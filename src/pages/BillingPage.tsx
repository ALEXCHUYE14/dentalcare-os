import { useEffect, useMemo, useState } from 'react';
import { Banknote, FileText, Plus, Printer, Receipt, Search, Wallet } from 'lucide-react';
import { TreatmentDetailModal } from '../components/billing/TreatmentDetailModal';
import { TreatmentEditorModal } from '../components/billing/TreatmentEditorModal';
import { PrintPreviewModal } from '../components/billing/PrintPreviewModal';
import { Button } from '../components/ui/Button';
import { EmptyState, ErrorBox, LoadingBlock, Pagination } from '../components/ui/Feedback';
import { Field, Input, Select } from '../components/ui/Field';
import { Badge, Card, PageHeader, Tabs } from '../components/ui/Primitives';
import { useSettings } from '../context/SettingsContext';
import { useToast } from '../context/ToastContext';
import { useAsync } from '../hooks/useAsync';
import { useDebounce } from '../hooks/useDebounce';
import { errorMessage } from '../lib/supabase';
import { getTreatment, listPayments, listTreatments } from '../services/treatments';
import type { Payment, PaymentMethod, Treatment, TreatmentStatus } from '../types';
import { PAYMENT_METHODS, TREATMENT_STATUS } from '../utils/constants';
import { addDays, cn, docNumber, fmtDate, fmtDateTime, fullName, money, startOfMonth, toDate, toISODate } from '../utils/format';

type Tab = 'presupuestos' | 'pagos';
const PAGE_SIZE = 15;

