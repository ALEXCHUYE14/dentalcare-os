-- =====================================================================
--  DentalCare OS · Migración 002
--  Documentos clínicos (recetas, consentimientos, indicaciones, constancias),
--  archivos del paciente (radiografías, fotos, PDFs) e índices de rendimiento.
--
--  Ejecutar en: Supabase Dashboard → SQL Editor → New query (después de schema.sql).
--  Es idempotente: puede ejecutarse más de una vez sin romper nada.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0. N° de colegiatura (COP) del profesional, impreso en recetas y constancias
-- ---------------------------------------------------------------------
alter table public.profiles add column if not exists license_number text;

-- ---------------------------------------------------------------------
-- 1. DOCUMENTOS CLÍNICOS (inmutables una vez emitidos)
-- ---------------------------------------------------------------------
create table if not exists public.clinical_documents (
  id          uuid primary key default gen_random_uuid(),
  number      bigint generated always as identity unique,
  patient_id  uuid not null references public.patients (id) on delete cascade,
  doctor_id   uuid references public.profiles (id) on delete set null default auth.uid(),
  kind        text not null check (kind in ('receta', 'consentimiento', 'indicaciones', 'constancia', 'referencia')),
  title       text not null check (length(trim(title)) > 0),
  body        text,
  items       jsonb not null default '[]'::jsonb check (jsonb_typeof(items) = 'array'),
  created_at  timestamptz not null default now()
);
create index if not exists idx_documents_patient on public.clinical_documents (patient_id, created_at desc);

alter table public.clinical_documents enable row level security;

drop policy if exists doc_select on public.clinical_documents;
create policy doc_select on public.clinical_documents for select to authenticated
  using (public.has_role(array['admin', 'doctor', 'asistente']::public.app_role[]));
drop policy if exists doc_insert on public.clinical_documents;
create policy doc_insert on public.clinical_documents for insert to authenticated
  with check (public.has_role(array['admin', 'doctor']::public.app_role[]));
drop policy if exists doc_delete on public.clinical_documents;
create policy doc_delete on public.clinical_documents for delete to authenticated
  using (public.has_role(array['admin']::public.app_role[]));

drop trigger if exists audit_clinical_documents on public.clinical_documents;
create trigger audit_clinical_documents after insert or update or delete on public.clinical_documents
  for each row execute function public.audit_trigger();

-- ---------------------------------------------------------------------
-- 2. ARCHIVOS DEL PACIENTE (metadatos; el binario vive en Storage privado)
-- ---------------------------------------------------------------------
create table if not exists public.patient_files (
  id            uuid primary key default gen_random_uuid(),
  patient_id    uuid not null references public.patients (id) on delete cascade,
  storage_path  text not null unique,
  file_name     text not null,
  mime_type     text,
  size_bytes    integer check (size_bytes is null or size_bytes >= 0),
  category      text not null default 'otro'
                check (category in ('radiografia', 'fotografia', 'documento', 'laboratorio', 'otro')),
  description   text,
  uploaded_by   uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at    timestamptz not null default now()
);
create index if not exists idx_files_patient on public.patient_files (patient_id, created_at desc);

alter table public.patient_files enable row level security;

drop policy if exists files_select on public.patient_files;
create policy files_select on public.patient_files for select to authenticated
  using (public.has_role(array['admin', 'doctor', 'asistente']::public.app_role[]));
drop policy if exists files_insert on public.patient_files;
create policy files_insert on public.patient_files for insert to authenticated
  with check (public.has_role(array['admin', 'doctor', 'asistente']::public.app_role[]));
drop policy if exists files_update on public.patient_files;
create policy files_update on public.patient_files for update to authenticated
  using (public.has_role(array['admin', 'doctor']::public.app_role[]))
  with check (public.has_role(array['admin', 'doctor']::public.app_role[]));
drop policy if exists files_delete on public.patient_files;
create policy files_delete on public.patient_files for delete to authenticated
  using (public.has_role(array['admin', 'doctor']::public.app_role[]));

drop trigger if exists audit_patient_files on public.patient_files;
create trigger audit_patient_files after insert or delete on public.patient_files
  for each row execute function public.audit_trigger();

-- Bucket PRIVADO: los archivos solo se sirven con URLs firmadas de corta duración.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('clinical-files', 'clinical-files', false, 10485760,
        array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists clinical_files_read on storage.objects;
create policy clinical_files_read on storage.objects for select to authenticated
  using (bucket_id = 'clinical-files' and public.has_role(array['admin', 'doctor', 'asistente']::public.app_role[]));
drop policy if exists clinical_files_insert on storage.objects;
create policy clinical_files_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'clinical-files' and public.has_role(array['admin', 'doctor', 'asistente']::public.app_role[]));
drop policy if exists clinical_files_delete on storage.objects;
create policy clinical_files_delete on storage.objects for delete to authenticated
  using (bucket_id = 'clinical-files' and public.has_role(array['admin', 'doctor']::public.app_role[]));

-- ---------------------------------------------------------------------
-- 3. LOGO Y QR: límite de tamaño en el bucket público
-- ---------------------------------------------------------------------
update storage.buckets
   set file_size_limit = 2097152,
       allowed_mime_types = array['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']
 where id = 'branding';

-- ---------------------------------------------------------------------
-- 4. ÍNDICES DE RENDIMIENTO
-- ---------------------------------------------------------------------
create index if not exists idx_audit_created on public.audit_log (created_at desc);
create index if not exists idx_appointments_doctor on public.appointments (doctor_id, starts_at);
create index if not exists idx_treatments_created on public.treatments (created_at desc);
create index if not exists idx_payments_patient on public.payments (patient_id);

-- FIN ---------------------------------------------------------------------
