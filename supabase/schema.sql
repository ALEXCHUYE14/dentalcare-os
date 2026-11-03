-- =====================================================================
--  DentalCare OS · Esquema Supabase / PostgreSQL
--  Ejecutar COMPLETO en: Supabase Dashboard → SQL Editor → New query
--  Pensado para un proyecto limpio.
-- =====================================================================

create extension if not exists pgcrypto;
create extension if not exists btree_gist;

-- ---------------------------------------------------------------------
-- 1. TIPOS ENUMERADOS
-- ---------------------------------------------------------------------
create type public.app_role as enum ('admin', 'doctor', 'recepcionista', 'asistente');
create type public.appointment_status as enum ('programada', 'confirmada', 'en_espera', 'atendida', 'cancelada');
create type public.tooth_condition as enum (
  'sano', 'caries', 'obturacion', 'sellante',
  'endodoncia', 'corona', 'ausente', 'extraccion_indicada', 'implante', 'pendiente'
);
create type public.tooth_status as enum ('sano', 'en_tratamiento', 'realizado');
create type public.treatment_status as enum ('borrador', 'aprobado', 'en_curso', 'completado', 'anulado');
create type public.payment_method as enum ('efectivo', 'yape', 'plin', 'transferencia', 'tarjeta');

-- ---------------------------------------------------------------------
-- 2. FUNCIÓN GENÉRICA updated_at
-- ---------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- ---------------------------------------------------------------------
-- 3. CONFIGURACIÓN GLOBAL DEL NEGOCIO (fila única)
-- ---------------------------------------------------------------------
create table public.tenants_config (
  id               smallint primary key default 1 check (id = 1),
  business_name    text not null default 'DentalCare OS',
  tax_id           text,
  address          text,
  phone            text,
  phone_alt        text,
  email            text,
  logo_url         text,
  payment_qr_url   text,
  payment_qr_label text default 'Yape / Plin',
  bank_details     text,
  currency         text not null default 'PEN',
  receipt_footer   text default 'Gracias por confiar en nosotros.',
  timezone         text not null default 'America/Lima',
  open_time        time not null default '08:00',
  close_time       time not null default '20:00',
  updated_at       timestamptz not null default now(),
  check (close_time > open_time)
);
insert into public.tenants_config (id) values (1) on conflict do nothing;
create trigger trg_tenants_config_updated before update on public.tenants_config
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- 4. PERFILES (vinculados a auth.users)
-- ---------------------------------------------------------------------
create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  full_name   text not null default '',
  email       text,
  role        public.app_role not null default 'asistente',
  specialty   text,
  phone       text,
  color       text not null default '#0284C7',
  active      boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create trigger trg_profiles_updated before update on public.profiles
  for each row execute function public.set_updated_at();

-- Helpers de rol (SECURITY DEFINER evita recursión con RLS)
create or replace function public.current_app_role()
returns public.app_role language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid() and active
$$;

create or replace function public.has_role(roles public.app_role[])
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.current_app_role() = any (roles), false)
$$;

create or replace function public.is_staff()
returns boolean language sql stable security definer set search_path = public as $$
  select public.current_app_role() is not null
$$;

-- Alta automática de perfil: el PRIMER usuario es admin activo; el resto queda pendiente.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_first boolean;
begin
  select not exists (select 1 from public.profiles) into v_first;
  insert into public.profiles (id, full_name, email, role, active)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data ->> 'full_name', ''), split_part(new.email, '@', 1)),
    new.email,
    case when v_first then 'admin'::public.app_role else 'asistente'::public.app_role end,
    v_first
  );
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Solo un admin cambia roles/estado; siempre debe quedar un admin activo.
create or replace function public.protect_profile_fields()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not public.has_role(array['admin']::public.app_role[]) then
    if new.role is distinct from old.role or new.active is distinct from old.active then
      raise exception 'Solo un administrador puede cambiar roles o el estado de acceso';
    end if;
  end if;
  if old.role = 'admin' and old.active and (new.role <> 'admin' or not new.active) then
    if (select count(*) from public.profiles where role = 'admin' and active and id <> old.id) = 0 then
      raise exception 'Debe existir al menos un administrador activo';
    end if;
  end if;
  return new;
end $$;
create trigger trg_profiles_protect before update on public.profiles
  for each row execute function public.protect_profile_fields();

