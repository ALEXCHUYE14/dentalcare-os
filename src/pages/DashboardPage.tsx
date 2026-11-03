import { useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Armchair, ArrowRight, CalendarCheck, CalendarDays, Clock, TrendingDown, TrendingUp, Users, Wallet } from 'lucide-react';
import { AppointmentModal } from '../components/appointments/AppointmentModal';
import { Button } from '../components/ui/Button';
import { BarChart, LineChart } from '../components/ui/Charts';
import { EmptyState, ErrorBox, Skeleton } from '../components/ui/Feedback';
import { Badge, Card, CardHeader, Segmented } from '../components/ui/Primitives';
import { useAuth } from '../context/AuthContext';
import { useSettings } from '../context/SettingsContext';
import { useToast } from '../context/ToastContext';
import { useAsync } from '../hooks/useAsync';
import { appointmentInView, useRealtime } from '../hooks/useRealtime';
import { errorMessage } from '../lib/supabase';
import { listAppointments, setAppointmentStatus } from '../services/appointments';
import { getSeries, getStats } from '../services/dashboard';
import type { Appointment, AppointmentStatus } from '../types';
import { APPT_STATUS } from '../utils/constants';
import { addDays, capitalize, cn, compactNumber, fmtDate, fmtTime, fullName, money, startOfDay } from '../utils/format';

function StatCard({
  label,
  value,
  hint,
  icon,
  accent,
  loading,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon: ReactNode;
  accent: string;
  loading?: boolean;
}) {
  return (
    <Card className="p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-medium text-slate-500">{label}</p>
        <span className={cn('flex h-8 w-8 items-center justify-center rounded-lg [&_svg]:h-4 [&_svg]:w-4', accent)}>{icon}</span>
      </div>
      {loading ? (
        <Skeleton className="mt-3 h-7 w-24" />
      ) : (
        <p className="mt-2 text-2xl font-semibold tracking-tight tabular-nums text-slate-900 sm:text-[26px]">{value}</p>
      )}
      {hint && <div className="mt-1 text-xs text-slate-500">{hint}</div>}
    </Card>
  );
}

const NEXT_STEP: Partial<Record<AppointmentStatus, { to: AppointmentStatus; label: string }>> = {
  programada: { to: 'confirmada', label: 'Confirmar' },
  confirmada: { to: 'en_espera', label: 'Llegó' },
  en_espera: { to: 'atendida', label: 'Atendida' },
};

