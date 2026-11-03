import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Briefcase,
  CalendarDays,
  CalendarPlus,
  ClipboardList,
  Droplet,
  FileText,
  FolderOpen,
  HeartPulse,
  History,
  Mail,
  MapPin,
  MessageCircle,
  Pencil,
  Phone,
  Pill,
  Plus,
  Power,
  Smile,
  Trash2,
  User,
  Wallet,
} from 'lucide-react';
import { AppointmentModal } from '../components/appointments/AppointmentModal';
import { TreatmentDetailModal } from '../components/billing/TreatmentDetailModal';
import { TreatmentEditorModal } from '../components/billing/TreatmentEditorModal';
import { PatientDocuments } from '../components/documents/PatientDocuments';
import { Odontogram } from '../components/odontogram/Odontogram';
import { MedicalAlerts } from '../components/patients/MedicalAlerts';
import { PatientFiles } from '../components/patients/PatientFiles';
import { PatientFormModal } from '../components/patients/PatientFormModal';
import { Button } from '../components/ui/Button';
import { ConfirmDialog, EmptyState, ErrorBox, LoadingBlock } from '../components/ui/Feedback';
import { Field, Input, Textarea } from '../components/ui/Field';
import { Avatar, Badge, Card, CardHeader, InfoRow, Tabs } from '../components/ui/Primitives';
import { useAuth } from '../context/AuthContext';
import { useSettings } from '../context/SettingsContext';
import { useToast } from '../context/ToastContext';
import { useAsync } from '../hooks/useAsync';
import { errorMessage } from '../lib/supabase';
import { listPatientAppointments } from '../services/appointments';
import { createNote, deleteNote, getPatient, listNotes, setPatientActive } from '../services/patients';
import { listTreatments } from '../services/treatments';
import type { Appointment, Patient } from '../types';
import { APPT_STATUS, TREATMENT_STATUS } from '../utils/constants';
import { ageFrom, docNumber, fmtDate, fmtDateTime, fmtTime, fullName, money, waLink } from '../utils/format';

type Tab = 'resumen' | 'odontograma' | 'historial' | 'documentos' | 'archivos' | 'presupuestos' | 'citas';

function Summary({ p }: { p: Patient }) {
  const sexLabel = p.sex === 'F' ? 'Femenino' : p.sex === 'M' ? 'Masculino' : p.sex === 'O' ? 'Otro' : null;
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader title="Datos personales" icon={<User />} />
        <div className="grid gap-x-6 px-4 py-2 sm:grid-cols-2">
          <InfoRow label="Documento" value={p.document_number ? `${p.document_type} ${p.document_number}` : null} />
          <InfoRow label="Nacimiento" value={p.birth_date ? `${fmtDate(p.birth_date)} (${ageFrom(p.birth_date)} años)` : null} />
          <InfoRow label="Sexo" value={sexLabel} />
          <InfoRow label="Ocupación" value={p.occupation} icon={<Briefcase />} />
          <InfoRow label="Teléfono" value={p.phone} icon={<Phone />} />
          <InfoRow label="Correo" value={p.email} icon={<Mail />} />
          <div className="sm:col-span-2">
            <InfoRow label="Dirección" value={p.address} icon={<MapPin />} />
          </div>
          <InfoRow label="Contacto de emergencia" value={[p.emergency_contact_name, p.emergency_contact_phone].filter(Boolean).join(' · ')} />
        </div>
      </Card>
      <Card>
        <CardHeader title="Antecedentes médicos" icon={<HeartPulse />} />
        <div className="px-4 py-2">
          <InfoRow label="Grupo sanguíneo" value={p.blood_type} icon={<Droplet />} />
          <InfoRow label="Antecedentes patológicos" value={p.medical_history && <span className="whitespace-pre-line">{p.medical_history}</span>} icon={<ClipboardList />} />
          <InfoRow label="Medicación actual" value={p.current_medications} icon={<Pill />} />
          <InfoRow label="Observaciones" value={p.notes && <span className="whitespace-pre-line">{p.notes}</span>} icon={<FileText />} />
        </div>
      </Card>
    </div>
  );
}

