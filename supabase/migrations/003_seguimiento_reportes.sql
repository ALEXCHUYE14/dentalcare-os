-- =====================================================================
--  DentalCare OS · Migración 003
--  Funciones para los módulos Seguimiento (controles, cobranza, cumpleaños)
--  y Reportes. Calculan en la base y devuelven solo resultados agregados
--  (mínimo egress). Se ejecutan con los permisos de quien llama (RLS aplica).
--
--  Ejecutar en: Supabase Dashboard → SQL Editor (después de la 002).
--  Es idempotente.
-- =====================================================================

-- Fecha "de hoy" en la zona horaria del consultorio
create or replace function public.clinic_today()
returns date language sql stable set search_path = public as $$
  select (now() at time zone coalesce((select timezone from public.tenants_config where id = 1), 'America/Lima'))::date
$$;

-- ---------------------------------------------------------------------
-- 1. CONTROLES PERIÓDICOS: pacientes atendidos hace más de N meses
--    y sin una cita futura agendada
-- ---------------------------------------------------------------------
create or replace function public.get_recall_patients(p_months int default 6, p_limit int default 100)
returns table (id uuid, first_name text, last_name text, phone text, last_visit timestamptz)
language sql stable set search_path = public as $$
  select p.id, p.first_name, p.last_name, p.phone, v.last_visit
    from public.patients p
    join lateral (
      select max(a.starts_at) as last_visit
        from public.appointments a
       where a.patient_id = p.id and a.status = 'atendida'
    ) v on v.last_visit is not null
   where p.active
     and v.last_visit < now() - make_interval(months => greatest(p_months, 1))
     and not exists (
       select 1 from public.appointments f
        where f.patient_id = p.id and f.starts_at >= now() and f.status <> 'cancelada'
     )
   order by v.last_visit
   limit least(greatest(p_limit, 1), 500)
$$;

-- ---------------------------------------------------------------------
-- 2. COBRANZA: saldo pendiente por paciente (solo presupuestos aceptados)
-- ---------------------------------------------------------------------
create or replace function public.get_debtors(p_limit int default 100)
returns table (id uuid, first_name text, last_name text, phone text, balance numeric, plans bigint, oldest timestamptz, last_payment timestamptz)
language sql stable set search_path = public as $$
  select p.id, p.first_name, p.last_name, p.phone,
         sum(t.balance) as balance,
         count(*) as plans,
         min(t.created_at) as oldest,
         (select max(pa.paid_at) from public.payments pa where pa.patient_id = p.id) as last_payment
    from public.treatments t
    join public.patients p on p.id = t.patient_id
   where public.has_role(array['admin', 'doctor', 'recepcionista']::public.app_role[])
     and t.status in ('aprobado', 'en_curso', 'completado')
     and t.balance > 0
   group by p.id
   order by sum(t.balance) desc
   limit least(greatest(p_limit, 1), 500)
$$;

-- ---------------------------------------------------------------------
-- 3. CUMPLEAÑOS en los próximos N días (29-feb se celebra el 28 en años no bisiestos)
-- ---------------------------------------------------------------------
create or replace function public.get_upcoming_birthdays(p_days int default 7)
returns table (id uuid, first_name text, last_name text, phone text, birth_date date, turning int, days_until int)
language sql stable set search_path = public as $$
  with t as (select public.clinic_today() as today)
  select p.id, p.first_name, p.last_name, p.phone, p.birth_date,
         case when d.last_bd = t.today then y.yrs else y.yrs + 1 end as turning,
         case when d.last_bd = t.today then 0 else (d.next_bd - t.today) end as days_until
    from public.patients p
   cross join t
   cross join lateral (select date_part('year', age(t.today, p.birth_date))::int as yrs) y
   cross join lateral (
     select (p.birth_date + make_interval(years => y.yrs))::date as last_bd,
            (p.birth_date + make_interval(years => y.yrs + 1))::date as next_bd
   ) d
   where p.active
     and p.birth_date is not null
     and p.birth_date <= t.today
     and (d.last_bd = t.today or d.next_bd - t.today <= greatest(least(p_days, 60), 0))
   order by days_until, p.last_name
   limit 200
$$;