export default function DashboardPage() {
  const { profile } = useAuth();
  const { config } = useSettings();
  const toast = useToast();
  const cur = config?.currency ?? 'PEN';
  const [period, setPeriod] = useState<'week' | 'month'>('week');
  const [selected, setSelected] = useState<Appointment | null>(null);

  const stats = useAsync(getStats, []);
  const series = useAsync(() => getSeries(period), [period]);
  const today = useAsync(() => {
    const from = startOfDay(new Date());
    return listAppointments({ from, to: addDays(from, 1) });
  }, []);

  const todayIds = useMemo(() => new Set((today.data ?? []).map((a) => a.id)), [today.data]);
  useRealtime(
    'appointments',
    () => {
      void today.reload(true);
      void stats.reload(true);
    },
    {
      shouldReload: (p) => {
        const from = startOfDay(new Date());
        return appointmentInView(p, from, addDays(from, 1), todayIds);
      },
    },
  );

  const s = stats.data;
  const growth = s && s.income_prev_month > 0 ? ((s.income_month - s.income_prev_month) / s.income_prev_month) * 100 : null;

  const chartData = useMemo(() => {
    const rows = series.data ?? [];
    const label = (b: string) =>
      period === 'month' ? capitalize(fmtDate(b, { month: 'short' }).replace('.', '')) : fmtDate(b, { day: '2-digit', month: 'short' }).replace('.', '');
    return {
      income: rows.map((r) => ({ label: label(r.bucket), value: r.income })),
      visits: rows.map((r) => ({ label: label(r.bucket), value: r.visits })),
    };
  }, [series.data, period]);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Buenos días' : hour < 19 ? 'Buenas tardes' : 'Buenas noches';

  const advance = async (a: Appointment, to: AppointmentStatus) => {
    today.setData((list) => list?.map((x) => (x.id === a.id ? { ...x, status: to } : x)) ?? null);
    try {
      await setAppointmentStatus(a.id, to);
      void stats.reload(true);
    } catch (e) {
      toast.error(errorMessage(e));
      void today.reload(true);
    }
  };

  const appts = (today.data ?? []).filter((a) => a.status !== 'cancelada');

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm text-slate-500">{capitalize(fmtDate(new Date(), { weekday: 'long', day: 'numeric', month: 'long' }))}</p>
          <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
            {greeting}, {profile?.full_name.replace(/^(dra?\.?|doctora?|lic\.?)\s+/i, '').split(' ')[0] || 'equipo'}
          </h1>
        </div>
        <Link to="/agenda">
          <Button variant="secondary" icon={<CalendarDays />}>
            Abrir agenda
          </Button>
        </Link>
      </div>

      {stats.error && <ErrorBox message={stats.error} onRetry={() => void stats.reload()} />}

      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <StatCard
          label="Citas de hoy"
          loading={stats.loading}
          value={s?.appointments_today ?? 0}
          icon={<CalendarCheck />}
          accent="bg-sky-50 text-sky-600"
          hint={
            <span>
              {s?.waiting_now ?? 0} en sala · {s?.attended_today ?? 0} atendidas
            </span>
          }
        />
        <StatCard
          label="Pacientes activos"
          loading={stats.loading}
          value={compactNumber(s?.active_patients ?? 0)}
          icon={<Users />}
          accent="bg-teal-50 text-teal-600"
          hint={`+${s?.new_patients_month ?? 0} nuevos este mes`}
        />
        <StatCard
          label="Ingresos del mes"
          loading={stats.loading}
          value={money(s?.income_month ?? 0, cur)}
          icon={<Wallet />}
          accent="bg-emerald-50 text-emerald-600"
          hint={
            growth === null ? (
              `Por cobrar: ${money(s?.pending_balance ?? 0, cur)}`
            ) : (
              <span className={cn('inline-flex items-center gap-1', growth >= 0 ? 'text-emerald-600' : 'text-rose-600')}>
                {growth >= 0 ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
                {Math.abs(growth).toFixed(1)}% vs mes anterior
              </span>
            )
          }
        />
        <StatCard
          label="Ocupación de sillones"
          loading={stats.loading}
          value={`${s?.occupancy_rate ?? 0}%`}
          icon={<Armchair />}
          accent="bg-amber-50 text-amber-600"
          hint={
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-100">
              <div className="h-full rounded-full bg-amber-500 transition-all" style={{ width: `${Math.min(100, s?.occupancy_rate ?? 0)}%` }} />
            </div>
          }
        />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
          <Card>
            <CardHeader
              title="Rendimiento financiero"
              subtitle={period === 'week' ? 'Ingresos por semana (8 semanas)' : 'Ingresos por mes (6 meses)'}
              action={
                <Segmented
                  size="sm"
                  value={period}
                  onChange={setPeriod}
                  options={[
                    { value: 'week', label: 'Semana' },
                    { value: 'month', label: 'Mes' },
                  ]}
                />
              }
            />
            <div className="p-3 sm:p-4">
              {series.loading && !series.data ? (
                <Skeleton className="h-56 w-full" />
              ) : (
                <BarChart data={chartData.income} format={(v) => money(v, cur)} axisFormat={(v) => compactNumber(v)} color="#0284C7" />
              )}
            </div>
          </Card>
          <Card>
            <CardHeader title="Flujo de pacientes" subtitle="Citas atendidas por periodo" />
            <div className="p-3 sm:p-4">
              {series.loading && !series.data ? (
                <Skeleton className="h-56 w-full" />
              ) : (
                <LineChart data={chartData.visits} format={(v) => `${Math.round(v)}`} color="#0D9488" />
              )}
            </div>
          </Card>
        </div>

        <Card className="self-start">
          <CardHeader
            title="Agenda de hoy"
            subtitle={`${appts.length} cita(s) activas`}
            icon={<Clock />}
            action={
              <Link to="/agenda" className="inline-flex items-center gap-1 text-xs font-medium text-sky-700 hover:underline">
                Ver todo <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            }
          />
          {today.loading && !today.data ? (
            <div className="space-y-3 p-4">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : appts.length === 0 ? (
            <EmptyState icon={<CalendarDays />} title="Sin citas para hoy" description="Las citas agendadas aparecerán aquí en tiempo real." />
          ) : (
            <ul className="max-h-[560px] divide-y divide-slate-100 overflow-y-auto">
              {appts.map((a) => {
                const next = NEXT_STEP[a.status];
                return (
                  <li key={a.id} className="flex items-center gap-3 px-4 py-3">
                    <button type="button" onClick={() => setSelected(a)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                      <div className="w-12 shrink-0 text-center">
                        <p className="text-sm font-semibold tabular-nums">{fmtTime(a.starts_at)}</p>
                        <p className="text-[10px] text-slate-400">{fmtTime(a.ends_at)}</p>
                      </div>
                      <span className={cn('h-9 w-1 shrink-0 rounded-full', APPT_STATUS[a.status].dot)} />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{fullName(a.patient)}</p>
                        <p className="truncate text-xs text-slate-500">
                          {a.treatment_type}
                          {a.doctor ? ` · ${a.doctor.full_name}` : ''}
                          {a.chair ? ` · ${a.chair.name}` : ''}
                        </p>
                      </div>
                    </button>
                    {next ? (
                      <Button size="xs" variant="subtle" onClick={() => void advance(a, next.to)}>
                        {next.label}
                      </Button>
                    ) : (
                      <Badge tone={APPT_STATUS[a.status].tone}>{APPT_STATUS[a.status].label}</Badge>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>

      <AppointmentModal
        open={!!selected}
        appointment={selected}
        onClose={() => setSelected(null)}
        onSaved={() => {
          void today.reload(true);
          void stats.reload(true);
        }}
      />
    </div>
  );
}
