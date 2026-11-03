import { supabase, toAppError, unwrap } from '../lib/supabase';
import type { AuditDetail, AuditEntry } from '../types';

/**
 * Bitácora paginada. Solo trae columnas livianas; el detalle (old_data/new_data)
 * se descarga bajo demanda al expandir una fila.
 */
export async function listAudit({ page = 1, pageSize = 30, table = '' }: { page?: number; pageSize?: number; table?: string }) {
  const from = (page - 1) * pageSize;
  let q = supabase
    .from('audit_log')
    .select('id,table_name,record_id,action,actor,created_at')
    .order('created_at', { ascending: false })
    .range(from, from + pageSize); // un registro extra para saber si hay más páginas
  if (table) q = q.eq('table_name', table);
  const { data, error } = await q;
  if (error) throw toAppError(error);
  const rows = (data ?? []) as AuditEntry[];
  return { rows: rows.slice(0, pageSize), hasMore: rows.length > pageSize };
}

export async function getAuditDetail(id: number): Promise<AuditDetail> {
  return unwrap<AuditDetail>(await supabase.from('audit_log').select('old_data,new_data').eq('id', id).single());
}
