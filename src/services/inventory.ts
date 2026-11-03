import { supabase, toAppError, unwrap } from '../lib/supabase';
import type { InventoryItem, InventoryItemInput, InventoryMovement, MovementKind } from '../types';

const n = Number;
const normItem = (i: InventoryItem): InventoryItem => ({ ...i, stock: n(i.stock), min_stock: n(i.min_stock), unit_cost: n(i.unit_cost) });

export async function listInventory({ lowOnly = false, includeInactive = false } = {}): Promise<InventoryItem[]> {
  let q = supabase.from('inventory_items').select('*').order('name').limit(1000);
  if (!includeInactive) q = q.eq('active', true);
  if (lowOnly) q = q.eq('low_stock', true);
  return unwrap<InventoryItem[]>(await q).map(normItem);
}

export async function saveInventoryItem(input: InventoryItemInput, id?: string): Promise<InventoryItem> {
  const payload = {
    ...input,
    name: input.name.trim(),
    category: input.category?.trim() || null,
    unit: input.unit.trim() || 'unidad',
    supplier: input.supplier?.trim() || null,
  };
  const res = id
    ? await supabase.from('inventory_items').update(payload).eq('id', id).select().single()
    : await supabase.from('inventory_items').insert(payload).select().single();
  return normItem(unwrap<InventoryItem>(res));
}

export async function deleteInventoryItem(id: string): Promise<void> {
  const { error } = await supabase.from('inventory_items').delete().eq('id', id);
  if (error) throw toAppError(error);
}

/** Registra un movimiento; la base actualiza el stock de forma atómica y rechaza stock negativo. */
export async function addMovement(itemId: string, kind: MovementKind, quantity: number, note: string | null): Promise<InventoryMovement> {
  const m = unwrap<InventoryMovement>(
    await supabase
      .from('inventory_movements')
      .insert({ item_id: itemId, kind, quantity, note: note?.trim() || null })
      .select()
      .single(),
  );
  return { ...m, quantity: n(m.quantity), stock_after: m.stock_after === null ? null : n(m.stock_after) };
}

export async function listMovements(itemId: string): Promise<InventoryMovement[]> {
  const rows = unwrap<InventoryMovement[]>(
    await supabase.from('inventory_movements').select('*').eq('item_id', itemId).order('created_at', { ascending: false }).limit(50),
  );
  return rows.map((m) => ({ ...m, quantity: n(m.quantity), stock_after: m.stock_after === null ? null : n(m.stock_after) }));
}
