import { useState } from 'react';
import { FilePlus2, FileText, Plus, Printer, Trash2, X } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useSettings } from '../../context/SettingsContext';
import { useToast } from '../../context/ToastContext';
import { useAsync } from '../../hooks/useAsync';
import { errorMessage } from '../../lib/supabase';
import { createDocument, deleteDocument, listDocuments } from '../../services/documents';
import type { ClinicalDocument, DocumentKind, Patient, PrescriptionItem } from '../../types';
import { DOC_KINDS } from '../../utils/constants';
import { DOC_TEMPLATES, type TemplateContext } from '../../utils/documentTemplates';
import { docNumber, fmtDate, fmtDateTime, fullName } from '../../utils/format';
import { Button } from '../ui/Button';
import { ConfirmDialog, EmptyState, ErrorBox, LoadingBlock } from '../ui/Feedback';
import { Field, Input, Select, Textarea } from '../ui/Field';
import { Modal } from '../ui/Modal';
import { Badge, Card, CardHeader } from '../ui/Primitives';
import { PrintHost } from '../ui/PrintHost';
import { ClinicalDocumentPrint } from './ClinicalDocumentPrint';

const emptyItem = (): PrescriptionItem => ({ drug: '', dose: '', frequency: '', duration: '', notes: '' });

