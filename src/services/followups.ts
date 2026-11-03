import { supabase, unwrap } from '../lib/supabase';
import type { BirthdayPatient, Debtor, RecallPatient } from '../types';

export async function getRecallPatients(months: number): Promise<RecallPatient[]> {
  return unwrap<RecallPatient[]>(await supabase.rpc('get_recall_patients', { p_months: months, p_limit: 150 }));
}

export async function getDebtors(): Promise<Debtor[]> {
  const rows = unwrap<Debtor[]>(await supabase.rpc('get_debtors', { p_limit: 150 }));
  return rows.map((r) => ({ ...r, balance: Number(r.balance), plans: Number(r.plans) }));
}

export async function getUpcomingBirthdays(days: number): Promise<BirthdayPatient[]> {
  return unwrap<BirthdayPatient[]>(await supabase.rpc('get_upcoming_birthdays', { p_days: days }));
}
