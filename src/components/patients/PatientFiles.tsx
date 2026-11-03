import { useRef, useState } from 'react';
import { Download, Eye, FileImage, FileText, FolderOpen, Trash2, Upload } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { useAsync } from '../../hooks/useAsync';
import { errorMessage } from '../../lib/supabase';
import { deletePatientFile, getFileUrl, listPatientFiles, uploadPatientFile } from '../../services/files';
import type { FileCategory, PatientFile } from '../../types';
import { FILE_CATEGORIES } from '../../utils/constants';
import { cn, fmtDateTime } from '../../utils/format';
import { formatBytes } from '../../utils/image';
import { Button } from '../ui/Button';
import { ConfirmDialog, EmptyState, ErrorBox, LoadingBlock } from '../ui/Feedback';
import { Input, Select } from '../ui/Field';
import { Badge, Card, CardHeader } from '../ui/Primitives';

const ACCEPT = 'image/jpeg,image/png,image/webp,application/pdf';

/** Radiografías, fotografías clínicas y documentos del paciente (Storage privado). */
export function PatientFiles({ patientId }: { patientId: string }) {
  const toast = useToast();
  const { can } = useAuth();
  const canView = can(['admin', 'doctor', 'asistente']);
  const canDelete = can(['admin', 'doctor']);
  const { data, loading, error, reload, setData } = useAsync(() => (canView ? listPatientFiles(patientId) : Promise.resolve([])), [patientId, canView]);
  const inputRef = useRef<HTMLInputElement>(null);
  const [category, setCategory] = useState<FileCategory>('radiografia');
  const [description, setDescription] = useState('');
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const [toDelete, setToDelete] = useState<PatientFile | null>(null);
  const [deleting, setDeleting] = useState(false);

  if (!canView) {
    return <EmptyState icon={<FolderOpen />} title="Acceso restringido" description="Los archivos clínicos solo son visibles para el personal clínico." />;
  }

  const upload = async (list: FileList | File[] | null | undefined) => {
    const files = Array.from(list ?? []);
    if (!files.length || progress) return;
    setProgress({ done: 0, total: files.length });
    let ok = 0;
    for (const f of files) {
      try {
        const saved = await uploadPatientFile(patientId, f, { category, description: description || null });
        setData((cur) => [saved, ...(cur ?? [])]);
        ok++;
      } catch (e) {
        toast.error(`${f.name}: ${errorMessage(e)}`);
      }
      setProgress((p) => (p ? { ...p, done: p.done + 1 } : p));
    }
    setProgress(null);
    setDescription('');
    if (inputRef.current) inputRef.current.value = '';
    if (ok) toast.success(ok === 1 ? 'Archivo subido' : `${ok} archivos subidos`);
  };

  const view = async (f: PatientFile) => {
    // Se abre la pestaña de inmediato (dentro del clic) para que el navegador no la bloquee
    const w = window.open('', '_blank');
    if (w) w.opener = null;
    try {
      const url = await getFileUrl(f);
      if (w) w.location.href = url;
      else window.location.assign(url);
    } catch (e) {
      w?.close();
      toast.error(errorMessage(e));
    }
  };

  const download = async (f: PatientFile) => {
    try {
      const a = document.createElement('a');
      a.href = await getFileUrl(f, true);
      a.rel = 'noopener';
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  const remove = async () => {
    if (!toDelete) return;
    setDeleting(true);
    try {
      await deletePatientFile(toDelete);
      setData((cur) => (cur ?? []).filter((x) => x.id !== toDelete.id));
      toast.success('Archivo eliminado');
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
      <CardHeader title="Radiografías y archivos" subtitle="JPG, PNG, WEBP o PDF · máx. 10 MB · las imágenes grandes se optimizan al subir" icon={<FolderOpen />} />

      <div
        className={cn(
          'flex flex-col gap-2 border-b border-dashed border-slate-200 p-4 transition sm:flex-row sm:items-center',
          dragging && 'bg-sky-50',
        )}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          void upload(e.dataTransfer.files);
        }}
      >
        <Select className="sm:w-48" value={category} onChange={(e) => setCategory(e.target.value as FileCategory)} aria-label="Categoría">
          {(Object.keys(FILE_CATEGORIES) as FileCategory[]).map((c) => (
            <option key={c} value={c}>
              {FILE_CATEGORIES[c]}
            </option>
          ))}
        </Select>
        <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Descripción (opcional): periapical pieza 36…" maxLength={200} />
        <input ref={inputRef} type="file" multiple accept={ACCEPT} className="hidden" onChange={(e) => void upload(e.target.files)} />
        <Button icon={<Upload />} loading={!!progress} onClick={() => inputRef.current?.click()}>
          {progress ? `Subiendo ${progress.done + 1}/${progress.total}` : 'Subir archivos'}
        </Button>
      </div>

      {loading && !data ? (
        <LoadingBlock />
      ) : error ? (
        <div className="p-4">
          <ErrorBox message={error} onRetry={() => void reload()} />
        </div>
      ) : rows.length === 0 ? (
        <EmptyState icon={<FileImage />} title="Sin archivos" description="Arrastra aquí radiografías, fotografías o PDFs, o usa el botón “Subir archivos”." />
      ) : (
        <ul className="divide-y divide-slate-100">
          {rows.map((f) => {
            const isPdf = f.mime_type === 'application/pdf';
            return (
              <li key={f.id} className="flex items-center gap-3 px-4 py-3">
                <div
                  className={cn(
                    'flex h-10 w-10 shrink-0 items-center justify-center rounded-lg',
                    isPdf ? 'bg-rose-50 text-rose-600' : 'bg-sky-50 text-sky-600',
                  )}
                >
                  {isPdf ? <FileText className="h-5 w-5" /> : <FileImage className="h-5 w-5" />}
                </div>
                <button type="button" className="min-w-0 flex-1 text-left" onClick={() => void view(f)}>
                  <p className="truncate text-sm font-medium hover:text-sky-700">{f.description || f.file_name}</p>
                  <p className="truncate text-xs text-slate-500">
                    {f.description ? `${f.file_name} · ` : ''}
                    {fmtDateTime(f.created_at)} · {formatBytes(f.size_bytes)}
                  </p>
                </button>
                <Badge tone={f.category === 'radiografia' ? 'violet' : 'slate'} className="hidden sm:inline-flex">
                  {FILE_CATEGORIES[f.category]}
                </Badge>
                <Button size="icon-sm" variant="ghost" onClick={() => void view(f)} aria-label="Ver">
                  <Eye />
                </Button>
                <Button size="icon-sm" variant="ghost" onClick={() => void download(f)} aria-label="Descargar">
                  <Download />
                </Button>
                {canDelete && (
                  <Button size="icon-sm" variant="ghost" className="text-slate-400 hover:text-rose-600" onClick={() => setToDelete(f)} aria-label="Eliminar">
                    <Trash2 />
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <ConfirmDialog
        open={!!toDelete}
        title="Eliminar archivo"
        message={`Se eliminará definitivamente “${toDelete?.file_name ?? ''}”.`}
        danger
        confirmLabel="Eliminar"
        loading={deleting}
        onConfirm={remove}
        onClose={() => setToDelete(null)}
      />
    </Card>
  );
}
