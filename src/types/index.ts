export type AppRole = 'admin' | 'doctor' | 'recepcionista' | 'asistente';
export type AppointmentStatus = 'programada' | 'confirmada' | 'en_espera' | 'atendida' | 'cancelada';
export type ToothCondition =
  | 'sano'
  | 'caries'
  | 'obturacion'
  | 'sellante'
  | 'endodoncia'
  | 'corona'
  | 'ausente'
  | 'extraccion_indicada'
  | 'implante'
  | 'pendiente';
export type ToothStatus = 'sano' | 'en_tratamiento' | 'realizado';
export type Surface = 'O' | 'M' | 'D' | 'V' | 'L';
export type SurfaceMap = Partial<Record<Surface, ToothCondition>>;
export type TreatmentStatus = 'borrador' | 'aprobado' | 'en_curso' | 'completado' | 'anulado';
export type PaymentMethod = 'efectivo' | 'yape' | 'plin' | 'transferencia' | 'tarjeta';

export interface TenantConfig {
  id: number;
  business_name: string;
  tax_id: string | null;
  address: string | null;
  phone: string | null;
  phone_alt: string | null;
  email: string | null;
  logo_url: string | null;
  payment_qr_url: string | null;
  payment_qr_label: string | null;
  bank_details: string | null;
  currency: string;
  receipt_footer: string | null;
  timezone: string;
  open_time: string;
  close_time: string;
  updated_at: string;
}

export interface Profile {
  id: string;
  full_name: string;
  email: string | null;
  role: AppRole;
  specialty: string | null;
  phone: string | null;
  /** N° de colegiatura (COP); null si la migración 002 aún no se aplicó */
  license_number?: string | null;
  color: string;
  active: boolean;
  created_at: string;
}

export interface Chair {
  id: string;
  name: string;
  active: boolean;
  created_at?: string;
}

export interface Procedure {
  id: string;
  name: string;
  category: string | null;
  default_price: number;
  active: boolean;
}