function ClinicalHistory({ patientId }: { patientId: string }) {
  const toast = useToast();
  const { can, profile } = useAuth();
  const canWrite = can(['admin', 'doctor']);
  const canView = can(['admin', 'doctor', 'asistente']);
  // Sin permiso no se consulta (RLS devolvería vacío y la petición solo gastaría cuota)
  const { data, loading, error, reload, setData } = useAsync(() => (canView ? listNotes(patientId) : Promise.resolve([])), [patientId, canView]);
  const [title, setTitle] = useState('');
  const [procedure, setProcedure] = useState('');
  const [teeth, setTeeth] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [toDelete, setToDelete] = useState<string | null>(null);

  if (!canView) {
    return <EmptyState icon={<History />} title="Acceso restringido" description="Las notas clínicas solo son visibles para el personal clínico." />;
  }

  const save = async () => {
    if (!title.trim() || !notes.trim()) return toast.error('Completa el título y la evolución.');
    setSaving(true);
    try {
      const n = await createNote({ patient_id: patientId, title: title.trim(), procedure: procedure.trim() || null, teeth: teeth.trim() || null, notes: notes.trim() });
      setData((cur) => [n, ...(cur ?? [])]);
      setTitle('');
      setProcedure('');
      setTeeth('');
      setNotes('');
      toast.success('Nota clínica registrada');
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!toDelete) return;
    try {
      await deleteNote(toDelete);
      setData((cur) => (cur ?? []).filter((n) => n.id !== toDelete));
      toast.success('Nota eliminada');
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setToDelete(null);
    }
  };

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
      <div className="order-2 lg:order-1">
        {loading && !data ? (
          <LoadingBlock />
        ) : error ? (
          <ErrorBox message={error} onRetry={() => void reload()} />
        ) : !data?.length ? (
          <Card>
            <EmptyState icon={<History />} title="Sin evoluciones registradas" description="Cada sesión clínica quedará documentada aquí en orden cronológico." />
          </Card>
        ) : (
          <ol className="relative space-y-4 border-l-2 border-slate-200 pl-6">
            {data.map((n) => (
              <li key={n.id} className="relative">
                <span className="absolute -left-[31px] top-4 h-3 w-3 rounded-full border-2 border-white bg-teal-500" />
                <Card className="p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-medium">{n.title}</p>
                      <p className="text-xs text-slate-500">
                        {fmtDateTime(n.created_at)}
                        {n.doctor ? ` · ${n.doctor.full_name}` : ''}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {n.teeth && <Badge tone="sky">Piezas {n.teeth}</Badge>}
                      {n.procedure && <Badge tone="teal">{n.procedure}</Badge>}
                      {can(['admin']) && (
                        <Button size="icon-sm" variant="ghost" className="text-slate-400 hover:text-rose-600" onClick={() => setToDelete(n.id)} aria-label="Eliminar nota">
                          <Trash2 />
                        </Button>
                      )}
                    </div>
                  </div>
                  <p className="mt-2 whitespace-pre-line text-sm text-slate-700">{n.notes}</p>
                </Card>
              </li>
            ))}
          </ol>
        )}
      </div>
      {canWrite && (
        <Card className="order-1 self-start lg:order-2">
          <CardHeader title="Nueva evolución" subtitle={profile?.full_name} icon={<Plus />} />
          <div className="space-y-3 p-4">
            <Field label="Título de la sesión" required>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ej. Sesión 2 – Endodoncia" />
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Procedimiento">
                <Input value={procedure} onChange={(e) => setProcedure(e.target.value)} placeholder="Endodoncia" />
              </Field>
              <Field label="Piezas">
                <Input value={teeth} onChange={(e) => setTeeth(e.target.value)} placeholder="36, 37" inputMode="numeric" />
              </Field>
            </div>
            <Field label="Evolución / notas clínicas" required>
              <Textarea rows={5} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Hallazgos, procedimiento realizado, anestesia, indicaciones, próxima cita…" />
            </Field>
            <Button className="w-full" onClick={save} loading={saving}>
              Registrar evolución
            </Button>
          </div>
        </Card>
      )}
      <ConfirmDialog open={!!toDelete} title="Eliminar nota clínica" message="La nota se eliminará del historial (quedará en la auditoría)." danger confirmLabel="Eliminar" onConfirm={remove} onClose={() => setToDelete(null)} />
    </div>
  );
}

