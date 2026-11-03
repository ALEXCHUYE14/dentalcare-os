import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarClock, FlaskConical, Plus, Save, Trash2, TriangleAlert } from 'lucide-react';
import { PatientPicker } from '../components/patients/PatientPicker';
import { Button } from '../components/ui/Button';
import { ConfirmDialog, EmptyState, ErrorBox, LoadingBlock } from '../components/ui/Feedback';
import { Field, Input, Select, Textarea } from '../components/ui/Field';
import { Modal } from '../components/ui/Modal';
import { Badge, Card, PageHeader, Segmented } from '../components/ui/Primitives';
import { useAuth } from '../context/AuthContext';
import { useSettings } from '../context/SettingsContext';
import { useToast } from '../context/ToastContext';
import { useAsync } from '../hooks/useAsync';
import { useCatalogs } from '../hooks/useCatalogs';
import { errorMessage } from '../lib/supabase';
import { deleteLabOrder, listLabOrders, saveLabOrder, setLabStatus, type LabFilter } from '../services/lab';
import type { LabOrder, LabStatus, PatientRef } from '../types';
import { LAB_NEXT, LAB_STATUS, LAB_WORK_TYPES } from '../utils/constants';
import { cn, docNumber, fmtDate, fullName, money, round2, toISODate } from '../utils/format';

const SHADES = ['BL1', 'BL2', 'A1', 'A2', 'A3', 'A3.5', 'A4', 'B1', 'B2', 'B3', 'B4', 'C1', 'C2', 'C3', 'C4', 'D2', 'D3', 'D4'];

