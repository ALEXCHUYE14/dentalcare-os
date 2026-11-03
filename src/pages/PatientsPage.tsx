import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ChevronDown, ChevronRight, MessageCircle, Phone, Plus, Search, UserPlus, Users } from 'lucide-react';
import { MedicalAlerts } from '../components/patients/MedicalAlerts';
import { PatientFormModal } from '../components/patients/PatientFormModal';
import { Button } from '../components/ui/Button';
import { EmptyState, ErrorBox, LoadingBlock, Pagination } from '../components/ui/Feedback';
import { Avatar, Badge, Card, PageHeader, Segmented } from '../components/ui/Primitives';
import { useAuth } from '../context/AuthContext';
import { useAsync } from '../hooks/useAsync';
import { useDebounce } from '../hooks/useDebounce';
import { listPatients } from '../services/patients';
import { ageFrom, cn, fmtDate, fullName, waLink } from '../utils/format';

const PAGE_SIZE = 12;

export default function PatientsPage() {
  const navigate = useNavigate();
  const { can } = useAuth();
  const canWrite = can(['admin', 'doctor', 'recepcionista']);
  const [search, setSearch] = useState('');
  const dq = useDebounce(search, 300);
  const [status, setStatus] = useState<'active' | 'inactive' | 'all'>('active');
  const [page, setPage] = useState(1);
  const [formOpen, setFormOpen] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => setPage(1), [dq, status]);

  const { data, loading, error, reload } = useAsync(() => listPatients({ search: dq, page, pageSize: PAGE_SIZE, status }), [dq, page, status]);
  const rows = data?.rows ?? [];

  return (
    <div>
      <PageHeader
        title="Pacientes"
        subtitle={data ? `${data.total} paciente(s) ${status === 'active' ? 'activos' : status === 'inactive' ? 'inactivos' : 'en total'}` : 'Expedientes clínicos'}
        actions={
          canWrite && (
            <Button icon={<UserPlus />} onClick={() => setFormOpen(true)} className="hidden sm:inline-flex">
              Nuevo paciente
            </Button>
          )
        }
      />

      <Card>
        <div className="flex flex-col gap-3 border-b border-slate-100 p-3 sm:flex-row sm:items-center sm:p-4">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por nombre, DNI o teléfono…"
              className="h-10 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
            />
          </div>
          <Segmented
            size="sm"
            value={status}
            onChange={setStatus}
            options={[
              { value: 'active', label: 'Activos' },
              { value: 'inactive', label: 'Inactivos' },
              { value: 'all', label: 'Todos' },
            ]}
          />
        </div>

        {error ? (
          <div className="p-4">
            <ErrorBox message={error} onRetry={() => void reload()} />
          </div>
        ) : loading && !data ? (
          <LoadingBlock />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={<Users />}
            title={dq ? 'Sin coincidencias' : 'Aún no hay pacientes'}
            description={dq ? 'Prueba con otro nombre, DNI o teléfono.' : 'Registra el primer paciente para comenzar su expediente.'}
            action={
              canWrite && !dq && (
                <Button icon={<Plus />} onClick={() => setFormOpen(true)}>
                  Registrar paciente
                </Button>
              )
            }
          />
        ) : (
          <>
            {/* Tabla escritorio */}
            <div className={cn('hidden overflow-x-auto md:block', loading && 'opacity-60')}>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-left text-[11px] font-medium uppercase tracking-wide text-slate-400">
                    <th className="px-4 py-2.5">Paciente</th>
                    <th className="px-4 py-2.5">Documento</th>
                    <th className="px-4 py-2.5">Edad</th>
                    <th className="px-4 py-2.5">Contacto</th>
                    <th className="px-4 py-2.5">Alertas</th>
                    <th className="px-4 py-2.5">Registro</th>
                    <th className="px-4 py-2.5" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rows.map((p) => {
                    const age = ageFrom(p.birth_date);
                    return (
                      <tr key={p.id} onClick={() => navigate(`/pacientes/${p.id}`)} className="cursor-pointer transition-colors hover:bg-slate-50">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <Avatar name={fullName(p)} size="sm" />
                            <div className="min-w-0">
                              <p className="truncate font-medium text-slate-900">{fullName(p)}</p>
                              {!p.active && <Badge>Inactivo</Badge>}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-slate-600">
                          {p.document_number ? (
                            <>
                              <span className="text-xs text-slate-400">{p.document_type}</span> {p.document_number}
                            </>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td className="px-4 py-3 tabular-nums text-slate-600">{age !== null ? `${age} años` : '—'}</td>
                        <td className="px-4 py-3 text-slate-600">{p.phone || p.email || '—'}</td>
                        <td className="px-4 py-3">
                          <MedicalAlerts patient={p} compact />
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-500">{fmtDate(p.created_at)}</td>
                        <td className="px-4 py-3 text-right">
                          <ChevronRight className="ml-auto h-4 w-4 text-slate-300" />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Tarjetas colapsables móvil */}
            <ul className={cn('divide-y divide-slate-100 md:hidden', loading && 'opacity-60')}>
              {rows.map((p) => {
                const open = expanded === p.id;
                const age = ageFrom(p.birth_date);
                return (
                  <li key={p.id}>
                    <button type="button" onClick={() => setExpanded(open ? null : p.id)} className="flex w-full items-center gap-3 px-4 py-3 text-left">
                      <Avatar name={fullName(p)} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{fullName(p)}</p>
                        <p className="truncate text-xs text-slate-500">
                          {p.document_number ?? 'Sin documento'}
                          {age !== null ? ` · ${age} años` : ''}
                        </p>
                      </div>
                      <MedicalAlerts patient={p} compact />
                      <ChevronDown className={cn('h-4 w-4 shrink-0 text-slate-400 transition-transform', open && 'rotate-180')} />
                    </button>
                    {open && (
                      <div className="animate-slide space-y-3 px-4 pb-4">
                        <MedicalAlerts patient={p} />
                        <div className="flex gap-2">
                          {p.phone && (
                            <>
                              <a href={`tel:${p.phone}`} className="flex-1">
                                <Button variant="secondary" size="sm" className="w-full" icon={<Phone />}>
                                  Llamar
                                </Button>
                              </a>
                              <a href={waLink(p.phone, `Hola ${p.first_name}`)} target="_blank" rel="noreferrer" className="flex-1">
                                <Button variant="secondary" size="sm" className="w-full" icon={<MessageCircle />}>
                                  WhatsApp
                                </Button>
                              </a>
                            </>
                          )}
                          <Link to={`/pacientes/${p.id}`} className="flex-1">
                            <Button size="sm" className="w-full">
                              Expediente
                            </Button>
                          </Link>
                        </div>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>

            <div className="border-t border-slate-100">
              <Pagination page={page} pageSize={PAGE_SIZE} total={data?.total ?? 0} onChange={setPage} />
            </div>
          </>
        )}
      </Card>

      {canWrite && (
        <button
          type="button"
          onClick={() => setFormOpen(true)}
          className="fixed bottom-20 right-4 z-20 flex h-14 w-14 items-center justify-center rounded-full bg-sky-600 text-white shadow-lg shadow-sky-600/30 active:scale-95 sm:hidden"
          aria-label="Nuevo paciente"
        >
          <Plus className="h-6 w-6" />
        </button>
      )}

      <PatientFormModal open={formOpen} onClose={() => setFormOpen(false)} onSaved={(p) => navigate(`/pacientes/${p.id}`)} />
    </div>
  );
}