function PatientTreatments({ patient }: { patient: Patient }) {
  const { can } = useAuth();
  const { config } = useSettings();
  const cur = config?.currency ?? 'PEN';
  const canView = can(['admin', 'doctor', 'recepcionista']);
  const { data, loading, error, reload } = useAsync(
    () => (canView ? listTreatments({ patientId: patient.id, pageSize: 50 }) : Promise.resolve({ rows: [], total: 0 })),
    [patient.id, canView],
  );
  const [newOpen, setNewOpen] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const rows = data?.rows ?? [];
  const pending = rows.filter((r) => r.status !== 'anulado').reduce((s, r) => s + Number(r.balance), 0);

  if (!canView) {
    return <EmptyState icon={<Wallet />} title="Acceso restringido" description="Tu rol no tiene acceso a la información financiera." />;
  }

  return (
    <Card>
      <CardHeader
        title="Presupuestos y planes"
        subtitle={`Saldo pendiente del paciente: ${money(pending, cur)}`}
        icon={<Wallet />}
        action={
          <Button size="sm" icon={<Plus />} onClick={() => setNewOpen(true)}>
            Nuevo
          </Button>
        }
      />
      {loading && !data ? (
        <LoadingBlock />
      ) : error ? (
        <div className="p-4">
          <ErrorBox message={error} onRetry={() => void reload()} />
        </div>
      ) : rows.length === 0 ? (
        <EmptyState icon={<FileText />} title="Sin presupuestos" description="Crea un plan de tratamiento con el detalle por pieza." />
      ) : (
        <ul className="divide-y divide-slate-100">
          {rows.map((t) => (
            <li key={t.id}>
              <button type="button" onClick={() => setOpenId(t.id)} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-slate-50">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{t.title}</p>
                  <p className="text-xs text-slate-500">
                    {docNumber('P', t.number)} · {fmtDate(t.created_at)}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold tabular-nums">{money(t.total, cur)}</p>
                  <p className="text-xs tabular-nums text-amber-600">Saldo {money(t.balance, cur)}</p>
                </div>
                <Badge tone={TREATMENT_STATUS[t.status].tone}>{TREATMENT_STATUS[t.status].label}</Badge>
              </button>
            </li>
          ))}
        </ul>
      )}
      <TreatmentEditorModal open={newOpen} onClose={() => setNewOpen(false)} patient={patient} onSaved={(id) => (void reload(true), setOpenId(id))} />
      <TreatmentDetailModal treatmentId={openId} onClose={() => setOpenId(null)} onChanged={() => void reload(true)} />
    </Card>
  );
}

function PatientAppointments({ patient }: { patient: Patient }) {
  const { data, loading, error, reload } = useAsync(() => listPatientAppointments(patient.id), [patient.id]);
  const [modal, setModal] = useState<{ appt: Appointment | null } | null>(null);
  const now = Date.now();
  const rows = data ?? [];
  return (
    <Card>
      <CardHeader
        title="Citas del paciente"
        subtitle={`${rows.filter((a) => new Date(a.starts_at).getTime() >= now && a.status !== 'cancelada').length} próximas`}
        icon={<CalendarDays />}
        action={
          <Button size="sm" icon={<CalendarPlus />} onClick={() => setModal({ appt: null })}>
            Agendar
          </Button>
        }
      />
      {loading && !data ? (
        <LoadingBlock />
      ) : error ? (
        <div className="p-4">
          <ErrorBox message={error} onRetry={() => void reload()} />
        </div>
      ) : rows.length === 0 ? (
        <EmptyState icon={<CalendarDays />} title="Sin citas registradas" />
      ) : (
        <ul className="divide-y divide-slate-100">
          {rows.map((a) => (
            <li key={a.id}>
              <button type="button" onClick={() => setModal({ appt: a })} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-slate-50">
                <div className="w-14 shrink-0 text-center">
                  <p className="text-[11px] uppercase text-slate-400">{fmtDate(a.starts_at, { month: 'short' })}</p>
                  <p className="text-lg font-semibold leading-tight">{fmtDate(a.starts_at, { day: '2-digit' })}</p>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{a.treatment_type}</p>
                  <p className="truncate text-xs text-slate-500">
                    {fmtTime(a.starts_at)}–{fmtTime(a.ends_at)}
                    {a.doctor ? ` · ${a.doctor.full_name}` : ''}
                    {a.chair ? ` · ${a.chair.name}` : ''}
                  </p>
                </div>
                <Badge tone={APPT_STATUS[a.status].tone}>{APPT_STATUS[a.status].label}</Badge>
              </button>
            </li>
          ))}
        </ul>
      )}
      <AppointmentModal
        open={!!modal}
        appointment={modal?.appt}
        draft={{ patient }}
        onClose={() => setModal(null)}
        onSaved={() => void reload(true)}
      />
    </Card>
  );
}