function DocumentEditorModal({
  open,
  patient,
  onClose,
  onCreated,
}: {
  open: boolean;
  patient: Patient;
  onClose: () => void;
  onCreated: (d: ClinicalDocument) => void;
}) {
  const toast = useToast();
  const { profile } = useAuth();
  const { config } = useSettings();
  const [kind, setKind] = useState<DocumentKind>('receta');
  const [templateId, setTemplateId] = useState('receta');
  const [title, setTitle] = useState('Receta médica');
  const [body, setBody] = useState('');
  const [items, setItems] = useState<PrescriptionItem[]>([emptyItem()]);
  const [saving, setSaving] = useState(false);

  const ctx: TemplateContext = {
    patient: fullName(patient),
    document: patient.document_number ? `${patient.document_type} N° ${patient.document_number}` : 'documento N° ________',
    doctor: profile?.full_name || '________',
    date: fmtDate(new Date(), { day: '2-digit', month: 'long', year: 'numeric' }),
    business: config?.business_name || 'este consultorio',
  };

  const applyTemplate = (k: DocumentKind, id: string) => {
    const t = DOC_TEMPLATES[k].find((x) => x.id === id) ?? DOC_TEMPLATES[k][0];
    setTemplateId(t.id);
    setTitle(t.title);
    setBody(t.body(ctx));
  };

  const reset = () => {
    setKind('receta');
    applyTemplate('receta', 'receta');
    setItems([emptyItem()]);
  };

  const close = () => {
    if (saving) return;
    reset();
    onClose();
  };

  const setItem = (i: number, patch: Partial<PrescriptionItem>) => setItems((list) => list.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));

  const save = async () => {
    const validItems = kind === 'receta' ? items.filter((i) => i.drug.trim()) : [];
    if (!title.trim()) return toast.error('El título es obligatorio.');
    if (kind === 'receta' && !validItems.length && !body.trim()) return toast.error('Agrega al menos un medicamento o indicaciones.');
    if (kind !== 'receta' && !body.trim()) return toast.error('El contenido del documento está vacío.');
    if (body.includes('____') && kind !== 'receta') {
      // Recordatorio, no bloqueo: algunos campos pueden completarse a mano tras imprimir
      toast.info('El documento tiene espacios en blanco (____) por completar.');
    }
    setSaving(true);
    try {
      const doc = await createDocument({
        patient_id: patient.id,
        kind,
        title,
        body,
        items: validItems.map((i) => ({ ...i, drug: i.drug.trim(), dose: i.dose.trim(), frequency: i.frequency.trim(), duration: i.duration.trim(), notes: i.notes?.trim() || undefined })),
      });
      toast.success(`${DOC_KINDS[kind].label} emitida`);
      onCreated(doc);
      reset();
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
      size="lg"
      title="Nuevo documento clínico"
      subtitle={`${fullName(patient)} · se emite a nombre de ${profile?.full_name ?? 'tu usuario'}`}
      footer={
        <>
          <Button variant="secondary" onClick={close} disabled={saving}>
            Cancelar
          </Button>
          <Button icon={<FilePlus2 />} onClick={save} loading={saving}>
            Emitir documento
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Tipo de documento">
            <Select
              value={kind}
              onChange={(e) => {
                const k = e.target.value as DocumentKind;
                setKind(k);
                applyTemplate(k, DOC_TEMPLATES[k][0].id);
              }}
            >
              {(Object.keys(DOC_KINDS) as DocumentKind[]).map((k) => (
                <option key={k} value={k}>
                  {DOC_KINDS[k].label}
                </option>
              ))}
            </Select>
          </Field>
          {DOC_TEMPLATES[kind].length > 1 && (
            <Field label="Plantilla">
              <Select value={templateId} onChange={(e) => applyTemplate(kind, e.target.value)}>
                {DOC_TEMPLATES[kind].map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label}
                  </option>
                ))}
              </Select>
            </Field>
          )}
          <Field label="Título" required className="sm:col-span-2">
            <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={150} />
          </Field>
        </div>

        {kind === 'receta' && (
          <div>
            <div className="mb-2 flex items-center justify-between">
              <p className="text-xs font-medium text-slate-600">Medicamentos (Rp/)</p>
              <Button size="xs" variant="subtle" icon={<Plus />} onClick={() => setItems((l) => [...l, emptyItem()])}>
                Agregar
              </Button>
            </div>
            {patient.allergies.length > 0 && (
              <p className="mb-2 rounded-lg bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700">
                Alergias del paciente: {patient.allergies.join(', ')}
              </p>
            )}
            <div className="space-y-2">
              {items.map((it, i) => (
                <div key={i} className="grid gap-2 rounded-lg border border-slate-200 p-2.5 sm:grid-cols-[1.6fr_1fr_1fr_1fr_auto]">
                  <Input className="h-9" value={it.drug} onChange={(e) => setItem(i, { drug: e.target.value })} placeholder="Medicamento y concentración" aria-label="Medicamento" />
                  <Input className="h-9" value={it.dose} onChange={(e) => setItem(i, { dose: e.target.value })} placeholder="Dosis (1 tab.)" aria-label="Dosis" />
                  <Input className="h-9" value={it.frequency} onChange={(e) => setItem(i, { frequency: e.target.value })} placeholder="Cada (8 h)" aria-label="Frecuencia" />
                  <Input className="h-9" value={it.duration} onChange={(e) => setItem(i, { duration: e.target.value })} placeholder="Por (5 días)" aria-label="Duración" />
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    className="text-slate-400 hover:text-rose-600"
                    disabled={items.length === 1}
                    onClick={() => setItems((l) => l.filter((_, idx) => idx !== i))}
                    aria-label="Quitar medicamento"
                  >
                    <X />
                  </Button>
                  <Input
                    className="h-9 sm:col-span-5"
                    value={it.notes ?? ''}
                    onChange={(e) => setItem(i, { notes: e.target.value })}
                    placeholder="Observación (opcional): tomar después de los alimentos…"
                    aria-label="Observación"
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        <Field label={kind === 'receta' ? 'Indicaciones generales' : 'Contenido'} hint="Puedes editar libremente el texto antes de emitir. Una vez emitido no se modifica.">
          <Textarea rows={kind === 'receta' ? 3 : 12} value={body} onChange={(e) => setBody(e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}

function DocumentPreviewModal({
  doc,
  patient,
  onClose,
  onDelete,
}: {
  doc: ClinicalDocument | null;
  patient: Patient;
  onClose: () => void;
  onDelete?: () => void;
}) {
  const { config } = useSettings();
  if (!doc) return null;
  return (
    <Modal
      open
      onClose={onClose}
      size="xl"
      title={`${DOC_KINDS[doc.kind].label} ${docNumber(DOC_KINDS[doc.kind].prefix, doc.number)}`}
      subtitle="Usa “Imprimir / PDF” y elige “Guardar como PDF” para exportar"
      bodyClassName="bg-slate-100 p-3 sm:p-6"
      footer={
        <>
          {onDelete && (
            <Button variant="ghost" className="mr-auto text-rose-600" icon={<Trash2 />} onClick={onDelete}>
              Eliminar
            </Button>
          )}
          <Button variant="secondary" onClick={onClose}>
            Cerrar
          </Button>
          <Button icon={<Printer />} onClick={() => window.print()}>
            Imprimir / PDF
          </Button>
        </>
      }
    >
      <div className="overflow-hidden rounded-lg shadow-md ring-1 ring-slate-200">
        <ClinicalDocumentPrint doc={doc} patient={patient} config={config} />
      </div>
      <PrintHost>
        <ClinicalDocumentPrint doc={doc} patient={patient} config={config} />
      </PrintHost>
    </Modal>
  );
}

/** Recetas, consentimientos, indicaciones, constancias y referencias del paciente. */
export function PatientDocuments({ patient }: { patient: Patient }) {
  const toast = useToast();
  const { can } = useAuth();
  const canView = can(['admin', 'doctor', 'asistente']);
  const canCreate = can(['admin', 'doctor']);
  const isAdmin = can(['admin']);
  // Sin permiso no se consulta (evita peticiones que RLS rechazaría)
  const { data, loading, error, reload, setData } = useAsync(() => (canView ? listDocuments(patient.id) : Promise.resolve([])), [patient.id, canView]);
  const [editorOpen, setEditorOpen] = useState(false);
  const [preview, setPreview] = useState<ClinicalDocument | null>(null);
  const [toDelete, setToDelete] = useState<ClinicalDocument | null>(null);
  const [deleting, setDeleting] = useState(false);

  if (!canView) {
    return <EmptyState icon={<FileText />} title="Acceso restringido" description="Los documentos clínicos solo son visibles para el personal clínico." />;
  }

  const remove = async () => {
    if (!toDelete) return;
    setDeleting(true);
    try {
      await deleteDocument(toDelete.id);
      setData((cur) => (cur ?? []).filter((d) => d.id !== toDelete.id));
      setPreview(null);
      toast.success('Documento eliminado (queda registrado en la auditoría)');
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setDeleting(false);
      setToDelete(null);
    }
  };

  const rows = data ?? [];

  return (
    <Card>
      <CardHeader
        title="Recetas y documentos"
        subtitle="Recetas, consentimientos informados, indicaciones, constancias y referencias"
        icon={<FileText />}
        action={
          canCreate && (
            <Button size="sm" icon={<Plus />} onClick={() => setEditorOpen(true)}>
              Nuevo
            </Button>
          )
        }
      />
      {loading && !data ? (
        <LoadingBlock />
      ) : error ? (
        <div className="p-4">
          <ErrorBox message={error} onRetry={() => void reload()} />
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<FileText />}
          title="Sin documentos emitidos"
          description="Emite recetas y consentimientos con el membrete del consultorio, listos para imprimir o guardar en PDF."
        />
      ) : (
        <ul className="divide-y divide-slate-100">
          {rows.map((d) => (
            <li key={d.id}>
              <button type="button" onClick={() => setPreview(d)} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-slate-50">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{d.title}</p>
                  <p className="truncate text-xs text-slate-500">
                    {docNumber(DOC_KINDS[d.kind].prefix, d.number)} · {fmtDateTime(d.created_at)}
                    {d.doctor ? ` · ${d.doctor.full_name}` : ''}
                  </p>
                </div>
                <Badge tone={DOC_KINDS[d.kind].tone}>{DOC_KINDS[d.kind].label}</Badge>
                <Printer className="h-4 w-4 shrink-0 text-slate-400" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {canCreate && (
        <DocumentEditorModal
          open={editorOpen}
          patient={patient}
          onClose={() => setEditorOpen(false)}
          onCreated={(d) => {
            setData((cur) => [d, ...(cur ?? [])]);
            setPreview(d);
          }}
        />
      )}
      <DocumentPreviewModal doc={preview} patient={patient} onClose={() => setPreview(null)} onDelete={isAdmin && preview ? () => setToDelete(preview) : undefined} />
      <ConfirmDialog
        open={!!toDelete}
        title="Eliminar documento"
        message="El documento dejará de aparecer en el expediente. La acción queda registrada en la auditoría."
        danger
        confirmLabel="Eliminar"
        loading={deleting}
        onConfirm={remove}
        onClose={() => setToDelete(null)}
      />
    </Card>
  );
}
