import { useState, type FormEvent, type ReactNode } from 'react';
import { ArrowLeft, CalendarDays, Eye, EyeOff, Lock, Mail, ShieldCheck, Stethoscope, User, Wallet } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { useAuth } from '../context/AuthContext';
import { cn } from '../utils/format';

type Mode = 'login' | 'register' | 'reset';

const features = [
  { icon: CalendarDays, text: 'Agenda multivista por doctor y sillón' },
  { icon: Stethoscope, text: 'Expediente clínico y odontograma interactivo' },
  { icon: Wallet, text: 'Presupuestos, abonos y recibos con QR de pago' },
  { icon: ShieldCheck, text: 'Roles, auditoría y seguridad a nivel de fila' },
];

function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M7.5 3.5C5 3.5 3.5 5.6 3.5 8.5c0 2.4 1 3.8 1.5 6.2.5 3 1 5.8 2.5 5.8s1.6-3 2.5-5c.5-1 1-1.5 2-1.5s1.5.5 2 1.5c.9 2 1 5 2.5 5s2-2.8 2.5-5.8c.5-2.4 1.5-3.8 1.5-6.2 0-2.9-1.5-5-4-5-2 0-3 1-4.5 1s-2.5-1-4.5-1Z" />
    </svg>
  );
}

/** Campo táctil del login: 48 px de alto en móvil, icono a la izquierda y acción opcional a la derecha. */
function AuthField({ label, icon, action, children }: { label: string; icon: ReactNode; action?: ReactNode; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[13px] font-medium text-slate-700">{label}</span>
      <span className="relative block">
        <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 [&_svg]:h-[18px] [&_svg]:w-[18px]">{icon}</span>
        {children}
        {action && <span className="absolute right-1.5 top-1/2 -translate-y-1/2">{action}</span>}
      </span>
    </label>
  );
}

const inputCls =
  'h-12 w-full rounded-xl border border-slate-200 bg-slate-50/60 pl-11 pr-4 text-base text-slate-900 placeholder:text-slate-400 transition ' +
  'focus:border-sky-500 focus:bg-white focus:outline-none focus:ring-4 focus:ring-sky-500/15 sm:h-11 sm:text-sm';

