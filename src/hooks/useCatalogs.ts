import { useCallback, useEffect, useState } from 'react';
import { listChairs, listProfiles } from '../services/staff';
import { listProcedures } from '../services/treatments';
import type { Chair, Procedure, Profile } from '../types';

interface Catalogs {
  staff: Profile[];
  doctors: Profile[];
  chairs: Chair[];
  procedures: Procedure[];
}

let cache: Catalogs | null = null;
let inflight: Promise<Catalogs> | null = null;
const listeners = new Set<(c: Catalogs) => void>();

async function fetchCatalogs(): Promise<Catalogs> {
  const [staff, chairs, procedures] = await Promise.all([listProfiles(), listChairs(), listProcedures()]);
  const active = staff.filter((p) => p.active);
  return {
    staff: active,
    doctors: active.filter((p) => p.role === 'doctor' || p.role === 'admin'),
    chairs,
    procedures,
  };
}

export async function invalidateCatalogs() {
  inflight = fetchCatalogs();
  cache = await inflight;
  inflight = null;
  listeners.forEach((l) => l(cache as Catalogs));
}

/** Catálogos compartidos (personal, doctores, sillones, procedimientos) con caché en memoria. */
export function useCatalogs() {
  const [state, setState] = useState<Catalogs>(cache ?? { staff: [], doctors: [], chairs: [], procedures: [] });
  const [loading, setLoading] = useState(!cache);

  useEffect(() => {
    listeners.add(setState);
    if (!cache) {
      inflight = inflight ?? fetchCatalogs();
      inflight
        .then((c) => {
          cache = c;
          listeners.forEach((l) => l(c));
        })
        .catch(() => undefined)
        .finally(() => {
          inflight = null;
          setLoading(false);
        });
    }
    return () => {
      listeners.delete(setState);
    };
  }, []);

  const reload = useCallback(() => invalidateCatalogs(), []);
  return { ...state, loading, reload };
}