-- ---------------------------------------------------------------------
-- 5. SILLONES / BOXES
-- ---------------------------------------------------------------------
create table public.chairs (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique,
  active     boolean not null default true,
  created_at timestamptz not null default now()
);
insert into public.chairs (name) values ('Sillón 1'), ('Sillón 2') on conflict do nothing;

-- ---------------------------------------------------------------------
-- 6. CATÁLOGO DE PROCEDIMIENTOS
-- ---------------------------------------------------------------------
create table public.procedures (
  id            uuid primary key default gen_random_uuid(),
  name          text not null unique,
  category      text,
  default_price numeric(12, 2) not null default 0 check (default_price >= 0),
  active        boolean not null default true,
  created_at    timestamptz not null default now()
);
insert into public.procedures (name, category, default_price) values
  ('Consulta y diagnóstico',            'Diagnóstico',   50),
  ('Profilaxis (limpieza)',             'Prevención',    80),
  ('Sellante por pieza',                'Prevención',    40),
  ('Restauración con resina',           'Operatoria',   120),
  ('Endodoncia unirradicular',          'Endodoncia',   350),
  ('Endodoncia multirradicular',        'Endodoncia',   550),
  ('Extracción simple',                 'Cirugía',      100),
  ('Extracción de tercer molar',        'Cirugía',      350),
  ('Corona de porcelana',               'Prótesis',     900),
  ('Implante dental',                   'Implantología', 3200),
  ('Blanqueamiento dental',             'Estética',     600),
  ('Control de ortodoncia',             'Ortodoncia',   150)
on conflict do nothing;

-- ---------------------------------------------------------------------
-- 7. PACIENTES
-- ---------------------------------------------------------------------
create table public.patients (
  id                       uuid primary key default gen_random_uuid(),
  document_type            text not null default 'DNI',
  document_number          text unique,
  first_name               text not null check (length(trim(first_name)) > 0),
  last_name                text not null check (length(trim(last_name)) > 0),
  birth_date               date,
  sex                      text check (sex in ('F', 'M', 'O')),
  phone                    text,
  email                    text,
  address                  text,
  occupation               text,
  emergency_contact_name   text,
  emergency_contact_phone  text,
  blood_type               text,
  allergies                text[] not null default '{}',
  medical_alerts           text[] not null default '{}',
  medical_history          text,
  current_medications      text,
  notes                    text,
  active                   boolean not null default true,
  created_by               uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);
create index idx_patients_last_name on public.patients (lower(last_name));
create index idx_patients_active on public.patients (active);
create trigger trg_patients_updated before update on public.patients
  for each row execute function public.set_updated_at();

-- Historial clínico evolutivo
create table public.clinical_notes (
  id             uuid primary key default gen_random_uuid(),
  patient_id     uuid not null references public.patients (id) on delete cascade,
  appointment_id uuid,
  doctor_id      uuid references public.profiles (id) on delete set null default auth.uid(),
  title          text not null,
  procedure      text,
  teeth          text,
  notes          text not null,
  created_at     timestamptz not null default now()
);
create index idx_notes_patient on public.clinical_notes (patient_id, created_at desc);

-- ---------------------------------------------------------------------
-- 8. CITAS (con bloqueo de solapamientos por sillón y por doctor)
-- ---------------------------------------------------------------------
create table public.appointments (
  id             uuid primary key default gen_random_uuid(),
  patient_id     uuid not null references public.patients (id) on delete cascade,
  doctor_id      uuid references public.profiles (id) on delete set null,
  chair_id       uuid references public.chairs (id) on delete set null,
  starts_at      timestamptz not null,
  ends_at        timestamptz not null,
  treatment_type text not null default 'Consulta',
  status         public.appointment_status not null default 'programada',
  notes          text,
  created_by     uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  check (ends_at > starts_at),
  constraint no_chair_overlap exclude using gist (
    chair_id with =, tstzrange(starts_at, ends_at) with &&
  ) where (status <> 'cancelada' and chair_id is not null),
  constraint no_doctor_overlap exclude using gist (
    doctor_id with =, tstzrange(starts_at, ends_at) with &&
  ) where (status <> 'cancelada' and doctor_id is not null)
);
create index idx_appointments_starts on public.appointments (starts_at);
create index idx_appointments_patient on public.appointments (patient_id);
create trigger trg_appointments_updated before update on public.appointments
  for each row execute function public.set_updated_at();

alter table public.clinical_notes
  add constraint clinical_notes_appointment_fk foreign key (appointment_id)
  references public.appointments (id) on delete set null;