-- ---------------------------------------------------------------------
-- 4. REPORTE GERENCIAL (solo administrador). Rango máximo: 1 año.
-- ---------------------------------------------------------------------
create or replace function public.get_report(p_from date, p_to date)
returns json language plpgsql stable set search_path = public as $$
declare
  v_tz   text;
  v_from timestamptz;
  v_to   timestamptz;
begin
  if not public.has_role(array['admin']::public.app_role[]) then
    raise exception 'Solo el administrador puede ver reportes' using errcode = '42501';
  end if;
  if p_from is null or p_to is null or p_to < p_from then
    raise exception 'Rango de fechas inválido';
  end if;
  if p_to - p_from > 366 then
    raise exception 'El rango máximo es de un año';
  end if;

  select coalesce(timezone, 'America/Lima') into v_tz from public.tenants_config where id = 1;
  v_from := p_from::timestamp at time zone v_tz;
  v_to   := (p_to + 1)::timestamp at time zone v_tz;

  return json_build_object(
    'income', (select coalesce(sum(amount), 0) from public.payments where paid_at >= v_from and paid_at < v_to),
    'payments_count', (select count(*) from public.payments where paid_at >= v_from and paid_at < v_to),
    'by_method', (
      select coalesce(json_agg(r order by r.total desc), '[]'::json) from (
        select method, sum(amount) as total, count(*) as n
          from public.payments where paid_at >= v_from and paid_at < v_to
         group by method
      ) r),
    'by_doctor', (
      select coalesce(json_agg(r order by r.total desc), '[]'::json) from (
        select t.doctor_id, coalesce(pr.full_name, 'Sin doctor asignado') as name,
               sum(pa.amount) as total, count(distinct pa.patient_id) as patients
          from public.payments pa
          join public.treatments t on t.id = pa.treatment_id
          left join public.profiles pr on pr.id = t.doctor_id
         where pa.paid_at >= v_from and pa.paid_at < v_to
         group by t.doctor_id, pr.full_name
      ) r),
    'daily', (
      select coalesce(json_agg(r order by r.day), '[]'::json) from (
        select (paid_at at time zone v_tz)::date as day, sum(amount) as total
          from public.payments where paid_at >= v_from and paid_at < v_to
         group by 1
      ) r),
    'appointments', (
      select json_build_object(
        'total', count(*) filter (where status <> 'cancelada'),
        'atendida', count(*) filter (where status = 'atendida'),
        'cancelada', count(*) filter (where status = 'cancelada'),
        'sin_cierre', count(*) filter (where status in ('programada', 'confirmada', 'en_espera') and ends_at < now())
      ) from public.appointments where starts_at >= v_from and starts_at < v_to),
    'attended_by_doctor', (
      select coalesce(json_agg(r order by r.n desc), '[]'::json) from (
        select a.doctor_id, coalesce(pr.full_name, 'Sin doctor asignado') as name, count(*) as n
          from public.appointments a
          left join public.profiles pr on pr.id = a.doctor_id
         where a.starts_at >= v_from and a.starts_at < v_to and a.status = 'atendida'
         group by a.doctor_id, pr.full_name
      ) r),
    'new_patients', (select count(*) from public.patients where created_at >= v_from and created_at < v_to),
    'treatments', (
      select json_build_object(
        'count', count(*),
        'total', coalesce(sum(total), 0),
        'accepted_count', count(*) filter (where status in ('aprobado', 'en_curso', 'completado')),
        'accepted_total', coalesce(sum(total) filter (where status in ('aprobado', 'en_curso', 'completado')), 0)
      ) from public.treatments where created_at >= v_from and created_at < v_to and status <> 'anulado'),
    'top_procedures', (
      select coalesce(json_agg(r order by r.total desc), '[]'::json) from (
        select i.description, sum(i.quantity) as qty, sum(i.line_total) as total
          from public.treatment_items i
          join public.treatments t on t.id = i.treatment_id
         where t.created_at >= v_from and t.created_at < v_to
           and t.status in ('aprobado', 'en_curso', 'completado')
         group by i.description
         order by sum(i.line_total) desc
         limit 10
      ) r)
  );
end $$;

-- Índices que usan estas consultas
create index if not exists idx_appointments_patient_status on public.appointments (patient_id, status, starts_at);
create index if not exists idx_patients_created on public.patients (created_at);

-- FIN ---------------------------------------------------------------------
