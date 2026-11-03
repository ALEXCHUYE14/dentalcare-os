import { useMemo, useState, type ReactNode } from 'react';
import { BarChart3, CalendarCheck, Download, FileSpreadsheet, Percent, Receipt, Stethoscope, TrendingUp, TriangleAlert, UserPlus, Wallet } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { BarChart } from '../components/ui/Charts';
import { EmptyState, ErrorBox, Skeleton } from '../components/ui/Feedback';
import { Field, Input } from '../components/ui/Field';
import { Card, CardHeader, PageHeader, Segmented } from '../components/ui/Primitives';
import { useSettings } from '../context/SettingsContext';
import { useToast } from '../context/ToastContext';
import { useAsync } from '../hooks/useAsync';
import { errorMessage } from '../lib/supabase';
import { getReport } from '../services/reports';
import { listPayments } from '../services/treatments';
import { EXPENSE_CATEGORIES, PAYMENT_METHODS } from '../utils/constants';
import { downloadCsv } from '../utils/csv';
import { addDays, capitalize, compactNumber, docNumber, fmtDate, fmtDateTime, fullName, money, startOfDay, startOfMonth, toDate, toISODate } from '../utils/format';

type Preset = 'mes' | 'anterior' | 'trimestre' | 'anio' | 'custom';

function presetRange(p: Exclude<Preset, 'custom'>): { from: Date; to: Date } {
  const today = startOfDay(new Date());
  const som = startOfMonth(today);
  if (p === 'mes') return { from: som, to: today };
  if (p === 'anterior') return { from: new Date(som.getFullYear(), som.getMonth() - 1, 1), to: addDays(som, -1) };
  if (p === 'trimestre') return { from: new Date(som.getFullYear(), som.getMonth() - 2, 1), to: today };
  return { from: new Date(today.getFullYear(), 0, 1), to: today };
}

const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 1000) / 10 : 0);

function Kpi({ label, value, hint, icon, accent, loading }: { label: string; value: ReactNode; hint?: ReactNode; icon: ReactNode; accent: string; loading: boolean }) {
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-medium text-slate-500">{label}</p>
        <span className={`flex h-8 w-8 items-center justify-center rounded-lg [&_svg]:h-4 [&_svg]:w-4 ${accent}`}>{icon}</span>
      </div>
      {loading ? <Skeleton className="mt-3 h-7 w-24" /> : <p className="mt-2 text-2xl font-semibold tabular-nums tracking-tight">{value}</p>}
      {hint && <div className="mt-1 text-xs text-slate-500">{hint}</div>}
    </Card>
  );
}