function TreatmentsTab() {
  const { config } = useSettings();
  const cur = config?.currency ?? 'PEN';
  const [search, setSearch] = useState('');
  const dq = useDebounce(search, 300);
  const [status, setStatus] = useState<TreatmentStatus | ''>('');
  const [page, setPage] = useState(1);
  const [newOpen, setNewOpen] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => setPage(1), [dq, status]);
  const { data, loading, error, reload } = useAsync(() => listTreatments({ search: dq, status, page, pageSize: PAGE_SIZE }), [dq, status, page]);
  const rows = data?.rows ?? [];

  return (
    <Card>
      <div className="flex flex-col gap-3 border-b border-slate-100 p-3 sm:flex-row sm:items-center sm:p-4">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por paciente o DNI…" className="pl-9" />
        </div>
        <Select className="sm:w-48" value={status} onChange={(e) => setStatus(e.target.value as TreatmentStatus | '')}>
          <option value="">Todos los estados</option>
          {(Object.keys(TREATMENT_STATUS) as TreatmentStatus[]).map((s) => (
            <option key={s} value={s}>
              {TREATMENT_STATUS[s].label}
            </option>
          ))}
        </Select>
        <Button icon={<Plus />} onClick={() => setNewOpen(true)}>
          Nuevo presupuesto
        </Button>
      </div>

      {error ? (
        <div className="p-4">
          <ErrorBox message={error} onRetry={() => void reload()} />
        </div>
      ) : loading && !data ? (
        <LoadingBlock />
      ) : rows.length === 0 ? (
        <EmptyState icon={<FileText />} title="Sin presupuestos" description="Crea un plan de tratamiento para comenzar a registrar abonos." />
      ) : (
        <>
          <div className={cn('hidden overflow-x-auto md:block', loading && 'opacity-60')}>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-[11px] font-medium uppercase tracking-wide text-slate-400">
                  <th className="px-4 py-2.5">N°</th>
                  <th className="px-4 py-2.5">Paciente</th>
                  <th className="px-4 py-2.5">Plan</th>
                  <th className="px-4 py-2.5 text-right">Total</th>
                  <th className="px-4 py-2.5 text-right">Pagado</th>
                  <th className="px-4 py-2.5 text-right">Saldo</th>
                  <th className="px-4 py-2.5">Estado</th>
                  <th className="px-4 py-2.5">Fecha</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((t) => (
                  <tr key={t.id} onClick={() => setOpenId(t.id)} className="cursor-pointer hover:bg-slate-50">
                    <td className="px-4 py-3 font-mono text-xs text-slate-500">{docNumber('P', t.number)}</td>
                    <td className="px-4 py-3 font-medium">{fullName(t.patient)}</td>
                    <td className="max-w-[220px] truncate px-4 py-3 text-slate-600">{t.title}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{money(t.total, cur)}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-teal-700">{money(t.paid, cur)}</td>
                    <td className={cn('px-4 py-3 text-right font-medium tabular-nums', Number(t.balance) > 0 ? 'text-amber-700' : 'text-slate-400')}>
                      {money(t.balance, cur)}
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={TREATMENT_STATUS[t.status].tone}>{TREATMENT_STATUS[t.status].label}</Badge>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500">{fmtDate(t.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ul className={cn('divide-y divide-slate-100 md:hidden', loading && 'opacity-60')}>
            {rows.map((t) => (
              <li key={t.id}>
                <button type="button" onClick={() => setOpenId(t.id)} className="flex w-full items-center gap-3 px-4 py-3 text-left">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{fullName(t.patient)}</p>
                    <p className="truncate text-xs text-slate-500">
                      {docNumber('P', t.number)} · {t.title}
                    </p>
                    <Badge tone={TREATMENT_STATUS[t.status].tone} className="mt-1">
                      {TREATMENT_STATUS[t.status].label}
                    </Badge>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold tabular-nums">{money(t.total, cur)}</p>
                    <p className="text-xs tabular-nums text-amber-600">Saldo {money(t.balance, cur)}</p>
                  </div>
                </button>
              </li>
            ))}
          </ul>
          <div className="border-t border-slate-100">
            <Pagination page={page} pageSize={PAGE_SIZE} total={data?.total ?? 0} onChange={setPage} />
          </div>
        </>
      )}
      <TreatmentEditorModal open={newOpen} onClose={() => setNewOpen(false)} onSaved={(id) => (void reload(true), setOpenId(id))} />
      <TreatmentDetailModal treatmentId={openId} onClose={() => setOpenId(null)} onChanged={() => void reload(true)} />
    </Card>
  );
}

function PaymentsTab() {
  const toast = useToast();
  const { config } = useSettings();
  const cur = config?.currency ?? 'PEN';
  const [from, setFrom] = useState(() => toISODate(startOfMonth(new Date())));
  const [to, setTo] = useState(() => toISODate(new Date()));
  const [method, setMethod] = useState<PaymentMethod | ''>('');
  const [receipt, setReceipt] = useState<{ treatment: Treatment; payment: Payment } | null>(null);

  const { data, loading, error, reload } = useAsync(
    () => listPayments({ from: toDate(from), to: addDays(toDate(to), 1), method }),
    [from, to, method],
  );
  const rows = useMemo(() => data ?? [], [data]);
  const total = rows.reduce((s, p) => s + Number(p.amount), 0);
  const byMethod = useMemo(() => {
    const m = new Map<PaymentMethod, number>();
    rows.forEach((p) => m.set(p.method, (m.get(p.method) ?? 0) + Number(p.amount)));
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [rows]);

  const openReceipt = async (p: Payment) => {
    try {
      const t = await getTreatment(p.treatment_id);
      const full = t.payments?.find((x) => x.id === p.id) ?? p;
      setReceipt({ treatment: t, payment: full });
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  return (
    <div className="space-y-4">
      <Card className="grid gap-3 p-3 sm:grid-cols-3 sm:p-4">
        <Field label="Desde">
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </Field>
        <Field label="Hasta">
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </Field>
        <Field label="Método">
          <Select value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod | '')}>
            <option value="">Todos</option>
            {(Object.keys(PAYMENT_METHODS) as PaymentMethod[]).map((m) => (
              <option key={m} value={m}>
                {PAYMENT_METHODS[m]}
              </option>
            ))}
          </Select>
        </Field>
      </Card>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card className="col-span-2 p-4 lg:col-span-1">
          <p className="text-xs text-slate-500">Total recaudado</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">{money(total, cur)}</p>
          <p className="text-xs text-slate-500">{rows.length} pago(s)</p>
        </Card>
        {byMethod.slice(0, 3).map(([m, v]) => (
          <Card key={m} className="p-4">
            <p className="text-xs text-slate-500">{PAYMENT_METHODS[m]}</p>
            <p className="mt-1 text-lg font-semibold tabular-nums">{money(v, cur)}</p>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
              <div className="h-full rounded-full bg-teal-500" style={{ width: `${total ? (v / total) * 100 : 0}%` }} />
            </div>
          </Card>
        ))}
      </div>

      <Card>
        {error ? (
          <div className="p-4">
            <ErrorBox message={error} onRetry={() => void reload()} />
          </div>
        ) : loading && !data ? (
          <LoadingBlock />
        ) : rows.length === 0 ? (
          <EmptyState icon={<Banknote />} title="Sin pagos en el rango" description="Ajusta las fechas o registra abonos desde un presupuesto." />
        ) : (
          <ul className="divide-y divide-slate-100">
            {rows.map((p) => (
              <li key={p.id} className="flex items-center gap-3 px-4 py-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-teal-50 text-teal-600">
                  <Receipt className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{fullName(p.patient)}</p>
                  <p className="truncate text-xs text-slate-500">
                    {docNumber('R', p.number)} · {p.treatment ? `${docNumber('P', p.treatment.number)} ${p.treatment.title}` : ''} · {fmtDateTime(p.paid_at)}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold tabular-nums">{money(p.amount, cur)}</p>
                  <p className="text-xs text-slate-500">{PAYMENT_METHODS[p.method]}</p>
                </div>
                <Button size="icon-sm" variant="ghost" onClick={() => void openReceipt(p)} aria-label="Ver recibo">
                  <Printer />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <PrintPreviewModal open={!!receipt} onClose={() => setReceipt(null)} kind="receipt" treatment={receipt?.treatment ?? null} payment={receipt?.payment} />
    </div>
  );
}

export default function BillingPage() {
  const [tab, setTab] = useState<Tab>('presupuestos');
  return (
    <div>
      <PageHeader title="Facturación y pagos" subtitle="Presupuestos por plan de tratamiento, abonos parciales y recibos" />
      <Tabs<Tab>
        className="mb-4"
        value={tab}
        onChange={setTab}
        tabs={[
          { id: 'presupuestos', label: 'Presupuestos', icon: <Wallet /> },
          { id: 'pagos', label: 'Pagos recibidos', icon: <Banknote /> },
        ]}
      />
      {tab === 'presupuestos' ? <TreatmentsTab /> : <PaymentsTab />}
    </div>
  );
}
