import type { Surface, ToothCondition, ToothStatus } from '../types';

// Notación FDI, ordenada como se ve el odontograma (derecha del paciente a la izquierda del observador)
export const PERMANENT_UPPER = [18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28];
export const PERMANENT_LOWER = [48, 47, 46, 45, 44, 43, 42, 41, 31, 32, 33, 34, 35, 36, 37, 38];
export const DECIDUOUS_UPPER = [55, 54, 53, 52, 51, 61, 62, 63, 64, 65];
export const DECIDUOUS_LOWER = [85, 84, 83, 82, 81, 71, 72, 73, 74, 75];

export const CONDITIONS: Record<ToothCondition, { label: string; color: string; scope: 'surface' | 'tooth' }> = {
  sano: { label: 'Sano', color: '#94A3B8', scope: 'tooth' },
  caries: { label: 'Caries', color: '#F43F5E', scope: 'surface' },
  obturacion: { label: 'Obturación', color: '#0284C7', scope: 'surface' },
  sellante: { label: 'Sellante', color: '#22C55E', scope: 'surface' },
  endodoncia: { label: 'Endodoncia', color: '#8B5CF6', scope: 'tooth' },
  corona: { label: 'Corona', color: '#F59E0B', scope: 'tooth' },
  ausente: { label: 'Ausente', color: '#64748B', scope: 'tooth' },
  extraccion_indicada: { label: 'Extracción indicada', color: '#DC2626', scope: 'tooth' },
  implante: { label: 'Implante', color: '#0D9488', scope: 'tooth' },
  pendiente: { label: 'Tratamiento pendiente', color: '#FB923C', scope: 'tooth' },
};

export const TOOL_ORDER: ToothCondition[] = [
  'caries',
  'obturacion',
  'sellante',
  'endodoncia',
  'corona',
  'pendiente',
  'extraccion_indicada',
  'implante',
  'ausente',
  'sano',
];

export const TOOTH_STATUS: Record<ToothStatus, { label: string; color: string }> = {
  sano: { label: 'Sano', color: '#94A3B8' },
  en_tratamiento: { label: 'En tratamiento', color: '#F59E0B' },
  realizado: { label: 'Realizado', color: '#0D9488' },
};

export const SURFACE_LABELS: Record<Surface, string> = {
  O: 'Oclusal / Incisal',
  M: 'Mesial',
  D: 'Distal',
  V: 'Vestibular',
  L: 'Lingual / Palatino',
};

export const quadrant = (n: number) => Math.floor(n / 10);
export const isUpper = (n: number) => [1, 2, 5, 6].includes(quadrant(n));
export const isDeciduous = (n: number) => n >= 51;
/** Lado derecho del paciente = lado izquierdo del observador */
const isPatientRight = (n: number) => [1, 4, 5, 8].includes(quadrant(n));

/** Superficie que corresponde a cada zona geométrica del diagrama */
export function surfaceLayout(n: number): { top: Surface; bottom: Surface; left: Surface; right: Surface; center: Surface } {
  const upper = isUpper(n);
  const right = isPatientRight(n);
  return {
    top: upper ? 'V' : 'L',
    bottom: upper ? 'L' : 'V',
    left: right ? 'D' : 'M',
    right: right ? 'M' : 'D',
    center: 'O',
  };
}

const PERM_NAMES = ['', 'Incisivo central', 'Incisivo lateral', 'Canino', 'Primer premolar', 'Segundo premolar', 'Primer molar', 'Segundo molar', 'Tercer molar'];
const DEC_NAMES = ['', 'Incisivo central', 'Incisivo lateral', 'Canino', 'Primer molar', 'Segundo molar'];
const QUAD_NAMES: Record<number, string> = {
  1: 'superior derecho', 2: 'superior izquierdo', 3: 'inferior izquierdo', 4: 'inferior derecho',
  5: 'superior derecho', 6: 'superior izquierdo', 7: 'inferior izquierdo', 8: 'inferior derecho',
};

export function toothName(n: number): string {
  const pos = n % 10;
  const base = isDeciduous(n) ? DEC_NAMES[pos] : PERM_NAMES[pos];
  return `${base} ${QUAD_NAMES[quadrant(n)]}${isDeciduous(n) ? ' (temporal)' : ''}`;
}
