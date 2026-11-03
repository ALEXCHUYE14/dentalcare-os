import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { isSupabaseConfigured, openedFromRecoveryLink, supabase } from '../lib/supabase';
import type { AppRole, Profile } from '../types';

interface AuthContextValue {
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (fullName: string, email: string, password: string) => Promise<{ needsConfirmation: boolean }>;
  resetPassword: (email: string) => Promise<void>;
  /** true tras abrir el enlace de "olvidé mi contraseña": hay que pedir la nueva contraseña */
  recovering: boolean;
  updatePassword: (password: string) => Promise<void>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  can: (roles: AppRole[]) => boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function translateAuthError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes('invalid login')) return 'Correo o contraseña incorrectos.';
  if (m.includes('email not confirmed')) return 'Debes confirmar tu correo antes de ingresar.';
  if (m.includes('already registered')) return 'Este correo ya está registrado.';
  if (m.includes('password should be')) return 'La contraseña debe tener al menos 6 caracteres.';
  if (m.includes('rate limit')) return 'Demasiados intentos. Espera un momento e inténtalo de nuevo.';
  if (m.includes('signups not allowed') || m.includes('signup is disabled'))
    return 'El registro está deshabilitado. Pide al administrador que cree tu cuenta.';
  if (m.includes('different from the old')) return 'La nueva contraseña debe ser distinta de la anterior.';
  return message;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [profileFor, setProfileFor] = useState<string | null>(null);
  const [booting, setBooting] = useState(true);
  const [recovering, setRecovering] = useState(openedFromRecoveryLink);

  const loadProfile = useCallback(async (uid: string | undefined) => {
    if (!uid) {
      setProfile(null);
      setProfileFor(null);
      return;
    }
    const { data, error } = await supabase.from('profiles').select('*').eq('id', uid).maybeSingle();
    // Ante un fallo de red se conserva el perfil previo en vez de mostrar "cuenta pendiente"
    if (!error) setProfile((data as Profile | null) ?? null);
    setProfileFor(uid);
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setBooting(false);
      return;
    }
    let mounted = true;
    supabase.auth.getSession().then(async ({ data }) => {
      if (!mounted) return;
      setSession(data.session);
      await loadProfile(data.session?.user.id);
      if (mounted) setBooting(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s);
      if (event === 'PASSWORD_RECOVERY') setRecovering(true);
      if (event === 'SIGNED_OUT') setRecovering(false);
      // La renovación del token no cambia el perfil: no volver a consultarlo (ahorra peticiones y logs)
      if (event === 'TOKEN_REFRESHED' || event === 'INITIAL_SESSION') return;
      // Diferido para no bloquear el callback interno de supabase-js
      setTimeout(() => void loadProfile(s?.user.id), 0);
    });
    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, [loadProfile]);

  // Al volver a la pestaña se revisa el perfil (máx. cada 5 min) para aplicar roles o accesos revocados
  const userId = session?.user.id;
  useEffect(() => {
    if (!userId) return;
    let last = Date.now();
    const onVisible = () => {
      if (document.hidden || Date.now() - last < 5 * 60_000) return;
      last = Date.now();
      void loadProfile(userId);
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [userId, loadProfile]);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      profile,
      loading: booting || (!!session && profileFor !== session.user.id),
      async signIn(email, password) {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (error) throw new Error(translateAuthError(error.message));
        setRecovering(false); // un enlace de recuperación vencido no debe forzar el cambio tras un login normal
      },
      async signUp(fullName, email, password) {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: { data: { full_name: fullName.trim() }, emailRedirectTo: window.location.origin },
        });
        if (error) throw new Error(translateAuthError(error.message));
        return { needsConfirmation: !data.session };
      },
      async resetPassword(email) {
        const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: window.location.origin });
        if (error) throw new Error(translateAuthError(error.message));
      },
      recovering,
      async updatePassword(password) {
        const { error } = await supabase.auth.updateUser({ password });
        if (error) throw new Error(translateAuthError(error.message));
        setRecovering(false);
      },
      async signOut() {
        await supabase.auth.signOut();
        setProfile(null);
        setProfileFor(null);
      },
      async refreshProfile() {
        await loadProfile(session?.user.id);
      },
      can(roles) {
        return !!profile && profile.active && roles.includes(profile.role);
      },
    }),
    [session, profile, profileFor, booting, recovering, loadProfile],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe usarse dentro de AuthProvider');
  return ctx;
}