export interface Patient {
  id: string;
  document_type: string;
  document_number: string | null;
  first_name: string;
  last_name: string;
  birth_date: string | null;
  sex: 'F' | 'M' | 'O' | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  occupation: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  blood_type: string | null;
  allergies: string[];
  medical_alerts: string[];
  medical_history: string | null;
  current_medications: string | null;
  notes: string | null;
  active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export type PatientInput = Omit<Patient, 'id' | 'created_at' | 'updated_at' | 'created_by'>;

/** Columnas mínimas para listados y buscadores (evita descargar antecedentes completos). */
export type PatientListItem = Pick<
  Patient,
  | 'id'
  | 'document_type'
  | 'document_number'
  | 'first_name'
  | 'last_name'
  | 'birth_date'
  | 'phone'
  | 'email'
  | 'address'
  | 'allergies'
  | 'medical_alerts'
  | 'active'
  | 'created_at'
>;

export type PatientRef = Pick<Patient, 'id' | 'first_name' | 'last_name' | 'phone'> &
  Partial<Pick<Patient, 'document_number' | 'email' | 'address' | 'allergies' | 'medical_alerts'>>;

export interface Appointment {
  id: string;
  patient_id: string;
  doctor_id: string | null;
  chair_id: string | null;
  starts_at: string;
  ends_at: string;
  treatment_type: string;
  status: AppointmentStatus;
  notes: string | null;
  created_at: string;
  patient?: PatientRef | null;
  doctor?: Pick<Profile, 'id' | 'full_name' | 'color'> | null;
  chair?: Pick<Chair, 'id' | 'name'> | null;
}

export type AppointmentInput = Pick<
  Appointment,
  'patient_id' | 'doctor_id' | 'chair_id' | 'starts_at' | 'ends_at' | 'treatment_type' | 'status' | 'notes'
>;

export interface ClinicalNote {
  id: string;
  patient_id: string;
  appointment_id: string | null;
  doctor_id: string | null;
  title: string;
  procedure: string | null;
  teeth: string | null;
  notes: string;
  created_at: string;
  doctor?: Pick<Profile, 'id' | 'full_name'> | null;
}

export interface OdontogramRecord {
  id?: string;
  patient_id: string;
  tooth_number: number;
  condition: ToothCondition;
  status: ToothStatus;
  surfaces: SurfaceMap;
  notes: string | null;
  updated_at?: string;
  dentition?: string;
}

export interface TreatmentItem {
  id?: string;
  treatment_id?: string;
  tooth_number: number | null;
  description: string;
  quantity: number;
  unit_price: number;
  line_total?: number;
  done: boolean;
  sort_order: number;
}

export interface Payment {
  id: string;
  number: number;
  treatment_id: string;
  patient_id: string;
  amount: number;
  method: PaymentMethod;
  reference: string | null;
  notes: string | null;
  paid_at: string;
  received_by: string | null;
  patient?: Pick<Patient, 'id' | 'first_name' | 'last_name'> | null;
  treatment?: { id: string; number: number; title: string } | null;
  receiver?: { full_name: string } | null;
}

export interface Treatment {
  id: string;
  number: number;
  patient_id: string;
  doctor_id: string | null;
  title: string;
  status: TreatmentStatus;
  subtotal: number;
  discount: number;
  total: number;
  paid: number;
  balance: number;
  notes: string | null;
  valid_until: string | null;
  created_at: string;
  patient?: PatientRef | null;
  doctor?: Pick<Profile, 'id' | 'full_name'> | null;
  items?: TreatmentItem[];
  payments?: Payment[];
}

export interface TreatmentHeaderInput {
  patient_id: string;
  doctor_id: string | null;
  title: string;
  status: TreatmentStatus;
  discount: number;
  notes: string | null;
  valid_until: string | null;
}

export interface DashboardStats {
  appointments_today: number;
  waiting_now: number;
  attended_today: number;
  active_patients: number;
  new_patients_month: number;
  income_month: number;
  income_prev_month: number;
  pending_balance: number;
  occupancy_rate: number;
}

export type DocumentKind = 'receta' | 'consentimiento' | 'indicaciones' | 'constancia' | 'referencia';

export interface PrescriptionItem {
  drug: string;
  dose: string;
  frequency: string;
  duration: string;
  notes?: string;
}

export interface ClinicalDocument {
  id: string;
  number: number;
  patient_id: string;
  doctor_id: string | null;
  kind: DocumentKind;
  title: string;
  body: string | null;
  items: PrescriptionItem[];
  created_at: string;
  doctor?: Pick<Profile, 'id' | 'full_name' | 'specialty' | 'license_number'> | null;
}

export type ClinicalDocumentInput = Pick<ClinicalDocument, 'patient_id' | 'kind' | 'title' | 'body' | 'items'>;

export type FileCategory = 'radiografia' | 'fotografia' | 'documento' | 'laboratorio' | 'otro';

export interface PatientFile {
  id: string;
  patient_id: string;
  storage_path: string;
  file_name: string;
  mime_type: string | null;
  size_bytes: number | null;
  category: FileCategory;
  description: string | null;
  uploaded_by: string | null;
  created_at: string;
}

export interface AuditEntry {
  id: number;
  table_name: string;
  record_id: string | null;
  action: 'INSERT' | 'UPDATE' | 'DELETE';
  actor: string | null;
  created_at: string;
}

export interface AuditDetail {
  old_data: Record<string, unknown> | null;
  new_data: Record<string, unknown> | null;
}

// ----- Seguimiento -----
interface PatientContact {
  id: string;
  first_name: string;
  last_name: string;
  phone: string | null;
}

export interface RecallPatient extends PatientContact {
  last_visit: string;
}

export interface Debtor extends PatientContact {
  balance: number;
  plans: number;
  oldest: string;
  last_payment: string | null;
}

export interface BirthdayPatient extends PatientContact {
  birth_date: string;
  turning: number;
  days_until: number;
}

// ----- Caja y gastos -----
export type ExpenseCategory = 'materiales' | 'laboratorio' | 'alquiler' | 'servicios' | 'sueldos' | 'marketing' | 'equipos' | 'impuestos' | 'otros';

export interface Expense {
  id: string;
  spent_at: string;
  category: ExpenseCategory;
  description: string;
  amount: number;
  method: PaymentMethod;
  supplier: string | null;
  reference: string | null;
  created_by: string | null;
  created_at: string;
}

export type ExpenseInput = Pick<Expense, 'spent_at' | 'category' | 'description' | 'amount' | 'method' | 'supplier' | 'reference'>;

export interface CashSession {
  id: string;
  opened_at: string;
  opened_by: string | null;
  opening_amount: number;
  closed_at: string | null;
  closed_by: string | null;
  expected_cash: number | null;
  counted_cash: number | null;
  difference: number | null;
  notes: string | null;
}

export interface CashSummary {
  session: CashSession;
  payments: { method: PaymentMethod; total: number; n: number }[];
  payments_total: number;
  expenses_total: number;
  cash_in: number;
  cash_out: number;
  expected_cash: number;
}

export interface MonthBalance {
  income: number;
  expenses: number;
  profit: number;
  by_category: { category: ExpenseCategory; total: number; n: number }[];
}

// ----- Laboratorio -----
export type LabStatus = 'pendiente' | 'enviado' | 'en_prueba' | 'recibido' | 'instalado' | 'anulado';

export interface LabOrder {
  id: string;
  number: number;
  patient_id: string;
  doctor_id: string | null;
  lab_name: string;
  work_type: string;
  teeth: string | null;
  shade: string | null;
  status: LabStatus;
  sent_at: string | null;
  due_date: string | null;
  received_at: string | null;
  cost: number;
  notes: string | null;
  created_at: string;
  patient?: Pick<Patient, 'id' | 'first_name' | 'last_name' | 'phone'> | null;
  doctor?: Pick<Profile, 'id' | 'full_name'> | null;
}

export type LabOrderInput = Pick<
  LabOrder,
  'patient_id' | 'doctor_id' | 'lab_name' | 'work_type' | 'teeth' | 'shade' | 'status' | 'sent_at' | 'due_date' | 'cost' | 'notes'
>;

// ----- Inventario -----
export interface InventoryItem {
  id: string;
  name: string;
  category: string | null;
  unit: string;
  stock: number;
  min_stock: number;
  unit_cost: number;
  supplier: string | null;
  active: boolean;
  low_stock: boolean;
  updated_at: string;
}

export type InventoryItemInput = Pick<InventoryItem, 'name' | 'category' | 'unit' | 'min_stock' | 'unit_cost' | 'supplier' | 'active'>;

export type MovementKind = 'entrada' | 'salida' | 'ajuste';

export interface InventoryMovement {
  id: string;
  item_id: string;
  kind: MovementKind;
  quantity: number;
  stock_after: number | null;
  note: string | null;
  created_by: string | null;
  created_at: string;
}

// ----- Reportes -----
export interface ReportData {
  income: number;
  payments_count: number;
  /** Disponibles desde la migración 004 */
  expenses?: number;
  expenses_by_category?: { category: ExpenseCategory; total: number; n: number }[];
  by_method: { method: PaymentMethod; total: number; n: number }[];
  by_doctor: { doctor_id: string | null; name: string; total: number; patients: number }[];
  daily: { day: string; total: number }[];
  appointments: { total: number; atendida: number; cancelada: number; sin_cierre: number };
  attended_by_doctor: { doctor_id: string | null; name: string; n: number }[];
  new_patients: number;
  treatments: { count: number; total: number; accepted_count: number; accepted_total: number };
  top_procedures: { description: string; qty: number; total: number }[];
}

export interface SeriesPoint {
  bucket: string;
  income: number;
  visits: number;
}
