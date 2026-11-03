import { lazy, Suspense, type ReactNode } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import AppLayout from './components/layout/AppLayout';
import { FullScreenLoader, LoadingBlock } from './components/ui/Feedback';
import { useAuth } from './context/AuthContext';
import { isSupabaseConfigured } from './lib/supabase';
import LoginPage from './pages/LoginPage';
import PendingApproval from './pages/PendingApproval';
import SetNewPassword from './pages/SetNewPassword';
import SetupRequired from './pages/SetupRequired';
import type { AppRole } from './types';

const DashboardPage = lazy(() => import('./pages/DashboardPage'));
const PatientsPage = lazy(() => import('./pages/PatientsPage'));
const PatientDetailPage = lazy(() => import('./pages/PatientDetailPage'));
const AgendaPage = lazy(() => import('./pages/AgendaPage'));
const BillingPage = lazy(() => import('./pages/BillingPage'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));
const FollowUpPage = lazy(() => import('./pages/FollowUpPage'));
const ReportsPage = lazy(() => import('./pages/ReportsPage'));
const CashPage = lazy(() => import('./pages/CashPage'));
const LabPage = lazy(() => import('./pages/LabPage'));
const InventoryPage = lazy(() => import('./pages/InventoryPage'));

function Guard({ roles, children }: { roles: AppRole[]; children: ReactNode }) {
  const { can } = useAuth();
  return can(roles) ? <>{children}</> : <Navigate to="/" replace />;
}

const page = (el: ReactNode) => <Suspense fallback={<LoadingBlock />}>{el}</Suspense>;

export default function App() {
  const { session, profile, loading, recovering } = useAuth();

  if (!isSupabaseConfigured) return <SetupRequired />;
  if (loading) return <FullScreenLoader />;
  if (!session) return <LoginPage />;
  if (recovering) return <SetNewPassword />;
  if (!profile || !profile.active) return <PendingApproval />;

  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route index element={page(<DashboardPage />)} />
        <Route path="agenda" element={page(<AgendaPage />)} />
        <Route path="pacientes" element={page(<PatientsPage />)} />
        <Route path="pacientes/:id" element={page(<PatientDetailPage />)} />
        <Route
          path="facturacion"
          element={page(
            <Guard roles={['admin', 'doctor', 'recepcionista']}>
              <BillingPage />
            </Guard>,
          )}
        />
        <Route path="seguimiento" element={page(<FollowUpPage />)} />
        <Route path="laboratorio" element={page(<LabPage />)} />
        <Route path="inventario" element={page(<InventoryPage />)} />
        <Route
          path="caja"
          element={page(
            <Guard roles={['admin', 'recepcionista']}>
              <CashPage />
            </Guard>,
          )}
        />
        <Route
          path="reportes"
          element={page(
            <Guard roles={['admin']}>
              <ReportsPage />
            </Guard>,
          )}
        />
        <Route path="configuracion" element={page(<SettingsPage />)} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
