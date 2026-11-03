import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const isSupabaseConfigured = Boolean(url && anonKey);

/**
 * El enlace de "olvidé mi contraseña" llega con `type=recovery` en la URL. Se lee antes de crear el
 * cliente porque supabase-js limpia la URL y su evento PASSWORD_RECOVERY puede emitirse antes de que React se suscriba.
 */
export const openedFromRecoveryLink =
  typeof window !== 'undefined' && /(^|[#&?])type=recovery(&|$)/.test(window.location.hash + window.location.search);

export const supabase = createClient(url || 'http://localhost:54321', anonKey || 'public-anon-key', {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});

export class AppError extends Error {
  code?: string;
  constructor(message: string, code?: string) {
    super(message);
    this.code = code;
  }
}

const MESSAGES: Record<string, string> = {
  '23505': 'Ya existe un registro con esos datos (duplicado).',
  '23503': 'No se puede completar: el registro está vinculado a otros datos.',
  '23514': 'Algún dato no cumple las validaciones del sistema.',
  '42501': 'No tienes permisos para realizar esta acción.',
  PGRST116: 'No se encontró el registro solicitado.',
};

export function toAppError(e: { message: string; code?: string }): AppError {
  if (e.code === '23P01') {
    if (e.message.includes('no_doctor_overlap')) return new AppError('El doctor ya tiene una cita en ese horario.', e.code);
    return new AppError('El sillón ya está ocupado en ese horario.', e.code);
  }
  if (e.message?.includes('row-level security')) return new AppError(MESSAGES['42501'], '42501');
  return new AppError((e.code && MESSAGES[e.code]) || e.message, e.code);
}

export function unwrap<T>(res: { data: unknown; error: { message: string; code?: string } | null }): T {
  if (res.error) throw toAppError(res.error);
  return res.data as T;
}

export function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === 'object' && e && 'message' in e) return String((e as { message: unknown }).message);
  return 'Ocurrió un error inesperado';
}