export default function PatientDetailPage() {
  const { id = '' } = useParams();
  const toast = useToast();
  const { can } = useAuth();
  const { data: p, loading, error, reload, setData } = useAsync(() => getPatient(id), [id]);
  const [tab, setTab] = useState<Tab>('resumen');
  const [editOpen, setEditOpen] = useState(false);
  const [confirmToggle, setConfirmToggle] = useState(false);
  const canWrite = can(['admin', 'doctor', 'recepcionista']);

  if (loading && !p) return <LoadingBlock label="Cargando expediente…" />;
  if (error || !p)
    return (
      <div className="space-y-4">
        <Link to="/pacientes" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800">
          <ArrowLeft className="h-4 w-4" /> Pacientes
        </Link>
        <ErrorBox message={error ?? 'Paciente no encontrado'} onRetry={() => void reload()} />
      </div>
    );

  const age = ageFrom(p.birth_date);

  const toggleActive = async () => {
    try {
      const next = await setPatientActive(p.id, !p.active);
      setData(next);
      toast.success(next.active ? 'Paciente reactivado' : 'Paciente archivado');
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setConfirmToggle(false);
    }
  };

  return (
    <div className="space-y-5">
      <Link to="/pacientes" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800">
        <ArrowLeft className="h-4 w-4" /> Pacientes
      </Link>

      <Card className="p-4 sm:p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <div className="flex min-w-0 flex-1 items-center gap-4">
            <Avatar name={fullName(p)} size="lg" />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="truncate text-xl font-semibold tracking-tight">{fullName(p)}</h1>
                {!p.active && <Badge tone="slate">Archivado</Badge>}
              </div>
              <p className="mt-0.5 text-sm text-slate-500">
                {[p.document_number && `${p.document_type} ${p.document_number}`, age !== null && `${age} años`, p.blood_type && `Grupo ${p.blood_type}`]
                  .filter(Boolean)
                  .join(' · ') || 'Sin datos de identificación'}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {p.phone && (
              <>
                <a href={`tel:${p.phone}`}>
                  <Button variant="secondary" size="sm" icon={<Phone />}>
                    Llamar
                  </Button>
                </a>
                <a href={waLink(p.phone, `Hola ${p.first_name}`)} target="_blank" rel="noreferrer">
                  <Button variant="secondary" size="sm" icon={<MessageCircle />}>
                    WhatsApp
                  </Button>
                </a>
              </>
            )}
            {canWrite && (
              <Button variant="secondary" size="sm" icon={<Pencil />} onClick={() => setEditOpen(true)}>
                Editar
              </Button>
            )}
            {canWrite && (
              <Button variant="ghost" size="sm" icon={<Power />} onClick={() => setConfirmToggle(true)}>
                {p.active ? 'Archivar' : 'Reactivar'}
              </Button>
            )}
          </div>
        </div>
        {(p.allergies.length > 0 || p.medical_alerts.length > 0) && (
          <div className="mt-4">
            <MedicalAlerts patient={p} />
          </div>
        )}
      </Card>

      <Tabs<Tab>
        value={tab}
        onChange={setTab}
        tabs={[
          { id: 'resumen', label: 'Ficha', icon: <User /> },
          { id: 'odontograma', label: 'Odontograma', icon: <Smile /> },
          { id: 'historial', label: 'Historial clínico', icon: <History /> },
          { id: 'documentos', label: 'Recetas y documentos', icon: <FileText /> },
          { id: 'archivos', label: 'Radiografías', icon: <FolderOpen /> },
          { id: 'presupuestos', label: 'Presupuestos', icon: <Wallet /> },
          { id: 'citas', label: 'Citas', icon: <CalendarDays /> },
        ]}
      />

      <div className="animate-fade">
        {tab === 'resumen' && <Summary p={p} />}
        {tab === 'odontograma' && <Odontogram patientId={p.id} canEdit={can(['admin', 'doctor'])} />}
        {tab === 'historial' && <ClinicalHistory patientId={p.id} />}
        {tab === 'documentos' && <PatientDocuments patient={p} />}
        {tab === 'archivos' && <PatientFiles patientId={p.id} />}
        {tab === 'presupuestos' && <PatientTreatments patient={p} />}
        {tab === 'citas' && <PatientAppointments patient={p} />}
      </div>

      <PatientFormModal open={editOpen} onClose={() => setEditOpen(false)} patient={p} onSaved={setData} />
      <ConfirmDialog
        open={confirmToggle}
        title={p.active ? 'Archivar paciente' : 'Reactivar paciente'}
        message={p.active ? 'El paciente dejará de aparecer en la lista de activos. Su historial se conserva.' : 'El paciente volverá a la lista de activos.'}
        confirmLabel={p.active ? 'Archivar' : 'Reactivar'}
        onConfirm={toggleActive}
        onClose={() => setConfirmToggle(false)}
      />
    </div>
  );
}
