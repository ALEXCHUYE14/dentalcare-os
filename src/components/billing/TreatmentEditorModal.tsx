import { useEffect, useMemo, useState } from 'react';
import { GripVertical, Plus, Trash2 } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useSettings } from '../../context/SettingsContext';
import { useToast } from '../../context/ToastContext';
import { useCatalogs } from '../../hooks/useCatalogs';
import { errorMessage } from '../../lib/supabase';
import { saveTreatment } from '../../services/treatments';
import type { PatientRef, Treatment, TreatmentItem, TreatmentStatus } from '../../types';
import { TREATMENT_STATUS } from '../../utils/constants';
import { addDays, money, round2, toISODate } from '../../utils/format';
import { PatientPicker } from '../patients/PatientPicker';
import { Button } from '../ui/Button';
import { Field, Input, Select, Textarea } from '../ui/Field';
import { Modal } from '../ui/Modal';

const newItem = (): TreatmentItem => ({ tooth_number: null, description: '', quantity: 1, unit_price: 0, done: false, sort_order: 0 });

const VALID_TEETH = new Set<number>([
  ...[11, 12, 13, 14, 15, 16, 17, 18, 21, 22, 23, 24, 25, 26, 27, 28, 31, 32, 33, 34, 35, 36, 37, 38, 41, 42, 43, 44, 45, 46, 47, 48],
  ...[51, 52, 53, 54, 55, 61, 62, 63, 64, 65, 71, 72, 73, 74, 75, 81, 82, 83, 84, 85],
]);

