import { useState, type FormEvent } from 'react';
import { CalendarDays, ShieldCheck, Stethoscope, Wallet } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { Field, Input } from '../components/ui/Field';
import { Segmented } from '../components/ui/Primitives';
import { useAuth } from '../context/AuthContext';

type Mode = 'login' | 'register' | 'reset';

export default function LoginPage() {
  const { signIn, signUp, resetPassword } = useAuth();
  const [mode, setMode] = useState<Mode>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
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
        }
      } else {
        await resetPassword(email);
        setNotice('Si el correo existe, recibirás un enlace para restablecer tu contraseña.');
        setMode('login');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo completar la operación.');
    } finally {
      setBusy(false);
    }
  };

  const features = [
    { icon: CalendarDays, text: 'Agenda multivista por doctor y sillón' },
    { icon: Stethoscope, text: 'Expediente clínico y odontograma interactivo' },
    { icon: Wallet, text: 'Presupuestos, abonos y recibos con QR de pago' },
    { icon: ShieldCheck, text: 'Roles, auditoría y seguridad a nivel de fila' },
  ];

  return (
    <div className="grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
      <div className="relative hidden overflow-hidden bg-gradient-to-br from-sky-700 via-sky-600 to-teal-600 p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="absolute -right-24 -top-24 h-96 w-96 rounded-full bg-white/10 blur-3xl" />
        <div className="absolute -bottom-32 -left-16 h-96 w-96 rounded-full bg-teal-300/20 blur-3xl" />
        <div className="relative flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/15 ring-1 ring-white/25">
            <Stethoscope className="h-6 w-6" strokeWidth={1.75} />
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
      </div>

      <div className="flex items-center justify-center px-5 py-10">
        <div className="w-full max-w-sm">
          <div className="mb-8 lg:hidden">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-sky-600 to-teal-600 text-white">
              <Stethoscope className="h-6 w-6" strokeWidth={1.75} />
            </div>
            <p className="text-sm font-semibold text-sky-700">DentalCare OS</p>
          </div>
          <h2 className="text-2xl font-semibold tracking-tight">
            {mode === 'login' ? 'Iniciar sesión' : mode === 'register' ? 'Crear cuenta' : 'Recuperar acceso'}
          </h2>
          <p className="mt-1.5 text-sm text-slate-500">
            {mode === 'register'
              ? 'La primera cuenta será Administrador. Las siguientes quedan pendientes de aprobación.'
              : mode === 'reset'
                ? 'Te enviaremos un enlace a tu correo.'
                : 'Ingresa con tu cuenta del consultorio.'}
          </p>

          {mode !== 'reset' && (
            <div className="mt-6">
              <Segmented
                value={mode}
                onChange={(m) => {
                  setMode(m);
                  setError(null);
                }}
                options={[
                  { value: 'login', label: 'Ingresar' },
                  { value: 'register', label: 'Registrarme' },
                ]}
              />
            </div>
          )}

          <form onSubmit={submit} className="mt-6 space-y-4">
            {mode === 'register' && (
              <Field label="Nombre completo" required>
                <Input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" placeholder="Dra. Ana Torres" />
              </Field>
            )}
            <Field label="Correo electrónico" required>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required placeholder="correo@clinica.pe" />
            </Field>
            {mode !== 'reset' && (
              <Field label="Contraseña" required>
                <Input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                  required
                  minLength={6}
                />
              </Field>
            )}
            {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
            {notice && <p className="rounded-lg bg-teal-50 px-3 py-2 text-sm text-teal-700">{notice}</p>}
            <Button type="submit" size="lg" className="w-full" loading={busy}>
              {mode === 'login' ? 'Ingresar' : mode === 'register' ? 'Crear cuenta' : 'Enviar enlace'}
            </Button>
          </form>

          <div className="mt-5 text-center text-sm">
            {mode === 'login' ? (
              <button type="button" className="text-slate-500 hover:text-sky-700" onClick={() => setMode('reset')}>
                ¿Olvidaste tu contraseña?
              </button>
            ) : mode === 'reset' ? (
              <button type="button" className="text-slate-500 hover:text-sky-700" onClick={() => setMode('login')}>
                Volver a iniciar sesión
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
