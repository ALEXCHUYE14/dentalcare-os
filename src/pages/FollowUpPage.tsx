import { useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { BellRing, CalendarCheck, CalendarPlus, Cake, Check, CircleCheck, HandCoins, MessageCircle, Repeat } from 'lucide-react';
import { AppointmentModal } from '../components/appointments/AppointmentModal';
import { Button } from '../components/ui/Button';
import { EmptyState, ErrorBox, LoadingBlock } from '../components/ui/Feedback';
import { Badge, Card, CardHeader, PageHeader, Segmented, Tabs } from '../components/ui/Primitives';
import { useAuth } from '../context/AuthContext';
import { useSettings } from '../context/SettingsContext';
import { useToast } from '../context/ToastContext';
import { useAsync } from '../hooks/useAsync';
import { errorMessage } from '../lib/supabase';
import { listAppointments, setAppointmentStatus } from '../services/appointments';
import { getDebtors, getRecallPatients, getUpcomingBirthdays } from '../services/followups';
import type { PatientRef } from '../types';
import { APPT_STATUS } from '../utils/constants';
import { addDays, capitalize, fmtDate, fmtTime, fullName, money, startOfDay, waLink } from '../utils/format';

type Tab = 'recordatorios' | 'cobranza' | 'controles' | 'cumpleanos';

// ----- Marcas locales de "mensaje enviado" (solo en este equipo; no consumen la base) -----
const SENT_KEY = 'dc-wa-sent';
const SENT_TTL = 45 * 24 * 3600 * 1000;

function readSent(): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(SENT_KEY) ?? '{}') as Record<string, number>;
  } catch {
    return {};
  }
}

function useSentMarks() {
  const [sent, setSent] = useState<Record<string, number>>(readSent);
  const mark = (key: string) => {
    const now = Date.now();
    const next = Object.fromEntries(Object.entries({ ...readSent(), [key]: now }).filter(([, t]) => now - t < SENT_TTL));
    setSent(next);
    try {
      localStorage.setItem(SENT_KEY, JSON.stringify(next));
    } catch {
      /* sin almacenamiento: la marca dura hasta recargar */
    }
  };
  return { isSent: (key: string) => !!sent[key], mark };
}

function WhatsAppButton({ phone, text, sent, onSent }: { phone: string | null; text: string; sent: boolean; onSent: () => void }) {
  if (!phone) {
    return (
      <Button size="xs" variant="ghost" disabled title="El paciente no tiene teléfono registrado">
        Sin teléfono
      </Button>
    );
  }
  return (
    <a href={waLink(phone, text)} target="_blank" rel="noreferrer" onClick={onSent}>
      <Button size="xs" variant={sent ? 'ghost' : 'success'} icon={sent ? <Check /> : <MessageCircle />} className={sent ? 'text-teal-700' : undefined}>
        {sent ? 'Enviado' : 'WhatsApp'}
      </Button>
    </a>
  );
}

function Row({ title, to, meta, side, actions }: { title: string; to: string; meta: ReactNode; side?: ReactNode; actions: ReactNode }) {
  return (
    <li className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:gap-3">
      <div className="min-w-0 flex-1">
        <Link to={to} className="truncate text-sm font-medium hover:text-sky-700 hover:underline">
          {title}
        </Link>
        <div className="truncate text-xs text-slate-500">{meta}</div>
      </div>
      {side}
      <div className="flex items-center gap-1.5">{actions}</div>
    </li>
  );
}

function ListState({ loading, error, empty, onRetry, emptyIcon, emptyTitle, emptyText, children }: {
  loading: boolean;
  error: string | null;
  empty: boolean;
  onRetry: () => void;
  emptyIcon: ReactNode;
  emptyTitle: string;
  emptyText?: string;
  children: ReactNode;
}) {
  if (loading) return <LoadingBlock />;
  if (error)
    return (
      <div className="p-4">
        <ErrorBox message={error} onRetry={onRetry} />
      </div>
    );
  if (empty) return <EmptyState icon={emptyIcon} title={emptyTitle} description={emptyText} />;
  return <ul className="divide-y divide-slate-100">{children}</ul>;
}