export function TreatmentEditorModal({
  open,
  onClose,
  treatment,
  patient: fixedPatient,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  treatment?: Treatment | null;
  patient?: PatientRef | null;
  onSaved: (id: string) => void;
}) {
  const toast = useToast();
  const { profile } = useAuth();
  const { config } = useSettings();
  const { doctors, procedures } = useCatalogs();
  const cur = config?.currency ?? 'PEN';

  const [patient, setPatient] = useState<PatientRef | null>(null);
  const [doctorId, setDoctorId] = useState('');
  const [title, setTitle] = useState('Plan de tratamiento');
  const [status, setStatus] = useState<TreatmentStatus>('borrador');
  const [validUntil, setValidUntil] = useState('');
  const [discount, setDiscount] = useState('0');
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState<TreatmentItem[]>([newItem()]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (treatment) {
      setPatient(treatment.patient ?? null);
      setDoctorId(treatment.doctor_id ?? '');
      setTitle(treatment.title);
      setStatus(treatment.status);
      setValidUntil(treatment.valid_until ?? '');
      setDiscount(String(treatment.discount ?? 0));
      setNotes(treatment.notes ?? '');
      setItems(treatment.items?.length ? treatment.items.map((i) => ({ ...i })) : [newItem()]);
    } else {
      setPatient(fixedPatient ?? null);
      setDoctorId(profile?.role === 'doctor' ? profile.id : '');
      setTitle('Plan de tratamiento');
      setStatus('borrador');
      setValidUntil(toISODate(addDays(new Date(), 30)));
      setDiscount('0');
      setNotes('');
      setItems([newItem()]);
    }
  }, [open, treatment, fixedPatient, profile]);

  const subtotal = useMemo(() => round2(items.reduce((s, i) => s + (Number(i.quantity) || 0) * (Number(i.unit_price) || 0), 0)), [items]);
  const disc = round2(Number(discount.replace(',', '.')) || 0);
  const total = Math.max(round2(subtotal - disc), 0);
  const paid = Number(treatment?.paid ?? 0);

  const update = (idx: number, patch: Partial<TreatmentItem>) => setItems((list) => list.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  const move = (from: number, to: number) =>
    setItems((list) => {
      if (to < 0 || to >= list.length) return list;
      const next = [...list];
      const [x] = next.splice(from, 1);
      next.splice(to, 0, x);
      return next;
    });

  const addProcedure = (id: string) => {
    const p = procedures.find((x) => x.id === id);
    if (!p) return;
    setItems((list) => {
      const base = list.length === 1 && !list[0].description.trim() ? [] : list;
      return [...base, { ...newItem(), description: p.name, unit_price: Number(p.default_price) }];
    });
  };

  const save = async () => {
    if (!patient) return toast.error('Selecciona un paciente.');
    const clean = items.filter((i) => i.description.trim());
    if (!clean.length) return toast.error('Agrega al menos un procedimiento.');
    const badTooth = clean.find((i) => i.tooth_number !== null && !VALID_TEETH.has(i.tooth_number));
    if (badTooth) return toast.error(`La pieza ${badTooth.tooth_number} no es válida (notación FDI).`);
    if (clean.some((i) => i.quantity < 1 || i.unit_price < 0)) return toast.error('Revisa cantidades y precios.');
    if (disc < 0 || disc > subtotal) return toast.error('El descuento no puede superar el subtotal.');
    if (treatment && total < paid) return toast.error(`El total no puede ser menor a lo ya pagado (${money(paid, cur)}).`);

    setSaving(true);
    try {
      const id = await saveTreatment(
        {
          patient_id: patient.id,
          doctor_id: doctorId || null,
          title: title.trim() || 'Plan de tratamiento',
          status,
          discount: disc,
          notes: notes.trim() || null,
          valid_until: validUntil || null,
        },
        clean,
        treatment?.id,
      );
      toast.success(treatment ? 'Presupuesto actualizado' : 'Presupuesto creado');
      onSaved(id);
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
      size="xl"
      title={treatment ? `Editar presupuesto P-${String(treatment.number).padStart(6, '0')}` : 'Nuevo presupuesto'}
      subtitle="Plan de tratamiento odontológico con detalle por pieza"
      footer={
        <>
          <div className="mr-auto text-sm">
            <span className="text-slate-500">Total: </span>
            <b className="text-base tabular-nums">{money(total, cur)}</b>
          </div>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={save} loading={saving}>
            {treatment ? 'Guardar cambios' : 'Crear presupuesto'}
          </Button>
        </>
      }
    >
      <div className="space-y-6">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field label="Paciente" required>
            <PatientPicker value={patient} onChange={setPatient} disabled={!!treatment || !!fixedPatient} />
          </Field>
          <Field label="Título del plan">
            <Input value={title} onChange={(e) => setTitle(e.target.value)} />
          </Field>
          <div className="grid grid-cols-2 gap-3 md:col-span-2 md:grid-cols-3">
            <Field label="Doctor responsable">
              <Select value={doctorId} onChange={(e) => setDoctorId(e.target.value)}>
                <option value="">Sin asignar</option>
                {doctors.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.full_name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Estado">
              <Select value={status} onChange={(e) => setStatus(e.target.value as TreatmentStatus)}>
                {(Object.keys(TREATMENT_STATUS) as TreatmentStatus[]).map((s) => (
                  <option key={s} value={s}>
                    {TREATMENT_STATUS[s].label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Válido hasta" className="col-span-2 md:col-span-1">
              <Input type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} />
            </Field>
          </div>
        </div>

        <div>
          <div className="mb-2 flex flex-wrap items-end justify-between gap-2">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400">Procedimientos</h4>
            <Select className="h-9 w-full text-xs sm:w-72" value="" onChange={(e) => addProcedure(e.target.value)}>
              <option value="">+ Agregar desde catálogo…</option>
              {procedures.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} — {money(p.default_price, cur)}
                </option>
              ))}
            </Select>
          </div>

          <div className="space-y-2">
            <div className="hidden grid-cols-[20px_70px_1fr_70px_110px_100px_36px] gap-2 px-1 text-[11px] font-medium uppercase tracking-wide text-slate-400 md:grid">
              <span />
              <span>Pieza</span>
              <span>Descripción</span>
              <span className="text-right">Cant.</span>
              <span className="text-right">P. unitario</span>
              <span className="text-right">Importe</span>
              <span />
            </div>
            {items.map((it, idx) => (
              <div
                key={idx}
                className="grid grid-cols-[1fr_1fr] gap-2 rounded-lg border border-slate-200 p-2.5 md:grid-cols-[20px_70px_1fr_70px_110px_100px_36px] md:items-center md:border-0 md:p-0"
              >
                <div className="hidden flex-col md:flex">
                  <button type="button" onClick={() => move(idx, idx - 1)} className="text-slate-300 hover:text-slate-600" aria-label="Subir">
                    <GripVertical className="h-4 w-4" />
                  </button>
                </div>
                <Input
                  inputMode="numeric"
                  placeholder="Pieza"
                  value={it.tooth_number ?? ''}
                  onChange={(e) => {
                    const v = e.target.value.replace(/\D/g, '').slice(0, 2);
                    update(idx, { tooth_number: v ? Number(v) : null });
                  }}
                  className="h-9"
                />
                <Input
                  placeholder="Descripción del procedimiento"
                  value={it.description}
                  onChange={(e) => update(idx, { description: e.target.value })}
                  className="col-span-2 h-9 md:col-span-1"
                />
                <Input
                  inputMode="numeric"
                  value={it.quantity}
                  onChange={(e) => update(idx, { quantity: Math.max(1, Number(e.target.value.replace(/\D/g, '')) || 1) })}
                  className="h-9 text-right"
                />
                <Input
                  inputMode="decimal"
                  value={it.unit_price}
                  onChange={(e) => update(idx, { unit_price: Number(e.target.value.replace(',', '.').replace(/[^\d.]/g, '')) || 0 })}
                  className="h-9 text-right tabular-nums"
                />
                <p className="self-center text-right text-sm font-medium tabular-nums">{money(it.quantity * it.unit_price, cur)}</p>
                <button
                  type="button"
                  onClick={() => setItems((l) => (l.length > 1 ? l.filter((_, i) => i !== idx) : [newItem()]))}
                  className="justify-self-end rounded-md p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                  aria-label="Quitar"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
          <Button variant="ghost" size="sm" className="mt-2" icon={<Plus />} onClick={() => setItems((l) => [...l, newItem()])}>
            Agregar línea
          </Button>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-[1fr_280px]">
          <Field label="Notas / condiciones">
            <Textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Forma de pago, número de sesiones, indicaciones…" />
          </Field>
          <dl className="space-y-2 rounded-xl bg-slate-50 p-4 text-sm">
            <div className="flex justify-between">
              <dt className="text-slate-500">Subtotal</dt>
              <dd className="tabular-nums">{money(subtotal, cur)}</dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-slate-500">Descuento</dt>
              <dd>
                <Input inputMode="decimal" value={discount} onChange={(e) => setDiscount(e.target.value.replace(/[^\d.,]/g, ''))} className="h-8 w-28 text-right" />
              </dd>
            </div>
            <div className="flex justify-between border-t border-slate-200 pt-2 text-base font-semibold">
              <dt>Total</dt>
              <dd className="tabular-nums">{money(total, cur)}</dd>
            </div>
            {treatment && (
              <div className="flex justify-between text-xs text-slate-500">
                <dt>Pagado</dt>
                <dd className="tabular-nums">{money(paid, cur)}</dd>
              </div>
            )}
          </dl>
        </div>
      </div>
    </Modal>
  );
}