-- ---------------------------------------------------------------------
-- 9. ODONTOGRAMA (notación FDI; superficies como JSON {"O":"caries",...})
-- ---------------------------------------------------------------------
create table public.odontogram_records (
  id           uuid primary key default gen_random_uuid(),
  patient_id   uuid not null references public.patients (id) on delete cascade,
  tooth_number smallint not null check (
       tooth_number between 11 and 18 or tooth_number between 21 and 28
    or tooth_number between 31 and 38 or tooth_number between 41 and 48
    or tooth_number between 51 and 55 or tooth_number between 61 and 65
    or tooth_number between 71 and 75 or tooth_number between 81 and 85
  ),
  dentition    text generated always as (case when tooth_number >= 51 then 'temporal' else 'permanente' end) stored,
  condition    public.tooth_condition not null default 'sano',
  status       public.tooth_status not null default 'sano',
  surfaces     jsonb not null default '{}'::jsonb check (jsonb_typeof(surfaces) = 'object'),
  notes        text,
  updated_by   uuid references public.profiles (id) on delete set null default auth.uid(),
  updated_at   timestamptz not null default now(),
  unique (patient_id, tooth_number)
);
create trigger trg_odontogram_updated before update on public.odontogram_records
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- 10. PRESUPUESTOS / PLANES DE TRATAMIENTO, ÍTEMS Y PAGOS
-- ---------------------------------------------------------------------
create table public.treatments (
  id          uuid primary key default gen_random_uuid(),
  number      bigint generated always as identity unique,
  patient_id  uuid not null references public.patients (id) on delete restrict,
  doctor_id   uuid references public.profiles (id) on delete set null,
  title       text not null default 'Plan de tratamiento',
  status      public.treatment_status not null default 'borrador',
  subtotal    numeric(12, 2) not null default 0,
  discount    numeric(12, 2) not null default 0 check (discount >= 0),
  total       numeric(12, 2) not null default 0,
  paid        numeric(12, 2) not null default 0,
  balance     numeric(12, 2) generated always as (total - paid) stored,
  notes       text,
  valid_until date,
  created_by  uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index idx_treatments_patient on public.treatments (patient_id);
create index idx_treatments_status on public.treatments (status);

create table public.treatment_items (
  id           uuid primary key default gen_random_uuid(),
  treatment_id uuid not null references public.treatments (id) on delete cascade,
  tooth_number smallint,
  description  text not null check (length(trim(description)) > 0),
  quantity     integer not null default 1 check (quantity > 0),
  unit_price   numeric(12, 2) not null default 0 check (unit_price >= 0),
  line_total   numeric(12, 2) generated always as (quantity * unit_price) stored,
  done         boolean not null default false,
  sort_order   integer not null default 0
);
create index idx_items_treatment on public.treatment_items (treatment_id);

create table public.payments (
  id           uuid primary key default gen_random_uuid(),
  number       bigint generated always as identity unique,
  treatment_id uuid not null references public.treatments (id) on delete restrict,
  patient_id   uuid not null references public.patients (id) on delete restrict,
  amount       numeric(12, 2) not null check (amount > 0),
  method       public.payment_method not null default 'efectivo',
  reference    text,
  notes        text,
  paid_at      timestamptz not null default now(),
  received_by  uuid references public.profiles (id) on delete set null default auth.uid()
);
create index idx_payments_paid_at on public.payments (paid_at);
create index idx_payments_treatment on public.payments (treatment_id);

-- Total = subtotal - descuento (nunca negativo)
create or replace function public.compute_treatment_total()
returns trigger language plpgsql as $$
begin
  new.total := greatest(coalesce(new.subtotal, 0) - coalesce(new.discount, 0), 0);
  new.updated_at := now();
  return new;
end $$;
create trigger trg_treatments_total before insert or update on public.treatments
  for each row execute function public.compute_treatment_total();

-- Recalcular subtotal al cambiar ítems
create or replace function public.recalc_treatment_subtotal()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
begin
  if tg_op = 'DELETE' then v_id := old.treatment_id; else v_id := new.treatment_id; end if;
  update public.treatments t
     set subtotal = coalesce((select sum(i.line_total) from public.treatment_items i where i.treatment_id = v_id), 0)
   where t.id = v_id;
  if tg_op = 'UPDATE' and new.treatment_id <> old.treatment_id then
    update public.treatments t
       set subtotal = coalesce((select sum(i.line_total) from public.treatment_items i where i.treatment_id = old.treatment_id), 0)
     where t.id = old.treatment_id;
  end if;
  return null;
end $$;
create trigger trg_items_recalc after insert or update or delete on public.treatment_items
  for each row execute function public.recalc_treatment_subtotal();

-- Validar abonos: no exceder saldo, no pagar presupuestos anulados
create or replace function public.validate_payment()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_balance numeric;
  v_patient uuid;
  v_status  public.treatment_status;
begin
  select balance, patient_id, status into v_balance, v_patient, v_status
    from public.treatments where id = new.treatment_id for update;
  if not found then raise exception 'Presupuesto no encontrado'; end if;
  if v_status = 'anulado' then raise exception 'No se pueden registrar pagos en un presupuesto anulado'; end if;
  if new.amount > v_balance + 0.009 then
    raise exception 'El abono (%) excede el saldo pendiente (%)', new.amount, v_balance;
  end if;
  new.patient_id  := v_patient;
  new.received_by := coalesce(new.received_by, auth.uid());
  return new;
end $$;
create trigger trg_payments_validate before insert on public.payments
  for each row execute function public.validate_payment();

-- Recalcular pagado y avanzar estado automáticamente
create or replace function public.recalc_treatment_paid()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_id   uuid;
  v_paid numeric;
begin
  if tg_op = 'DELETE' then v_id := old.treatment_id; else v_id := new.treatment_id; end if;
  select coalesce(sum(amount), 0) into v_paid from public.payments where treatment_id = v_id;
  update public.treatments
     set paid = v_paid,
         status = case when status in ('borrador', 'aprobado') and v_paid > 0 then 'en_curso'::public.treatment_status else status end
   where id = v_id;
  return null;
end $$;
create trigger trg_payments_recalc after insert or update or delete on public.payments
  for each row execute function public.recalc_treatment_paid();

-- ---------------------------------------------------------------------
-- 11. AUDITORÍA
-- ---------------------------------------------------------------------
create table public.audit_log (
  id         bigint generated always as identity primary key,
  table_name text not null,
  record_id  text,
  action     text not null,
  old_data   jsonb,
  new_data   jsonb,
  actor      uuid,
  created_at timestamptz not null default now()
);
create index idx_audit_table on public.audit_log (table_name, created_at desc);

create or replace function public.audit_trigger()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.audit_log (table_name, record_id, action, old_data, new_data, actor)
  values (
    tg_table_name,
    case when tg_op = 'DELETE' then to_jsonb(old) ->> 'id' else to_jsonb(new) ->> 'id' end,
    tg_op,
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end,
    auth.uid()
  );
  return null;
end $$;

create trigger audit_patients        after insert or update or delete on public.patients           for each row execute function public.audit_trigger();
create trigger audit_appointments    after insert or update or delete on public.appointments       for each row execute function public.audit_trigger();
create trigger audit_odontogram      after insert or update or delete on public.odontogram_records for each row execute function public.audit_trigger();
create trigger audit_clinical_notes  after insert or update or delete on public.clinical_notes     for each row execute function public.audit_trigger();
create trigger audit_treatments      after insert or update or delete on public.treatments         for each row execute function public.audit_trigger();
create trigger audit_payments        after insert or update or delete on public.payments           for each row execute function public.audit_trigger();
create trigger audit_tenants_config  after update                     on public.tenants_config     for each row execute function public.audit_trigger();
create trigger audit_profiles        after update or delete           on public.profiles           for each row execute function public.audit_trigger();

-- ---------------------------------------------------------------------
-- 12. RPC DEL DASHBOARD
-- ---------------------------------------------------------------------
create or replace function public.get_dashboard_stats()
returns json language plpgsql stable security definer set search_path = public as $$
declare
  v_tz       text;
  v_open     time;
  v_close    time;
  v_today    date;
  v_month    timestamp;
  v_chairs   int;
  v_booked   numeric;
  v_capacity numeric;
begin
  if not public.is_staff() then raise exception 'No autorizado'; end if;

  select timezone, open_time, close_time into v_tz, v_open, v_close from public.tenants_config where id = 1;
  v_today := (now() at time zone v_tz)::date;
  v_month := date_trunc('month', now() at time zone v_tz);

  select count(*) into v_chairs from public.chairs where active;
  select coalesce(sum(extract(epoch from (least(ends_at, starts_at + interval '12 hours') - starts_at)) / 60), 0)
    into v_booked
    from public.appointments
   where status <> 'cancelada' and (starts_at at time zone v_tz)::date = v_today;
  v_capacity := greatest(v_chairs, 1) * extract(epoch from (v_close - v_open)) / 60;

  return json_build_object(
    'appointments_today', (select count(*) from public.appointments
                            where status <> 'cancelada' and (starts_at at time zone v_tz)::date = v_today),
    'waiting_now',        (select count(*) from public.appointments
                            where status = 'en_espera' and (starts_at at time zone v_tz)::date = v_today),
    'attended_today',     (select count(*) from public.appointments
                            where status = 'atendida' and (starts_at at time zone v_tz)::date = v_today),
    'active_patients',    (select count(*) from public.patients where active),
    'new_patients_month', (select count(*) from public.patients where date_trunc('month', created_at at time zone v_tz) = v_month),
    'income_month',       (select coalesce(sum(amount), 0) from public.payments
                            where date_trunc('month', paid_at at time zone v_tz) = v_month),
    'income_prev_month',  (select coalesce(sum(amount), 0) from public.payments
                            where date_trunc('month', paid_at at time zone v_tz) = v_month - interval '1 month'),
    'pending_balance',    (select coalesce(sum(balance), 0) from public.treatments where status <> 'anulado'),
    'occupancy_rate',     round(least(v_booked / nullif(v_capacity, 0), 1) * 100, 1)
  );
end $$;

create or replace function public.get_dashboard_series(p_period text default 'week')
returns table (bucket date, income numeric, visits bigint)
language plpgsql stable security definer set search_path = public as $$
declare
  v_tz   text;
  v_unit text;
  v_n    int;
begin
  if not public.is_staff() then raise exception 'No autorizado'; end if;
  select timezone into v_tz from public.tenants_config where id = 1;
  if p_period = 'month' then v_unit := 'month'; v_n := 6; else v_unit := 'week'; v_n := 8; end if;

  return query
  with buckets as (
    select generate_series(
      date_trunc(v_unit, now() at time zone v_tz) - ((v_n - 1) || ' ' || v_unit)::interval,
      date_trunc(v_unit, now() at time zone v_tz),
      ('1 ' || v_unit)::interval
    )::date as b
  )
  select bk.b,
         coalesce((select sum(p.amount) from public.payments p
                    where date_trunc(v_unit, p.paid_at at time zone v_tz)::date = bk.b), 0)::numeric,
         (select count(*) from public.appointments a
           where a.status = 'atendida' and date_trunc(v_unit, a.starts_at at time zone v_tz)::date = bk.b)
    from buckets bk
   order by bk.b;
end $$;

-- ---------------------------------------------------------------------
-- 13. ROW LEVEL SECURITY
-- ---------------------------------------------------------------------
alter table public.tenants_config     enable row level security;
alter table public.profiles           enable row level security;
alter table public.chairs             enable row level security;
alter table public.procedures         enable row level security;
alter table public.patients           enable row level security;
alter table public.clinical_notes     enable row level security;
alter table public.appointments       enable row level security;
alter table public.odontogram_records enable row level security;
alter table public.treatments         enable row level security;
alter table public.treatment_items    enable row level security;
alter table public.payments           enable row level security;
alter table public.audit_log          enable row level security;

-- tenants_config
create policy cfg_select on public.tenants_config for select to authenticated using (public.is_staff());
create policy cfg_update on public.tenants_config for update to authenticated
  using (public.has_role(array['admin']::public.app_role[]))
  with check (public.has_role(array['admin']::public.app_role[]));

-- profiles
create policy prof_select on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_staff());
create policy prof_update on public.profiles for update to authenticated
  using (id = auth.uid() or public.has_role(array['admin']::public.app_role[]))
  with check (id = auth.uid() or public.has_role(array['admin']::public.app_role[]));

