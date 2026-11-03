import { useState } from 'react';
import { Clock, LogOut, RefreshCw } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { useAuth } from '../context/AuthContext';

export default function PendingApproval() {
  const { profile, session, refreshProfile, signOut } = useAuth();
  const [checking, setChecking] = useState(false);

  return (
    <div className="flex min-h-dvh items-center justify-center px-5">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-amber-50 text-amber-600">
          <Clock className="h-6 w-6" strokeWidth={1.75} />
        </div>
        <h1 className="text-lg font-semibold">Cuenta pendiente de aprobación</h1>
        <p className="mt-2 text-sm text-slate-500">
          Hola {profile?.full_name || session?.user.email}. Un administrador del consultorio debe activar tu acceso y asignarte un rol
          (Doctor, Recepcionista o Asistente).
        </p>
        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
          <Button
            variant="primary"
            icon={<RefreshCw />}
            loading={checking}
            onClick={async () => {
              setChecking(true);
              await refreshProfile();
              setChecking(false);
            }}
          >
            Verificar de nuevo
          </Button>
          <Button variant="secondary" icon={<LogOut />} onClick={() => void signOut()}>
            Cerrar sesión
          </Button>
        </div>
      </div>
    </div>
  );
}
