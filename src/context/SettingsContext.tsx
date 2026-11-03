import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { getConfig, updateConfig } from '../services/settings';
import type { TenantConfig } from '../types';
import { useAuth } from './AuthContext';

interface SettingsContextValue {
  config: TenantConfig | null;
  loading: boolean;
  refresh: () => Promise<void>;
  save: (patch: Partial<TenantConfig>) => Promise<TenantConfig>;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const { session, profile } = useAuth();
  // Depender del id (no del objeto sesión) evita recargar la configuración en cada renovación del token
  const userId = session?.user.id;
  const [config, setConfig] = useState<TenantConfig | null>(null);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setConfig(await getConfig());
    } catch {
      setConfig(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (userId && profile?.active) void refresh();
    else setConfig(null);
  }, [userId, profile?.active, refresh]);

  useEffect(() => {
    document.title = config?.business_name ? `${config.business_name} · DentalCare OS` : 'DentalCare OS';
  }, [config?.business_name]);

  const save = useCallback(async (patch: Partial<TenantConfig>) => {
    const next = await updateConfig(patch);
    setConfig(next);
    return next;
  }, []);

  const value = useMemo(() => ({ config, loading, refresh, save }), [config, loading, refresh, save]);
  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings(): SettingsContextValue {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings debe usarse dentro de SettingsProvider');
  return ctx;
}