-- chairs / procedures
create policy chairs_select on public.chairs for select to authenticated using (public.is_staff());
create policy chairs_admin  on public.chairs for all to authenticated
  using (public.has_role(array['admin']::public.app_role[]))
  with check (public.has_role(array['admin']::public.app_role[]));
create policy proc_select on public.procedures for select to authenticated using (public.is_staff());
create policy proc_admin  on public.procedures for all to authenticated
  using (public.has_role(array['admin']::public.app_role[]))
  with check (public.has_role(array['admin']::public.app_role[]));

-- patients
create policy pat_select on public.patients for select to authenticated using (public.is_staff());
create policy pat_insert on public.patients for insert to authenticated
  with check (public.has_role(array['admin', 'doctor', 'recepcionista']::public.app_role[]));
create policy pat_update on public.patients for update to authenticated
  using (public.has_role(array['admin', 'doctor', 'recepcionista']::public.app_role[]))
  with check (public.has_role(array['admin', 'doctor', 'recepcionista']::public.app_role[]));
create policy pat_delete on public.patients for delete to authenticated
  using (public.has_role(array['admin']::public.app_role[]));

-- clinical_notes (confidencial: recepción no ve notas clínicas)
create policy notes_select on public.clinical_notes for select to authenticated
  using (public.has_role(array['admin', 'doctor', 'asistente']::public.app_role[]));