// ---------------------------------------------------------------------
function RemindersTab() {
  const toast = useToast();
  const { config } = useSettings();
  const { isSent, mark } = useSentMarks();
  const [offset, setOffset] = useState<'0' | '1' | '2'>('1');
  const day = useMemo(() => addDays(startOfDay(new Date()), Number(offset)), [offset]);
  const { data, loading, error, reload, setData } = useAsync(() => listAppointments({ from: day, to: addDays(day, 1), hideCancelled: true }), [day.getTime()]);
  const rows = data ?? [];
  const business = config?.business_name ?? 'el consultorio';
  const pendingConfirm = rows.filter((a) => a.status === 'programada').length;
  const sentCount = rows.filter((a) => isSent(`rem:${a.id}`)).length;

  const confirm = async (id: string) => {
    setData((list) => list?.map((a) => (a.id === id ? { ...a, status: 'confirmada' } : a)) ?? null);
    try {
      await setAppointmentStatus(id, 'confirmada');
    } catch (e) {
      toast.error(errorMessage(e));
      void reload(true);
    }
  };

  return (
    <Card>
      <CardHeader
        title={`Citas del ${fmtDate(day, { weekday: 'long', day: 'numeric', month: 'long' })}`}
        subtitle={rows.length ? `${rows.length} cita(s) · ${pendingConfirm} por confirmar · ${sentCount} recordatorio(s) enviados` : 'Envía el recordatorio y marca la cita como confirmada'}
        icon={<BellRing />}
        action={
          <Segmented
            size="sm"
            value={offset}
            onChange={setOffset}
            options={[
              { value: '0', label: 'Hoy' },
              { value: '1', label: 'Mañana' },
              { value: '2', label: capitalize(fmtDate(addDays(new Date(), 2), { weekday: 'short' }).replace('.', '')) },
            ]}
          />
        }
      />
      <ListState
        loading={loading && !data}
        error={error}
        empty={!rows.length}
        onRetry={() => void reload()}
        emptyIcon={<CalendarCheck />}
        emptyTitle="Sin citas para ese día"
      >
        {rows.map((a) => {
          const text = `Hola ${a.patient?.first_name ?? ''}, le recordamos su cita en ${business} el ${fmtDate(a.starts_at, {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
          })} a las ${fmtTime(a.starts_at)}${a.doctor ? ` con ${a.doctor.full_name}` : ''}. Responda SÍ para confirmar.`;
          return (
            <Row
              key={a.id}
              title={`${fmtTime(a.starts_at)} · ${fullName(a.patient)}`}
              to={`/pacientes/${a.patient_id}`}
              meta={[a.treatment_type, a.doctor?.full_name, a.chair?.name].filter(Boolean).join(' · ')}
              side={<Badge tone={APPT_STATUS[a.status].tone}>{APPT_STATUS[a.status].label}</Badge>}
              actions={
                <>
                  {a.status === 'programada' && (
                    <Button size="xs" variant="subtle" icon={<CircleCheck />} onClick={() => void confirm(a.id)}>
                      Confirmar
                    </Button>
                  )}
                  <WhatsAppButton phone={a.patient?.phone ?? null} text={text} sent={isSent(`rem:${a.id}`)} onSent={() => mark(`rem:${a.id}`)} />
                </>
              }
            />
          );
        })}
      </ListState>
    </Card>
  );
}

// ---------------------------------------------------------------------
function CollectionsTab() {
  const { config } = useSettings();
  const { isSent, mark } = useSentMarks();
  const cur = config?.currency ?? 'PEN';
  const { data, loading, error, reload } = useAsync(getDebtors, []);
  const rows = data ?? [];
  const total = rows.reduce((s, d) => s + d.balance, 0);
  const month = new Date().toISOString().slice(0, 7);
  const payHint = config?.payment_qr_label ? ` Puede abonar por ${config.payment_qr_label} o en su próxima visita.` : ' Puede abonar en su próxima visita.';

  return (
    <Card>
      <CardHeader
        title="Cobranza"
        subtitle={rows.length ? `${rows.length} paciente(s) con saldo · total por cobrar ${money(total, cur)}` : 'Saldos de presupuestos aprobados'}
        icon={<HandCoins />}
      />
      <ListState
        loading={loading && !data}
        error={error}
        empty={!rows.length}
        onRetry={() => void reload()}
        emptyIcon={<HandCoins />}
        emptyTitle="Sin saldos pendientes"
        emptyText="Todos los presupuestos aprobados están al día."
      >
        {rows.map((d) => {
          const key = `debt:${d.id}:${month}`;
          const text = `Hola ${d.first_name}, le saludamos de ${config?.business_name ?? 'su consultorio dental'}. Le recordamos que tiene un saldo pendiente de ${money(d.balance, cur)} por su tratamiento.${payHint} ¡Gracias!`;
          return (
            <Row
              key={d.id}
              title={fullName(d)}
              to={`/pacientes/${d.id}`}
              meta={`${d.plans} presupuesto(s) desde ${fmtDate(d.oldest)} · último pago: ${d.last_payment ? fmtDate(d.last_payment) : 'ninguno'}`}
              side={<p className="text-sm font-semibold tabular-nums text-amber-700">{money(d.balance, cur)}</p>}
              actions={<WhatsAppButton phone={d.phone} text={text} sent={isSent(key)} onSent={() => mark(key)} />}
            />
          );
        })}
      </ListState>
    </Card>
  );
}

