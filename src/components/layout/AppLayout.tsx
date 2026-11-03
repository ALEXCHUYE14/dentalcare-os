import { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { LogOut, Menu, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useSettings } from '../../context/SettingsContext';
import { ROLE_LABELS } from '../../utils/constants';
import { cn } from '../../utils/format';
import { Avatar } from '../ui/Primitives';
import { NAV_ITEMS, NAV_SECTIONS, type NavItem } from './navigation';

function BrandMark({ compact }: { compact?: boolean }) {
  const { config } = useSettings();
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      {config?.logo_url ? (
        <img src={config.logo_url} alt="" className="h-9 w-9 shrink-0 rounded-lg bg-white object-contain p-0.5 ring-1 ring-slate-200" />
      ) : (
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-sky-600 to-teal-600 text-white">
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <path d="M7.5 3.5C5 3.5 3.5 5.6 3.5 8.5c0 2.4 1 3.8 1.5 6.2.5 3 1 5.8 2.5 5.8s1.6-3 2.5-5c.5-1 1-1.5 2-1.5s1.5.5 2 1.5c.9 2 1 5 2.5 5s2-2.8 2.5-5.8c.5-2.4 1.5-3.8 1.5-6.2 0-2.9-1.5-5-4-5-2 0-3 1-4.5 1s-2.5-1-4.5-1Z" />
          </svg>
        </div>
      )}
      {!compact && (
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-slate-900">{config?.business_name || 'DentalCare OS'}</p>
          <p className="truncate text-[11px] text-slate-400">Gestión odontológica</p>
        </div>
      )}
    </div>
  );
}

function UserMenu() {
  const { profile, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onClick = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);
  if (!profile) return null;
  return (
    <div className="relative" ref={ref}>
      <button type="button" onClick={() => setOpen((o) => !o)} className="flex items-center gap-2 rounded-full p-0.5 hover:ring-2 hover:ring-slate-200" aria-label="Menú de usuario">
        <Avatar name={profile.full_name || profile.email || '?'} color={profile.color} size="sm" />
      </button>
      {open && (
        <div className="animate-slide absolute right-0 top-11 z-40 w-60 rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl">
          <div className="px-3 py-2.5">
            <p className="truncate text-sm font-semibold">{profile.full_name}</p>
            <p className="truncate text-xs text-slate-500">{profile.email}</p>
            <p className="mt-1 text-[11px] font-medium uppercase tracking-wide text-sky-600">{ROLE_LABELS[profile.role]}</p>
          </div>
          <div className="my-1 h-px bg-slate-100" />
          <button
            type="button"
            onClick={() => void signOut()}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-rose-600 hover:bg-rose-50"
          >
            <LogOut className="h-4 w-4" /> Cerrar sesión
          </button>
        </div>
      )}
    </div>
  );
}