create policy notes_insert on public.clinical_notes for insert to authenticated
  with check (public.has_role(array['admin', 'doctor']::public.app_role[]));
create policy notes_update on public.clinical_notes for update to authenticated
  using (public.has_role(array['admin']::public.app_role[]) or doctor_id = auth.uid())
  with check (public.has_role(array['admin', 'doctor']::public.app_role[]));
create policy notes_delete on public.clinical_notes for delete to authenticated
  using (public.has_role(array['admin']::public.app_role[]));

-- appointments
create policy appt_select on public.appointments for select to authenticated using (public.is_staff());
create policy appt_insert on public.appointments for insert to authenticated with check (public.is_staff());
create policy appt_update on public.appointments for update to authenticated
  using (public.is_staff()) with check (public.is_staff());
create policy appt_delete on public.appointments for delete to authenticated
  using (public.has_role(array['admin', 'recepcionista']::public.app_role[]));

-- odontogram
create policy odo_select on public.odontogram_records for select to authenticated using (public.is_staff());
create policy odo_write on public.odontogram_records for all to authenticated
  using (public.has_role(array['admin', 'doctor']::public.app_role[]))
  with check (public.has_role(array['admin', 'doctor']::public.app_role[]));

-- treatments + items
create policy trt_select on public.treatments for select to authenticated using (public.is_staff());
create policy trt_insert on public.treatments for insert to authenticated
  with check (public.has_role(array['admin', 'doctor', 'recepcionista']::public.app_role[]));
