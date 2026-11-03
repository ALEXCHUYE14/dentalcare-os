import { FunctionsFetchError, FunctionsHttpError, FunctionsRelayError } from '@supabase/supabase-js';
import { AppError, supabase, toAppError, unwrap } from '../lib/supabase';
import type { AppRole, Chair, Profile } from '../types';

export async function listProfiles(): Promise<Profile[]> {
  return unwrap<Profile[]>(await supabase.from('profiles').select('*').order('active', { ascending: false }).order('full_name'));
}

export async function updateProfile(
  id: string,
  patch: Partial<Pick<Profile, 'full_name' | 'role' | 'specialty' | 'phone' | 'license_number' | 'color' | 'active'>>,
): Promise<Profile> {
  return unwrap<Profile>(await supabase.from('profiles').update(patch).eq('id', id).select().single());
}

// ----- Gestión de cuentas (Edge Function "admin-users", requiere rol admin) -----
const NOT_DEPLOYED =
  'La función "admin-users" no está desplegada en Supabase. Revisa la sección "Gestión de usuarios" del README.';

async function invokeAdmin<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('admin-users', { body });
  if (!error) return data as T;

  if (error instanceof FunctionsHttpError) {
    // La función responde { error }; la pasarela responde 404 sin ese campo si la función no existe.
    const res = error.context as Response;
    const payload = (await res.json().catch(() => null)) as { error?: string } | null;
    if (payload?.error) throw new AppError(payload.error);
    if (res.status === 404) throw new AppError(NOT_DEPLOYED);
    throw new AppError(`Error del servidor (${res.status})`);
  }
  if (error instanceof FunctionsRelayError || error instanceof FunctionsFetchError) {
    throw new AppError(`No se pudo contactar con la función de usuarios. ${NOT_DEPLOYED}`);
  }
  throw new AppError(error.message);
}

export interface NewStaffInput {
  full_name: string;
  email: string;
  password: string;
  role: AppRole;
  specialty: string | null;
  phone: string | null;
  license_number: string | null;
  color: string;
}

export function createStaffUser(input: NewStaffInput): Promise<{ id: string }> {
  return invokeAdmin({ action: 'create', ...input });
}

export function resetStaffPassword(userId: string, password: string): Promise<{ ok: true }> {
  return invokeAdmin({ action: 'reset_password', user_id: userId, password });
}

export function deleteStaffUser(userId: string): Promise<{ ok: true }> {
  return invokeAdmin({ action: 'delete', user_id: userId });
}

/** Contraseña temporal legible (sin caracteres ambiguos como 0/O o 1/l). */
export function generatePassword(length = 12): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  const bytes = new Uint32Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => chars[b % chars.length]).join('');
}

// ----- Sillones -----
export async function listChairs(includeInactive = false): Promise<Chair[]> {
  let q = supabase.from('chairs').select('*').order('name');
  if (!includeInactive) q = q.eq('active', true);
  return unwrap<Chair[]>(await q);
}

export async function saveChair(c: { id?: string; name: string; active?: boolean }): Promise<Chair> {
  const payload = { name: c.name.trim(), active: c.active ?? true };
  if (c.id) return unwrap<Chair>(await supabase.from('chairs').update(payload).eq('id', c.id).select().single());
  return unwrap<Chair>(await supabase.from('chairs').insert(payload).select().single());
}

export async function deleteChair(id: string): Promise<void> {
  const { error } = await supabase.from('chairs').delete().eq('id', id);
  if (error) throw toAppError(error);
}
