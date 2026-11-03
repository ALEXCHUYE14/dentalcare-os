import { supabase, toAppError, unwrap } from '../lib/supabase';
import type { FileCategory, PatientFile } from '../types';
import { downscaleImage } from '../utils/image';

const BUCKET = 'clinical-files';
const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
/** Las URLs firmadas caducan pronto: el archivo solo se descarga cuando alguien lo abre. */
const SIGNED_TTL = 300;

export async function listPatientFiles(patientId: string): Promise<PatientFile[]> {
  return unwrap<PatientFile[]>(
    await supabase
      .from('patient_files')
      .select('*')
      .eq('patient_id', patientId)
      .order('created_at', { ascending: false })
      .limit(200),
  );
}

export async function uploadPatientFile(
  patientId: string,
  original: File,
  meta: { category: FileCategory; description: string | null },
): Promise<PatientFile> {
  if (!ALLOWED.includes(original.type)) throw new Error('Formato no permitido. Usa JPG, PNG, WEBP o PDF.');

  // Radiografías y fotos: máximo 3000 px y re-codificadas solo si pesan más de 1,5 MB.
  const file = await downscaleImage(original, { maxSide: 3000, maxBytes: 1.5 * 1024 * 1024, type: 'image/jpeg', quality: 0.92 });
  if (file.size > MAX_BYTES) throw new Error('El archivo supera los 10 MB.');

  const ext = (file.name.split('.').pop() || 'bin').toLowerCase().replace(/[^a-z0-9]/g, '') || 'bin';
  const path = `${patientId}/${crypto.randomUUID()}.${ext}`;

  const { error: upErr } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, { contentType: file.type, cacheControl: '31536000', upsert: false });
  if (upErr) throw toAppError(upErr);

  const { data, error } = await supabase
    .from('patient_files')
    .insert({
      patient_id: patientId,
      storage_path: path,
      file_name: original.name.slice(0, 200),
      mime_type: file.type,
      size_bytes: file.size,
      category: meta.category,
      description: meta.description?.trim() || null,
    })
    .select()
    .single();
  if (error) {
    await supabase.storage.from(BUCKET).remove([path]); // no dejar binarios huérfanos
    throw toAppError(error);
  }
  return data as PatientFile;
}

export async function getFileUrl(f: PatientFile, download = false): Promise<string> {
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(f.storage_path, SIGNED_TTL, download ? { download: f.file_name } : undefined);
  if (error || !data) throw toAppError(error ?? { message: 'No se pudo generar el enlace' });
  return data.signedUrl;
}

export async function deletePatientFile(f: PatientFile): Promise<void> {
  const { error: rmErr } = await supabase.storage.from(BUCKET).remove([f.storage_path]);
  if (rmErr) throw toAppError(rmErr);
  const { error } = await supabase.from('patient_files').delete().eq('id', f.id);
  if (error) throw toAppError(error);
}
