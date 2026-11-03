import { useCallback, useEffect, useRef, useState, type DependencyList } from 'react';
import { errorMessage } from '../lib/supabase';

/** Carga asíncrona con estado, recarga silenciosa y protección contra respuestas obsoletas. */
export function useAsync<T>(fn: () => Promise<T>, deps: DependencyList) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const fnRef = useRef(fn);
  const reqId = useRef(0);

  useEffect(() => {
    fnRef.current = fn;
  });

  const reload = useCallback(async (silent = false) => {
    const id = ++reqId.current;
    if (!silent) setLoading(true);
    setError(null);
    try {
      const result = await fnRef.current();
      if (id === reqId.current) setData(result);
    } catch (e) {
      if (id === reqId.current) setError(errorMessage(e));
    } finally {
      if (id === reqId.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    fnRef.current = fn;
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { data, setData, loading, error, reload };
}