function LabOrderModal({
  open,
  order,
  labNames,
  onClose,
  onSaved,
  onDelete,
}: {
  open: boolean;
  order: LabOrder | null;
  labNames: string[];
  onClose: () => void;
  onSaved: (o: LabOrder) => void;
  onDelete?: () => void;
}) {
  const toast = useToast();
  const { profile } = useAuth();
  const { doctors } = useCatalogs();
  const [patient, setPatient] = useState<PatientRef | null>(null);
  const [f, setF] = useState({
    doctor_id: '',
    lab_name: '',
    work_type: LAB_WORK_TYPES[0],
    teeth: '',
    shade: '',
    status: 'pendiente' as LabStatus,
    sent_at: '',
    due_date: '',
    cost: '',
    notes: '',
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setPatient(order?.patient ?? null);
    setF({
      doctor_id: order?.doctor_id ?? (profile?.role === 'doctor' ? profile.id : ''),
      lab_name: order?.lab_name ?? labNames[0] ?? '',
      work_type: order?.work_type ?? LAB_WORK_TYPES[0],
      teeth: order?.teeth ?? '',
      shade: order?.shade ?? '',
      status: order?.status ?? 'pendiente',
      sent_at: order?.sent_at ?? '',
      due_date: order?.due_date ?? '',
      cost: order ? String(order.cost) : '',
      notes: order?.notes ?? '',
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, order?.id]);

  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((d) => ({ ...d, [k]: e.target.value }));

  const save = async () => {
    if (!patient) return toast.error('Selecciona el paciente.');
    if (!f.lab_name.trim()) return toast.error('Indica el laboratorio.');
    if (!f.work_type.trim()) return toast.error('Indica el tipo de trabajo.');
    const cost = f.cost.trim() ? round2(Number(f.cost.replace(',', '.'))) : 0;
    if (!Number.isFinite(cost) || cost < 0) return toast.error('Costo inválido.');
    if (f.sent_at && f.due_date && f.due_date < f.sent_at) return toast.error('La entrega no puede ser anterior al envío.');
    setSaving(true);
    try {
      const saved = await saveLabOrder(
        {
          patient_id: patient.id,
          doctor_id: f.doctor_id || null,
          lab_name: f.lab_name,
          work_type: f.work_type,
          teeth: f.teeth || null,
          shade: f.shade || null,
          status: f.status,
          sent_at: f.sent_at || null,
          due_date: f.due_date || null,
          cost,
          notes: f.notes || null,
        },
        order?.id,
      );
      toast.success(order ? 'Orden actualizada' : `Orden ${docNumber('LAB', saved.number)} creada`);
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
      onClose={() => !saving && onClose()}
      size="lg"
      title={order ? `Orden ${docNumber('LAB', order.number)}` : 'Nueva orden de laboratorio'}
      footer={
        <>
          {onDelete && (
            <Button variant="ghost" className="mr-auto text-rose-600" icon={<Trash2 />} onClick={onDelete} disabled={saving}>
              Eliminar
            </Button>
          )}
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button icon={<Save />} onClick={save} loading={saving}>
            Guardar
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Paciente" required className="sm:col-span-2">
          <PatientPicker value={patient} onChange={setPatient} disabled={!!order} />
        </Field>
        <Field label="Tipo de trabajo" required>
          <Input value={f.work_type} onChange={set('work_type')} list="lab-work-types" />
          <datalist id="lab-work-types">
            {LAB_WORK_TYPES.map((t) => (
              <option key={t} value={t} />
            ))}
          </datalist>
        </Field>
        <Field label="Laboratorio" required>
          <Input value={f.lab_name} onChange={set('lab_name')} list="lab-names" placeholder="Nombre del laboratorio" />
          <datalist id="lab-names">
            {labNames.map((n) => (
              <option key={n} value={n} />
            ))}
          </datalist>
        </Field>
        <Field label="Piezas">
          <Input value={f.teeth} onChange={set('teeth')} placeholder="11, 21" />
        </Field>
        <Field label="Color (guía VITA)">
          <Input value={f.shade} onChange={set('shade')} list="lab-shades" placeholder="A2" />
          <datalist id="lab-shades">
            {SHADES.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
        </Field>
        <Field label="Doctor">
          <Select value={f.doctor_id} onChange={set('doctor_id')}>
            <option value="">Sin asignar</option>
            {doctors.map((d) => (
              <option key={d.id} value={d.id}>
                {d.full_name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Estado">
          <Select value={f.status} onChange={set('status')}>
            {(Object.keys(LAB_STATUS) as LabStatus[]).map((s) => (
              <option key={s} value={s}>
                {LAB_STATUS[s].label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Fecha de envío" hint="Se completa sola al marcar como enviado">
          <Input type="date" value={f.sent_at} onChange={set('sent_at')} />
        </Field>
        <Field label="Entrega prometida">
          <Input type="date" value={f.due_date} onChange={set('due_date')} />
        </Field>
        <Field label="Costo del laboratorio">
          <Input inputMode="decimal" value={f.cost} onChange={(e) => setF((d) => ({ ...d, cost: e.target.value.replace(/[^\d.,]/g, '') }))} placeholder="0.00" />
        </Field>
        <Field label="Indicaciones al laboratorio" className="sm:col-span-2">
          <Textarea rows={3} value={f.notes} onChange={set('notes')} placeholder="Material, tipo de terminación, observaciones de la prueba…" />
        </Field>
      </div>
    </Modal>
  );
}

export default function LabPage() {
  const toast = useToast();
  const { can } = useAuth();
  const { config } = useSettings();
  const cur = config?.currency ?? 'PEN';
  const [filter, setFilter] = useState<LabFilter>('activas');
  const today = toISODate(new Date());
  const { data, loading, error, reload, setData } = useAsync(() => listLabOrders({ filter, today }), [filter, today]);
  const [modal, setModal] = useState<{ order: LabOrder | null } | null>(null);
  const [toDelete, setToDelete] = useState<LabOrder | null>(null);
  const rows = useMemo(() => data ?? [], [data]);
  const labNames = useMemo(() => [...new Set(rows.map((o) => o.lab_name))].sort(), [rows]);
  const isOverdue = (o: LabOrder) => !!o.due_date && o.due_date < today && ['pendiente', 'enviado', 'en_prueba'].includes(o.status);
  const overdue = rows.filter(isOverdue).length;

  const advance = async (o: LabOrder, to: LabStatus) => {
    try {
      const saved = await setLabStatus(o.id, to);
      setData((list) => (list ?? []).map((x) => (x.id === o.id ? saved : x)));
      toast.success(`${docNumber('LAB', o.number)}: ${LAB_STATUS[to].label.toLowerCase()}`);
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  const upsertLocal = (o: LabOrder) =>
    setData((list) => {
      const cur = list ?? [];
      return cur.some((x) => x.id === o.id) ? cur.map((x) => (x.id === o.id ? o : x)) : [o, ...cur];
    });

  return (
    <div>
      <PageHeader
        title="Laboratorio dental"
        subtitle="Coronas, prótesis y demás trabajos enviados al laboratorio"
        actions={
          <Button icon={<Plus />} onClick={() => setModal({ order: null })}>
            Nueva orden
          </Button>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Segmented
          size="sm"
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'activas', label: 'En curso' },
            { value: 'vencidas', label: 'Vencidas' },
            { value: 'cerradas', label: 'Cerradas' },
            { value: 'todas', label: 'Todas' },
          ]}
        />
        {filter === 'activas' && overdue > 0 && (
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-rose-700">
            <TriangleAlert className="h-3.5 w-3.5" /> {overdue} con entrega vencida
          </span>
        )}
      </div>

      <Card>
        {error ? (
          <div className="p-4">
            <ErrorBox message={error} onRetry={() => void reload()} />
          </div>
        ) : loading && !data ? (
          <LoadingBlock />
        ) : !rows.length ? (
          <EmptyState
            icon={<FlaskConical />}
            title={filter === 'vencidas' ? 'Nada vencido' : 'Sin órdenes'}
            description="Registra cada trabajo que envías al laboratorio para controlar fechas de entrega y costos."
          />
        ) : (
          <ul className="divide-y divide-slate-100">
            {rows.map((o) => {
              const next = LAB_NEXT[o.status];
              const late = isOverdue(o);
              return (
                <li key={o.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:gap-3">
                  <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setModal({ order: o })}>
                    <p className="truncate text-sm font-medium">
                      <span className="font-mono text-xs text-slate-400">{docNumber('LAB', o.number)}</span> {o.work_type}
                      {o.teeth ? ` · pzas ${o.teeth}` : ''}
                      {o.shade ? ` · ${o.shade}` : ''}
                    </p>
                    <p className="truncate text-xs text-slate-500">
                      <Link to={`/pacientes/${o.patient_id}`} onClick={(e) => e.stopPropagation()} className="font-medium text-slate-700 hover:underline">
                        {fullName(o.patient)}
                      </Link>
                      {` · ${o.lab_name}`}
                      {o.doctor ? ` · ${o.doctor.full_name}` : ''}
                      {o.cost > 0 ? ` · ${money(o.cost, cur)}` : ''}
                    </p>
                  </button>
                  <div className="flex flex-wrap items-center gap-2">
                    {o.due_date && (
                      <span className={cn('inline-flex items-center gap-1 text-xs', late ? 'font-semibold text-rose-700' : 'text-slate-500')}>
                        <CalendarClock className="h-3.5 w-3.5" />
                        {late ? 'Venció ' : 'Entrega '}
                        {fmtDate(o.due_date, { day: '2-digit', month: 'short' })}
                      </span>
                    )}
                    <Badge tone={LAB_STATUS[o.status].tone}>{LAB_STATUS[o.status].label}</Badge>
                    {next && (
                      <Button size="xs" variant="subtle" onClick={() => void advance(o, next.to)}>
                        {next.label}
                      </Button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <LabOrderModal
        open={!!modal}
        order={modal?.order ?? null}
        labNames={labNames}
        onClose={() => setModal(null)}
        onSaved={(o) => {
          upsertLocal(o);
          if (filter !== 'todas') void reload(true); // el cambio de estado puede sacarla del filtro actual
        }}
        onDelete={can(['admin']) && modal?.order ? () => setToDelete(modal.order) : undefined}
      />
      <ConfirmDialog
        open={!!toDelete}
        title="Eliminar orden"
        message="Si el trabajo se canceló, es preferible marcarla como “Anulado” para conservar el historial."
        danger
        confirmLabel="Eliminar"
        onClose={() => setToDelete(null)}
        onConfirm={async () => {
          try {
            if (toDelete) await deleteLabOrder(toDelete.id);
            setData((list) => (list ?? []).filter((x) => x.id !== toDelete?.id));
            setModal(null);
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
