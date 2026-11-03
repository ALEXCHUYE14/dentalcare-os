import {
  Banknote,
  BarChart3,
  CalendarDays,
  FlaskConical,
  HeartHandshake,
  LayoutDashboard,
  Package,
  Settings,
  Users,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import type { AppRole } from '../../types';

export type NavSection = 'Clínica' | 'Gestión' | 'Sistema';

export interface NavItem {
  to: string;
  label: string;
  short: string;
  icon: LucideIcon;
  section: NavSection;
  roles?: AppRole[];
  /** Acceso directo en la barra inferior móvil; el resto va en "Más". */
  mobile?: boolean;
}

export const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'Dashboard', short: 'Inicio', icon: LayoutDashboard, section: 'Clínica', mobile: true },
  { to: '/agenda', label: 'Agenda clínica', short: 'Agenda', icon: CalendarDays, section: 'Clínica', mobile: true },
  { to: '/pacientes', label: 'Pacientes', short: 'Pacientes', icon: Users, section: 'Clínica', mobile: true },
  { to: '/seguimiento', label: 'Seguimiento', short: 'Seguimiento', icon: HeartHandshake, section: 'Clínica' },
  { to: '/laboratorio', label: 'Laboratorio', short: 'Laboratorio', icon: FlaskConical, section: 'Clínica' },
  { to: '/facturacion', label: 'Facturación y pagos', short: 'Cobros', icon: Wallet, section: 'Gestión', roles: ['admin', 'doctor', 'recepcionista'], mobile: true },
  { to: '/caja', label: 'Caja y gastos', short: 'Caja', icon: Banknote, section: 'Gestión', roles: ['admin', 'recepcionista'] },
  { to: '/inventario', label: 'Inventario', short: 'Inventario', icon: Package, section: 'Gestión' },
  { to: '/reportes', label: 'Reportes', short: 'Reportes', icon: BarChart3, section: 'Gestión', roles: ['admin'] },
  { to: '/configuracion', label: 'Configuración', short: 'Ajustes', icon: Settings, section: 'Sistema' },
];

export const NAV_SECTIONS: NavSection[] = ['Clínica', 'Gestión', 'Sistema'];
