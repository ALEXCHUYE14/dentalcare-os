import { supabase, toAppError, unwrap } from '../lib/supabase';
import type { ClinicalNote, Patient, PatientInput, PatientListItem } from '../types';

const sanitize = (s: string) => s.replace(/[,()%*\\:]/g, ' ').trim();

const LIST_COLUMNS =
  'id,document_type,document_number,first_name,last_name,birth_date,phone,email,address,allergies,medical_alerts,active,created_at';

export interface PatientQuery {
  search?: string;
  page?: number;
  pageSize?: number;
  status?: 'active' | 'inactive' | 'all';
  /** El buscador no necesita el total: se omite el conteo para ahorrar trabajo en la base. */
  withCount?: boolean;
}

export async function listPatients({ search = '', page = 1, pageSize = 12, status = 'active', withCount = true }: PatientQuery = {}) {
  let q = supabase
    .from('patients')
    .select(LIST_COLUMNS, withCount ? { count: 'exact' } : undefined)
    .order('last_name')
    .order('first_name');

  // Cada palabra debe coincidir en algún campo (permite buscar "Juan Pérez")
  for (const word of sanitize(search).split(/\s+/).filter(Boolean)) {
    q = q.or(
      `first_name.ilike.%${word}%,last_name.ilike.%${word}%,document_number.ilike.%${word}%,phone.ilike.%${word}%`,
    );
  }
  if (status !== 'all') q = q.eq('active', status === 'active');

  const from = (page - 1) * pageSize;
  const { data, error, count } = await q.range(from, from + pageSize - 1);
  if (error) throw toAppError(error);
  return { rows: (data ?? []) as unknown as PatientListItem[], total: count ?? 0 };
}

export async function getPatient(id: string): Promise<Patient> {
  return unwrap<Patient>(await supabase.from('patients').select('*').eq('id', id).single());
}

function normalize(input: Partial<PatientInput>): Partial<PatientInput> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input)) {
    out[k] = typeof v === 'string' ? (v.trim() === '' ? null : v.trim()) : v;
  }
  return out as Partial<PatientInput>;
}

export async function createPatient(input: PatientInput): Promise<Patient> {
  return unwrap<Patient>(await supabase.from('patients').insert(normalize(input)).select().single());
}

export async function updatePatient(id: string, patch: Partial<PatientInput>): Promise<Patient> {
  return unwrap<Patient>(await supabase.from('patients').update(normalize(patch)).eq('id', id).select().single());
}

export async function setPatientActive(id: string, active: boolean): Promise<Patient> {
  return updatePatient(id, { active });
}

// ----- Historial clínico -----
export async function listNotes(patientId: string): Promise<ClinicalNote[]> {
  return unwrap<ClinicalNote[]>(
    await supabase
      .from('clinical_notes')
      .select('*, doctor:profiles(id,full_name)')
      .eq('patient_id', patientId)
      .order('created_at', { ascending: false }),
  );
}

export async function createNote(
  input: Pick<ClinicalNote, 'patient_id' | 'title' | 'procedure' | 'teeth' | 'notes'>,
): Promise<ClinicalNote> {
  return unwrap<ClinicalNote>(
    await supabase.from('clinical_notes').insert(input).select('*, doctor:profiles(id,full_name)').single(),
  );
}

export async function deleteNote(id: string): Promise<void> {
  const { error } = await supabase.from('clinical_notes').delete().eq('id', id);
  if (error) throw toAppError(error);
}
