import type {
  AppRole,
  AppointmentStatus,
  DocumentKind,
  ExpenseCategory,
  FileCategory,
  LabStatus,
  MovementKind,
  PaymentMethod,
  TreatmentStatus,
} from '../types';

export type Tone = 'slate' | 'sky' | 'teal' | 'amber' | 'rose' | 'emerald' | 'violet';

export const APPT_STATUS: Record<
  AppointmentStatus,
  { label: string; tone: Tone; block: string; dot: string }
> = {
  programada: {
    label: 'Programada',
    tone: 'sky',
    dot: 'bg-sky-500',
    block: 'bg-sky-50 border-sky-500 text-sky-900',
  },
  confirmada: {
    label: 'Confirmada',
    tone: 'teal',
    dot: 'bg-teal-500',
    block: 'bg-teal-50 border-teal-500 text-teal-900',
  },
  en_espera: {
    label: 'En sala de espera',
    tone: 'amber',
    dot: 'bg-amber-500',
    block: 'bg-amber-50 border-amber-500 text-amber-900',
  },
  atendida: {
    label: 'Atendida',
    tone: 'emerald',
    dot: 'bg-emerald-500',
    block: 'bg-emerald-50 border-emerald-500 text-emerald-900',
  },
  cancelada: {
    label: 'Cancelada',
    tone: 'rose',
    dot: 'bg-rose-500',
    block: 'bg-rose-50 border-rose-400 text-rose-800 line-through opacity-70',
  },
};

export const APPT_STATUS_ORDER: AppointmentStatus[] = ['programada', 'confirmada', 'en_espera', 'atendida', 'cancelada'];

export const ROLE_LABELS: Record<AppRole, string> = {
  admin: 'Administrador',
  doctor: 'Doctor',
  recepcionista: 'Recepcionista',
  asistente: 'Asistente',
};

export const ROLE_TONE: Record<AppRole, Tone> = {
  admin: 'violet',
  doctor: 'sky',
  recepcionista: 'teal',
  asistente: 'slate',
};

export const PAYMENT_METHODS: Record<PaymentMethod, string> = {
  efectivo: 'Efectivo',
  yape: 'Yape',
  plin: 'Plin',
  transferencia: 'Transferencia',
  tarjeta: 'Tarjeta',
};

export const TREATMENT_STATUS: Record<TreatmentStatus, { label: string; tone: Tone }> = {
  borrador: { label: 'Borrador', tone: 'slate' },
  aprobado: { label: 'Aprobado', tone: 'sky' },
  en_curso: { label: 'En curso', tone: 'amber' },
  completado: { label: 'Completado', tone: 'emerald' },
  anulado: { label: 'Anulado', tone: 'rose' },
};

export const TREATMENT_TYPES = [
  'Consulta',
  'Profilaxis',
  'Restauración',
  'Endodoncia',
  'Exodoncia',
  'Ortodoncia',
  'Prótesis',
  'Implante',
  'Blanqueamiento',
  'Periodoncia',
  'Control',
  'Urgencia',
];

export const DURATIONS = [15, 30, 45, 60, 90, 120, 180];

export const ROLE_DESCRIPTIONS: Record<AppRole, string> = {
  admin: 'Acceso total: configuración, usuarios, caja y clínica',
  doctor: 'Clínica, odontograma, recetas y presupuestos',
  recepcionista: 'Agenda, pacientes y caja (sin notas clínicas)',
  asistente: 'Agenda, consulta clínica y carga de radiografías',
};

export const DOC_KINDS: Record<DocumentKind, { label: string; prefix: string; tone: Tone }> = {
  receta: { label: 'Receta médica', prefix: 'RX', tone: 'sky' },
  consentimiento: { label: 'Consentimiento informado', prefix: 'CI', tone: 'violet' },
  indicaciones: { label: 'Indicaciones', prefix: 'IN', tone: 'teal' },
  constancia: { label: 'Constancia de atención', prefix: 'CA', tone: 'amber' },
  referencia: { label: 'Referencia / interconsulta', prefix: 'RF', tone: 'slate' },
};

export const FILE_CATEGORIES: Record<FileCategory, string> = {
  radiografia: 'Radiografía',
  fotografia: 'Fotografía clínica',
  documento: 'Documento',
  laboratorio: 'Laboratorio',
  otro: 'Otro',
};

export const BLOOD_TYPES = ['O+', 'O-', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-'];

export const AGENDA_COLORS = ['#0284C7', '#0D9488', '#7C3AED', '#DB2777', '#EA580C', '#4F46E5', '#059669', '#64748B'];

export const EXPENSE_CATEGORIES: Record<ExpenseCategory, string> = {
  materiales: 'Materiales dentales',
  laboratorio: 'Laboratorio',
  alquiler: 'Alquiler',
  servicios: 'Servicios (luz, agua, internet)',
  sueldos: 'Sueldos y honorarios',
  marketing: 'Marketing',
  equipos: 'Equipos y mantenimiento',
  impuestos: 'Impuestos y trámites',
  otros: 'Otros',
};

export const LAB_STATUS: Record<LabStatus, { label: string; tone: Tone }> = {
  pendiente: { label: 'Por enviar', tone: 'slate' },
  enviado: { label: 'En laboratorio', tone: 'sky' },
  en_prueba: { label: 'En prueba', tone: 'violet' },
  recibido: { label: 'Recibido', tone: 'teal' },
  instalado: { label: 'Instalado', tone: 'emerald' },
  anulado: { label: 'Anulado', tone: 'rose' },
};

/** Siguiente paso habitual del flujo de una orden de laboratorio. */
export const LAB_NEXT: Partial<Record<LabStatus, { to: LabStatus; label: string }>> = {
  pendiente: { to: 'enviado', label: 'Marcar enviado' },
  enviado: { to: 'recibido', label: 'Marcar recibido' },
  en_prueba: { to: 'recibido', label: 'Marcar recibido' },
  recibido: { to: 'instalado', label: 'Marcar instalado' },
};

export const LAB_WORK_TYPES = [
  'Corona metal-cerámica',
  'Corona de zirconio',
  'Corona de disilicato',
  'Puente fijo',
  'Carilla',
  'Incrustación',
  'Prótesis removible',
  'Prótesis total',
  'Placa de relajación',
  'Guarda / férula',
  'Modelo de estudio',
  'Provisional',
  'Otro',
];

export const MOVEMENT_KINDS: Record<MovementKind, { label: string; tone: Tone }> = {
  entrada: { label: 'Entrada', tone: 'teal' },
  salida: { label: 'Salida / uso', tone: 'amber' },
  ajuste: { label: 'Ajuste (conteo)', tone: 'violet' },
};
