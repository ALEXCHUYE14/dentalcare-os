import { useState } from 'react';
import { Banknote, CircleCheck, Circle, Pencil, Printer, Receipt, Trash2 } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useSettings } from '../../context/SettingsContext';
import { useToast } from '../../context/ToastContext';
import { useAsync } from '../../hooks/useAsync';
import { errorMessage } from '../../lib/supabase';
import { deletePayment, getTreatment, setTreatmentStatus, toggleItemDone } from '../../services/treatments';
import type { Payment, TreatmentStatus } from '../../types';
import { PAYMENT_METHODS, TREATMENT_STATUS } from '../../utils/constants';
import { cn, docNumber, fmtDate, fmtDateTime, fullName, money } from '../../utils/format';
import { Button } from '../ui/Button';
import { ConfirmDialog, ErrorBox, LoadingBlock } from '../ui/Feedback';
import { Select } from '../ui/Field';
import { Modal } from '../ui/Modal';
import { Badge } from '../ui/Primitives';
import { PaymentModal } from './PaymentModal';
import { PrintPreviewModal } from './PrintPreviewModal';
import { TreatmentEditorModal } from './TreatmentEditorModal';

export function TreatmentDetailModal({
  treatmentId,
  onClose,
  onChanged,
}: {
  treatmentId: string | null;
  onClose: () => void;
  onChanged: () => void;
}) {
  const toast = useToast();
  const { can } = useAuth();
  const { config } = useSettings();
  const cur = config?.currency ?? 'PEN';
  const { data: t, loading, error, reload, setData } = useAsync(
    () => (treatmentId ? getTreatment(treatmentId) : Promise.resolve(null)),
    [treatmentId],
  );

  const [payOpen, setPayOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [print, setPrint] = useState<{ kind: 'budget' | 'receipt'; payment?: Payment | null } | null>(null);
  const [toDelete, setToDelete] = useState<Payment | null>(null);
  const [busy, setBusy] = useState(false);

  const canEdit = can(['admin', 'doctor', 'recepcionista']);
  const canCharge = can(['admin', 'recepcionista']);

  const refresh = async () => {
    await reload(true);
    onChanged();
  };

  const changeStatus = async (s: TreatmentStatus) => {
    if (!t) return;
    try {
      await setTreatmentStatus(t.id, s);
      toast.success(`Estado: ${TREATMENT_STATUS[s].label}`);
      await refresh();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  const toggleDone = async (itemId: string, done: boolean) => {
    if (!t) return;
    setData({ ...t, items: t.items?.map((i) => (i.id === itemId ? { ...i, done } : i)) });
    try {
      await toggleItemDone(itemId, done);
    } catch (e) {
      toast.error(errorMessage(e));
      void reload(true);
    }
  };

  const removePayment = async () => {
    if (!toDelete) return;
    setBusy(true);
    try {
      await deletePayment(toDelete.id);
      toast.success('Pago anulado');
      setToDelete(null);
      await refresh();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const items = t?.items ?? [];
  const done = items.filter((i) => i.done).length;
  const progress = Number(t?.total) > 0 ? Math.min(100, (Number(t?.paid) / Number(t?.total)) * 100) : 0;

  return (
    <>
      <Modal
        open={!!treatmentId}
        onClose={onClose}
        size="lg"
        title={t ? `${docNumber('P', t.number)} · ${t.title}` : 'Presupuesto'}
        subtitle={t ? `${fullName(t.patient)} · ${fmtDate(t.created_at)}` : undefined}
        footer={
          t && (
            <>
              <Button variant="secondary" icon={<Printer />} onClick={() => setPrint({ kind: 'budget' })}>
                Presupuesto
              </Button>
              {canEdit && t.status !== 'anulado' && (
                <Button variant="secondary" icon={<Pencil />} onClick={() => setEditOpen(true)}>
                  Editar
                </Button>
              )}
              {canCharge && t.status !== 'anulado' && Number(t.balance) > 0 && (
                <Button variant="success" icon={<Banknote />} onClick={() => setPayOpen(true)}>
                  Registrar abono
                </Button>
              )}
            </>
          )
        }
      >
        {loading && !t ? (
          <LoadingBlock />
        ) : error ? (
          <ErrorBox message={error} onRetry={() => void reload()} />
        ) : t ? (
          <div className="space-y-6">
            {/* Resumen financiero */}
            <div className="grid grid-cols-3 gap-2">
              {[
                { label: 'Total', value: t.total, tone: 'text-slate-900' },
                { label: 'Pagado', value: t.paid, tone: 'text-teal-700' },
                { label: 'Saldo', value: t.balance, tone: Number(t.balance) > 0 ? 'text-amber-700' : 'text-slate-500' },
              ].map((k) => (
                <div key={k.label} className="rounded-xl bg-slate-50 p-3">
                  <p className="text-[11px] uppercase tracking-wide text-slate-500">{k.label}</p>
                  <p className={cn('mt-0.5 text-base font-semibold tabular-nums sm:text-lg', k.tone)}>{money(k.value, cur)}</p>
                </div>
              ))}
            </div>
            <div>
              <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                <div className="h-full rounded-full bg-teal-500 transition-all" style={{ width: `${progress}%` }} />
              </div>
              <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
                <span>
                  {progress.toFixed(0)}% cobrado · {done}/{items.length} procedimientos realizados
                </span>
                {canEdit ? (
                  <Select className="h-8 w-auto text-xs" value={t.status} onChange={(e) => void changeStatus(e.target.value as TreatmentStatus)}>
                    {(Object.keys(TREATMENT_STATUS) as TreatmentStatus[]).map((s) => (
                      <option key={s} value={s}>
                        {TREATMENT_STATUS[s].label}
                      </option>
                    ))}
                  </Select>
                ) : (
                  <Badge tone={TREATMENT_STATUS[t.status].tone}>{TREATMENT_STATUS[t.status].label}</Badge>
                )}
              </div>
            </div>

            {/* Procedimientos */}
            <section>
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">Procedimientos</h4>
              <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
                {items.map((it) => (
                  <li key={it.id} className="flex items-center gap-3 px-3 py-2.5">
                    <button
                      type="button"
                      disabled={!canEdit || !it.id}
                      onClick={() => it.id && void toggleDone(it.id, !it.done)}
                      className={cn('shrink-0', it.done ? 'text-teal-600' : 'text-slate-300 hover:text-slate-500')}
                      aria-label={it.done ? 'Marcar pendiente' : 'Marcar realizado'}
                    >
                      {it.done ? <CircleCheck className="h-5 w-5" /> : <Circle className="h-5 w-5" />}
                    </button>
                    <div className="min-w-0 flex-1">
                      <p className={cn('truncate text-sm', it.done && 'text-slate-400 line-through')}>{it.description}</p>
                      <p className="text-xs text-slate-500">
                        {it.tooth_number ? `Pieza ${it.tooth_number} · ` : ''}
                        {it.quantity} × {money(it.unit_price, cur)}
                      </p>
                    </div>
                    <p className="text-sm font-medium tabular-nums">{money(it.quantity * Number(it.unit_price), cur)}</p>
                  </li>
                ))}
              </ul>
              {Number(t.discount) > 0 && <p className="mt-2 text-right text-xs text-slate-500">Descuento aplicado: {money(t.discount, cur)}</p>}
              {t.notes && <p className="mt-3 whitespace-pre-line text-sm text-slate-600">{t.notes}</p>}
            </section>

            {/* Pagos */}
            <section>
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">Abonos registrados</h4>
              {t.payments?.length ? (
                <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
                  {t.payments.map((p) => (
                    <li key={p.id} className="flex items-center gap-3 px-3 py-2.5">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-teal-50 text-teal-600">
                        <Receipt className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium tabular-nums">{money(p.amount, cur)}</p>
                        <p className="truncate text-xs text-slate-500">
                          {docNumber('R', p.number)} · {PAYMENT_METHODS[p.method]} · {fmtDateTime(p.paid_at)}
                        </p>
                      </div>
                      <Button size="icon-sm" variant="ghost" onClick={() => setPrint({ kind: 'receipt', payment: p })} aria-label="Imprimir recibo">
                        <Printer />
                      </Button>
                      {can(['admin']) && (
                        <Button size="icon-sm" variant="ghost" className="text-rose-500" onClick={() => setToDelete(p)} aria-label="Anular pago">
                          <Trash2 />
                        </Button>
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="rounded-xl border border-dashed border-slate-200 p-4 text-center text-sm text-slate-500">
                  Aún no hay abonos.
                </p>
              )}
            </section>
          </div>
        ) : null}
      </Modal>

      <PaymentModal
        open={payOpen}
        onClose={() => setPayOpen(false)}
        treatment={t}
        onSaved={async (p) => {
          await refresh();
          setPrint({ kind: 'receipt', payment: p });
        }}
      />
      <TreatmentEditorModal open={editOpen} onClose={() => setEditOpen(false)} treatment={t} onSaved={() => void refresh()} />
      <PrintPreviewModal open={!!print} onClose={() => setPrint(null)} kind={print?.kind ?? 'budget'} treatment={t} payment={print?.payment} />
      <ConfirmDialog
        open={!!toDelete}
        title="Anular pago"
        message={`Se eliminará el abono ${toDelete ? docNumber('R', toDelete.number) : ''} por ${money(toDelete?.amount, cur)} y se recalculará el saldo.`}
        confirmLabel="Anular pago"
        danger
        loading={busy}
        onConfirm={removePayment}
        onClose={() => setToDelete(null)}
      />
    </>
  );
}
