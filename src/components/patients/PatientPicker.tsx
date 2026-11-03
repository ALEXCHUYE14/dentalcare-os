import { useEffect, useRef, useState } from 'react';
import { Search, X } from 'lucide-react';
import { useDebounce } from '../../hooks/useDebounce';
import { listPatients } from '../../services/patients';
import type { PatientListItem, PatientRef } from '../../types';
import { cn, fullName } from '../../utils/format';
import { Avatar } from '../ui/Primitives';
import { Spinner } from '../ui/Feedback';

/** Buscador asíncrono de pacientes (nombre, DNI o teléfono). */
export function PatientPicker({
  value,
  onChange,
  disabled,
}: {
  value: PatientRef | null;
  onChange: (p: PatientRef | null) => void;
  disabled?: boolean;
}) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<PatientListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(0);
  const dq = useDebounce(query, 250);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    listPatients({ search: dq, pageSize: 8, withCount: false })
      .then((r) => !cancelled && (setResults(r.rows), setActive(0)))
      .catch(() => !cancelled && setResults([]))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [dq, open]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => boxRef.current && !boxRef.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  if (value) {
    return (
      <div className="flex h-10 items-center gap-2.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5">
        <Avatar name={fullName(value)} size="sm" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{fullName(value)}</p>
        </div>
        {!disabled && (
          <button type="button" onClick={() => onChange(null)} className="rounded p-1 text-slate-400 hover:text-slate-700" aria-label="Cambiar paciente">
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
    );
  }

  const pick = (p: PatientListItem) => {
    onChange(p);
    setOpen(false);
    setQuery('');
  };

  return (
    <div className="relative" ref={boxRef}>
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
      <input
        value={query}
        disabled={disabled}
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') setActive((a) => Math.min(a + 1, results.length - 1));
          else if (e.key === 'ArrowUp') setActive((a) => Math.max(a - 1, 0));
          else if (e.key === 'Enter' && results[active]) {
            e.preventDefault();
            pick(results[active]);
          }
        }}
        placeholder="Buscar paciente por nombre, DNI o teléfono…"
        className="h-10 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-sm placeholder:text-slate-400 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
      />
      {open && (
        <div className="absolute inset-x-0 top-11 z-20 max-h-72 overflow-y-auto rounded-xl border border-slate-200 bg-white p-1 shadow-xl">
          {loading ? (
            <div className="flex justify-center py-4">
              <Spinner className="h-4 w-4" />
            </div>
          ) : results.length === 0 ? (
            <p className="px-3 py-4 text-center text-sm text-slate-500">Sin resultados</p>
          ) : (
            results.map((p, i) => (
              <button
                key={p.id}
                type="button"
                onMouseEnter={() => setActive(i)}
                onClick={() => pick(p)}
                className={cn('flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left', i === active && 'bg-sky-50')}
              >
                <Avatar name={fullName(p)} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{fullName(p)}</p>
                  <p className="truncate text-xs text-slate-500">
                    {p.document_number ? `${p.document_type} ${p.document_number}` : 'Sin documento'}
                    {p.phone ? ` · ${p.phone}` : ''}
                  </p>
                </div>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
