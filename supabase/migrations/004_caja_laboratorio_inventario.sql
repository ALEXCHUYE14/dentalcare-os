-- =====================================================================
--  DentalCare OS · Migración 004
--  Caja diaria y gastos · Órdenes de laboratorio · Inventario de materiales
--  Además amplía get_report con gastos y utilidad.
--
--  Ejecutar en: Supabase Dashboard → SQL Editor (después de la 003).
--  Es idempotente.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. GASTOS
-- ---------------------------------------------------------------------
create table if not exists public.expenses (
  id           uuid primary key default gen_random_uuid(),
  spent_at     date not null default public.clinic_today(),
  category     text not null default 'otros'
               check (category in ('materiales', 'laboratorio', 'alquiler', 'servicios', 'sueldos', 'marketing', 'equipos', 'impuestos', 'otros')),
  description  text not null check (length(trim(description)) > 0),
  amount       numeric(12, 2) not null check (amount > 0),
  method       public.payment_method not null default 'efectivo',
  supplier     text,
  reference    text,
  created_by   uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at   timestamptz not null default now()
);
create index if not exists idx_expenses_spent on public.expenses (spent_at desc);
create index if not exists idx_expenses_created on public.expenses (created_at);

alter table public.expenses enable row level security;
drop policy if exists exp_select on public.expenses;
create policy exp_select on public.expenses for select to authenticated
  using (public.has_role(array['admin', 'recepcionista']::public.app_role[]));
drop policy if exists exp_insert on public.expenses;
create policy exp_insert on public.expenses for insert to authenticated
  with check (public.has_role(array['admin', 'recepcionista']::public.app_role[]));
drop policy if exists exp_update on public.expenses;
create policy exp_update on public.expenses for update to authenticated
  using (public.has_role(array['admin']::public.app_role[]))
  with check (public.has_role(array['admin']::public.app_role[]));
drop policy if exists exp_delete on public.expenses;
create policy exp_delete on public.expenses for delete to authenticated
  using (public.has_role(array['admin']::public.app_role[]));

drop trigger if exists audit_expenses on public.expenses;
create trigger audit_expenses after insert or update or delete on public.expenses
  for each row execute function public.audit_trigger();

-- ---------------------------------------------------------------------
-- 2. CAJA DIARIA (apertura / cierre con arqueo de efectivo)
-- ---------------------------------------------------------------------
create table if not exists public.cash_sessions (
  id              uuid primary key default gen_random_uuid(),
  opened_at       timestamptz not null default now(),
  opened_by       uuid references public.profiles (id) on delete set null default auth.uid(),
  opening_amount  numeric(12, 2) not null default 0 check (opening_amount >= 0),
  closed_at       timestamptz,
  closed_by       uuid references public.profiles (id) on delete set null,
  expected_cash   numeric(12, 2),
  counted_cash    numeric(12, 2) check (counted_cash is null or counted_cash >= 0),
  difference      numeric(12, 2) generated always as (counted_cash - expected_cash) stored,
  notes           text
);
-- Solo puede haber una caja abierta a la vez
create unique index if not exists uq_cash_one_open on public.cash_sessions ((true)) where closed_at is null;
create index if not exists idx_cash_opened on public.cash_sessions (opened_at desc);

alter table public.cash_sessions enable row level security;
drop policy if exists cash_select on public.cash_sessions;
create policy cash_select on public.cash_sessions for select to authenticated
  using (public.has_role(array['admin', 'recepcionista']::public.app_role[]));
drop policy if exists cash_insert on public.cash_sessions;
create policy cash_insert on public.cash_sessions for insert to authenticated
  with check (
    public.has_role(array['admin', 'recepcionista']::public.app_role[])
    and closed_at is null and closed_by is null and expected_cash is null and counted_cash is null
  );
drop policy if exists cash_delete on public.cash_sessions;
create policy cash_delete on public.cash_sessions for delete to authenticated
  using (public.has_role(array['admin']::public.app_role[]));
-- Sin política de UPDATE: el cierre solo ocurre vía close_cash_session (el esperado lo calcula el servidor)

