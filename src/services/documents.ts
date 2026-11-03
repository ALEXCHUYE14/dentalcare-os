import { supabase, toAppError, unwrap } from '../lib/supabase';
import type { ClinicalDocument, ClinicalDocumentInput } from '../types';

const SELECT = '*, doctor:profiles(id,full_name,specialty,license_number)';

export async function listDocuments(patientId: string): Promise<ClinicalDocument[]> {
  return unwrap<ClinicalDocument[]>(
    await supabase
      .from('clinical_documents')
      .select(SELECT)
      .eq('patient_id', patientId)
      .order('created_at', { ascending: false })
      .limit(100),
  );
}

export async function createDocument(input: ClinicalDocumentInput): Promise<ClinicalDocument> {
  const payload = {
    ...input,
    title: input.title.trim(),
    body: input.body?.trim() || null,
    items: input.items.filter((i) => i.drug.trim()),
  };
  return unwrap<ClinicalDocument>(await supabase.from('clinical_documents').insert(payload).select(SELECT).single());
}

export async function deleteDocument(id: string): Promise<void> {
  const { error } = await supabase.from('clinical_documents').delete().eq('id', id);
  if (error) throw toAppError(error);
}
