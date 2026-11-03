import { supabase, toAppError, unwrap } from '../lib/supabase';
import type { CashSession, CashSummary, Expense, ExpenseInput, MonthBalance } from '../types';
import { toISODate } from '../utils/format';

const num = (v: unknown) => Number(v ?? 0);

function normalizeSession(s: CashSession): CashSession {
  return {
    ...s,
    opening_amount: num(s.opening_amount),
    expected_cash: s.expected_cash === null ? null : num(s.expected_cash),
    counted_cash: s.counted_cash === null ? null : num(s.counted_cash),
    difference: s.difference === null ? null : num(s.difference),
  };
}

// ----- Caja -----
/** Resumen calculado en la base; null si no hay caja abierta (o la sesión no existe). */
export async function getCashSummary(sessionId?: string): Promise<CashSummary | null> {
  const r = unwrap<CashSummary | null>(await supabase.rpc('get_cash_summary', { p_session: sessionId ?? null }));
  if (!r) return null;
  return {
    session: normalizeSession(r.session),
    payments: r.payments.map((p) => ({ ...p, total: num(p.total), n: num(p.n) })),
    payments_total: num(r.payments_total),
    expenses_total: num(r.expenses_total),
    cash_in: num(r.cash_in),
    cash_out: num(r.cash_out),
    expected_cash: num(r.expected_cash),
  };
}

export async function openCashSession(openingAmount: number): Promise<void> {
  const { error } = await supabase.from('cash_sessions').insert({ opening_amount: openingAmount });
  if (error) {
    if (error.code === '23505') throw new Error('Ya hay una caja abierta. Actualiza la página.');
    throw toAppError(error);
  }
}

export async function closeCashSession(counted: number, notes: string | null): Promise<CashSession> {
  return normalizeSession(unwrap<CashSession>(await supabase.rpc('close_cash_session', { p_counted: counted, p_notes: notes })));
}

export async function listCashSessions(limit = 30): Promise<CashSession[]> {
  const rows = unwrap<CashSession[]>(
    await supabase.from('cash_sessions').select('*').not('closed_at', 'is', null).order('opened_at', { ascending: false }).limit(limit),
  );
  return rows.map(normalizeSession);
}

// ----- Gastos -----
export async function listExpenses(month: Date): Promise<Expense[]> {
  const from = new Date(month.getFullYear(), month.getMonth(), 1);
  const to = new Date(month.getFullYear(), month.getMonth() + 1, 1);
  const rows = unwrap<Expense[]>(
    await supabase
      .from('expenses')
      .select('*')
      .gte('spent_at', toISODate(from))
      .lt('spent_at', toISODate(to))
      .order('spent_at', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(500),
  );
  return rows.map((e) => ({ ...e, amount: num(e.amount) }));
}

export async function createExpense(input: ExpenseInput): Promise<Expense> {
  const payload = {
    ...input,
    description: input.description.trim(),
    supplier: input.supplier?.trim() || null,
    reference: input.reference?.trim() || null,
  };
  const e = unwrap<Expense>(await supabase.from('expenses').insert(payload).select().single());
  return { ...e, amount: num(e.amount) };
}

export async function deleteExpense(id: string): Promise<void> {
  const { error } = await supabase.from('expenses').delete().eq('id', id);
  if (error) throw toAppError(error);
}

export async function getMonthBalance(month: Date): Promise<MonthBalance> {
  const r = unwrap<MonthBalance>(await supabase.rpc('get_month_balance', { p_month: toISODate(month) }));
  return {
    income: num(r.income),
    expenses: num(r.expenses),
    profit: num(r.profit),
    by_category: r.by_category.map((c) => ({ ...c, total: num(c.total), n: num(c.n) })),
  };
}
