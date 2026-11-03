import {
  forwardRef,
  useState,
  type InputHTMLAttributes,
  type KeyboardEvent,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import { X } from 'lucide-react';
import { cn } from '../../utils/format';

export function Field({
  label,
  hint,
  error,
  required,
  className,
  children,
}: {
  label?: string;
  hint?: string;
  error?: string | null;
  required?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn('min-w-0', className)}>
      {label && (
        <span className="mb-1.5 block text-xs font-medium text-slate-600">
          {label}
          {required && <span className="ml-0.5 text-rose-500">*</span>}
        </span>
      )}
      {children}
      {error ? (
        <p className="mt-1 text-xs text-rose-600">{error}</p>
      ) : hint ? (
        <p className="mt-1 text-xs text-slate-400">{hint}</p>
      ) : null}
    </div>
  );
}

const base =
  'w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 placeholder:text-slate-400 transition ' +
  'focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500 ' +
  '';

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input(
  { className, ...p },
  ref,
) {
  return <input ref={ref} {...p} className={cn(base, 'h-10', className)} />;
});

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select(
  { className, children, ...p },
  ref,
) {
  return (
    <select ref={ref} {...p} className={cn(base, 'h-10 pr-8', className)}>
      {children}
    </select>
  );
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea(
  { className, rows = 3, ...p },
  ref,
) {
  return <textarea ref={ref} rows={rows} {...p} className={cn(base, 'py-2 leading-relaxed', className)} />;
});

/** Entrada de etiquetas (alergias, alertas). Enter o coma agregan. */
export function TagInput({
  value,
  onChange,
  placeholder,
  tone = 'rose',
  suggestions = [],
}: {
  value: string[];
  onChange: (v: string[]) => void;
  placeholder?: string;
  tone?: 'rose' | 'amber' | 'sky';
  suggestions?: string[];
}) {
  const [text, setText] = useState('');
  const add = (raw: string) => {
    const t = raw.trim().replace(/,$/, '');
    if (t && !value.some((v) => v.toLowerCase() === t.toLowerCase())) onChange([...value, t]);
    setText('');
  };
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      add(text);
    } else if (e.key === 'Backspace' && !text && value.length) {
      onChange(value.slice(0, -1));
    }
  };
  const chip = {
    rose: 'bg-rose-50 text-rose-700 ring-rose-200',
    amber: 'bg-amber-50 text-amber-700 ring-amber-200',
    sky: 'bg-sky-50 text-sky-700 ring-sky-200',
  }[tone];
  const pending = suggestions.filter((s) => !value.includes(s));

  return (
    <div>
      <div className={cn(base, 'flex min-h-10 flex-wrap items-center gap-1.5 py-1.5')}>
        {value.map((v) => (
          <span key={v} className={cn('inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset', chip)}>
            {v}
            <button type="button" onClick={() => onChange(value.filter((x) => x !== v))} aria-label={`Quitar ${v}`}>
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKey}
          onBlur={() => text && add(text)}
          placeholder={value.length ? '' : placeholder}
          className="min-w-[8rem] flex-1 bg-transparent text-sm outline-none placeholder:text-slate-400"
        />
      </div>
      {pending.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {pending.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => onChange([...value, s])}
              className="rounded-md border border-dashed border-slate-300 px-2 py-0.5 text-[11px] text-slate-500 hover:border-slate-400 hover:text-slate-700"
            >
              + {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Interruptor accesible */
export function Switch({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-50',
        checked ? 'bg-teal-600' : 'bg-slate-300',
      )}
    >
      <span className={cn('inline-block h-5 w-5 rounded-full bg-white shadow transition-transform', checked ? 'translate-x-5' : 'translate-x-0.5')} />
    </button>
  );
}
