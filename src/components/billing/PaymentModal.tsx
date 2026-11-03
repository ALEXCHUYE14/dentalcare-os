import { useEffect, useState } from 'react';
import { useSettings } from '../../context/SettingsContext';
import { useToast } from '../../context/ToastContext';
import { errorMessage } from '../../lib/supabase';
import { addPayment } from '../../services/treatments';
import type { Payment, PaymentMethod, Treatment } from '../../types';
import { PAYMENT_METHODS } from '../../utils/constants';
import { cn, money, round2 } from '../../utils/format';
import { Button } from '../ui/Button';
import { Field, Input, Textarea } from '../ui/Field';
import { Modal } from '../ui/Modal';

export function PaymentModal({
  open,
  onClose,
  treatment,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  treatment: Treatment | null;
  onSaved: (p: Payment) => void;
}) {
  const toast = useToast();
  const { config } = useSettings();
  const cur = config?.currency ?? 'PEN';
  const balance = Number(treatment?.balance ?? 0);
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<PaymentMethod>('efectivo');
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setAmount(balance > 0 ? balance.toFixed(2) : '');
      setMethod('efectivo');
      setReference('');
      setNotes('');
    }
  }, [open, balance]);

  const value = round2(Number(amount.replace(',', '.')));
  const invalid = !value || value <= 0 || value > balance + 0.009;

  const save = async () => {
    if (!treatment || invalid) return;
    setSaving(true);
    try {
      const p = await addPayment({
        treatment_id: treatment.id,
        patient_id: treatment.patient_id,
        amount: value,
        method,
        reference: reference.trim() || null,
        notes: notes.trim() || null,
      });
      toast.success(`Abono de ${money(value, cur)} registrado`);
      onSaved(p);
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
      onClose={onClose}
      size="sm"
      title="Registrar abono"
      subtitle={`Saldo pendiente: ${money(balance, cur)}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="success" onClick={save} loading={saving} disabled={invalid}>
            Registrar pago
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Monto" required error={value > balance + 0.009 ? 'El monto excede el saldo pendiente' : null}>
          <div className="relative">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">{cur === 'PEN' ? 'S/' : cur}</span>
            <Input
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value.replace(/[^\d.,]/g, ''))}
              className="h-12 pl-10 text-lg font-semibold tabular-nums"
              autoFocus
            />
          </div>
          <div className="mt-2 flex gap-1.5">
            {[0.25, 0.5, 1].map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setAmount(round2(balance * f).toFixed(2))}
                className="rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50"
              >
                {f === 1 ? 'Total' : `${f * 100}%`}
              </button>
            ))}
          </div>
        </Field>
        <Field label="Método de pago">
          <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-5">
            {(Object.keys(PAYMENT_METHODS) as PaymentMethod[]).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMethod(m)}
                className={cn(
                  'rounded-lg border px-2 py-2 text-xs font-medium transition',
                  method === m
                    ? 'border-teal-600 bg-teal-50 text-teal-700'
                    : 'border-slate-200 text-slate-600 hover:bg-slate-50',
                )}
              >
                {PAYMENT_METHODS[m]}
              </button>
            ))}
          </div>
        </Field>
        {method !== 'efectivo' && (
          <Field label="N° de operación / referencia">
            <Input value={reference} onChange={(e) => setReference(e.target.value)} inputMode="numeric" />
          </Field>
        )}
        <Field label="Nota">
          <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}
