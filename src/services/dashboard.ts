import { supabase, unwrap } from '../lib/supabase';
import type { DashboardStats, SeriesPoint } from '../types';

export async function getStats(): Promise<DashboardStats> {
  return unwrap<DashboardStats>(await supabase.rpc('get_dashboard_stats'));
}

export async function getSeries(period: 'week' | 'month'): Promise<SeriesPoint[]> {
  const rows = unwrap<SeriesPoint[]>(await supabase.rpc('get_dashboard_series', { p_period: period }));
  return rows.map((r) => ({ bucket: r.bucket, income: Number(r.income), visits: Number(r.visits) }));
}
