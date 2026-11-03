import { useEffect, useState, type ReactNode } from 'react';
import { useToast } from '../../context/ToastContext';
import { errorMessage } from '../../lib/supabase';
import { createPatient, updatePatient } from '../../services/patients';
import type { Patient, PatientInput } from '../../types';
import { BLOOD_TYPES } from '../../utils/constants';
import { Button } from '../ui/Button';
import { Field, Input, Select, TagInput, Textarea } from '../ui/Field';
import { Modal } from '../ui/Modal';

const EMPTY: PatientInput = {
  document_type: 'DNI',
  document_number: '',
  first_name: '',
  last_name: '',
  birth_date: null,
  sex: null,
  phone: '',
  email: '',
  address: '',
  occupation: '',
  emergency_contact_name: '',
  emergency_contact_phone: '',
  blood_type: null,
  allergies: [],
  medical_alerts: [],
  medical_history: '',
  current_medications: '',
  notes: '',
  active: true,
};

const COMMON_ALLERGIES = ['Penicilina', 'Látex', 'Lidocaína', 'AINEs', 'Clorhexidina'];
const COMMON_ALERTS = ['Hipertensión', 'Diabetes', 'Anticoagulado', 'Cardiopatía', 'Embarazo', 'Asma'];

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className="space-y-4">
      <legend className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-400">{title}</legend>
      {children}
    </fieldset>
  );
}

export function PatientFormModal({
  open,
  onClose,
  patient,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  patient?: Patient | null;
  onSaved: (p: Patient) => void;
}) {
  const toast = useToast();
  const [form, setForm] = useState<PatientInput>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<keyof PatientInput, string>>>({});

  useEffect(() => {
    if (!open) return;
    setErrors({});
    if (patient) {
      const { id: _i, created_at: _c, updated_at: _u, created_by: _b, ...rest } = patient;
      setForm({ ...EMPTY, ...rest });
    } else setForm(EMPTY);
  }, [open, patient]);

  const set = <K extends keyof PatientInput>(k: K, v: PatientInput[K]) => setForm((f) => ({ ...f, [k]: v }));
  const str = (v: string | null) => v ?? '';

  const validate = () => {
    const e: typeof errors = {};
    if (!form.first_name.trim()) e.first_name = 'Requerido';
    if (!form.last_name.trim()) e.last_name = 'Requerido';
    if (form.document_type === 'DNI' && form.document_number && !/^\d{8}$/.test(form.document_number.trim()))
      e.document_number = 'El DNI debe tener 8 dígitos';
    if (form.email && !/^\S+@\S+\.\S+$/.test(form.email)) e.email = 'Correo no válido';
    if (form.birth_date && new Date(form.birth_date) > new Date()) e.birth_date = 'Fecha futura no válida';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const save = async () => {
    if (!validate()) return;
    setSaving(true);
    try {
      const saved = patient ? await updatePatient(patient.id, form) : await createPatient(form);
      toast.success(patient ? 'Paciente actualizado' : 'Paciente registrado');
      onSaved(saved);
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
      size="lg"
      title={patient ? 'Editar paciente' : 'Nuevo paciente'}
      subtitle="Los campos con * son obligatorios"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={save} loading={saving}>
            {patient ? 'Guardar cambios' : 'Registrar paciente'}
          </Button>
        </>
      }
    >
      <div className="space-y-8">
        <Section title="Datos personales">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Nombres" required error={errors.first_name}>
              <Input value={form.first_name} onChange={(e) => set('first_name', e.target.value)} autoFocus />
            </Field>
            <Field label="Apellidos" required error={errors.last_name}>
              <Input value={form.last_name} onChange={(e) => set('last_name', e.target.value)} />
            </Field>
            <div className="grid grid-cols-[110px_1fr] gap-2">
              <Field label="Documento">
                <Select value={form.document_type} onChange={(e) => set('document_type', e.target.value)}>
                  <option>DNI</option>
                  <option>CE</option>
                  <option>Pasaporte</option>
                  <option>RUC</option>
                </Select>
              </Field>
              <Field label="Número" error={errors.document_number}>
                <Input
                  inputMode="numeric"
                  value={str(form.document_number)}
                  onChange={(e) => set('document_number', e.target.value)}
                  maxLength={15}
                />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Fecha de nacimiento" error={errors.birth_date}>
                <Input type="date" value={str(form.birth_date)} onChange={(e) => set('birth_date', e.target.value || null)} />
              </Field>
              <Field label="Sexo">
                <Select value={str(form.sex)} onChange={(e) => set('sex', (e.target.value || null) as PatientInput['sex'])}>
                  <option value="">—</option>
                  <option value="F">Femenino</option>
                  <option value="M">Masculino</option>
                  <option value="O">Otro</option>
                </Select>
              </Field>
            </div>
            <Field label="Ocupación">
              <Input value={str(form.occupation)} onChange={(e) => set('occupation', e.target.value)} />
            </Field>
          </div>
        </Section>

        <Section title="Contacto">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Teléfono / WhatsApp">
              <Input type="tel" inputMode="tel" value={str(form.phone)} onChange={(e) => set('phone', e.target.value)} placeholder="9XX XXX XXX" />
            </Field>
            <Field label="Correo" error={errors.email}>
              <Input type="email" inputMode="email" value={str(form.email)} onChange={(e) => set('email', e.target.value)} />
            </Field>
            <Field label="Dirección" className="sm:col-span-2">
              <Input value={str(form.address)} onChange={(e) => set('address', e.target.value)} />
            </Field>
            <Field label="Contacto de emergencia">
              <Input value={str(form.emergency_contact_name)} onChange={(e) => set('emergency_contact_name', e.target.value)} />
            </Field>
            <Field label="Teléfono de emergencia">
              <Input type="tel" inputMode="tel" value={str(form.emergency_contact_phone)} onChange={(e) => set('emergency_contact_phone', e.target.value)} />
            </Field>
          </div>
        </Section>

        <Section title="Antecedentes médicos">
          <div className="grid gap-4 sm:grid-cols-[1fr_140px]">
            <Field label="Alergias críticas" hint="Enter para agregar">
              <TagInput value={form.allergies} onChange={(v) => set('allergies', v)} tone="rose" suggestions={COMMON_ALLERGIES} placeholder="Ej. Penicilina" />
            </Field>
            <Field label="Grupo sanguíneo">
              <Select value={str(form.blood_type)} onChange={(e) => set('blood_type', e.target.value || null)}>
                <option value="">—</option>
                {BLOOD_TYPES.map((b) => (
                  <option key={b}>{b}</option>
                ))}
              </Select>
            </Field>
          </div>
          <Field label="Alertas médicas" hint="Condiciones que el doctor debe ver antes de atender">
            <TagInput value={form.medical_alerts} onChange={(v) => set('medical_alerts', v)} tone="amber" suggestions={COMMON_ALERTS} placeholder="Ej. Hipertensión" />
          </Field>
          <Field label="Antecedentes patológicos">
            <Textarea value={str(form.medical_history)} onChange={(e) => set('medical_history', e.target.value)} placeholder="Enfermedades previas, cirugías, hospitalizaciones…" />
          </Field>
          <Field label="Medicación actual">
            <Textarea rows={2} value={str(form.current_medications)} onChange={(e) => set('current_medications', e.target.value)} />
          </Field>
          <Field label="Observaciones">
            <Textarea rows={2} value={str(form.notes)} onChange={(e) => set('notes', e.target.value)} />
          </Field>
        </Section>
      </div>
    </Modal>
  );
}