drop trigger if exists audit_cash_sessions on public.cash_sessions;
create trigger audit_cash_sessions after insert or update or delete on public.cash_sessions
  for each row execute function public.audit_trigger();

-- Resumen de una caja (la abierta si p_session es null)
create or replace function public.get_cash_summary(p_session uuid default null)
returns json language plpgsql stable set search_path = public as $$
declare
  s     public.cash_sessions;
  v_end timestamptz;
  v_in  numeric;
  v_out numeric;
begin
  if not public.has_role(array['admin', 'recepcionista']::public.app_role[]) then
    raise exception 'No tienes acceso a la caja' using errcode = '42501';
  end if;
  if p_session is null then
    select * into s from public.cash_sessions where closed_at is null limit 1;
  else
    select * into s from public.cash_sessions where id = p_session;
  end if;
  if not found then
    return null;
  end if;

  v_end := coalesce(s.closed_at, now());
  select coalesce(sum(amount), 0) into v_in from public.payments
   where method = 'efectivo' and paid_at >= s.opened_at and paid_at <= v_end;
  select coalesce(sum(amount), 0) into v_out from public.expenses
   where method = 'efectivo' and created_at >= s.opened_at and created_at <= v_end;

  return json_build_object(
    'session', to_json(s),
    'payments', (
      select coalesce(json_agg(r order by r.total desc), '[]'::json) from (
        select method, sum(amount) as total, count(*) as n from public.payments
         where paid_at >= s.opened_at and paid_at <= v_end group by method
      ) r),
    'payments_total', (select coalesce(sum(amount), 0) from public.payments where paid_at >= s.opened_at and paid_at <= v_end),
    'expenses_total', (select coalesce(sum(amount), 0) from public.expenses where created_at >= s.opened_at and created_at <= v_end),
    'cash_in', v_in,
    'cash_out', v_out,
    'expected_cash', coalesce(s.expected_cash, s.opening_amount + v_in - v_out)
  );
end $$;

-- Cierre con arqueo: el efectivo esperado se calcula aquí, no en el navegador
create or replace function public.close_cash_session(p_counted numeric, p_notes text default null)
returns public.cash_sessions language plpgsql security definer set search_path = public as $$
declare
  s     public.cash_sessions;
  v_now timestamptz := now();
  v_in  numeric;
  v_out numeric;
begin
  if not public.has_role(array['admin', 'recepcionista']::public.app_role[]) then
    raise exception 'No tienes acceso a la caja' using errcode = '42501';
  end if;
  if p_counted is null or p_counted < 0 then
    raise exception 'Ingresa el efectivo contado';
  end if;
  select * into s from public.cash_sessions where closed_at is null for update;
  if not found then
    raise exception 'No hay una caja abierta';
  end if;

  select coalesce(sum(amount), 0) into v_in from public.payments
   where method = 'efectivo' and paid_at >= s.opened_at and paid_at <= v_now;
  select coalesce(sum(amount), 0) into v_out from public.expenses
   where method = 'efectivo' and created_at >= s.opened_at and created_at <= v_now;

  update public.cash_sessions
     set closed_at = v_now,
         closed_by = auth.uid(),
         expected_cash = s.opening_amount + v_in - v_out,
         counted_cash = round(p_counted, 2),
         notes = nullif(trim(coalesce(p_notes, '')), '')
   where id = s.id
  returning * into s;
  return s;
end $$;
revoke execute on function public.close_cash_session(numeric, text) from public, anon;
grant execute on function public.close_cash_session(numeric, text) to authenticated;

-- Balance de un mes: ingresos, gastos y utilidad
create or replace function public.get_month_balance(p_month date)
returns json language plpgsql stable set search_path = public as $$
declare
  v_tz   text;
  v_d0   date := date_trunc('month', p_month)::date;
  v_d1   date := (date_trunc('month', p_month) + interval '1 month')::date;
  v_inc  numeric;
  v_exp  numeric;