// ---------------------------------------------------------------------
function RecallTab() {
  const { config } = useSettings();
  const { isSent, mark } = useSentMarks();
  const [months, setMonths] = useState<'6' | '12'>('6');
  const [schedule, setSchedule] = useState<PatientRef | null>(null);
  const { data, loading, error, reload } = useAsync(() => getRecallPatients(Number(months)), [months]);
  const rows = data ?? [];

  const monthsAgo = (iso: string) => {
    const d = new Date(iso);
    const now = new Date();
    return (now.getFullYear() - d.getFullYear()) * 12 + now.getMonth() - d.getMonth();
  };

  return (
    <Card>
      <CardHeader
        title="Controles periódicos"
        subtitle={rows.length ? `${rows.length} paciente(s) sin control y sin cita futura` : 'Pacientes que deberían volver a su control y limpieza'}
        icon={<Repeat />}
        action={
          <Segmented
            size="sm"
            value={months}
            onChange={setMonths}
            options={[
              { value: '6', label: '+6 meses' },
              { value: '12', label: '+1 año' },
            ]}
          />
        }
      />
      <ListState
        loading={loading && !data}
        error={error}
        empty={!rows.length}
        onRetry={() => void reload()}
        emptyIcon={<Repeat />}
        emptyTitle="Nadie pendiente de control"
        emptyText="Todos los pacientes atendidos tienen un control reciente o una cita agendada."
      >
        {rows.map((p) => {
          const key = `recall:${p.id}`;
          const text = `Hola ${p.first_name}, le saludamos de ${config?.business_name ?? 'su consultorio dental'}. Su última visita fue el ${fmtDate(p.last_visit, {
            day: 'numeric',
            month: 'long',
            year: 'numeric',
          })}. Le recomendamos un control y limpieza dental cada 6 meses. ¿Le agendamos una cita?`;
          return (
            <Row
              key={p.id}
              title={fullName(p)}
              to={`/pacientes/${p.id}`}
              meta={`Última atención: ${fmtDate(p.last_visit)} (hace ${monthsAgo(p.last_visit)} meses)`}
              actions={
                <>
                  <Button size="xs" variant="subtle" icon={<CalendarPlus />} onClick={() => setSchedule(p)}>
                    Agendar
                  </Button>
                  <WhatsAppButton phone={p.phone} text={text} sent={isSent(key)} onSent={() => mark(key)} />
                </>
              }
            />
          );
        })}
      </ListState>
      <AppointmentModal
        open={!!schedule}
        draft={{ patient: schedule, starts_at: undefined }}
        onClose={() => setSchedule(null)}
        onSaved={() => void reload(true)}
      />
    </Card>
  );
}

// ---------------------------------------------------------------------
function BirthdaysTab() {
  const { config } = useSettings();
  const { isSent, mark } = useSentMarks();
  const { data, loading, error, reload } = useAsync(() => getUpcomingBirthdays(7), []);
  const rows = data ?? [];
  const year = new Date().getFullYear();

  return (
    <Card>
      <CardHeader title="Cumpleaños" subtitle="Hoy y los próximos 7 días" icon={<Cake />} />
      <ListState
        loading={loading && !data}
        error={error}
        empty={!rows.length}
        onRetry={() => void reload()}
        emptyIcon={<Cake />}
        emptyTitle="Sin cumpleaños esta semana"
      >
        {rows.map((p) => {
          const key = `bday:${p.id}:${year}`;
          const when = p.days_until === 0 ? 'Hoy' : p.days_until === 1 ? 'Mañana' : `En ${p.days_until} días`;
          const text = `¡Feliz cumpleaños, ${p.first_name}! Todo el equipo de ${config?.business_name ?? 'su consultorio dental'} le desea un excelente día. 🎉`;
          return (
            <Row
              key={p.id}
              title={fullName(p)}
              to={`/pacientes/${p.id}`}
              meta={`${fmtDate(p.birth_date, { day: 'numeric', month: 'long' })} · cumple ${p.turning} años`}
              side={<Badge tone={p.days_until === 0 ? 'rose' : 'slate'}>{when}</Badge>}
              actions={<WhatsAppButton phone={p.phone} text={text} sent={isSent(key)} onSent={() => mark(key)} />}
            />
          );
        })}
      </ListState>
    </Card>
  );
}

export default function FollowUpPage() {
  const { can } = useAuth();
  const canCollect = can(['admin', 'doctor', 'recepcionista']);
  const [tab, setTab] = useState<Tab>('recordatorios');

  const tabs = [
    { id: 'recordatorios' as const, label: 'Recordatorios', icon: <BellRing /> },
    ...(canCollect ? [{ id: 'cobranza' as const, label: 'Cobranza', icon: <HandCoins /> }] : []),
    { id: 'controles' as const, label: 'Controles', icon: <Repeat /> },
    { id: 'cumpleanos' as const, label: 'Cumpleaños', icon: <Cake /> },
  ];

  return (
    <div>
      <PageHeader title="Seguimiento de pacientes" subtitle="Recordatorios, cobranza, controles y cumpleaños por WhatsApp" />
      <Tabs<Tab> className="mb-4" value={tab} onChange={setTab} tabs={tabs} />
      <div className="animate-fade" key={tab}>
        {tab === 'recordatorios' && <RemindersTab />}
        {tab === 'cobranza' && canCollect && <CollectionsTab />}
        {tab === 'controles' && <RecallTab />}
        {tab === 'cumpleanos' && <BirthdaysTab />}
      </div>
    </div>
  );
}
