import { supabase, toAppError, unwrap } from '../lib/supabase';
import type { OdontogramRecord } from '../types';

export async function getOdontogram(patientId: string): Promise<OdontogramRecord[]> {
  return unwrap<OdontogramRecord[]>(
    await supabase.from('odontogram_records').select('*').eq('patient_id', patientId).order('tooth_number'),
  );
}

export async function saveTooth(rec: OdontogramRecord): Promise<OdontogramRecord> {
  const payload = {
    patient_id: rec.patient_id,
    tooth_number: rec.tooth_number,
    condition: rec.condition,
    status: rec.status,
    surfaces: rec.surfaces,
    notes: rec.notes?.trim() ? rec.notes.trim() : null,
  };
  return unwrap<OdontogramRecord>(
    await supabase
      .from('odontogram_records')
      .upsert(payload, { onConflict: 'patient_id,tooth_number' })
      .select()
      .single(),
  );
}

export async function clearTooth(patientId: string, toothNumber: number): Promise<void> {
  const { error } = await supabase
    .from('odontogram_records')
    .delete()
    .eq('patient_id', patientId)
    .eq('tooth_number', toothNumber);
  if (error) throw toAppError(error);
}
