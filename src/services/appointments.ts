import { supabase, toAppError, unwrap } from '../lib/supabase';
import type { Appointment, AppointmentInput, AppointmentStatus } from '../types';

const SELECT =
  '*, patient:patients(id,first_name,last_name,phone), doctor:profiles!appointments_doctor_id_fkey(id,full_name,color), chair:chairs(id,name)';

export interface AppointmentFilters {
  from: Date;
  to: Date;
  doctorId?: string;
  chairId?: string;
  treatmentType?: string;
  hideCancelled?: boolean;
}

export async function listAppointments(f: AppointmentFilters): Promise<Appointment[]> {
  let q = supabase
    .from('appointments')
    .select(SELECT)
    .gte('starts_at', f.from.toISOString())
    .lt('starts_at', f.to.toISOString())
    .order('starts_at');
  if (f.doctorId) q = q.eq('doctor_id', f.doctorId);
  if (f.chairId) q = q.eq('chair_id', f.chairId);
  if (f.treatmentType) q = q.eq('treatment_type', f.treatmentType);
  if (f.hideCancelled) q = q.neq('status', 'cancelada');
  return unwrap<Appointment[]>(await q);
}

export async function listPatientAppointments(patientId: string): Promise<Appointment[]> {
  return unwrap<Appointment[]>(
    await supabase
      .from('appointments')
      .select(SELECT)
      .eq('patient_id', patientId)
      .order('starts_at', { ascending: false })
      .limit(100),
  );
}

export async function createAppointment(input: AppointmentInput): Promise<Appointment> {
  return unwrap<Appointment>(await supabase.from('appointments').insert(input).select(SELECT).single());
}

export async function updateAppointment(id: string, patch: Partial<AppointmentInput>): Promise<Appointment> {
  return unwrap<Appointment>(await supabase.from('appointments').update(patch).eq('id', id).select(SELECT).single());
}

export async function setAppointmentStatus(id: string, status: AppointmentStatus): Promise<Appointment> {
  return updateAppointment(id, { status });
}

export async function deleteAppointment(id: string): Promise<void> {
  const { error } = await supabase.from('appointments').delete().eq('id', id);
  if (error) throw toAppError(error);
}