create policy trt_update on public.treatments for update to authenticated
  using (public.has_role(array['admin', 'doctor', 'recepcionista']::public.app_role[]))
  with check (public.has_role(array['admin', 'doctor', 'recepcionista']::public.app_role[]));
create policy trt_delete on public.treatments for delete to authenticated
  using (public.has_role(array['admin']::public.app_role[]));

create policy itm_select on public.treatment_items for select to authenticated using (public.is_staff());
create policy itm_write on public.treatment_items for all to authenticated
  using (public.has_role(array['admin', 'doctor', 'recepcionista']::public.app_role[]))
  with check (public.has_role(array['admin', 'doctor', 'recepcionista']::public.app_role[]));

-- payments
create policy pay_select on public.payments for select to authenticated using (public.is_staff());
create policy pay_insert on public.payments for insert to authenticated
  with check (public.has_role(array['admin', 'recepcionista']::public.app_role[]));
create policy pay_delete on public.payments for delete to authenticated
  using (public.has_role(array['admin']::public.app_role[]));

-- audit_log (solo lectura para admin; escritura vía trigger)
create policy audit_select on public.audit_log for select to authenticated
  using (public.has_role(array['admin']::public.app_role[]));

-- ---------------------------------------------------------------------
-- 14. STORAGE: bucket público "branding" (logo y QR de pagos)
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('branding', 'branding', true)
on conflict (id) do update set public = true;

create policy branding_read on storage.objects for select using (bucket_id = 'branding');
create policy branding_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'branding' and public.has_role(array['admin']::public.app_role[]));
create policy branding_update on storage.objects for update to authenticated
  using (bucket_id = 'branding' and public.has_role(array['admin']::public.app_role[]));
create policy branding_delete on storage.objects for delete to authenticated
  using (bucket_id = 'branding' and public.has_role(array['admin']::public.app_role[]));

-- ---------------------------------------------------------------------
-- 15. REALTIME (agenda y odontograma en vivo)
-- ---------------------------------------------------------------------
do $$
begin
  alter publication supabase_realtime add table public.appointments;
exception when duplicate_object then null;
end $$;
do $$
begin
  alter publication supabase_realtime add table public.odontogram_records;
exception when duplicate_object then null;
end $$;

-- FIN ---------------------------------------------------------------------
