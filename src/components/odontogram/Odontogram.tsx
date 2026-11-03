import { Fragment, useEffect, useMemo, useState } from 'react';
import { Eraser, MousePointer2, Save } from 'lucide-react';
import { useToast } from '../../context/ToastContext';
import { useAsync } from '../../hooks/useAsync';
import { useRealtime } from '../../hooks/useRealtime';
import { errorMessage } from '../../lib/supabase';
import { clearTooth, getOdontogram, saveTooth } from '../../services/odontogram';
import type { OdontogramRecord, Surface, SurfaceMap, ToothCondition, ToothStatus } from '../../types';
import { cn } from '../../utils/format';
import {
  CONDITIONS,
  DECIDUOUS_LOWER,
  DECIDUOUS_UPPER,
  PERMANENT_LOWER,
  PERMANENT_UPPER,
  SURFACE_LABELS,
  TOOL_ORDER,
  TOOTH_STATUS,
  isDeciduous,
  toothName,
} from '../../utils/teeth';
import { Button } from '../ui/Button';
import { ErrorBox, LoadingBlock } from '../ui/Feedback';
import { Field, Select, Textarea } from '../ui/Field';
import { Badge, Card, CardHeader, Segmented } from '../ui/Primitives';
import { ToothSvg } from './ToothSvg';

type Dentition = 'permanente' | 'temporal' | 'mixta';

const blank = (patientId: string, n: number): OdontogramRecord => ({
  patient_id: patientId,
  tooth_number: n,
  condition: 'sano',
  status: 'sano',
  surfaces: {},
  notes: null,
});

const isEmptyRecord = (r: OdontogramRecord) =>
  r.condition === 'sano' && Object.keys(r.surfaces ?? {}).length === 0 && !r.notes?.trim();

