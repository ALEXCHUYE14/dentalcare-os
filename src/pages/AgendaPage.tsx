import { useEffect, useMemo, useRef, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, ListFilter, Plus, X } from 'lucide-react';
import { AppointmentModal, type AppointmentDraft } from '../components/appointments/AppointmentModal';
import { Button } from '../components/ui/Button';
import { ErrorBox } from '../components/ui/Feedback';
import { Select } from '../components/ui/Field';
import { Card, Segmented } from '../components/ui/Primitives';
import { useSettings } from '../context/SettingsContext';
import { useAsync } from '../hooks/useAsync';
import { useCatalogs } from '../hooks/useCatalogs';
import { appointmentInView, useRealtime } from '../hooks/useRealtime';
import { listAppointments } from '../services/appointments';
import type { Appointment } from '../types';
import { APPT_STATUS, APPT_STATUS_ORDER, TREATMENT_TYPES } from '../utils/constants';
import {
  addDays,
  addMonths,
  capitalize,
  cn,
  fmtDate,
  fmtTime,
  fullName,
  isSameDay,
  parseTime,
  startOfDay,
  startOfMonth,
  startOfWeek,
} from '../utils/format';

type View = 'day' | 'week' | 'month';
const HOUR_PX = 64;
const SNAP_MIN = 15;

interface Laid {
  ev: Appointment;
  lane: number;
  lanes: number;
}

/** Distribuye citas superpuestas en carriles paralelos. */
function layoutLanes(events: Appointment[]): Laid[] {
  const sorted = [...events].sort((a, b) => +new Date(a.starts_at) - +new Date(b.starts_at) || +new Date(b.ends_at) - +new Date(a.ends_at));
  const out: Laid[] = [];
  let cluster: { ev: Appointment; lane: number; end: number }[] = [];
  let clusterEnd = -Infinity;
  const flush = () => {
    const lanes = Math.max(1, ...cluster.map((c) => c.lane + 1));
    cluster.forEach((c) => out.push({ ev: c.ev, lane: c.lane, lanes }));
    cluster = [];
    clusterEnd = -Infinity;
  };
  for (const ev of sorted) {
    const s = +new Date(ev.starts_at);
    const e = +new Date(ev.ends_at);
    if (cluster.length && s >= clusterEnd) flush();
    const laneEnds: number[] = [];
    cluster.forEach((c) => (laneEnds[c.lane] = Math.max(laneEnds[c.lane] ?? -Infinity, c.end)));
    let lane = laneEnds.findIndex((le) => le <= s);
    if (lane === -1) lane = laneEnds.length;
    cluster.push({ ev, lane, end: e });
    clusterEnd = Math.max(clusterEnd, e);
  }
  if (cluster.length) flush();
  return out;
}

function EventBlock({ item, dayStart, openMin, onClick }: { item: Laid; dayStart: Date; openMin: number; onClick: () => void }) {
  const { ev, lane, lanes } = item;
  const s = new Date(ev.starts_at);
  const e = new Date(ev.ends_at);
  const startMin = (s.getTime() - dayStart.getTime()) / 60000 - openMin;
  const dur = Math.max(15, (e.getTime() - s.getTime()) / 60000);
  const top = Math.max(0, (startMin / 60) * HOUR_PX);
  const height = Math.max(22, (dur / 60) * HOUR_PX - 2);
  const meta = APPT_STATUS[ev.status];
  return (
    <button
      type="button"
      onClick={(evt) => {
        evt.stopPropagation();
        onClick();
      }}
      className={cn(
        'absolute overflow-hidden rounded-md border-l-[3px] px-1.5 py-1 text-left text-[11px] leading-tight shadow-sm transition hover:z-10 hover:shadow-md',
        meta.block,
      )}
      style={{ top, height, left: `calc(${(lane / lanes) * 100}% + 2px)`, width: `calc(${100 / lanes}% - 4px)` }}
      title={`${fmtTime(ev.starts_at)}–${fmtTime(ev.ends_at)} · ${fullName(ev.patient)} · ${ev.treatment_type} · ${meta.label}`}
    >
      <p className="truncate font-semibold">{fullName(ev.patient)}</p>
      {height > 34 && (
        <p className="truncate opacity-80">
          {fmtTime(ev.starts_at)} · {ev.treatment_type}
        </p>
      )}
      {height > 52 && ev.doctor && (
        <p className="mt-0.5 flex items-center gap-1 truncate opacity-80">
          <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: ev.doctor.color }} />
          {ev.doctor.full_name}
        </p>
      )}
    </button>
  );
}