export default function AppLayout() {
  const { can, profile } = useAuth();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem('dc-sidebar') === '1';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem('dc-sidebar', collapsed ? '1' : '0');
    } catch {
      /* sin almacenamiento */
    }
  }, [collapsed]);

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [location.pathname]);

  const items = NAV_ITEMS.filter((i) => !i.roles || can(i.roles));
  const current = items.find((i) => (i.to === '/' ? location.pathname === '/' : location.pathname.startsWith(i.to)));

  return (
    <div className="min-h-dvh">
      {/* Sidebar escritorio / tablet */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-30 hidden flex-col border-r border-slate-200 bg-white transition-[width] duration-200 md:flex',
          collapsed ? 'w-[72px]' : 'w-64',
        )}
      >
        <div className={cn('flex h-16 items-center border-b border-slate-100', collapsed ? 'justify-center px-2' : 'px-4')}>
          <BrandMark compact={collapsed} />
        </div>
        <nav className="flex-1 overflow-y-auto p-3">
          {NAV_SECTIONS.map((section, si) => {
            const group = items.filter((i) => i.section === section);
            if (!group.length) return null;
            return (
              <div key={section} className={cn(si > 0 && 'mt-4')}>
                {collapsed ? (
                  si > 0 && <div className="mx-3 mb-3 h-px bg-slate-100" />
                ) : (
                  <p className="mb-1 px-3 text-[10px] font-semibold uppercase tracking-wider text-slate-400">{section}</p>
                )}
                <div className="space-y-1">
                  {group.map((item) => (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      end={item.to === '/'}
                      title={collapsed ? item.label : undefined}
                      className={({ isActive }) =>
                        cn(
                          'group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                          collapsed && 'justify-center px-0',
                          isActive
                            ? 'bg-sky-50 text-sky-700'
                            : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900',
                        )
                      }
                    >
                      <item.icon className="h-[18px] w-[18px] shrink-0" strokeWidth={1.75} />
                      {!collapsed && <span className="truncate">{item.label}</span>}
                    </NavLink>
                  ))}
                </div>
              </div>
            );
          })}
        </nav>
        <div className="border-t border-slate-100 p-3">
          {!collapsed && profile && (
            <div className="mb-2 flex items-center gap-2.5 rounded-lg px-2 py-1.5">
              <Avatar name={profile.full_name || '?'} color={profile.color} size="sm" />
              <div className="min-w-0">
                <p className="truncate text-xs font-semibold">{profile.full_name}</p>
                <p className="truncate text-[11px] text-slate-400">{ROLE_LABELS[profile.role]}</p>
              </div>
            </div>
          )}
          <button
            type="button"
            onClick={() => setCollapsed((c) => !c)}
            className={cn(
              'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-xs font-medium text-slate-500 hover:bg-slate-50',
              collapsed && 'justify-center px-0',
            )}
            aria-label={collapsed ? 'Expandir menú' : 'Contraer menú'}
          >
            {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
            {!collapsed && 'Contraer menú'}
          </button>
        </div>
      </aside>

      <div className={cn('transition-[padding] duration-200', collapsed ? 'md:pl-[72px]' : 'md:pl-64')}>
        {/* Barra superior */}
        <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-slate-200/80 bg-white/85 px-4 backdrop-blur-md sm:h-16 sm:px-6">
          <div className="md:hidden">
            <BrandMark compact />
          </div>
          <p className="min-w-0 flex-1 truncate text-sm font-medium text-slate-500">
            {current?.label ?? 'Detalle'}
          </p>
          <UserMenu />
        </header>

        <main className="mx-auto max-w-[1440px] px-4 pb-28 pt-5 sm:px-6 sm:pt-6 md:pb-10">
          <Outlet />
        </main>
      </div>

      {/* Navegación inferior móvil */}
      <MobileNav items={items} />
    </div>
  );
}

/** Barra inferior móvil: accesos principales + menú "Más" con el resto de módulos. */
function MobileNav({ items }: { items: NavItem[] }) {
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const primary = items.filter((i) => i.mobile);
  const extra = items.filter((i) => !i.mobile);
  const extraActive = extra.some((i) => location.pathname.startsWith(i.to));

  useEffect(() => setOpen(false), [location.pathname]);

  const cols = primary.length + (extra.length ? 1 : 0);
  return (
    <>
      {open && <div className="fixed inset-0 z-30 bg-slate-900/30 md:hidden" onClick={() => setOpen(false)} />}
      {open && (
        <div className="animate-slide fixed inset-x-3 bottom-20 z-40 rounded-2xl border border-slate-200 bg-white p-2 shadow-xl md:hidden">
          {extra.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium',
                  isActive ? 'bg-sky-50 text-sky-700' : 'text-slate-700',
                )
              }
            >
              <item.icon className="h-5 w-5" strokeWidth={1.75} />
              {item.label}
            </NavLink>
          ))}
        </div>
      )}
      <nav className="pb-safe fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 backdrop-blur-md md:hidden">
        <div className="grid" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
          {primary.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                cn(
                  'flex flex-col items-center gap-1 py-2.5 text-[10px] font-medium transition-colors',
                  isActive ? 'text-sky-600' : 'text-slate-500',
                )
              }
            >
              <item.icon className="h-5 w-5" strokeWidth={1.75} />
              {item.short}
            </NavLink>
          ))}
          {extra.length > 0 && (
            <button
              type="button"
              onClick={() => setOpen((o) => !o)}
              className={cn(
                'flex flex-col items-center gap-1 py-2.5 text-[10px] font-medium transition-colors',
                open || extraActive ? 'text-sky-600' : 'text-slate-500',
              )}
              aria-expanded={open}
            >
              <Menu className="h-5 w-5" strokeWidth={1.75} />
              Más
            </button>
          )}
        </div>
      </nav>
    </>
  );
}
