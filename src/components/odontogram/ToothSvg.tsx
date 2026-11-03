import type { OdontogramRecord, Surface } from '../../types';
import { CONDITIONS, TOOTH_STATUS, isUpper, surfaceLayout } from '../../utils/teeth';
import { cn } from '../../utils/format';

const POLYS = {
  top: '2,2 38,2 27,13 13,13',
  bottom: '13,27 27,27 38,38 2,38',
  left: '2,2 13,13 13,27 2,38',
  right: '38,2 38,38 27,27 27,13',
} as const;

/** Diagrama de pieza dental con 5 superficies clicables (V, L/P, M, D, O). */
export function ToothSvg({
  n,
  rec,
  selected,
  interactive,
  onSurface,
  onTooth,
}: {
  n: number;
  rec?: OdontogramRecord;
  selected?: boolean;
  interactive?: boolean;
  onSurface: (s: Surface) => void;
  onTooth: () => void;
}) {
  const layout = surfaceLayout(n);
  const condition = rec?.condition ?? 'sano';
  const status = rec?.status ?? 'sano';
  const absent = condition === 'ausente';
  const fill = (s: Surface) => {
    const c = rec?.surfaces?.[s];
    return c ? CONDITIONS[c].color : 'var(--tooth-fill)';
  };
  const upper = isUpper(n);
  const label = (
    <button
      type="button"
      onClick={onTooth}
      className={cn(
        'w-full rounded text-center text-[10px] font-semibold tabular-nums leading-4 transition-colors',
        selected ? 'bg-sky-600 text-white' : 'text-slate-500 hover:text-slate-900',
      )}
    >
      {n}
    </button>
  );

  const zone = (key: keyof typeof POLYS) => (
    <polygon
      points={POLYS[key]}
      fill={fill(layout[key])}
      stroke="var(--tooth-stroke)"
      strokeWidth={1}
      className={cn(interactive && 'cursor-pointer transition-opacity hover:opacity-70')}
      onClick={(e) => {
        e.stopPropagation();
        onSurface(layout[key]);
      }}
    >
      <title>{`${n} · ${layout[key]}`}</title>
    </polygon>
  );

  return (
    <div className="flex w-8 flex-col items-center gap-0.5 sm:w-9 xl:w-10 2xl:w-11">
      {upper && label}
      <svg
        viewBox="-3 -3 46 46"
        className={cn('w-full overflow-visible rounded-sm', selected && 'drop-shadow-[0_0_0_2px_rgba(2,132,199,0.9)]')}
        onClick={onTooth}
      >
        {selected && <rect x={-2.5} y={-2.5} width={45} height={45} rx={4} fill="none" stroke="#0284C7" strokeWidth={2} />}
        <g opacity={absent ? 0.3 : 1}>
          {zone('top')}
          {zone('bottom')}
          {zone('left')}
          {zone('right')}
          <rect
            x={13}
            y={13}
            width={14}
            height={14}
            fill={fill(layout.center)}
            stroke="var(--tooth-stroke)"
            strokeWidth={1}
            className={cn(interactive && 'cursor-pointer transition-opacity hover:opacity-70')}
            onClick={(e) => {
              e.stopPropagation();
              onSurface(layout.center);
            }}
          >
            <title>{`${n} · O`}</title>
          </rect>
        </g>

        {/* Marcas de condición de la pieza completa */}
        {condition === 'ausente' && (
          <g stroke={CONDITIONS.ausente.color} strokeWidth={3} strokeLinecap="round" pointerEvents="none">
            <line x1={4} y1={4} x2={36} y2={36} />
            <line x1={36} y1={4} x2={4} y2={36} />
          </g>
        )}
        {condition === 'extraccion_indicada' && (
          <g stroke={CONDITIONS.extraccion_indicada.color} strokeWidth={3} strokeLinecap="round" pointerEvents="none">
            <line x1={4} y1={4} x2={36} y2={36} />
            <line x1={36} y1={4} x2={4} y2={36} />
          </g>
        )}
        {condition === 'endodoncia' && (
          <g pointerEvents="none">
            <line x1={20} y1={upper ? -3 : 43} x2={20} y2={20} stroke={CONDITIONS.endodoncia.color} strokeWidth={3.5} strokeLinecap="round" />
            <circle cx={20} cy={20} r={4.5} fill={CONDITIONS.endodoncia.color} />
          </g>
        )}
        {condition === 'corona' && (
          <circle cx={20} cy={20} r={20.5} fill="none" stroke={CONDITIONS.corona.color} strokeWidth={3} pointerEvents="none" />
        )}
        {condition === 'implante' && (
          <g pointerEvents="none">
            <rect x={0.5} y={0.5} width={39} height={39} fill="none" stroke={CONDITIONS.implante.color} strokeWidth={2.5} />
            <text x={20} y={24} textAnchor="middle" fontSize={11} fontWeight={700} fill={CONDITIONS.implante.color}>
              IMP
            </text>
          </g>
        )}
        {condition === 'pendiente' && <circle cx={36} cy={4} r={5} fill={CONDITIONS.pendiente.color} stroke="white" strokeWidth={1.5} pointerEvents="none" />}

        {/* Estado del tratamiento */}
        {status === 'en_tratamiento' && (
          <rect x={-1.5} y={-1.5} width={43} height={43} rx={3} fill="none" stroke={TOOTH_STATUS.en_tratamiento.color} strokeWidth={2} strokeDasharray="4 3" pointerEvents="none" />
        )}
        {status === 'realizado' && (
          <g pointerEvents="none">
            <circle cx={4} cy={upper ? 36 : 4} r={5.5} fill={TOOTH_STATUS.realizado.color} stroke="white" strokeWidth={1.5} />
            <path
              d={upper ? 'M1.6 36 l1.8 1.8 l3.2 -3.4' : 'M1.6 4 l1.8 1.8 l3.2 -3.4'}
              stroke="white"
              strokeWidth={1.6}
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </g>
        )}
      </svg>
      {!upper && label}
    </div>
  );
}
