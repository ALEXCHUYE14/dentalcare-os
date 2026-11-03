import { supabase, toAppError, unwrap } from '../lib/supabase';
import type {
  Payment,
  PaymentMethod,
  Procedure,
  Treatment,
  TreatmentHeaderInput,
  TreatmentItem,
  TreatmentStatus,
} from '../types';

const PATIENT_FIELDS = 'id,first_name,last_name,phone,document_number,email,address';
const T_SELECT = `*, patient:patients(${PATIENT_FIELDS}), doctor:profiles!treatments_doctor_id_fkey(id,full_name)`;

export interface TreatmentQuery {
  patientId?: string;
  status?: TreatmentStatus | '';
  search?: string;
  page?: number;
  pageSize?: number;
}

export async function listTreatments({ patientId, status, search = '', page = 1, pageSize = 15 }: TreatmentQuery = {}) {
  const term = search.replace(/[,()%*\\:]/g, ' ').trim();
  const select = term ? T_SELECT.replace('patient:patients(', 'patient:patients!inner(') : T_SELECT;
  let q = supabase.from('treatments').select(select, { count: 'exact' }).order('created_at', { ascending: false });
  if (patientId) q = q.eq('patient_id', patientId);
  if (status) q = q.eq('status', status);
  if (term) {
    for (const w of term.split(/\s+/)) {
      q = q.or(`first_name.ilike.%${w}%,last_name.ilike.%${w}%,document_number.ilike.%${w}%`, {
        referencedTable: 'patients',
      });
    }
  }
  const from = (page - 1) * pageSize;
  const { data, error, count } = await q.range(from, from + pageSize - 1);
  if (error) throw toAppError(error);
  return { rows: (data ?? []) as unknown as Treatment[], total: count ?? 0 };
}

export async function getTreatment(id: string): Promise<Treatment> {
  return unwrap<Treatment>(
    await supabase
      .from('treatments')
      .select(`${T_SELECT}, items:treatment_items(*), payments(*, receiver:profiles!payments_received_by_fkey(full_name))`)
      .eq('id', id)
      .order('sort_order', { referencedTable: 'treatment_items' })
      .order('paid_at', { referencedTable: 'payments' })
      .single(),
  );
}

/** Crea o actualiza el presupuesto y sincroniza sus ítems. Devuelve el id. */
export async function saveTreatment(header: TreatmentHeaderInput, items: TreatmentItem[], id?: string): Promise<string> {
  let tid = id;
  if (tid) {
    unwrap(await supabase.from('treatments').update(header).eq('id', tid).select('id').single());
  } else {
    tid = unwrap<{ id: string }>(await supabase.from('treatments').insert(header).select('id').single()).id;
  }

  const keepIds = items.filter((i) => i.id).map((i) => i.id as string);
  let del = supabase.from('treatment_items').delete().eq('treatment_id', tid);
  if (keepIds.length) del = del.not('id', 'in', `(${keepIds.join(',')})`);
  const { error: delErr } = await del;
  if (delErr) throw toAppError(delErr);

  const rows = items.map((it, idx) => ({
    id: it.id,
    treatment_id: tid as string,
    tooth_number: it.tooth_number,
    description: it.description.trim(),
    quantity: it.quantity,
    unit_price: it.unit_price,
    done: it.done,
    sort_order: idx,
  }));
  const existing = rows.filter((r) => r.id);
  const fresh = rows.filter((r) => !r.id).map(({ id: _id, ...r }) => r);

  if (existing.length) {
    const { error } = await supabase.from('treatment_items').upsert(existing);
    if (error) throw toAppError(error);
  }
  if (fresh.length) {
    const { error } = await supabase.from('treatment_items').insert(fresh);
    if (error) throw toAppError(error);
  }
  return tid as string;
}

export async function setTreatmentStatus(id: string, status: TreatmentStatus): Promise<void> {
  const { error } = await supabase.from('treatments').update({ status }).eq('id', id);
  if (error) throw toAppError(error);
}

export async function toggleItemDone(itemId: string, done: boolean): Promise<void> {
  const { error } = await supabase.from('treatment_items').update({ done }).eq('id', itemId);
  if (error) throw toAppError(error);
}

export interface PaymentInput {
  treatment_id: string;
  patient_id: string;
  amount: number;
  method: PaymentMethod;
  reference: string | null;
  notes: string | null;
}

export async function addPayment(input: PaymentInput): Promise<Payment> {
  return unwrap<Payment>(
    await supabase
      .from('payments')
      .insert(input)
      .select('*, receiver:profiles!payments_received_by_fkey(full_name)')
      .single(),
  );
}

export async function deletePayment(id: string): Promise<void> {
  const { error } = await supabase.from('payments').delete().eq('id', id);
  if (error) throw toAppError(error);
}

export async function listPayments({ from, to, method }: { from: Date; to: Date; method?: PaymentMethod | '' }) {
  let q = supabase
    .from('payments')
    .select('*, patient:patients(id,first_name,last_name), treatment:treatments(id,number,title)')
    .gte('paid_at', from.toISOString())
    .lt('paid_at', to.toISOString())
    .order('paid_at', { ascending: false });
  if (method) q = q.eq('method', method);
  return unwrap<Payment[]>(await q);
}

// ----- Catálogo de procedimientos -----
export async function listProcedures(includeInactive = false): Promise<Procedure[]> {
  let q = supabase.from('procedures').select('*').order('category').order('name');
  if (!includeInactive) q = q.eq('active', true);
  return unwrap<Procedure[]>(await q);
}

export async function saveProcedure(p: Partial<Procedure> & { name: string }): Promise<Procedure> {
  const payload = { name: p.name.trim(), category: p.category?.trim() || null, default_price: p.default_price ?? 0, active: p.active ?? true };
  if (p.id) return unwrap<Procedure>(await supabase.from('procedures').update(payload).eq('id', p.id).select().single());
  return unwrap<Procedure>(await supabase.from('procedures').insert(payload).select().single());
}

export async function deleteProcedure(id: string): Promise<void> {
  const { error } = await supabase.from('procedures').delete().eq('id', id);
  if (error) throw toAppError(error);
}