function NowLine({ day, openMin, closeMin }: { day: Date; openMin: number; closeMin: number }) {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(t);
  }, []);
  if (!isSameDay(now, day)) return null;
  const min = now.getHours() * 60 + now.getMinutes();
  if (min < openMin || min > closeMin) return null;
  return (
    <div className="pointer-events-none absolute inset-x-0 z-[5]" style={{ top: ((min - openMin) / 60) * HOUR_PX }}>
      <div className="relative h-0.5 bg-rose-500">
        <span className="absolute -left-1 -top-[3px] h-2 w-2 rounded-full bg-rose-500" />
      </div>
    </div>
  );
}

export default function AgendaPage() {
  const { config } = useSettings();
  const { doctors, chairs } = useCatalogs();
  const [view, setView] = useState<View>(() => (window.innerWidth < 768 ? 'day' : 'week'));
  const [cursor, setCursor] = useState(() => startOfDay(new Date()));
  const [doctorId, setDoctorId] = useState('');
  const [chairId, setChairId] = useState('');
  const [type, setType] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [modal, setModal] = useState<{ appt: Appointment | null; draft?: AppointmentDraft } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const openMin = parseTime(config?.open_time ?? '08:00');
  const closeMin = parseTime(config?.close_time ?? '20:00');
  const hours = useMemo(() => {
    const out: number[] = [];
    for (let m = Math.floor(openMin / 60) * 60; m < closeMin; m += 60) out.push(m);
    return out;
  }, [openMin, closeMin]);
  const gridOpen = hours[0] ?? openMin;
  const gridHeight = hours.length * HOUR_PX;

  const range = useMemo(() => {
    if (view === 'day') return { from: cursor, to: addDays(cursor, 1) };
    if (view === 'week') {
      const from = startOfWeek(cursor);
      return { from, to: addDays(from, 7) };
    }
    const from = startOfWeek(startOfMonth(cursor));
    return { from, to: addDays(from, 42) };
  }, [view, cursor]);

  const { data, loading, error, reload } = useAsync(
    () => listAppointments({ ...range, doctorId: doctorId || undefined, chairId: chairId || undefined, treatmentType: type || undefined }),
    [range.from.getTime(), range.to.getTime(), doctorId, chairId, type],
  );
  const appts = useMemo(() => data ?? [], [data]);
  const loadedIds = useMemo(() => new Set(appts.map((a) => a.id)), [appts]);
  useRealtime('appointments', () => void reload(true), {
    shouldReload: (p) => appointmentInView(p, range.from, range.to, loadedIds),
  });

  useEffect(() => {
    if (view === 'month' || !scrollRef.current) return;
    const now = new Date();
    const target = isSameDay(now, cursor) || view === 'week' ? Math.max(0, ((now.getHours() * 60 - gridOpen) / 60 - 1) * HOUR_PX) : 0;
    scrollRef.current.scrollTop = target;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view]);

  const step = (dir: number) => {
    if (view === 'day') setCursor((c) => addDays(c, dir));
    else if (view === 'week') setCursor((c) => addDays(c, dir * 7));
    else setCursor((c) => startOfDay(addMonths(c, dir)));
  };

  const title =
    view === 'day'
      ? capitalize(fmtDate(cursor, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }))
      : view === 'week'
        ? `${fmtDate(range.from, { day: 'numeric', month: 'short' })} – ${fmtDate(addDays(range.from, 6), { day: 'numeric', month: 'short', year: 'numeric' })}`
        : capitalize(fmtDate(cursor, { month: 'long', year: 'numeric' }));

  const slotClick = (day: Date, offsetY: number, chair?: string | null) => {
    const minutes = gridOpen + Math.floor(((offsetY / HOUR_PX) * 60) / SNAP_MIN) * SNAP_MIN;
    const starts = new Date(day);
    starts.setHours(0, minutes, 0, 0);
    setModal({ appt: null, draft: { starts_at: starts, chair_id: chair ?? (chairId || null), doctor_id: doctorId || null } });
  };

  const activeFilters = [doctorId, chairId, type].filter(Boolean).length;

  // Columnas de la vista diaria: un sillón por columna
  const dayColumns = useMemo(() => {
    const cols: { id: string | null; name: string }[] = (chairId ? chairs.filter((c) => c.id === chairId) : chairs).map((c) => ({ id: c.id, name: c.name }));
    if (!chairId && appts.some((a) => !a.chair_id)) cols.push({ id: null, name: 'Sin sillón' });
    if (!cols.length) cols.push({ id: null, name: 'Agenda' });
    return cols;
  }, [chairs, chairId, appts]);

  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(range.from, i)), [range.from]);
  const byDay = (d: Date) => appts.filter((a) => isSameDay(new Date(a.starts_at), d));

  const TimeGutter = (
    <div className="sticky left-0 z-[6] w-14 shrink-0 border-r border-slate-100 bg-white">
      {hours.map((m) => (
        <div key={m} className="relative border-b border-transparent text-right" style={{ height: HOUR_PX }}>
          <span className="absolute -top-2 right-2 text-[10px] tabular-nums text-slate-400">{`${String(Math.floor(m / 60)).padStart(2, '0')}:00`}</span>
        </div>
      ))}
    </div>
  );

  const GridLines = () => (
    <>
      {hours.map((m) => (
        <div key={m} className="border-b border-slate-100" style={{ height: HOUR_PX }}>
          <div className="h-1/2 border-b border-dashed border-slate-100/70" />
        </div>
      ))}
    </>
  );

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={() => setCursor(startOfDay(new Date()))}>
            Hoy
          </Button>
          <div className="flex">
            <Button variant="ghost" size="icon-sm" onClick={() => step(-1)} aria-label="Anterior">
              <ChevronLeft />
            </Button>
            <Button variant="ghost" size="icon-sm" onClick={() => step(1)} aria-label="Siguiente">
              <ChevronRight />
            </Button>
          </div>
          <h1 className="min-w-0 truncate text-base font-semibold sm:text-lg">{title}</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Segmented
            size="sm"
            value={view}
            onChange={setView}
            options={[
              { value: 'day', label: 'Día' },
              { value: 'week', label: 'Semana' },
              { value: 'month', label: 'Mes' },
            ]}
          />
          <Button variant={activeFilters ? 'subtle' : 'secondary'} size="sm" icon={<ListFilter />} onClick={() => setShowFilters((s) => !s)}>
            Filtros{activeFilters ? ` (${activeFilters})` : ''}
          </Button>
          <Button size="sm" icon={<Plus />} onClick={() => setModal({ appt: null, draft: { starts_at: undefined, chair_id: chairId || null, doctor_id: doctorId || null } })}>
            Nueva cita
          </Button>
        </div>
      </div>

      {showFilters && (
        <Card className="animate-slide grid gap-3 p-3 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-center">
          <Select value={doctorId} onChange={(e) => setDoctorId(e.target.value)} aria-label="Doctor">
            <option value="">Todos los doctores</option>
            {doctors.map((d) => (
              <option key={d.id} value={d.id}>
                {d.full_name}
              </option>
            ))}
          </Select>
          <Select value={chairId} onChange={(e) => setChairId(e.target.value)} aria-label="Sillón">
            <option value="">Todos los sillones</option>
            {chairs.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
          <Select value={type} onChange={(e) => setType(e.target.value)} aria-label="Tratamiento">
            <option value="">Todos los tratamientos</option>
            {TREATMENT_TYPES.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </Select>
          <Button
            variant="ghost"
            size="sm"
            icon={<X />}
            disabled={!activeFilters}
            onClick={() => {
              setDoctorId('');
              setChairId('');
              setType('');
            }}
          >
            Limpiar
          </Button>
        </Card>
      )}

      {/* Leyenda de estados */}
      <div className="no-scrollbar flex gap-3 overflow-x-auto text-[11px] text-slate-500">
        {APPT_STATUS_ORDER.map((s) => (
          <span key={s} className="inline-flex shrink-0 items-center gap-1.5">
            <span className={cn('h-2 w-2 rounded-full', APPT_STATUS[s].dot)} />
            {APPT_STATUS[s].label}
            <b className="text-slate-700">{appts.filter((a) => a.status === s).length}</b>
          </span>
        ))}
        {loading && <span className="shrink-0 text-sky-600">Actualizando…</span>}
      </div>

      {error && <ErrorBox message={error} onRetry={() => void reload()} />}

      {view === 'month' ? (
        <Card className="overflow-hidden">
          <div className="grid grid-cols-7 border-b border-slate-100 text-center text-[11px] font-medium uppercase tracking-wide text-slate-400">
            {['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'].map((d) => (
              <div key={d} className="py-2">
                {d}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {Array.from({ length: 42 }, (_, i) => addDays(range.from, i)).map((d) => {
              const list = byDay(d).filter((a) => a.status !== 'cancelada');
              const inMonth = d.getMonth() === cursor.getMonth();
              const today = isSameDay(d, new Date());
              return (
                <button
                  key={d.toISOString()}
                  type="button"
                  onClick={() => {
                    setCursor(startOfDay(d));
                    setView('day');
                  }}
                  className={cn(
                    'flex min-h-[72px] flex-col gap-1 border-b border-r border-slate-100 p-1.5 text-left transition hover:bg-slate-50 sm:min-h-[112px]',
                    !inMonth && 'bg-slate-50/60 text-slate-400',
                  )}
                >
                  <span
                    className={cn(
                      'inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium',
                      today && 'bg-sky-600 text-white',
                    )}
                  >
                    {d.getDate()}
                  </span>
                  <div className="hidden space-y-0.5 sm:block">
                    {list.slice(0, 3).map((a) => (
                      <div key={a.id} className={cn('truncate rounded border-l-2 px-1 py-px text-[10px]', APPT_STATUS[a.status].block)}>
                        {fmtTime(a.starts_at)} {a.patient?.last_name}
                      </div>
                    ))}
                    {list.length > 3 && <p className="px-1 text-[10px] text-slate-500">+{list.length - 3} más</p>}
                  </div>
                  {list.length > 0 && (
                    <div className="flex flex-wrap gap-0.5 sm:hidden">
                      {list.slice(0, 4).map((a) => (
                        <span key={a.id} className={cn('h-1.5 w-1.5 rounded-full', APPT_STATUS[a.status].dot)} />
                      ))}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div ref={scrollRef} className="max-h-[calc(100dvh-260px)] min-h-[420px] overflow-auto">
            <div className={cn('min-w-full', view === 'week' ? 'w-[820px] lg:w-auto' : dayColumns.length > 2 ? 'w-max' : '')}>
              {/* Cabeceras */}
              <div className="sticky top-0 z-[7] flex border-b border-slate-200 bg-white">
                <div className="sticky left-0 z-[8] w-14 shrink-0 bg-white" />
                {view === 'week'
                  ? weekDays.map((d) => {
                      const today = isSameDay(d, new Date());
                      return (
                        <button
                          key={d.toISOString()}
                          type="button"
                          onClick={() => {
                            setCursor(d);
                            setView('day');
                          }}
                          className="flex-1 border-l border-slate-100 py-2 text-center"
                        >
                          <p className="text-[10px] uppercase tracking-wide text-slate-400">{fmtDate(d, { weekday: 'short' }).replace('.', '')}</p>
                          <p className={cn('mx-auto mt-0.5 flex h-7 w-7 items-center justify-center rounded-full text-sm font-semibold', today && 'bg-sky-600 text-white')}>
                            {d.getDate()}
                          </p>
                        </button>
                      );
                    })
                  : dayColumns.map((c) => (
                      <div key={c.id ?? 'none'} className="min-w-[180px] flex-1 border-l border-slate-100 py-3 text-center text-xs font-semibold text-slate-600">
                        {c.name}
                      </div>
                    ))}
              </div>

              {/* Cuerpo */}
              <div className="flex">
                {TimeGutter}
                {view === 'week'
                  ? weekDays.map((d) => {
                      const items = layoutLanes(byDay(d));
                      const dayStart = startOfDay(d);
                      return (
                        <div
                          key={d.toISOString()}
                          className="relative flex-1 cursor-pointer border-l border-slate-100"
                          style={{ height: gridHeight }}
                          onClick={(e) => slotClick(d, e.clientY - e.currentTarget.getBoundingClientRect().top)}
                        >
                          <GridLines />
                          <NowLine day={d} openMin={gridOpen} closeMin={closeMin} />
                          <div className="absolute inset-0">
                            {items.map((it) => (
                              <EventBlock key={it.ev.id} item={it} dayStart={dayStart} openMin={gridOpen} onClick={() => setModal({ appt: it.ev })} />
                            ))}
                          </div>
                        </div>
                      );
                    })
                  : dayColumns.map((col) => {
                      const items = layoutLanes(byDay(cursor).filter((a) => (col.id === null ? !a.chair_id || dayColumns.length === 1 : a.chair_id === col.id)));
                      return (
                        <div
                          key={col.id ?? 'none'}
                          className="relative min-w-[180px] flex-1 cursor-pointer border-l border-slate-100"
                          style={{ height: gridHeight }}
                          onClick={(e) => slotClick(cursor, e.clientY - e.currentTarget.getBoundingClientRect().top, col.id)}
                        >
                          <GridLines />
                          <NowLine day={cursor} openMin={gridOpen} closeMin={closeMin} />
                          <div className="absolute inset-0">
                            {items.map((it) => (
                              <EventBlock key={it.ev.id} item={it} dayStart={cursor} openMin={gridOpen} onClick={() => setModal({ appt: it.ev })} />
                            ))}
                          </div>
                        </div>
                      );
                    })}
              </div>
            </div>
          </div>
          {!loading && appts.length === 0 && (
            <div className="flex items-center justify-center gap-2 border-t border-slate-100 py-3 text-xs text-slate-500">
              <CalendarDays className="h-3.5 w-3.5" /> Sin citas en este periodo. Toca un horario para agendar.
            </div>
          )}
        </Card>
      )}

      <AppointmentModal
        open={!!modal}
        appointment={modal?.appt}
        draft={modal?.draft}
        onClose={() => setModal(null)}
        onSaved={() => void reload(true)}
      />
    </div>
  );
}