export default function LoginPage() {
  const { signIn, signUp, resetPassword } = useAuth();
  const [mode, setMode] = useState<Mode>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const switchMode = (m: Mode) => {
    if (busy) return;
    setMode(m);
    setError(null);
    if (m !== 'login') setNotice(null);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return; // evita doble envío por doble toque
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      if (mode === 'login') await signIn(email, password);
      else if (mode === 'register') {
        if (name.trim().length < 3) throw new Error('Ingresa tu nombre completo.');
        if (password.length < 6) throw new Error('La contraseña debe tener al menos 6 caracteres.');
        const { needsConfirmation } = await signUp(name, email, password);
        if (needsConfirmation) {
          setNotice('Te enviamos un correo de confirmación. Confírmalo y luego inicia sesión.');
          setMode('login');
          setPassword('');
        }
      } else {
        await resetPassword(email);
        setNotice('Si el correo está registrado, recibirás un enlace para restablecer tu contraseña.');
        setMode('login');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo completar la operación.');
    } finally {
      setBusy(false);
    }
  };

  const title = mode === 'login' ? 'Bienvenido de nuevo' : mode === 'register' ? 'Crear cuenta' : 'Recuperar acceso';
  const subtitle =
    mode === 'register'
      ? 'La primera cuenta será Administrador. Las siguientes quedan pendientes de aprobación.'
      : mode === 'reset'
        ? 'Escribe tu correo y te enviaremos un enlace para crear una nueva contraseña.'
        : 'Ingresa con la cuenta de tu consultorio.';

  return (
    <div className="flex min-h-dvh flex-col bg-white lg:grid lg:grid-cols-[1.05fr_1fr] lg:bg-slate-50">
      {/* Panel de marca: escritorio */}
      <aside className="relative hidden overflow-hidden bg-gradient-to-br from-sky-700 via-sky-600 to-teal-600 p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="absolute -right-24 -top-24 h-96 w-96 rounded-full bg-white/10 blur-3xl" />
        <div className="absolute -bottom-32 -left-16 h-96 w-96 rounded-full bg-teal-300/20 blur-3xl" />
        <div className="relative flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/15 ring-1 ring-white/25">
            <LogoMark className="h-6 w-6" />
          </div>
          <span className="text-lg font-semibold tracking-tight">DentalCare OS</span>
        </div>
        <div className="relative max-w-md">
          <h1 className="text-4xl font-semibold leading-tight tracking-tight">Tu consultorio, organizado de principio a fin.</h1>
          <p className="mt-4 text-base text-sky-100">Pacientes, citas, tratamientos y caja en una sola plataforma clínica.</p>
          <ul className="mt-10 space-y-4">
            {features.map((f) => (
              <li key={f.text} className="flex items-center gap-3 text-sm text-sky-50">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/10 ring-1 ring-white/20">
                  <f.icon className="h-4 w-4" strokeWidth={1.75} />
                </span>
                {f.text}
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-xs text-sky-200">© {new Date().getFullYear()} DentalCare OS</p>
      </aside>

      {/* Cabecera de marca: móvil y tablet (respeta el notch / barra de estado) */}
      <header className="relative overflow-hidden bg-gradient-to-br from-sky-700 via-sky-600 to-teal-600 px-6 pb-14 pt-[calc(env(safe-area-inset-top)+2.25rem)] text-white lg:hidden">
        <div className="absolute -right-16 -top-20 h-64 w-64 rounded-full bg-white/10 blur-2xl" />
        <div className="absolute -bottom-24 -left-10 h-56 w-56 rounded-full bg-teal-300/25 blur-2xl" />
        <div className="relative mx-auto flex max-w-sm flex-col items-center text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white/15 shadow-lg shadow-sky-900/20 ring-1 ring-white/30 backdrop-blur">
            <LogoMark className="h-9 w-9" />
          </div>
          <p className="mt-4 text-xl font-semibold tracking-tight">DentalCare OS</p>
          <p className="mt-1 text-sm text-sky-100">Gestión odontológica integral</p>
        </div>
      </header>

      {/* Formulario: hoja que se superpone a la cabecera en móvil */}
      <main className="relative -mt-7 flex flex-1 flex-col rounded-t-[28px] bg-white px-6 pb-[calc(env(safe-area-inset-bottom)+1.25rem)] pt-8 shadow-[0_-10px_30px_-12px_rgba(15,23,42,0.18)] lg:mt-0 lg:justify-center lg:rounded-none lg:bg-transparent lg:px-10 lg:py-10 lg:shadow-none">
        <div className="mx-auto w-full max-w-sm lg:rounded-2xl lg:border lg:border-slate-200 lg:bg-white lg:p-8 lg:shadow-sm">
          {mode === 'reset' && (
            <button
              type="button"
              onClick={() => switchMode('login')}
              className="-ml-1 mb-4 inline-flex items-center gap-1 rounded-lg px-1 py-1 text-sm font-medium text-slate-500 active:text-sky-700"
            >
              <ArrowLeft className="h-4 w-4" /> Volver
            </button>
          )}

          <h1 className="text-[22px] font-semibold tracking-tight text-slate-900 sm:text-2xl">{title}</h1>
          <p className="mt-1.5 text-sm leading-relaxed text-slate-500">{subtitle}</p>

          {mode !== 'reset' && (
            <div className="mt-6 grid grid-cols-2 rounded-xl bg-slate-100 p-1" role="tablist" aria-label="Tipo de acceso">
              {(
                [
                  ['login', 'Ingresar'],
                  ['register', 'Registrarme'],
                ] as const
              ).map(([m, label]) => (
                <button
                  key={m}
                  type="button"
                  role="tab"
                  aria-selected={mode === m}
                  onClick={() => switchMode(m)}
                  className={cn(
                    'h-10 rounded-lg text-sm font-medium transition',
                    mode === m ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 active:text-slate-800',
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          )}

          <form onSubmit={submit} className="mt-6 space-y-4">
            {mode === 'register' && (
              <AuthField label="Nombre completo" icon={<User />}>
                <input
                  className={inputCls}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  autoComplete="name"
                  autoCapitalize="words"
                  enterKeyHint="next"
                  placeholder="Dra. Ana Torres"
                  required
                />
              </AuthField>
            )}
            <AuthField label="Correo electrónico" icon={<Mail />}>
              <input
                className={inputCls}
                type="email"
                inputMode="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete={mode === 'register' ? 'email' : 'username'}
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                enterKeyHint={mode === 'reset' ? 'send' : 'next'}
                placeholder="correo@clinica.pe"
                required
              />
            </AuthField>
            {mode !== 'reset' && (
              <AuthField
                label="Contraseña"
                icon={<Lock />}
                action={
                  <button
                    type="button"
                    onClick={() => setShowPassword((s) => !s)}
                    className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 active:bg-slate-100 active:text-slate-700"
                    aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                  >
                    {showPassword ? <EyeOff className="h-[18px] w-[18px]" /> : <Eye className="h-[18px] w-[18px]" />}
                  </button>
                }
              >
                <input
                  className={cn(inputCls, 'pr-12')}
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  enterKeyHint="go"
                  placeholder={mode === 'register' ? 'Mínimo 6 caracteres' : '••••••••'}
                  required
                  minLength={6}
                />
              </AuthField>
            )}

            {mode === 'login' && (
              <div className="-mt-1 flex justify-end">
                <button type="button" className="py-1 text-[13px] font-medium text-sky-700 active:text-sky-900" onClick={() => switchMode('reset')}>
                  ¿Olvidaste tu contraseña?
                </button>
              </div>
            )}

            {error && (
              <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-sm text-rose-700">
                {error}
              </p>
            )}
            {notice && (
              <p role="status" className="rounded-xl border border-teal-200 bg-teal-50 px-3.5 py-2.5 text-sm text-teal-800">
                {notice}
              </p>
            )}

            <Button type="submit" size="lg" className="h-12 w-full rounded-xl text-base shadow-md shadow-sky-600/25" loading={busy}>
              {mode === 'login' ? 'Ingresar' : mode === 'register' ? 'Crear cuenta' : 'Enviar enlace'}
            </Button>
          </form>
        </div>

        <footer className="mx-auto mt-auto flex w-full max-w-sm flex-col items-center gap-1 pt-8 text-center text-xs text-slate-400 lg:mt-6 lg:pt-0">
          <span className="inline-flex items-center gap-1.5">
            <ShieldCheck className="h-3.5 w-3.5" /> Conexión cifrada · datos clínicos protegidos
          </span>
          <span className="lg:hidden">© {new Date().getFullYear()} DentalCare OS</span>
        </footer>
      </main>
    </div>
  );
}