export function Odontogram({ patientId, canEdit }: { patientId: string; canEdit: boolean }) {
  const toast = useToast();
  const { data, setData, loading, error, reload } = useAsync(() => getOdontogram(patientId), [patientId]);
  // El evento trae la fila completa: se aplica en memoria sin volver a consultar (cero egress extra por clic).
  useRealtime('odontogram_records', () => void reload(true), {
    filter: `patient_id=eq.${patientId}`,
    shouldReload: (p) => {
      if (p.eventType === 'DELETE') {
        const id = (p.old as { id?: string }).id;
        if (!id) return true;
        setData((cur) => (cur ?? []).filter((r) => r.id !== id));
        return false;
      }
      const rec = p.new as unknown as OdontogramRecord;
      setData((cur) => [...(cur ?? []).filter((r) => r.tooth_number !== rec.tooth_number), rec]);
      return false;
    },
  });

  const records = useMemo(() => data ?? [], [data]);
  const byTooth = useMemo(() => new Map(records.map((r) => [r.tooth_number, r])), [records]);

  const [dentition, setDentition] = useState<Dentition>('permanente');
  const [tool, setTool] = useState<ToothCondition | null>(null);
  const [applyStatus, setApplyStatus] = useState<ToothStatus>('en_tratamiento');
  const [selected, setSelected] = useState<number | null>(null);

  // Si el paciente solo tiene registros temporales, mostrar esa dentición al cargar
  useEffect(() => {
    if (!records.length) return;
    const hasTemp = records.some((r) => isDeciduous(r.tooth_number));
    const hasPerm = records.some((r) => !isDeciduous(r.tooth_number));
    if (hasTemp && hasPerm) setDentition('mixta');
    else if (hasTemp) setDentition('temporal');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data === null]);

  const persist = async (n: number, next: OdontogramRecord | null) => {
    const snapshot = records;
    const normalized = next && isEmptyRecord(next) ? null : next;
    setData((cur) => {
      const rest = (cur ?? []).filter((r) => r.tooth_number !== n);
      return normalized ? [...rest, normalized] : rest;
    });
    try {
      if (normalized) {
        const saved = await saveTooth(normalized);
        setData((cur) => [...(cur ?? []).filter((r) => r.tooth_number !== n), saved]);
      } else if (byTooth.has(n)) {
        await clearTooth(patientId, n);
      }
    } catch (e) {
      setData(snapshot);
      toast.error(errorMessage(e));
    }
  };

  const statusFor = (condition: ToothCondition, surfaces: SurfaceMap): ToothStatus =>
    condition === 'sano' && Object.keys(surfaces).length === 0 ? 'sano' : applyStatus;

  const applyToTooth = (n: number) => {
    setSelected(n);
    if (!canEdit || !tool) return;
    const cur = byTooth.get(n) ?? blank(patientId, n);
    if (tool === 'sano') {
      void persist(n, null);
      return;
    }
    if (CONDITIONS[tool].scope === 'surface') return; // las de superficie se aplican tocando la superficie
    const condition: ToothCondition = cur.condition === tool ? 'sano' : tool;
    const surfaces = condition === 'ausente' ? {} : cur.surfaces;
    void persist(n, { ...cur, condition, surfaces, status: statusFor(condition, surfaces) });
  };

  const applyToSurface = (n: number, s: Surface) => {
    setSelected(n);
    if (!canEdit || !tool) return;
    if (CONDITIONS[tool].scope === 'tooth') {
      applyToTooth(n);
      return;
    }
    const cur = byTooth.get(n) ?? blank(patientId, n);
    if (cur.condition === 'ausente') {
      toast.info('La pieza está marcada como ausente.');
      return;
    }
    const surfaces: SurfaceMap = { ...cur.surfaces };
    if (surfaces[s] === tool) delete surfaces[s];
    else surfaces[s] = tool;
    void persist(n, { ...cur, surfaces, status: statusFor(cur.condition, surfaces) });
  };

  // ----- Panel de edición -----
  const selectedRec = selected ? byTooth.get(selected) ?? blank(patientId, selected) : null;
  const [draft, setDraft] = useState<OdontogramRecord | null>(null);
  useEffect(() => {
    setDraft(selectedRec ? { ...selectedRec, surfaces: { ...selectedRec.surfaces } } : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, selectedRec?.updated_at, selectedRec?.condition, selectedRec?.status, JSON.stringify(selectedRec?.surfaces)]);

  const rows: { teeth: number[]; upper: boolean }[] = [];
  if (dentition !== 'temporal') rows.push({ teeth: PERMANENT_UPPER, upper: true });
  if (dentition !== 'permanente') rows.push({ teeth: DECIDUOUS_UPPER, upper: true });
  if (dentition !== 'permanente') rows.push({ teeth: DECIDUOUS_LOWER, upper: false });
  if (dentition !== 'temporal') rows.push({ teeth: PERMANENT_LOWER, upper: false });

  const findings = [...records].sort((a, b) => a.tooth_number - b.tooth_number);
  const counts = useMemo(() => {
    const c: Partial<Record<ToothCondition, number>> = {};
    for (const r of records) {
      if (r.condition !== 'sano') c[r.condition] = (c[r.condition] ?? 0) + 1;
      for (const v of Object.values(r.surfaces ?? {})) if (v) c[v] = (c[v] ?? 0) + 1;
    }
    return c;
  }, [records]);

  if (loading && !data) return <LoadingBlock label="Cargando odontograma…" />;
  if (error) return <ErrorBox message={error} onRetry={() => void reload()} />;

  return (
    <div className="space-y-4">
      {/* Barra de herramientas */}
      <Card className="p-3 sm:p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <Segmented
            size="sm"
            value={dentition}
            onChange={setDentition}
            options={[
              { value: 'permanente', label: 'Permanente' },
              { value: 'temporal', label: 'Temporal' },
              { value: 'mixta', label: 'Mixta' },
            ]}
          />
          {canEdit && (
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <span>Aplicar como:</span>
              <Segmented
                size="sm"
                value={applyStatus}
                onChange={setApplyStatus}
                options={[
                  { value: 'en_tratamiento', label: 'En tratamiento' },
                  { value: 'realizado', label: 'Realizado' },
                ]}
              />
            </div>
          )}
        </div>
        {canEdit && (
          <div className="no-scrollbar -mx-3 mt-3 flex gap-1.5 overflow-x-auto px-3 pb-0.5 sm:mx-0 sm:flex-wrap sm:px-0">
            <button
              type="button"
              onClick={() => setTool(null)}
              className={cn(
                'inline-flex shrink-0 items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition',
                tool === null
                  ? 'border-sky-500 bg-sky-50 text-sky-700'
                  : 'border-slate-200 text-slate-600 hover:bg-slate-50',
              )}
            >
              <MousePointer2 className="h-3.5 w-3.5" /> Seleccionar
            </button>
            {TOOL_ORDER.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setTool(tool === c ? null : c)}
                className={cn(
                  'inline-flex shrink-0 items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition',
                  tool === c
                    ? 'border-slate-900 bg-slate-900 text-white'
                    : 'border-slate-200 text-slate-600 hover:bg-slate-50',
                )}
              >
                <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: CONDITIONS[c].color }} />
                {c === 'sano' ? 'Restablecer' : CONDITIONS[c].label}
              </button>
            ))}
          </div>
        )}
        {canEdit && tool && (
          <p className="mt-2 text-xs text-slate-500">
            {tool === 'sano'
              ? 'Toca una pieza para dejarla sana (borra sus hallazgos).'
              : CONDITIONS[tool].scope === 'surface'
                ? `Toca una superficie para marcar/desmarcar ${CONDITIONS[tool].label.toLowerCase()}.`
                : `Toca una pieza para marcar/desmarcar ${CONDITIONS[tool].label.toLowerCase()}.`}
          </p>
        )}
      </Card>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        {/* Arcada */}
        <Card className="self-start overflow-hidden">
          <div className="overflow-x-auto px-3 py-6 sm:px-6 sm:py-8">
            <div className="mx-auto w-max space-y-4">
              {rows.map((row, i) => (
                <Fragment key={i}>
                  {i > 0 && rows[i - 1].upper && !row.upper && (
                    <div className="relative my-2 h-px bg-slate-200">
                      <span className="absolute left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white px-2 text-[10px] uppercase tracking-widest text-slate-400">
                        oclusión
                      </span>
                    </div>
                  )}
                  <div className="flex justify-center gap-1 2xl:gap-1.5">
                    {row.teeth.map((n, idx) => (
                      <Fragment key={n}>
                        {idx === row.teeth.length / 2 && <div className="mx-1 w-px self-stretch bg-slate-300" />}
                        <ToothSvg
                          n={n}
                          rec={byTooth.get(n)}
                          selected={selected === n}
                          interactive={canEdit && !!tool}
                          onTooth={() => applyToTooth(n)}
                          onSurface={(s) => applyToSurface(n, s)}
                        />
                      </Fragment>
                    ))}
                  </div>
                </Fragment>
              ))}
            </div>
          </div>
          {/* Leyenda */}
          <div className="flex flex-wrap gap-x-4 gap-y-1.5 border-t border-slate-100 px-4 py-3 text-[11px] text-slate-500">
            {TOOL_ORDER.filter((c) => c !== 'sano').map((c) => (
              <span key={c} className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: CONDITIONS[c].color }} />
                {CONDITIONS[c].label}
                {counts[c] ? <b className="text-slate-700">({counts[c]})</b> : null}
              </span>
            ))}
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm border-2 border-dashed" style={{ borderColor: TOOTH_STATUS.en_tratamiento.color }} />
              En tratamiento
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: TOOTH_STATUS.realizado.color }} />
              Realizado
            </span>
          </div>
        </Card>

        {/* Panel de pieza */}
        <Card>
          <CardHeader
            title={selected ? `Pieza ${selected}` : 'Detalle de pieza'}
            subtitle={selected ? toothName(selected) : 'Selecciona una pieza en el odontograma'}
          />
          {draft && selected ? (
            <div className="space-y-4 p-4">
              <Field label="Condición de la pieza">
                <Select
                  value={draft.condition}
                  disabled={!canEdit}
                  onChange={(e) => setDraft({ ...draft, condition: e.target.value as ToothCondition })}
                >
                  {(Object.keys(CONDITIONS) as ToothCondition[])
                    .filter((c) => CONDITIONS[c].scope === 'tooth')
                    .map((c) => (
                      <option key={c} value={c}>
                        {CONDITIONS[c].label}
                      </option>
                    ))}
                </Select>
              </Field>
              <Field label="Estado">
                <div className="grid grid-cols-3 gap-1.5">
                  {(Object.keys(TOOTH_STATUS) as ToothStatus[]).map((s) => (
                    <button
                      key={s}
                      type="button"
                      disabled={!canEdit}
                      onClick={() => setDraft({ ...draft, status: s })}
                      className={cn(
                        'rounded-lg border px-2 py-1.5 text-xs font-medium transition disabled:opacity-60',
                        draft.status === s ? 'border-transparent text-white' : 'border-slate-200 text-slate-600',
                      )}
                      style={draft.status === s ? { backgroundColor: TOOTH_STATUS[s].color } : undefined}
                    >
                      {TOOTH_STATUS[s].label}
                    </button>
                  ))}
                </div>
              </Field>
              <Field label="Superficies">
                <div className="space-y-1.5">
                  {(['V', 'L', 'M', 'D', 'O'] as Surface[]).map((s) => {
                    const val = draft.surfaces[s];
                    return (
                      <div key={s} className="flex items-center gap-2 text-xs">
                        <span className="w-28 shrink-0 text-slate-500">{SURFACE_LABELS[s]}</span>
                        <Select
                          className="h-8 text-xs"
                          disabled={!canEdit || draft.condition === 'ausente'}
                          value={val ?? ''}
                          onChange={(e) => {
                            const surfaces = { ...draft.surfaces };
                            if (e.target.value) surfaces[s] = e.target.value as ToothCondition;
                            else delete surfaces[s];
                            setDraft({ ...draft, surfaces });
                          }}
                        >
                          <option value="">Sana</option>
                          <option value="caries">Caries</option>
                          <option value="obturacion">Obturación</option>
                          <option value="sellante">Sellante</option>
                        </Select>
                      </div>
                    );
                  })}
                </div>
              </Field>
              <Field label="Notas de la pieza">
                <Textarea
                  rows={2}
                  disabled={!canEdit}
                  value={draft.notes ?? ''}
                  onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
                  placeholder="Movilidad, fractura, observaciones…"
                />
              </Field>
              {canEdit && (
                <div className="flex gap-2">
                  <Button
                    className="flex-1"
                    icon={<Save />}
                    onClick={() => {
                      const surfaces = draft.condition === 'ausente' ? {} : draft.surfaces;
                      void persist(selected, { ...draft, surfaces }).then(() => toast.success(`Pieza ${selected} actualizada`));
                    }}
                  >
                    Guardar
                  </Button>
                  <Button variant="secondary" icon={<Eraser />} onClick={() => void persist(selected, null)} title="Restablecer a sano">
                    Limpiar
                  </Button>
                </div>
              )}
            </div>
          ) : (
            <p className="p-4 text-sm text-slate-500">
              {canEdit ? 'Elige una herramienta y toca las piezas, o selecciona una pieza para editarla en detalle.' : 'Vista de solo lectura.'}
            </p>
          )}
        </Card>
      </div>

      {/* Resumen de hallazgos */}
      <Card>
        <CardHeader title="Hallazgos registrados" subtitle={`${findings.length} pieza(s) con registros`} />
        {findings.length === 0 ? (
          <p className="p-4 text-sm text-slate-500">Sin hallazgos. Todas las piezas figuran sanas.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {findings.map((r) => (
              <li key={r.tooth_number}>
                <button
                  type="button"
                  onClick={() => setSelected(r.tooth_number)}
                  className="flex w-full flex-wrap items-center gap-2 px-4 py-2.5 text-left text-sm hover:bg-slate-50"
                >
                  <span className="w-8 font-semibold tabular-nums">{r.tooth_number}</span>
                  {r.condition !== 'sano' && (
                    <span className="inline-flex items-center gap-1.5 text-xs">
                      <span className="h-2 w-2 rounded-sm" style={{ backgroundColor: CONDITIONS[r.condition].color }} />
                      {CONDITIONS[r.condition].label}
                    </span>
                  )}
                  {Object.entries(r.surfaces ?? {}).map(([s, c]) =>
                    c ? (
                      <span key={s} className="inline-flex items-center gap-1 text-xs text-slate-500">
                        <span className="h-2 w-2 rounded-sm" style={{ backgroundColor: CONDITIONS[c].color }} />
                        {CONDITIONS[c].label} ({s})
                      </span>
                    ) : null,
                  )}
                  <span className="ml-auto">
                    <Badge tone={r.status === 'realizado' ? 'teal' : r.status === 'en_tratamiento' ? 'amber' : 'slate'}>
                      {TOOTH_STATUS[r.status].label}
                    </Badge>
                  </span>
                  {r.notes && <p className="w-full pl-10 text-xs text-slate-500">{r.notes}</p>}
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
