import { useMemo, useState } from 'react';
import { Banknote, ChevronDown, ChevronLeft, ChevronRight, History, Lock, LockOpen, Plus, Receipt, RefreshCw, Trash2, TrendingDown, TrendingUp, Wallet } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { ConfirmDialog, EmptyState, ErrorBox, LoadingBlock, Skeleton } from '../components/ui/Feedback';
import { Field, Input, Select, Textarea } from '../components/ui/Field';
import { Modal } from '../components/ui/Modal';
import { Badge, Card, CardHeader, PageHeader, Tabs } from '../components/ui/Primitives';
import { useAuth } from '../context/AuthContext';
import { useSettings } from '../context/SettingsContext';
import { useToast } from '../context/ToastContext';
import { useAsync } from '../hooks/useAsync';
import { useCatalogs } from '../hooks/useCatalogs';
import { errorMessage } from '../lib/supabase';
import { closeCashSession, createExpense, deleteExpense, getCashSummary, getMonthBalance, listCashSessions, listExpenses, openCashSession } from '../services/cash';
import type { CashSession, ExpenseCategory, PaymentMethod } from '../types';
import { EXPENSE_CATEGORIES, PAYMENT_METHODS } from '../utils/constants';
import { capitalize, cn, fmtDate, fmtDateTime, fmtTime, money, round2, toISODate } from '../utils/format';

type Tab = 'caja' | 'gastos' | 'cierres';

const parseAmount = (s: string) => {
  const v = Number(s.replace(',', '.'));
  return Number.isFinite(v) ? round2(v) : NaN;
};
const amountInput = (v: string) => v.replace(/[^\d.,]/g, '');

