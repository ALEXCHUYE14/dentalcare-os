import { useEffect, useRef } from 'react';
import type { RealtimeChannel, RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

export type RealtimePayload = RealtimePostgresChangesPayload<Record<string, unknown>>;

interface RealtimeOptions {
  /** Filtro de Postgres Realtime, p. ej. `patient_id=eq.<uuid>` */
  filter?: string;
  /**
   * Decide si el evento requiere recargar. Devuelve false para descartarlo (no afecta a la vista)
   * o tras aplicarlo localmente con los datos que ya trae el payload.
   */
  shouldReload?: (payload: RealtimePayload) => boolean;
}

/** Tras este tiempo con la pestaña oculta se cierra el canal; al volver se reabre con una sola recarga. */
const IDLE_MS = 60_000;
const DEBOUNCE_MS = 400;

/**
 * Suscripción a cambios de Postgres vía Supabase Realtime, pensada para ahorrar egress:
 * agrupa ráfagas en una sola recarga, no recarga mientras la pestaña está oculta
 * y libera el canal si la pestaña queda en segundo plano.
 */
export function useRealtime(table: string, onChange: () => void, { filter, shouldReload }: RealtimeOptions = {}) {
  const cbRef = useRef(onChange);
  const shouldRef = useRef(shouldReload);
  useEffect(() => {
    cbRef.current = onChange;
    shouldRef.current = shouldReload;
  });

  useEffect(() => {
    let channel: RealtimeChannel | null = null;
    let debounce: ReturnType<typeof setTimeout> | undefined;
    let idle: ReturnType<typeof setTimeout> | undefined;
    let stale = false;

    const fire = () => {
      clearTimeout(debounce);
      if (document.hidden) {
        stale = true; // se recargará una sola vez al volver a la pestaña
        return;
      }
      debounce = setTimeout(() => cbRef.current(), DEBOUNCE_MS);
    };

    const subscribe = () => {
      const name = `rt-${table}-${filter ?? 'all'}-${Math.random().toString(36).slice(2, 8)}`;
      channel = supabase
        .channel(name)
        .on('postgres_changes', { event: '*', schema: 'public', table, ...(filter ? { filter } : {}) }, (payload: RealtimePayload) => {
          if (shouldRef.current && !shouldRef.current(payload)) return;
          fire();
        })
        .subscribe();
    };

    const unsubscribe = () => {
      if (!channel) return;
      void supabase.removeChannel(channel);
      channel = null;
    };

    const onVisibility = () => {
      clearTimeout(idle);
      if (document.hidden) {
        idle = setTimeout(() => {
          unsubscribe();
          stale = true; // pudo haber cambios mientras el canal estuvo cerrado
        }, IDLE_MS);
        return;
      }
      if (!channel) subscribe();
      if (stale) {
        stale = false;
        fire();
      }
    };

    subscribe();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      clearTimeout(debounce);
      clearTimeout(idle);
      unsubscribe();
    };
  }, [table, filter]);
}

/** ¿El evento de una cita cae dentro del rango visible o afecta a una cita ya cargada? */
export function appointmentInView(payload: RealtimePayload, from: Date, to: Date, loadedIds: Set<string>): boolean {
  if (payload.eventType === 'DELETE') {
    const id = (payload.old as { id?: string }).id;
    return !id || loadedIds.has(id);
  }
  const row = payload.new as { id?: string; starts_at?: string };
  if (row.id && loadedIds.has(row.id)) return true; // se movió o cambió de estado
  if (!row.starts_at) return true;
  const t = new Date(row.starts_at).getTime();
  return t >= from.getTime() && t < to.getTime();
}
