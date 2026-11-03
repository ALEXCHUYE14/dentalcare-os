import { supabase, toAppError, unwrap } from '../lib/supabase';
import type { LabOrder, LabOrderInput, LabStatus } from '../types';

const SELECT = '*, patient:patients(id,first_name,last_name,phone), doctor:profiles(id,full_name)';

export type LabFilter = 'activas' | 'vencidas' | 'cerradas' | 'todas';

const OPEN: LabStatus[] = ['pendiente', 'enviado', 'en_prueba', 'recibido'];

export async function listLabOrders({ filter, patientId, today }: { filter: LabFilter; patientId?: string; today: string }): Promise<LabOrder[]> {
  let q = supabase.from('lab_orders').select(SELECT).limit(300);
  if (patientId) q = q.eq('patient_id', patientId);
  if (filter === 'activas') q = q.in('status', OPEN);
  if (filter === 'vencidas') q = q.in('status', ['pendiente', 'enviado', 'en_prueba']).lt('due_date', today);
  if (filter === 'cerradas') q = q.in('status', ['instalado', 'anulado']);
  q = filter === 'cerradas' || filter === 'todas' ? q.order('created_at', { ascending: false }) : q.order('due_date', { ascending: true, nullsFirst: false });
  const rows = unwrap<LabOrder[]>(await q);
  return rows.map((o) => ({ ...o, cost: Number(o.cost) }));
}

function normalize(input: Partial<LabOrderInput>): Partial<LabOrderInput> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input)) out[k] = typeof v === 'string' ? v.trim() || null : v;
  return out as Partial<LabOrderInput>;
}

export async function saveLabOrder(input: LabOrderInput, id?: string): Promise<LabOrder> {
  const payload = normalize(input);
  const res = id
    ? await supabase.from('lab_orders').update(payload).eq('id', id).select(SELECT).single()
    : await supabase.from('lab_orders').insert(payload).select(SELECT).single();
  const o = unwrap<LabOrder>(res);
  return { ...o, cost: Number(o.cost) };
}

export async function setLabStatus(id: string, status: LabStatus): Promise<LabOrder> {
  const o = unwrap<LabOrder>(await supabase.from('lab_orders').update({ status }).eq('id', id).select(SELECT).single());
  return { ...o, cost: Number(o.cost) };
}

export async function deleteLabOrder(id: string): Promise<void> {
  const { error } = await supabase.from('lab_orders').delete().eq('id', id);
  if (error) throw toAppError(error);
}