/** Tabla de ranking con barra proporcional. */
function Ranking({ rows, empty }: { rows: { key: string; label: string; detail?: string; value: number; display: string }[]; empty: string }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  if (!rows.length) return <p className="px-4 py-6 text-center text-sm text-slate-500">{empty}</p>;
  return (
    <ul className="divide-y divide-slate-100">
      {rows.map((r) => (
        <li key={r.key} className="px-4 py-2.5">
          <div className="flex items-baseline justify-between gap-3">
            <p className="min-w-0 truncate text-sm font-medium">{r.label}</p>
            <p className="shrink-0 text-sm font-semibold tabular-nums">{r.display}</p>
          </div>
          {r.detail && <p className="text-xs text-slate-500">{r.detail}</p>}
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-100">
            <div className="h-full rounded-full bg-sky-500" style={{ width: `${(r.value / max) * 100}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

export default function ReportsPage() {
  const toast = useToast();
  const { config } = useSettings();
  const cur = config?.currency ?? 'PEN';
  const [preset, setPreset] = useState<Preset>('mes');
  const [custom, setCustom] = useState(() => ({ from: toISODate(startOfMonth(new Date())), to: toISODate(new Date()) }));
  const [exporting, setExporting] = useState(false);

  const range = useMemo(() => (preset === 'custom' ? { from: toDate(custom.from), to: toDate(custom.to) } : presetRange(preset)), [preset, custom]);
  const fromKey = toISODate(range.from);
  const toKey = toISODate(range.to);
  const invalid = preset === 'custom' && (!custom.from || !custom.to || custom.to < custom.from);

  const { data: r, loading, error, reload } = useAsync(() => (invalid ? Promise.resolve(null) : getReport(range.from, range.to)), [fromKey, toKey, invalid]);

  // Serie de ingresos: diaria hasta ~2 meses, mensual para rangos mayores (rellena días sin pagos con 0)
  const days = Math.round((range.to.getTime() - range.from.getTime()) / 86400000) + 1;
  const monthly = days > 62;
  const series = useMemo(() => {
    if (!r) return [];
    const byDay = new Map(r.daily.map((d) => [d.day, d.total]));
    if (!monthly) {
      return Array.from({ length: days }, (_, i) => {
        const d = addDays(range.from, i);
        return { label: fmtDate(d, { day: '2-digit', month: 'short' }).replace('.', ''), value: byDay.get(toISODate(d)) ?? 0 };
      });
    }
    const months = new Map<string, number>();
    for (let d = startOfMonth(range.from); d <= range.to; d = new Date(d.getFullYear(), d.getMonth() + 1, 1)) months.set(toISODate(d).slice(0, 7), 0);
    r.daily.forEach((d) => months.set(d.day.slice(0, 7), (months.get(d.day.slice(0, 7)) ?? 0) + d.total));
    return [...months.entries()].map(([m, v]) => ({ label: capitalize(fmtDate(`${m}-01`, { month: 'short', year: '2-digit' }).replace('.', '')), value: v }));
  }, [r, range.from, range.to, days, monthly]);

  const periodLabel = `${fmtDate(range.from)} – ${fmtDate(range.to)}`;
  const fileSuffix = `${fromKey}_${toKey}`;

  const exportSummary = () => {
    if (!r) return;
    const rows: (string | number)[][] = [
      ['Reporte', config?.business_name ?? 'DentalCare OS'],
      ['Periodo', periodLabel],
      [],
      ['Indicador', 'Valor'],
      ['Ingresos', r.income],
      ['N° de pagos', r.payments_count],
      ['Ticket promedio', r.payments_count ? r.income / r.payments_count : 0],
      ...(r.expenses !== undefined
        ? [
            ['Gastos', r.expenses],
            ['Utilidad', r.income - r.expenses],
          ]
        : []),
      ['Pacientes nuevos', r.new_patients],
      ['Citas (no canceladas)', r.appointments.total],
      ['Citas atendidas', r.appointments.atendida],
      ['Citas canceladas', r.appointments.cancelada],
      ['Citas pasadas sin cerrar', r.appointments.sin_cierre],
      ['Presupuestos emitidos', r.treatments.count],
      ['Monto presupuestado', r.treatments.total],
      ['Presupuestos aceptados', r.treatments.accepted_count],
      ['Monto aceptado', r.treatments.accepted_total],
      [],
      ['Ingresos por doctor', 'Pacientes', 'Monto'],
      ...r.by_doctor.map((d) => [d.name, d.patients, d.total]),
      [],
      ['Método de pago', 'Pagos', 'Monto'],
      ...r.by_method.map((m) => [PAYMENT_METHODS[m.method] ?? m.method, m.n, m.total]),
      [],
      ['Procedimiento', 'Cantidad', 'Monto aceptado'],
      ...r.top_procedures.map((p) => [p.description, p.qty, p.total]),
      [],
      ['Citas atendidas por doctor', 'Citas'],
      ...r.attended_by_doctor.map((d) => [d.name, d.n]),
      ...(r.expenses_by_category?.length
        ? [[], ['Gastos por categoría', 'N°', 'Monto'], ...r.expenses_by_category.map((c) => [EXPENSE_CATEGORIES[c.category] ?? c.category, c.n, c.total])]
        : []),
    ];
    downloadCsv(`reporte_${fileSuffix}.csv`, rows);
  };

  // El detalle de pagos solo se descarga cuando se pide (no en cada visita a la página)
  const exportPayments = async () => {
    setExporting(true);
    try {
      const list = await listPayments({ from: range.from, to: addDays(range.to, 1) });
      downloadCsv(`pagos_${fileSuffix}.csv`, [
        ['Recibo', 'Fecha', 'Paciente', 'Presupuesto', 'Método', 'Referencia', 'Monto'],
        ...list.map((p) => [
          docNumber('R', p.number),
          fmtDateTime(p.paid_at),
          fullName(p.patient),
          p.treatment ? `${docNumber('P', p.treatment.number)} ${p.treatment.title}` : '',
          PAYMENT_METHODS[p.method],
          p.reference ?? '',
          Number(p.amount),
        ]),
      ]);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setExporting(false);
    }
  };

  const busy = loading && !r;
  const appts = r?.appointments;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Reportes"
        subtitle={periodLabel}
        actions={
          <>
            <Button variant="secondary" size="sm" icon={<FileSpreadsheet />} disabled={!r} onClick={exportSummary}>
              Exportar resumen
            </Button>
            <Button variant="secondary" size="sm" icon={<Download />} disabled={invalid} loading={exporting} onClick={() => void exportPayments()}>
              Exportar pagos
            </Button>
          </>
        }
      />

      <Card className="flex flex-col gap-3 p-3 sm:p-4 lg:flex-row lg:items-end">
        <div className="no-scrollbar -mx-1 overflow-x-auto px-1">
          <Segmented
            size="sm"
            value={preset}
            onChange={setPreset}
            options={[
              { value: 'mes', label: 'Este mes' },
              { value: 'anterior', label: 'Mes anterior' },
              { value: 'trimestre', label: '3 meses' },
              { value: 'anio', label: 'Este año' },
              { value: 'custom', label: 'Personalizado' },
            ]}
          />
        </div>
        {preset === 'custom' && (
          <div className="grid grid-cols-2 gap-3 lg:ml-auto lg:w-80">
            <Field label="Desde">
              <Input type="date" value={custom.from} onChange={(e) => setCustom((c) => ({ ...c, from: e.target.value }))} />
            </Field>
            <Field label="Hasta">
              <Input type="date" value={custom.to} onChange={(e) => setCustom((c) => ({ ...c, to: e.target.value }))} />
            </Field>
          </div>
        )}
      </Card>

      {invalid && <ErrorBox message="La fecha final debe ser igual o posterior a la inicial." />}
      {error && <ErrorBox message={error} onRetry={() => void reload()} />}

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Kpi
          label="Ingresos"
          loading={busy}
          value={money(r?.income ?? 0, cur)}
          hint={r ? `${r.payments_count} pago(s) · ticket ${money(r.payments_count ? r.income / r.payments_count : 0, cur)}` : null}
          icon={<Wallet />}
          accent="bg-emerald-50 text-emerald-600"
        />
        <Kpi label="Pacientes nuevos" loading={busy} value={compactNumber(r?.new_patients ?? 0)} icon={<UserPlus />} accent="bg-teal-50 text-teal-600" />
        <Kpi
          label="Citas atendidas"
          loading={busy}
          value={appts?.atendida ?? 0}
          hint={appts ? `de ${appts.total} agendadas · ${pct(appts.cancelada, appts.total + appts.cancelada)}% canceladas` : null}
          icon={<CalendarCheck />}
          accent="bg-sky-50 text-sky-600"
        />
        <Kpi
          label="Aceptación de presupuestos"
          loading={busy}
          value={`${pct(r?.treatments.accepted_total ?? 0, r?.treatments.total ?? 0)}%`}
          hint={r ? `${r.treatments.accepted_count} de ${r.treatments.count} · ${money(r.treatments.accepted_total, cur)}` : null}
          icon={<Percent />}
          accent="bg-violet-50 text-violet-600"
        />
      </div>

      {r?.expenses !== undefined && (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,2fr)]">
          <Kpi label="Gastos" loading={busy} value={money(r.expenses, cur)} icon={<Receipt />} accent="bg-rose-50 text-rose-600" />
          <Kpi
            label="Utilidad"
            loading={busy}
            value={<span className={r.income - r.expenses < 0 ? 'text-rose-700' : undefined}>{money(r.income - r.expenses, cur)}</span>}
            hint={r.income > 0 ? `Margen ${pct(r.income - r.expenses, r.income)}%` : null}
            icon={<TrendingUp />}
            accent="bg-sky-50 text-sky-600"
          />
          <Card>
            <CardHeader title="Gastos por categoría" icon={<Receipt />} />
            <Ranking
              empty="Sin gastos en el periodo"
              rows={(r.expenses_by_category ?? []).map((c) => ({
                key: c.category,
                label: EXPENSE_CATEGORIES[c.category] ?? c.category,
                detail: `${c.n} gasto(s)`,
                value: c.total,
                display: money(c.total, cur),
              }))}
            />
          </Card>
        </div>
      )}

      {!!appts?.sin_cierre && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            Hay <b>{appts.sin_cierre}</b> cita(s) pasadas que siguen como programadas, confirmadas o en espera. Márcalas como atendidas o canceladas en la agenda para que
            los indicadores sean exactos.
          </p>
        </div>
      )}

      <Card>
        <CardHeader title="Ingresos del periodo" subtitle={monthly ? 'Por mes' : 'Por día'} icon={<BarChart3 />} />
        <div className="p-3 sm:p-4">
          {busy ? (
            <Skeleton className="h-56 w-full" />
          ) : r && r.income > 0 ? (
            <BarChart data={series} format={(v) => money(v, cur)} axisFormat={(v) => compactNumber(v)} color="#059669" />
          ) : (
            <EmptyState icon={<Wallet />} title="Sin ingresos en el periodo" />
          )}
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Ingresos por doctor" subtitle="Según el doctor del presupuesto pagado (base para comisiones)" icon={<Stethoscope />} />
          {busy ? (
            <Skeleton className="m-4 h-32" />
          ) : (
            <Ranking
              empty="Sin pagos en el periodo"
              rows={(r?.by_doctor ?? []).map((d) => ({
                key: d.doctor_id ?? 'none',
                label: d.name,
                detail: `${d.patients} paciente(s) · ${pct(d.total, r?.income ?? 0)}% del total`,
                value: d.total,
                display: money(d.total, cur),
              }))}
            />
          )}
        </Card>
        <Card>
          <CardHeader title="Métodos de pago" icon={<Wallet />} />
          {busy ? (
            <Skeleton className="m-4 h-32" />
          ) : (
            <Ranking
              empty="Sin pagos en el periodo"
              rows={(r?.by_method ?? []).map((m) => ({
                key: m.method,
                label: PAYMENT_METHODS[m.method] ?? m.method,
                detail: `${m.n} pago(s) · ${pct(m.total, r?.income ?? 0)}%`,
                value: m.total,
                display: money(m.total, cur),
              }))}
            />
          )}
        </Card>
        <Card>
          <CardHeader title="Procedimientos más vendidos" subtitle="De presupuestos aceptados en el periodo" icon={<FileSpreadsheet />} />
          {busy ? (
            <Skeleton className="m-4 h-32" />
          ) : (
            <Ranking
              empty="Sin presupuestos aceptados en el periodo"
              rows={(r?.top_procedures ?? []).map((p) => ({ key: p.description, label: p.description, detail: `${p.qty} unidad(es)`, value: p.total, display: money(p.total, cur) }))}
            />
          )}
        </Card>
        <Card>
          <CardHeader title="Citas atendidas por doctor" icon={<CalendarCheck />} />
          {busy ? (
            <Skeleton className="m-4 h-32" />
          ) : (
            <Ranking
              empty="Sin citas atendidas en el periodo"
              rows={(r?.attended_by_doctor ?? []).map((d) => ({
                key: d.doctor_id ?? 'none',
                label: d.name,
                detail: `${pct(d.n, appts?.atendida ?? 0)}% de las atenciones`,
                value: d.n,
                display: String(d.n),
              }))}
            />
          )}
        </Card>
      </div>
    </div>
  );
}