begin
  if not public.has_role(array['admin', 'recepcionista']::public.app_role[]) then
    raise exception 'No tienes acceso a los gastos' using errcode = '42501';
  end if;
  select coalesce(timezone, 'America/Lima') into v_tz from public.tenants_config where id = 1;
  select coalesce(sum(amount), 0) into v_inc from public.payments
   where paid_at >= (v_d0::timestamp at time zone v_tz) and paid_at < (v_d1::timestamp at time zone v_tz);
  select coalesce(sum(amount), 0) into v_exp from public.expenses where spent_at >= v_d0 and spent_at < v_d1;
  return json_build_object(
    'income', v_inc,
    'expenses', v_exp,
    'profit', v_inc - v_exp,
    'by_category', (
      select coalesce(json_agg(r order by r.total desc), '[]'::json) from (
        select category, sum(amount) as total, count(*) as n from public.expenses
         where spent_at >= v_d0 and spent_at < v_d1 group by category
      ) r)
  );
end $$;

-- ---------------------------------------------------------------------
-- 3. ÓRDENES DE LABORATORIO
-- ---------------------------------------------------------------------
create table if not exists public.lab_orders (
  id           uuid primary key default gen_random_uuid(),
  number       bigint generated always as identity unique,
  patient_id   uuid not null references public.patients (id) on delete cascade,
  doctor_id    uuid references public.profiles (id) on delete set null default auth.uid(),
  lab_name     text not null check (length(trim(lab_name)) > 0),
  work_type    text not null check (length(trim(work_type)) > 0),
  teeth        text,
  shade        text,
  status       text not null default 'pendiente'
               check (status in ('pendiente', 'enviado', 'en_prueba', 'recibido', 'instalado', 'anulado')),
  sent_at      date,
  due_date     date,
  received_at  date,
  cost         numeric(12, 2) not null default 0 check (cost >= 0),
  notes        text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists idx_lab_status_due on public.lab_orders (status, due_date);
create index if not exists idx_lab_patient on public.lab_orders (patient_id);

-- Fechas automáticas según el estado
create or replace function public.lab_order_dates()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.status = 'enviado' and new.sent_at is null then new.sent_at := public.clinic_today(); end if;
  if new.status in ('recibido', 'instalado') and new.received_at is null then new.received_at := public.clinic_today(); end if;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists trg_lab_dates on public.lab_orders;
create trigger trg_lab_dates before insert or update on public.lab_orders
  for each row execute function public.lab_order_dates();

alter table public.lab_orders enable row level security;
drop policy if exists lab_select on public.lab_orders;
create policy lab_select on public.lab_orders for select to authenticated using (public.is_staff());
drop policy if exists lab_insert on public.lab_orders;
create policy lab_insert on public.lab_orders for insert to authenticated with check (public.is_staff());
drop policy if exists lab_update on public.lab_orders;
create policy lab_update on public.lab_orders for update to authenticated using (public.is_staff()) with check (public.is_staff());
drop policy if exists lab_delete on public.lab_orders;
create policy lab_delete on public.lab_orders for delete to authenticated
  using (public.has_role(array['admin']::public.app_role[]));

drop trigger if exists audit_lab_orders on public.lab_orders;
create trigger audit_lab_orders after insert or update or delete on public.lab_orders
  for each row execute function public.audit_trigger();

-- ---------------------------------------------------------------------
-- 4. INVENTARIO (el stock solo cambia mediante movimientos)
-- ---------------------------------------------------------------------
create table if not exists public.inventory_items (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique check (length(trim(name)) > 0),
  category    text,
  unit        text not null default 'unidad',
  stock       numeric(12, 2) not null default 0 check (stock >= 0),
  min_stock   numeric(12, 2) not null default 0 check (min_stock >= 0),
  unit_cost   numeric(12, 2) not null default 0 check (unit_cost >= 0),
  supplier    text,
  active      boolean not null default true,
  low_stock   boolean generated always as (stock <= min_stock) stored,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists idx_inventory_low on public.inventory_items (low_stock) where active;

create or replace function public.protect_inventory_stock()
returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.stock := 0; -- el stock inicial se registra como movimiento de entrada
  elsif new.stock is distinct from old.stock and coalesce(current_setting('app.stock_sync', true), 'off') <> 'on' then
    raise exception 'El stock solo cambia registrando una entrada, salida o ajuste';
  end if;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists trg_inventory_protect on public.inventory_items;
create trigger trg_inventory_protect before insert or update on public.inventory_items
  for each row execute function public.protect_inventory_stock();

create table if not exists public.inventory_movements (
  id           uuid primary key default gen_random_uuid(),
  item_id      uuid not null references public.inventory_items (id) on delete cascade,
  kind         text not null check (kind in ('entrada', 'salida', 'ajuste')),
  quantity     numeric(12, 2) not null check (quantity >= 0),
  stock_after  numeric(12, 2),
  note         text,
  created_by   uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at   timestamptz not null default now()
);
create index if not exists idx_movements_item on public.inventory_movements (item_id, created_at desc);

-- Aplica el movimiento al stock de forma atómica (bloquea la fila del material)
create or replace function public.apply_inventory_movement()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_stock numeric;
  v_unit  text;
begin
  select stock, unit into v_stock, v_unit from public.inventory_items where id = new.item_id for update;
  if not found then
    raise exception 'Material no encontrado';
  end if;
  if new.kind <> 'ajuste' and new.quantity <= 0 then
    raise exception 'La cantidad debe ser mayor a cero';
  end if;
  v_stock := case new.kind
               when 'entrada' then v_stock + new.quantity
               when 'salida'  then v_stock - new.quantity
               else new.quantity
             end;
  if v_stock < 0 then
    raise exception 'Stock insuficiente: solo hay % %', v_stock + new.quantity, v_unit;
  end if;
  perform set_config('app.stock_sync', 'on', true);
  update public.inventory_items set stock = v_stock where id = new.item_id;
  perform set_config('app.stock_sync', 'off', true);
  new.stock_after := v_stock;
  new.created_by := coalesce(new.created_by, auth.uid());
  return new;
end $$;
drop trigger if exists trg_inventory_apply on public.inventory_movements;
create trigger trg_inventory_apply before insert on public.inventory_movements
  for each row execute function public.apply_inventory_movement();

alter table public.inventory_items enable row level security;
drop policy if exists inv_select on public.inventory_items;
create policy inv_select on public.inventory_items for select to authenticated using (public.is_staff());
drop policy if exists inv_insert on public.inventory_items;
create policy inv_insert on public.inventory_items for insert to authenticated
  with check (public.has_role(array['admin', 'doctor', 'asistente']::public.app_role[]));
drop policy if exists inv_update on public.inventory_items;
create policy inv_update on public.inventory_items for update to authenticated
  using (public.has_role(array['admin', 'doctor', 'asistente']::public.app_role[]))
  with check (public.has_role(array['admin', 'doctor', 'asistente']::public.app_role[]));
drop policy if exists inv_delete on public.inventory_items;
create policy inv_delete on public.inventory_items for delete to authenticated
  using (public.has_role(array['admin']::public.app_role[]));

alter table public.inventory_movements enable row level security;
drop policy if exists mov_select on public.inventory_movements;
create policy mov_select on public.inventory_movements for select to authenticated using (public.is_staff());
drop policy if exists mov_insert on public.inventory_movements;
create policy mov_insert on public.inventory_movements for insert to authenticated with check (public.is_staff());
-- Sin UPDATE ni DELETE: el kardex es inmutable

drop trigger if exists audit_inventory_movements on public.inventory_movements;
create trigger audit_inventory_movements after insert on public.inventory_movements
  for each row execute function public.audit_trigger();

-- ---------------------------------------------------------------------
-- 5. REPORTE GERENCIAL con gastos y utilidad (reemplaza la versión de la 003)
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
    'expenses', (select coalesce(sum(amount), 0) from public.expenses where spent_at >= p_from and spent_at <= p_to),
    'expenses_by_category', (
      select coalesce(json_agg(r order by r.total desc), '[]'::json) from (
        select category, sum(amount) as total, count(*) as n
          from public.expenses where spent_at >= p_from and spent_at <= p_to
         group by category
      ) r),
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

-- FIN ---------------------------------------------------------------------
