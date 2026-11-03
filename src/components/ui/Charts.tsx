import { useId, useState } from 'react';

export interface ChartPoint {
  label: string;
  value: number;
}

function niceMax(v: number): number {
  if (v <= 0) return 1;
  const exp = Math.pow(10, Math.floor(Math.log10(v)));
  const f = v / exp;
  const nice = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10;
  return nice * exp;
}

const W = 640;
const PAD = { t: 18, r: 12, b: 30, l: 48 };

function Grid({ max, h, format }: { max: number; h: number; format: (v: number) => string }) {
  return (
    <>
      {[0, 0.25, 0.5, 0.75, 1].map((t) => {
        const y = PAD.t + (h - PAD.t - PAD.b) * (1 - t);
        return (
          <g key={t}>
            <line
              x1={PAD.l}
              x2={W - PAD.r}
              y1={y}
              y2={y}
              className="stroke-slate-200"
              strokeDasharray={t === 0 ? undefined : '3 5'}
            />
            <text x={PAD.l - 8} y={y + 4} textAnchor="end" className="fill-slate-400" fontSize="11">
              {format(max * t)}
            </text>
          </g>
        );
      })}
    </>
  );
}

function Tooltip({ x, label, value }: { x: number; label: string; value: string }) {
  return (
    <div
      className="pointer-events-none absolute top-0 z-10 -translate-x-1/2 -translate-y-1 whitespace-nowrap rounded-lg bg-slate-900 px-2.5 py-1.5 text-xs text-white shadow-lg"
      style={{ left: `${x}%` }}
    >
      <span className="opacity-70">{label}</span> · <b>{value}</b>
    </div>
  );
}

export function BarChart({
  data,
  format = (v) => String(Math.round(v)),
  axisFormat,
  height = 240,
  color = '#0284C7',
}: {
  data: ChartPoint[];
  format?: (v: number) => string;
  axisFormat?: (v: number) => string;
  height?: number;
  color?: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const max = niceMax(Math.max(0, ...data.map((d) => d.value)));
  const plotH = height - PAD.t - PAD.b;
  const slot = (W - PAD.l - PAD.r) / Math.max(data.length, 1);
  const barW = Math.min(slot * 0.56, 46);

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${height}`} className="h-auto w-full" role="img" aria-label="Gráfico de barras">
        <Grid max={max} h={height} format={axisFormat ?? format} />
        {data.map((d, i) => {
          const h = (plotH * d.value) / max;
          const cx = PAD.l + slot * i + slot / 2;
          return (
            <g key={i} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} onTouchStart={() => setHover(i)}>
              <rect x={PAD.l + slot * i} y={PAD.t} width={slot} height={plotH} fill="transparent" />
              <rect
                x={cx - barW / 2}
                y={PAD.t + plotH - h}
                width={barW}
                height={Math.max(h, d.value > 0 ? 2 : 0)}
                rx={5}
                fill={color}
                opacity={hover === null || hover === i ? 1 : 0.4}
                style={{ transition: 'opacity .15s' }}
              />
              <text x={cx} y={height - 9} textAnchor="middle" className="fill-slate-400" fontSize="11">
                {d.label}
              </text>
            </g>
          );
        })}
      </svg>
      {hover !== null && data[hover] && (
        <Tooltip
          x={((PAD.l + slot * hover + slot / 2) / W) * 100}
          label={data[hover].label}
          value={format(data[hover].value)}
        />
      )}
    </div>
  );
}

export function LineChart({
  data,
  format = (v) => String(Math.round(v)),
  height = 240,
  color = '#0D9488',
}: {
  data: ChartPoint[];
  format?: (v: number) => string;
  height?: number;
  color?: string;
}) {
  const gid = useId().replace(/:/g, '');
  const [hover, setHover] = useState<number | null>(null);
  const max = niceMax(Math.max(0, ...data.map((d) => d.value)));
  const plotH = height - PAD.t - PAD.b;
  const step = (W - PAD.l - PAD.r) / Math.max(data.length - 1, 1);
  const pts = data.map((d, i) => ({ x: PAD.l + step * i, y: PAD.t + plotH - (plotH * d.value) / max }));
  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${p.x},${p.y}`).join(' ');
  const area = pts.length ? `${line} L${pts[pts.length - 1].x},${PAD.t + plotH} L${pts[0].x},${PAD.t + plotH} Z` : '';

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${height}`} className="h-auto w-full" role="img" aria-label="Gráfico de líneas">
        <defs>
          <linearGradient id={gid} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.22" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        <Grid max={max} h={height} format={format} />
        {area && <path d={area} fill={`url(#${gid})`} />}
        {line && <path d={line} fill="none" stroke={color} strokeWidth={2.25} strokeLinejoin="round" strokeLinecap="round" />}
        {pts.map((p, i) => (
          <g key={i} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} onTouchStart={() => setHover(i)}>
            <rect x={p.x - step / 2} y={PAD.t} width={step} height={plotH} fill="transparent" />
            {hover === i && <line x1={p.x} x2={p.x} y1={PAD.t} y2={PAD.t + plotH} className="stroke-slate-300" />}
            <circle cx={p.x} cy={p.y} r={hover === i ? 5 : 3.5} fill="white" stroke={color} strokeWidth={2} />
            <text x={p.x} y={height - 9} textAnchor="middle" className="fill-slate-400" fontSize="11">
              {data[i].label}
            </text>
          </g>
        ))}
      </svg>
      {hover !== null && data[hover] && (
        <Tooltip x={(pts[hover].x / W) * 100} label={data[hover].label} value={format(data[hover].value)} />
      )}
    </div>
  );
}
