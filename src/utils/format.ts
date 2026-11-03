const LOCALE = 'es-PE';

export function cn(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(' ');
}

export function money(n: number | string | null | undefined, currency = 'PEN'): string {
  return new Intl.NumberFormat(LOCALE, { style: 'currency', currency, minimumFractionDigits: 2 }).format(Number(n ?? 0));
}

export function compactNumber(n: number): string {
  return new Intl.NumberFormat(LOCALE, { notation: 'compact', maximumFractionDigits: 1 }).format(n);
}

/** Interpreta 'YYYY-MM-DD' como fecha local (evita el desfase UTC). */
export function toDate(d: string | Date): Date {
  if (d instanceof Date) return d;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d);
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(d);
}

export function fmtDate(
  d: string | Date | null | undefined,
  opts: Intl.DateTimeFormatOptions = { day: '2-digit', month: 'short', year: 'numeric' },
): string {
  if (!d) return '—';
  return new Intl.DateTimeFormat(LOCALE, opts).format(toDate(d));
}

export function fmtTime(d: string | Date): string {
  return new Intl.DateTimeFormat(LOCALE, { hour: '2-digit', minute: '2-digit', hour12: false }).format(toDate(d));
}

export function fmtDateTime(d: string | Date | null | undefined): string {
  if (!d) return '—';
  return `${fmtDate(d)} · ${fmtTime(d)}`;
}

export function fullName(p?: { first_name: string; last_name: string } | null): string {
  return p ? `${p.first_name} ${p.last_name}`.trim() : '—';
}

export function initials(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w.charAt(0).toUpperCase())
      .join('') || '?'
  );
}

export function ageFrom(birth: string | null | undefined): number | null {
  if (!birth) return null;
  const b = toDate(birth);
  const now = new Date();
  let age = now.getFullYear() - b.getFullYear();
  const m = now.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < b.getDate())) age--;
  return age;
}

export const pad = (n: number, len = 2) => String(n).padStart(len, '0');
export const toISODate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const toTimeInput = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

export function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
export function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}
export function addMonths(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(1);
  x.setMonth(x.getMonth() + n);
  return x;
}
/** Semana iniciando en lunes */
export function startOfWeek(d: Date): Date {
  const x = startOfDay(d);
  return addDays(x, -((x.getDay() + 6) % 7));
}
export const startOfMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth(), 1);
export const isSameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

/** 'HH:MM[:SS]' → minutos desde medianoche */
export function parseTime(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

export const docNumber = (prefix: string, n: number) => `${prefix}-${pad(n, 6)}`;
export const round2 = (n: number) => Math.round(n * 100) / 100;

export function waLink(phone: string | null | undefined, text: string): string {
  const digits = (phone ?? '').replace(/\D/g, '');
  const full = digits.length === 9 ? `51${digits}` : digits;
  return `https://wa.me/${full}?text=${encodeURIComponent(text)}`;
}

export function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
