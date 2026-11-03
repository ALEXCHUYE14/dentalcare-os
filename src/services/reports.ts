import { supabase, unwrap } from '../lib/supabase';
import type { ReportData } from '../types';
import { toISODate } from '../utils/format';

/** Reporte agregado en la base: viajan solo los totales, nunca los registros. */
export async function getReport(from: Date, to: Date): Promise<ReportData> {
  const r = unwrap<ReportData>(await supabase.rpc('get_report', { p_from: toISODate(from), p_to: toISODate(to) }));
  const n = Number;
  return {
    ...r,
    income: n(r.income),
    payments_count: n(r.payments_count),
    new_patients: n(r.new_patients),
    // Campos de la migración 004: ausentes si aún no se aplicó
    expenses: r.expenses === undefined ? undefined : n(r.expenses),
    expenses_by_category: r.expenses_by_category?.map((x) => ({ ...x, total: n(x.total), n: n(x.n) })),
    by_method: r.by_method.map((x) => ({ ...x, total: n(x.total), n: n(x.n) })),
    by_doctor: r.by_doctor.map((x) => ({ ...x, total: n(x.total), patients: n(x.patients) })),
    daily: r.daily.map((x) => ({ ...x, total: n(x.total) })),
    attended_by_doctor: r.attended_by_doctor.map((x) => ({ ...x, n: n(x.n) })),
    top_procedures: r.top_procedures.map((x) => ({ ...x, qty: n(x.qty), total: n(x.total) })),
    treatments: {
      count: n(r.treatments.count),
      total: n(r.treatments.total),
      accepted_count: n(r.treatments.accepted_count),
      accepted_total: n(r.treatments.accepted_total),
    },
    appointments: {
      total: n(r.appointments.total),
      atendida: n(r.appointments.atendida),
      cancelada: n(r.appointments.cancelada),
      sin_cierre: n(r.appointments.sin_cierre),
    },
  };
}