// ---------------------------------------------------------------------
function ExpenseModal({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const blank = () => ({
    spent_at: toISODate(new Date()),
    category: 'materiales' as ExpenseCategory,
    description: '',
    amount: '',
    method: 'efectivo' as PaymentMethod,
    supplier: '',
    reference: '',
  });
  const [f, setF] = useState(blank);
  const [saving, setSaving] = useState(false);
  const close = () => {
    if (saving) return;
    setF(blank());
    onClose();
  };
  const save = async () => {
    const amount = parseAmount(f.amount);
    if (!f.description.trim()) return toast.error('Describe el gasto.');
    if (!(amount > 0)) return toast.error('Ingresa un monto mayor a cero.');
    if (!f.spent_at) return toast.error('Indica la fecha.');
    setSaving(true);
    try {
      await createExpense({ ...f, amount, supplier: f.supplier || null, reference: f.reference || null });
      toast.success('Gasto registrado');
      setF(blank());
      onSaved();
      onClose();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };
  return (
    <Modal
      open={open}
      onClose={close}
      title="Registrar gasto"
      subtitle="Los gastos en efectivo se descuentan del efectivo esperado de la caja abierta"
      footer={
        <>
          <Button variant="secondary" onClick={close} disabled={saving}>
            Cancelar
          </Button>
          <Button icon={<Plus />} onClick={save} loading={saving}>
            Registrar
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Descripción" required className="sm:col-span-2">
          <Input value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} placeholder="Resinas, guantes, pago de luz…" autoFocus maxLength={200} />
        </Field>
        <Field label="Monto" required>
          <Input inputMode="decimal" value={f.amount} onChange={(e) => setF({ ...f, amount: amountInput(e.target.value) })} placeholder="0.00" />
        </Field>
        <Field label="Fecha">
          <Input type="date" value={f.spent_at} onChange={(e) => setF({ ...f, spent_at: e.target.value })} />
        </Field>
        <Field label="Categoría">
          <Select value={f.category} onChange={(e) => setF({ ...f, category: e.target.value as ExpenseCategory })}>
            {(Object.keys(EXPENSE_CATEGORIES) as ExpenseCategory[]).map((c) => (
              <option key={c} value={c}>
                {EXPENSE_CATEGORIES[c]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Pagado con">
          <Select value={f.method} onChange={(e) => setF({ ...f, method: e.target.value as PaymentMethod })}>
            {(Object.keys(PAYMENT_METHODS) as PaymentMethod[]).map((m) => (
              <option key={m} value={m}>
                {PAYMENT_METHODS[m]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Proveedor">
          <Input value={f.supplier} onChange={(e) => setF({ ...f, supplier: e.target.value })} maxLength={120} />
        </Field>
        <Field label="N° de comprobante">
          <Input value={f.reference} onChange={(e) => setF({ ...f, reference: e.target.value })} placeholder="Boleta / factura" maxLength={60} />
        </Field>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------
function CashTab() {
  const toast = useToast();
  const { config } = useSettings();
  const { staff } = useCatalogs();
  const cur = config?.currency ?? 'PEN';
  const { data, loading, error, reload } = useAsync(() => getCashSummary(), []);
  const [opening, setOpening] = useState('');
  const [busy, setBusy] = useState(false);
  const [expenseOpen, setExpenseOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const [counted, setCounted] = useState('');
  const [notes, setNotes] = useState('');
  const [lastClosed, setLastClosed] = useState<CashSession | null>(null);
  const name = (id: string | null) => staff.find((s) => s.id === id)?.full_name ?? '—';

  const open = async () => {
    const amount = opening.trim() ? parseAmount(opening) : 0;
    if (!(amount >= 0)) return toast.error('Monto inicial inválido.');
    setBusy(true);
    try {
      await openCashSession(amount);
      setOpening('');
      setLastClosed(null);
      toast.success('Caja abierta');
      await reload();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const close = async () => {
    const amount = parseAmount(counted);
    if (!(amount >= 0)) return toast.error('Ingresa el efectivo contado.');
    setBusy(true);
    try {
      const s = await closeCashSession(amount, notes.trim() || null);
      setLastClosed(s);
      setClosing(false);
      setCounted('');
      setNotes('');
      toast.success('Caja cerrada');
      await reload();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  if (loading && data === null && !error) return <LoadingBlock label="Consultando caja…" />;
  if (error) return <ErrorBox message={error} onRetry={() => void reload()} />;

  if (!data) {
    return (
      <div className="space-y-4">
        {lastClosed && <ClosingResult s={lastClosed} cur={cur} />}
        <Card className="mx-auto max-w-lg">
          <CardHeader title="La caja está cerrada" subtitle="Ábrela al iniciar el día con el sencillo disponible" icon={<Lock />} />
          <div className="space-y-4 p-4">
            <Field label="Efectivo inicial (sencillo)" hint="Déjalo vacío si empiezas en cero">
              <Input inputMode="decimal" value={opening} onChange={(e) => setOpening(amountInput(e.target.value))} placeholder="0.00" />
            </Field>
            <Button className="w-full" icon={<LockOpen />} loading={busy} onClick={open}>
              Abrir caja
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  const s = data.session;
  const diff = closing && counted.trim() ? parseAmount(counted) - data.expected_cash : null;

  return (
    <div className="space-y-4">
      <Card className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-teal-50 text-teal-600">
            <LockOpen className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold">Caja abierta desde {fmtDateTime(s.opened_at)}</p>
            <p className="truncate text-xs text-slate-500">
              Por {name(s.opened_by)} · efectivo inicial {money(s.opening_amount, cur)}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="ghost" size="sm" icon={<RefreshCw />} loading={loading} onClick={() => void reload(true)}>
            Actualizar
          </Button>
          <Button variant="secondary" size="sm" icon={<Receipt />} onClick={() => setExpenseOpen(true)}>
            Registrar gasto
          </Button>
          <Button size="sm" icon={<Lock />} onClick={() => setClosing(true)}>
            Cerrar caja
          </Button>
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Card className="p-4">
          <p className="text-xs text-slate-500">Cobrado (todos los métodos)</p>
          <p className="mt-1 text-xl font-semibold tabular-nums">{money(data.payments_total, cur)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-slate-500">Efectivo recibido</p>
          <p className="mt-1 text-xl font-semibold tabular-nums text-teal-700">+ {money(data.cash_in, cur)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-slate-500">Gastos en efectivo</p>
          <p className="mt-1 text-xl font-semibold tabular-nums text-rose-700">− {money(data.cash_out, cur)}</p>
          <p className="text-[11px] text-slate-400">Gastos totales: {money(data.expenses_total, cur)}</p>
        </Card>
        <Card className="border-sky-200 p-4">
          <p className="text-xs text-slate-500">Efectivo esperado en caja</p>
          <p className="mt-1 text-xl font-semibold tabular-nums text-sky-700">{money(data.expected_cash, cur)}</p>
          <p className="text-[11px] text-slate-400">Inicial + efectivo recibido − gastos en efectivo</p>
        </Card>
      </div>

      <Card>
        <CardHeader title="Cobros por método de pago" subtitle="Desde la apertura de la caja" icon={<Wallet />} />
        {data.payments.length === 0 ? (
          <p className="p-4 text-sm text-slate-500">Aún no hay cobros en esta caja.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {data.payments.map((p) => (
              <li key={p.method} className="flex items-center justify-between px-4 py-2.5 text-sm">
                <span>
                  {PAYMENT_METHODS[p.method] ?? p.method} <span className="text-xs text-slate-400">· {p.n} pago(s)</span>
                </span>
                <span className="font-semibold tabular-nums">{money(p.total, cur)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <ExpenseModal open={expenseOpen} onClose={() => setExpenseOpen(false)} onSaved={() => void reload(true)} />

      <Modal
        open={closing}
        onClose={() => !busy && setClosing(false)}
        size="sm"
        title="Cerrar caja (arqueo)"
        subtitle="Cuenta el efectivo físico y regístralo"
        footer={
          <>
            <Button variant="secondary" onClick={() => setClosing(false)} disabled={busy}>
              Cancelar
            </Button>
            <Button icon={<Lock />} onClick={close} loading={busy}>
              Cerrar caja
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="flex justify-between rounded-lg bg-slate-50 px-3 py-2.5 text-sm">
            <span className="text-slate-500">Efectivo esperado</span>
            <b className="tabular-nums">{money(data.expected_cash, cur)}</b>
          </div>
          <Field label="Efectivo contado" required>
            <Input inputMode="decimal" value={counted} onChange={(e) => setCounted(amountInput(e.target.value))} placeholder="0.00" autoFocus />
          </Field>
          {diff !== null && Number.isFinite(diff) && (
            <p className={cn('text-sm font-medium', Math.abs(diff) < 0.005 ? 'text-teal-700' : diff > 0 ? 'text-amber-700' : 'text-rose-700')}>
              {Math.abs(diff) < 0.005 ? 'Cuadra exacto' : diff > 0 ? `Sobrante de ${money(diff, cur)}` : `Faltante de ${money(-diff, cur)}`}
            </p>
          )}
          <Field label="Observaciones">
            <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Motivo de la diferencia, entregas a gerencia…" />
          </Field>
          <p className="text-xs text-slate-500">El monto esperado lo vuelve a calcular el servidor al cerrar, incluyendo cobros registrados hasta ese momento.</p>
        </div>
      </Modal>
    </div>
  );
}

function DiffBadge({ diff, cur }: { diff: number | null; cur: string }) {
  if (diff === null) return null;
  if (Math.abs(diff) < 0.005) return <Badge tone="teal">Cuadra</Badge>;
  return diff > 0 ? <Badge tone="amber">Sobra {money(diff, cur)}</Badge> : <Badge tone="rose">Falta {money(-diff, cur)}</Badge>;
}

function ClosingResult({ s, cur }: { s: CashSession; cur: string }) {
  return (
    <Card className="mx-auto max-w-lg p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold">Caja cerrada a las {s.closed_at ? fmtTime(s.closed_at) : '—'}</p>
          <p className="text-xs text-slate-500">
            Esperado {money(s.expected_cash, cur)} · contado {money(s.counted_cash, cur)}
          </p>
        </div>
        <DiffBadge diff={s.difference} cur={cur} />
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------
function ExpensesTab() {
  const toast = useToast();
  const { can } = useAuth();
  const { config } = useSettings();
  const cur = config?.currency ?? 'PEN';
  const [month, setMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const key = toISODate(month);
  const balance = useAsync(() => getMonthBalance(month), [key]);
  const list = useAsync(() => listExpenses(month), [key]);
  const [modal, setModal] = useState(false);
  const [toDelete, setToDelete] = useState<string | null>(null);
  const isAdmin = can(['admin']);
  const b = balance.data;
  const maxCat = Math.max(1, ...(b?.by_category ?? []).map((c) => c.total));

  const refresh = () => {
    void balance.reload(true);
    void list.reload(true);
  };

  const step = (d: number) => setMonth((m) => new Date(m.getFullYear(), m.getMonth() + d, 1));
  const isCurrent = month.getFullYear() === new Date().getFullYear() && month.getMonth() === new Date().getMonth();

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="ghost" size="icon-sm" onClick={() => step(-1)} aria-label="Mes anterior">
          <ChevronLeft />
        </Button>
        <p className="min-w-40 text-center text-base font-semibold">{capitalize(fmtDate(month, { month: 'long', year: 'numeric' }))}</p>
        <Button variant="ghost" size="icon-sm" onClick={() => step(1)} disabled={isCurrent} aria-label="Mes siguiente">
          <ChevronRight />
        </Button>
        <Button className="ml-auto" icon={<Plus />} onClick={() => setModal(true)}>
          Nuevo gasto
        </Button>
      </div>

      {balance.error && <ErrorBox message={balance.error} onRetry={() => void balance.reload()} />}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {[
          { label: 'Ingresos del mes', value: b?.income, icon: <TrendingUp />, cls: 'text-teal-700' },
          { label: 'Gastos del mes', value: b?.expenses, icon: <TrendingDown />, cls: 'text-rose-700' },
          { label: 'Utilidad', value: b?.profit, icon: <Wallet />, cls: (b?.profit ?? 0) >= 0 ? 'text-sky-700' : 'text-rose-700' },
        ].map((k) => (
          <Card key={k.label} className="p-4">
            <p className="flex items-center gap-1.5 text-xs text-slate-500 [&_svg]:h-3.5 [&_svg]:w-3.5">
              {k.icon}
              {k.label}
            </p>
            {balance.loading && !b ? <Skeleton className="mt-2 h-7 w-28" /> : <p className={cn('mt-1 text-2xl font-semibold tabular-nums', k.cls)}>{money(k.value ?? 0, cur)}</p>}
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
        <Card className="self-start">
          <CardHeader title="Por categoría" />
          {!b?.by_category.length ? (
            <p className="p-4 text-sm text-slate-500">Sin gastos este mes.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {b.by_category.map((c) => (
                <li key={c.category} className="px-4 py-2.5">
                  <div className="flex justify-between gap-2 text-sm">
                    <span className="truncate">{EXPENSE_CATEGORIES[c.category] ?? c.category}</span>
                    <b className="tabular-nums">{money(c.total, cur)}</b>
                  </div>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-100">
                    <div className="h-full rounded-full bg-rose-400" style={{ width: `${(c.total / maxCat) * 100}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <CardHeader title="Gastos registrados" subtitle={list.data ? `${list.data.length} gasto(s)` : undefined} icon={<Receipt />} />
          {list.error ? (
            <div className="p-4">
              <ErrorBox message={list.error} onRetry={() => void list.reload()} />
            </div>
          ) : list.loading && !list.data ? (
            <LoadingBlock />
          ) : !list.data?.length ? (
            <EmptyState icon={<Receipt />} title="Sin gastos este mes" description="Registra compras de materiales, pagos de servicios, sueldos y más." />
          ) : (
            <ul className="divide-y divide-slate-100">
              {list.data.map((e) => (
                <li key={e.id} className="flex items-center gap-3 px-4 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{e.description}</p>
                    <p className="truncate text-xs text-slate-500">
                      {fmtDate(e.spent_at)} · {EXPENSE_CATEGORIES[e.category]} · {PAYMENT_METHODS[e.method]}
                      {e.supplier ? ` · ${e.supplier}` : ''}
                      {e.reference ? ` · ${e.reference}` : ''}
                    </p>
                  </div>
                  <p className="text-sm font-semibold tabular-nums text-rose-700">{money(e.amount, cur)}</p>
                  {isAdmin && (
                    <Button size="icon-sm" variant="ghost" className="text-slate-400 hover:text-rose-600" onClick={() => setToDelete(e.id)} aria-label="Eliminar gasto">
                      <Trash2 />
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <ExpenseModal open={modal} onClose={() => setModal(false)} onSaved={refresh} />
      <ConfirmDialog
        open={!!toDelete}
        title="Eliminar gasto"
        message="El gasto se eliminará (queda registrado en la auditoría). Si pertenece a una caja ya cerrada, su arqueo no cambia."
        danger
        confirmLabel="Eliminar"
        onClose={() => setToDelete(null)}
        onConfirm={async () => {
          try {
            if (toDelete) await deleteExpense(toDelete);
            refresh();
          } catch (e) {
            toast.error(errorMessage(e));
          } finally {
            setToDelete(null);
          }
        }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------
function SessionDetail({ id, cur }: { id: string; cur: string }) {
  const { data, loading, error } = useAsync(() => getCashSummary(id), [id]);
  if (loading) return <LoadingBlock />;
  if (error || !data) return <p className="px-4 pb-3 text-xs text-rose-600">{error ?? 'Sin detalle'}</p>;
  return (
    <div className="grid gap-x-6 gap-y-1 px-4 pb-3 text-xs sm:grid-cols-2">
      {data.payments.map((p) => (
        <p key={p.method} className="flex justify-between">
          <span className="text-slate-500">
            {PAYMENT_METHODS[p.method] ?? p.method} ({p.n})
          </span>
          <span className="tabular-nums">{money(p.total, cur)}</span>
        </p>
      ))}
      <p className="flex justify-between">
        <span className="text-slate-500">Gastos en efectivo</span>
        <span className="tabular-nums">− {money(data.cash_out, cur)}</span>
      </p>
      <p className="flex justify-between">
        <span className="text-slate-500">Total cobrado</span>
        <b className="tabular-nums">{money(data.payments_total, cur)}</b>
      </p>
    </div>
  );
}

function ClosingsTab() {
  const { config } = useSettings();
  const { staff } = useCatalogs();
  const cur = config?.currency ?? 'PEN';
  const { data, loading, error, reload } = useAsync(() => listCashSessions(60), []);
  const [open, setOpen] = useState<string | null>(null);
  const names = useMemo(() => new Map(staff.map((s) => [s.id, s.full_name])), [staff]);

  return (
    <Card>
      <CardHeader title="Cierres anteriores" subtitle="Últimos 60 arqueos" icon={<History />} />
      {error ? (
        <div className="p-4">
          <ErrorBox message={error} onRetry={() => void reload()} />
        </div>
      ) : loading && !data ? (
        <LoadingBlock />
      ) : !data?.length ? (
        <EmptyState icon={<Banknote />} title="Aún no hay cierres de caja" />
      ) : (
        <ul className="divide-y divide-slate-100">
          {data.map((s) => (
            <li key={s.id}>
              <button type="button" onClick={() => setOpen(open === s.id ? null : s.id)} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-slate-50">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">
                    {capitalize(fmtDate(s.opened_at, { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' }))} · {fmtTime(s.opened_at)}–
                    {s.closed_at ? fmtTime(s.closed_at) : '—'}
                  </p>
                  <p className="truncate text-xs text-slate-500">
                    Esperado {money(s.expected_cash, cur)} · contado {money(s.counted_cash, cur)} · cerró {names.get(s.closed_by ?? '') ?? '—'}
                    {s.notes ? ` · ${s.notes}` : ''}
                  </p>
                </div>
                <DiffBadge diff={s.difference} cur={cur} />
                <ChevronDown className={cn('h-4 w-4 shrink-0 text-slate-400 transition-transform', open === s.id && 'rotate-180')} />
              </button>
              {open === s.id && <SessionDetail id={s.id} cur={cur} />}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export default function CashPage() {
  const [tab, setTab] = useState<Tab>('caja');
  return (
    <div>
      <PageHeader title="Caja y gastos" subtitle="Apertura y cierre de caja diario, gastos del consultorio y utilidad del mes" />
      <Tabs<Tab>
        className="mb-4"
        value={tab}
        onChange={setTab}
        tabs={[
          { id: 'caja', label: 'Caja del día', icon: <Banknote /> },
          { id: 'gastos', label: 'Gastos', icon: <Receipt /> },
          { id: 'cierres', label: 'Cierres anteriores', icon: <History /> },
        ]}
      />
      <div className="animate-fade" key={tab}>
        {tab === 'caja' && <CashTab />}
        {tab === 'gastos' && <ExpensesTab />}
        {tab === 'cierres' && <ClosingsTab />}
      </div>
    </div>
  );
}
