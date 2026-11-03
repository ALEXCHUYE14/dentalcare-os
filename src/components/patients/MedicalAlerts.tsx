import { HeartPulse, TriangleAlert } from 'lucide-react';
import type { PatientRef } from '../../types';
import { cn } from '../../utils/format';

/** Banner de alertas críticas: alergias y alertas médicas siempre visibles. */
export function MedicalAlerts({ patient, compact }: { patient: PatientRef; compact?: boolean }) {
  const allergies = patient.allergies ?? [];
  const alerts = patient.medical_alerts ?? [];
  if (!allergies.length && !alerts.length) return null;

  if (compact) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-medium text-rose-700 ring-1 ring-inset ring-rose-200">
        <TriangleAlert className="h-3 w-3" />
        {allergies.length + alerts.length} alerta{allergies.length + alerts.length > 1 ? 's' : ''}
      </span>
    );
  }

  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {allergies.length > 0 && (
        <div className="flex items-start gap-3 rounded-xl border border-rose-200 bg-rose-50 p-3.5">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" />
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-rose-700">Alergias</p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {allergies.map((a) => (
                <span key={a} className="rounded-md bg-white px-2 py-0.5 text-xs font-medium text-rose-700 ring-1 ring-rose-200">
                  {a}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}
      {alerts.length > 0 && (
        <div className={cn('flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3.5', !allergies.length && 'sm:col-span-2')}>
          <HeartPulse className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">Alertas médicas</p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {alerts.map((a) => (
                <span key={a} className="rounded-md bg-white px-2 py-0.5 text-xs font-medium text-amber-800 ring-1 ring-amber-200">
                  {a}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
