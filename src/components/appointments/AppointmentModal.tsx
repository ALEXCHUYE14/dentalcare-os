import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ExternalLink, MessageCircle, Trash2 } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useSettings } from '../../context/SettingsContext';
import { useToast } from '../../context/ToastContext';
import { useCatalogs } from '../../hooks/useCatalogs';
import { errorMessage } from '../../lib/supabase';
import { createAppointment, deleteAppointment, updateAppointment } from '../../services/appointments';
import type { Appointment, AppointmentInput, AppointmentStatus, PatientRef } from '../../types';
import { APPT_STATUS, APPT_STATUS_ORDER, DURATIONS, TREATMENT_TYPES } from '../../utils/constants';
import { cn, fmtDate, fmtTime, fullName, toISODate, toTimeInput, waLink } from '../../utils/format';
import { PatientPicker } from '../patients/PatientPicker';
import { Button } from '../ui/Button';
import { ConfirmDialog } from '../ui/Feedback';
import { Field, Input, Select, Textarea } from '../ui/Field';
import { Modal } from '../ui/Modal';

export interface AppointmentDraft {
  starts_at?: Date;
  chair_id?: string | null;
  doctor_id?: string | null;
  patient?: PatientRef | null;
}

export function AppointmentModal({
  open,
  onClose,
  appointment,
  draft,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  appointment?: Appointment | null;
  draft?: AppointmentDraft;
  onSaved: () => void;
}) {
  const toast = useToast();
  const { can, profile } = useAuth();
  const { config } = useSettings();
  const { doctors, chairs } = useCatalogs();

  const [patient, setPatient] = useState<PatientRef | null>(null);
  const [doctorId, setDoctorId] = useState('');
  const [chairId, setChairId] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('09:00');
  const [duration, setDuration] = useState(30);
  const [type, setType] = useState('Consulta');
  const [status, setStatus] = useState<AppointmentStatus>('programada');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (appointment) {
      const s = new Date(appointment.starts_at);
      const e = new Date(appointment.ends_at);
      setPatient(appointment.patient ?? null);
      setDoctorId(appointment.doctor_id ?? '');
      setChairId(appointment.chair_id ?? '');
      setDate(toISODate(s));
      setTime(toTimeInput(s));
      setDuration(Math.max(5, Math.round((e.getTime() - s.getTime()) / 60000)));
      setType(appointment.treatment_type);
      setStatus(appointment.status);
      setNotes(appointment.notes ?? '');
    } else {
      const s = draft?.starts_at ?? new Date();
      setPatient(draft?.patient ?? null);
      setDoctorId(draft?.doctor_id ?? (profile?.role === 'doctor' ? profile.id : ''));
      setChairId(draft?.chair_id ?? '');
      setDate(toISODate(s));
      setTime(draft?.starts_at ? toTimeInput(s) : (config?.open_time ?? '09:00').slice(0, 5));
      setDuration(30);
      setType('Consulta');
      setStatus('programada');
      setNotes('');
    }
    // Solo se reinicia al abrir o al cambiar de cita (draft puede ser un objeto nuevo en cada render)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, appointment?.id]);

  const durationOptions = DURATIONS.includes(duration) ? DURATIONS : [...DURATIONS, duration].sort((a, b) => a - b);

  const save = async () => {
    if (!patient) return toast.error('Selecciona un paciente.');
    if (!date || !time) return toast.error('Indica fecha y hora.');
    const starts = new Date(`${date}T${time}`);
    if (Number.isNaN(starts.getTime())) return toast.error('Fecha u hora no válida.');
    const ends = new Date(starts.getTime() + duration * 60000);
    const input: AppointmentInput = {
      patient_id: patient.id,
      doctor_id: doctorId || null,
      chair_id: chairId || null,
      starts_at: starts.toISOString(),
      ends_at: ends.toISOString(),
      treatment_type: type,
      status,
      notes: notes.trim() || null,
    };
    setSaving(true);
    try {
      if (appointment) await updateAppointment(appointment.id, input);
      else await createAppointment(input);
      toast.success(appointment ? 'Cita actualizada' : 'Cita agendada');
      onSaved();
      onClose();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!appointment) return;
    setDeleting(true);
    try {
      await deleteAppointment(appointment.id);
      toast.success('Cita eliminada');
      setConfirmDelete(false);
      onSaved();
      onClose();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setDeleting(false);
    }
  };

  const reminder =
    appointment && patient
      ? `Hola ${patient.first_name}, le recordamos su cita en ${config?.business_name ?? 'el consultorio'} el ${fmtDate(appointment.starts_at, {
          weekday: 'long',
          day: 'numeric',
          month: 'long',
        })} a las ${fmtTime(appointment.starts_at)}. Responda SÍ para confirmar.`
      : '';

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        title={appointment ? 'Detalle de cita' : 'Nueva cita'}
        subtitle={appointment ? fullName(appointment.patient) : 'Agenda una atención en un sillón y horario disponible'}
        footer={
          <>
            {appointment && can(['admin', 'recepcionista']) && (
              <Button variant="ghost" className="mr-auto text-rose-600" icon={<Trash2 />} onClick={() => setConfirmDelete(true)}>
                Eliminar
              </Button>
            )}
            <Button variant="secondary" onClick={onClose}>
              Cancelar
            </Button>
            <Button onClick={save} loading={saving}>
              {appointment ? 'Guardar' : 'Agendar cita'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Paciente" required>
            <PatientPicker value={patient} onChange={setPatient} disabled={!!appointment} />
          </Field>
          {appointment && patient && (
            <div className="flex flex-wrap gap-2">
              <Link to={`/pacientes/${patient.id}`} className="inline-flex items-center gap-1 text-xs font-medium text-sky-700 hover:underline">
                <ExternalLink className="h-3.5 w-3.5" /> Ver expediente
              </Link>
              {patient.phone && (
                <a
                  href={waLink(patient.phone, reminder)}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-xs font-medium text-teal-700 hover:underline"
                >
                  <MessageCircle className="h-3.5 w-3.5" /> Enviar recordatorio por WhatsApp
                </a>
              )}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Field label="Fecha" required className="col-span-2 sm:col-span-1">
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </Field>
            <Field label="Hora" required>
              <Input type="time" step={300} value={time} onChange={(e) => setTime(e.target.value)} />
            </Field>
            <Field label="Duración">
              <Select value={duration} onChange={(e) => setDuration(Number(e.target.value))}>
                {durationOptions.map((d) => (
                  <option key={d} value={d}>
                    {d < 60 ? `${d} min` : `${Math.floor(d / 60)} h${d % 60 ? ` ${d % 60} min` : ''}`}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Doctor">
              <Select value={doctorId} onChange={(e) => setDoctorId(e.target.value)}>
                <option value="">Sin asignar</option>
                {doctors.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.full_name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Sillón / Box">
              <Select value={chairId} onChange={(e) => setChairId(e.target.value)}>
                <option value="">Sin asignar</option>
                {chairs.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Tratamiento">
              <Select value={type} onChange={(e) => setType(e.target.value)}>
                {(TREATMENT_TYPES.includes(type) ? TREATMENT_TYPES : [type, ...TREATMENT_TYPES]).map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </Select>
            </Field>
          </div>

          <Field label="Estado">
            <div className="flex flex-wrap gap-1.5">
              {APPT_STATUS_ORDER.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setStatus(s)}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition',
                    status === s
                      ? 'border-slate-900 bg-slate-900 text-white'
                      : 'border-slate-200 text-slate-600 hover:bg-slate-50',
                  )}
                >
                  <span className={cn('h-2 w-2 rounded-full', APPT_STATUS[s].dot)} />
                  {APPT_STATUS[s].label}
                </button>
              ))}
            </div>
          </Field>

          <Field label="Notas">
            <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Motivo de consulta, indicaciones…" />
          </Field>
        </div>
      </Modal>
      <ConfirmDialog
        open={confirmDelete}
        title="Eliminar cita"
        message="Esta acción no se puede deshacer. Si solo quieres liberar el horario, cambia el estado a Cancelada."
        confirmLabel="Eliminar"
        danger
        loading={deleting}
        onConfirm={remove}
        onClose={() => setConfirmDelete(false)}
      />
    </>
  );
}
