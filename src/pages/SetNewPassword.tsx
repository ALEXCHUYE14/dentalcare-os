import { useState } from 'react';
import { KeyRound, LogOut } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { Field, Input } from '../components/ui/Field';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { errorMessage } from '../lib/supabase';

/** Se muestra al abrir el enlace de "olvidé mi contraseña" para fijar la nueva clave. */
export default function SetNewPassword() {
  const { session, updatePassword, signOut } = useAuth();
  const toast = useToast();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (password.length < 8) return toast.error('La contraseña debe tener al menos 8 caracteres.');
    if (password !== confirm) return toast.error('Las contraseñas no coinciden.');
    setSaving(true);
    try {
      await updatePassword(password);
      toast.success('Contraseña actualizada');
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex min-h-dvh items-center justify-center px-5">
      <form
        className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-sm"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-sky-50 text-sky-600">
          <KeyRound className="h-6 w-6" strokeWidth={1.75} />
        </div>
        <h1 className="text-lg font-semibold">Crea tu nueva contraseña</h1>
        <p className="mt-1 text-sm text-slate-500">{session?.user.email}</p>
        <div className="mt-5 space-y-4">
          <Field label="Nueva contraseña" hint="Mínimo 8 caracteres">
            <Input type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus />
          </Field>
          <Field label="Repite la contraseña">
            <Input type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          </Field>
        </div>
        <div className="mt-6 flex flex-col gap-2 sm:flex-row-reverse">
          <Button type="submit" className="flex-1" loading={saving}>
            Guardar contraseña
          </Button>
          <Button variant="secondary" icon={<LogOut />} onClick={() => void signOut()} disabled={saving}>
            Salir
          </Button>
        </div>
      </form>
    </div>
  );
}
