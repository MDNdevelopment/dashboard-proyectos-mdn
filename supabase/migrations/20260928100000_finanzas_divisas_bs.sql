-- Manejo de bolívares y divisas en Finanzas (spec MAPPI-Finanzas-Divisas v1.0).
--
-- Principio: el USD sigue siendo la unidad de cuenta y el reparto 72/18/10 no cambia.
-- Los bolívares tienen su propio libro (fin_bs_ledger), acumulado, no su propio
-- patrimonio. Ese libro y la partida técnica 'cambio' son DERIVADOS: los escriben
-- triggers, nunca la UI (la única excepción manual es source='ajuste', para conciliar
-- contra el banco) — ver ARQUITECTURA.md §2.15.
--
-- Desvíos conscientes de la spec (ver ARQUITECTURA.md para el razonamiento completo):
--  - currency usa 'Bs' (no 'BS'), igual que fin_invoices.currency ya existente.
--  - fin_distributions.fx_operation_id es ON DELETE CASCADE, no SET NULL: con SET NULL
--    borrar una operación de divisas deja huérfana su fila 'cambio' y descuadra el
--    invariante de forma permanente.
--  - El invariante de cuadre real (documentado en ARQUITECTURA.md) es una identidad de
--    caja acumulada, no el query por mes de la spec §7 (ese da distinto de cero incluso
--    con datos correctos, porque asume reparto automático e ignora el traspaso entre
--    partidas).
--
-- IMPORTANTE: el seed de la capability nueva (finanzas.cajabs) va en esta misma
-- migración — una capability sin fila en module_permissions queda ABIERTA a todos.

-- ── 1. fin_rates: tasa BCV por fecha, se llena a mano (decisión D3 de la spec) ────
create table public.fin_rates (
  company_id text not null,
  rate_date  date not null,
  rate_bcv   numeric(18,4) not null check (rate_bcv > 0),
  created_by uuid references public.users(user_id),
  created_at timestamptz not null default now(),
  primary key (company_id, rate_date)
);

-- Tasa vigente para una fecha: la más reciente registrada en o antes de esa fecha.
create or replace function public.fin_rate_bcv(p_company text, p_date date)
returns numeric
language sql
stable
set search_path = public
as $$
  select rate_bcv from public.fin_rates
  where company_id = p_company and rate_date <= p_date
  order by rate_date desc limit 1;
$$;

-- ── 2. fin_fx_operations: compras y ventas de divisas ─────────────────────────────
-- Inmutable a propósito: sin policy de UPDATE. Corregir un error es borrar y volver
-- a registrar — así el ON DELETE CASCADE limpia sus dos filas derivadas (la del
-- ledger y la de 'cambio') sin necesitar lógica de resincronización.
create table public.fin_fx_operations (
  id           uuid primary key default gen_random_uuid(),
  company_id   text not null,
  month_id     uuid not null references public.fin_months(id) on delete cascade,
  op_type      text not null check (op_type in ('compra', 'venta')),
  moved_on     date not null,
  amount_bs    numeric(18,2) not null check (amount_bs > 0),
  amount_usd   numeric(18,2) not null check (amount_usd > 0),
  rate_real    numeric(18,4) generated always as (amount_bs / amount_usd) stored,
  rate_bcv     numeric(18,4) not null check (rate_bcv > 0),
  counterparty text,
  purpose      text,
  note         text,
  created_by   uuid references public.users(user_id),
  created_at   timestamptz not null default now()
);

create index fin_fx_operations_month_idx on public.fin_fx_operations (month_id, moved_on);

-- ── 3. fin_bs_ledger: libro único de la Caja Bs (acumulado, no se cierra por mes) ─
-- Este libro no se llena a mano: cada fila la genera un trigger a partir de un cobro
-- en Bs, una operación de divisas o un pago directo en Bs. La única excepción es
-- source='ajuste', para conciliar contra el banco (ver policy de insert abajo).
create table public.fin_bs_ledger (
  id              uuid primary key default gen_random_uuid(),
  company_id      text not null,
  month_id        uuid not null references public.fin_months(id) on delete cascade,
  moved_on        date not null,
  kind            text not null check (kind in ('in', 'out')),
  source          text not null check (source in
                    ('cobro', 'venta_divisa', 'compra_divisa', 'pago_directo', 'ajuste')),
  amount_bs       numeric(18,2) not null check (amount_bs > 0),
  rate            numeric(18,4) not null check (rate > 0),
  amount_usd_ref  numeric(18,2) not null,
  payment_id      uuid references public.fin_payments(id)       on delete cascade,
  fx_operation_id uuid references public.fin_fx_operations(id)  on delete cascade,
  distribution_id uuid references public.fin_distributions(id)  on delete cascade,
  concept         text not null,
  created_by      uuid references public.users(user_id),
  created_at      timestamptz not null default now(),
  -- 'ajuste' es el único origen sin fila fuente; los demás deben traer exactamente
  -- el FK que les corresponde (así una fila derivada nunca queda ambigua sobre su origen).
  constraint fin_bs_ledger_source_ref check (
    (source = 'ajuste' and payment_id is null and fx_operation_id is null and distribution_id is null)
    or (source = 'cobro' and payment_id is not null)
    or (source in ('compra_divisa', 'venta_divisa') and fx_operation_id is not null)
    or (source = 'pago_directo' and distribution_id is not null)
  )
);

create index fin_bs_ledger_month_idx   on public.fin_bs_ledger (month_id, moved_on);
create index fin_bs_ledger_company_idx on public.fin_bs_ledger (company_id, moved_on);

-- ── 4. Cambios a tablas existentes ────────────────────────────────────────────────
alter table public.fin_payments
  add column currency    text not null default 'USD' check (currency in ('USD', 'Bs')),
  add column rate_source text check (rate_source in ('bcv', 'manual'));

comment on column public.fin_payments.rate is
  'Tasa BCV del día del cobro, congelada en la fila. No valora la compra de divisas (esa usa rate_real de fin_fx_operations).';

alter table public.fin_distributions
  add column currency        text not null default 'USD' check (currency in ('USD', 'Bs')),
  add column amount_bs        numeric(18,2) check (amount_bs > 0),
  add column rate             numeric(18,4) check (rate > 0),
  add column fx_operation_id  uuid references public.fin_fx_operations(id) on delete cascade;

alter table public.fin_distributions drop constraint if exists fin_distributions_partida_check;
alter table public.fin_distributions
  add constraint fin_distributions_partida_check
  check (partida in ('gastos', 'socios', 'ganancia', 'cambio'));

-- Un movimiento en Bs debe traer sus dos datos de respaldo.
alter table public.fin_distributions
  add constraint fin_distributions_bs_complete
  check (currency = 'USD' or (amount_bs is not null and rate is not null));

-- La partida técnica 'cambio' es siempre USD: nunca es un pago en bolívares.
alter table public.fin_distributions
  add constraint fin_distributions_cambio_usd
  check (partida <> 'cambio' or currency = 'USD');

-- resultado_cambio suele ser negativo y saldo_bs puede quedar momentáneamente negativo
-- (un pago directo antes de que su cobro respectivo se registre) — sin check >= 0,
-- a diferencia de los total_* existentes que sí lo tienen.
alter table public.fin_month_totals
  add column total_divisa_fisica numeric(18,2) not null default 0,
  add column saldo_bs            numeric(18,2) not null default 0,
  add column saldo_bs_usd_ref    numeric(18,2) not null default 0,
  add column resultado_cambio    numeric(18,2) not null default 0;

-- ── 5. Mes cerrado también bloquea operaciones de divisas (§10) ───────────────────
-- Reusa fin_block_closed_month(): fin_fx_operations tiene month_id propio, así que
-- la rama genérica de la función ya cubre este caso sin tocar su cuerpo.
-- NO se pone en fin_bs_ledger: es una tabla derivada, protegida por su fuente; un
-- BEFORE DELETE ahí se dispararía dentro del cascade de un borrado legítimo (por
-- ejemplo, al borrar una factura de un mes que se está limpiando) y podría abortarlo.
create trigger fin_fx_operations_block_closed
  before insert or update or delete on public.fin_fx_operations
  for each row execute function public.fin_block_closed_month();

-- ── 6. amount en USD siempre, derivado en la BD para un movimiento en Bs ──────────
-- Refuerza en la BD lo que la spec §5.2 pide: amount es SIEMPRE el valor en dólares;
-- cuando currency='Bs', amount = amount_bs / rate.
create or replace function public.fin_distribution_derive_usd()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.currency = 'Bs' then
    new.amount := round(new.amount_bs / new.rate, 2);
  end if;
  return new;
end;
$$;

create trigger fin_distributions_derive_usd
  before insert or update on public.fin_distributions
  for each row execute function public.fin_distribution_derive_usd();

-- ── 7. Triggers derivados: el libro de Bs y la partida 'cambio' se llenan solos ───
-- SECURITY DEFINER (owner postgres) porque un INSERT hecho dentro de un trigger SÍ
-- pasa por RLS con el rol invocante, y fin_bs_ledger no tiene policy de insert para
-- el camino derivado — justamente para que nadie pueda llenar el libro a mano.
-- La autorización real ya ocurrió arriba: insertar en fin_payments exige
-- finanzas.cobros.manage; en fin_fx_operations y en fin_distributions con pago en Bs,
-- finanzas.distribucion.manage (o finanzas.cobros.manage para el cobro).

create or replace function public.fin_payment_sync_bs()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_month   uuid;
  v_company text;
  v_client  text;
begin
  select i.month_id, m.company_id, i.client_name
    into v_month, v_company, v_client
  from public.fin_invoices i
  join public.fin_months m on m.id = i.month_id
  where i.id = new.invoice_id;

  -- Resync: si el pago se edita (o cambia de moneda), su fila anterior del libro
  -- se descarta y se vuelve a generar desde cero a partir del estado actual.
  delete from public.fin_bs_ledger where payment_id = new.id;

  if new.currency = 'Bs' and new.amount_bs is not null and new.rate is not null then
    insert into public.fin_bs_ledger
      (company_id, month_id, moved_on, kind, source, amount_bs, rate,
       amount_usd_ref, payment_id, concept, created_by)
    values
      (v_company, v_month, new.paid_on, 'in', 'cobro', new.amount_bs, new.rate,
       new.amount, new.id, 'Cobro ' || coalesce(v_client, '—'), auth.uid());
  end if;

  return null;
end;
$$;

create trigger fin_payments_sync_bs
  after insert or update on public.fin_payments
  for each row execute function public.fin_payment_sync_bs();

create or replace function public.fin_fx_sync()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_usd_bcv numeric;
  v_delta   numeric;
begin
  v_usd_bcv := new.amount_bs / new.rate_bcv;
  v_delta := case
    when new.op_type = 'compra' then new.amount_usd - v_usd_bcv
    else v_usd_bcv - new.amount_usd
  end;

  insert into public.fin_bs_ledger
    (company_id, month_id, moved_on, kind, source, amount_bs, rate,
     amount_usd_ref, fx_operation_id, concept, created_by)
  values
    (new.company_id, new.month_id, new.moved_on,
     case when new.op_type = 'compra' then 'out' else 'in' end,
     case when new.op_type = 'compra' then 'compra_divisa' else 'venta_divisa' end,
     new.amount_bs, new.rate_real, new.amount_usd, new.id,
     case when new.op_type = 'compra' then 'Compra de divisas' else 'Venta de divisas' end
       || coalesce(' · ' || nullif(new.purpose, ''), ''),
     auth.uid());

  -- amount tiene CHECK (> 0): si no hubo brecha (redondeada a centavos), no se
  -- inserta fila de resultado por cambio.
  if round(abs(v_delta), 2) >= 0.01 then
    insert into public.fin_distributions
      (month_id, partida, kind, moved_on, concept, amount, currency,
       fx_operation_id, created_by)
    values
      (new.month_id, 'cambio',
       case when v_delta > 0 then 'in' else 'out' end,
       new.moved_on,
       'Resultado por cambio · ' || new.op_type,
       round(abs(v_delta), 2), 'USD', new.id, auth.uid());
  end if;

  return null;
end;
$$;

create trigger fin_fx_operations_sync
  after insert on public.fin_fx_operations
  for each row execute function public.fin_fx_sync();

-- Pago directo en bolívares (nómina, impuestos, proveedor local — §6.5). La fila
-- 'cambio' que inserta fin_fx_sync() siempre es currency='USD', así que este
-- trigger la ve pasar y no hace nada con ella: sin recursión.
create or replace function public.fin_distribution_sync_bs()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_company text;
begin
  delete from public.fin_bs_ledger where distribution_id = new.id;

  if new.currency = 'Bs' and new.kind = 'out' then
    select company_id into v_company from public.fin_months where id = new.month_id;

    insert into public.fin_bs_ledger
      (company_id, month_id, moved_on, kind, source, amount_bs, rate,
       amount_usd_ref, distribution_id, concept, created_by)
    values
      (v_company, new.month_id, new.moved_on, 'out', 'pago_directo',
       new.amount_bs, new.rate, new.amount, new.id, new.concept, auth.uid());
  end if;

  return null;
end;
$$;

create trigger fin_distributions_sync_bs
  after insert or update on public.fin_distributions
  for each row execute function public.fin_distribution_sync_bs();

-- ── 8. RLS ─────────────────────────────────────────────────────────────────────
alter table public.fin_rates         enable row level security;
alter table public.fin_fx_operations enable row level security;
alter table public.fin_bs_ledger     enable row level security;

create policy "fin_rates_read" on public.fin_rates
  for select to authenticated using (user_can('finanzas'));
create policy "fin_rates_insert" on public.fin_rates
  for insert to authenticated with check (user_can('finanzas.distribucion.manage'));
create policy "fin_rates_update" on public.fin_rates
  for update to authenticated
  using (user_can('finanzas.distribucion.manage')) with check (user_can('finanzas.distribucion.manage'));

create policy "fin_fx_operations_read" on public.fin_fx_operations
  for select to authenticated using (user_can('finanzas'));
create policy "fin_fx_operations_insert" on public.fin_fx_operations
  for insert to authenticated with check (user_can('finanzas.distribucion.manage'));
create policy "fin_fx_operations_delete" on public.fin_fx_operations
  for delete to authenticated using (user_can('finanzas.distribucion.manage'));
-- Sin policy de UPDATE: la operación es inmutable (ver comentario del create table).

create policy "fin_bs_ledger_read" on public.fin_bs_ledger
  for select to authenticated using (user_can('finanzas'));
-- El libro NO se llena a mano: el único insert permitido desde el cliente es el
-- ajuste de cuadre, sin ninguna fila fuente y sobre un mes todavía abierto. Las
-- filas derivadas las escriben los triggers SECURITY DEFINER de arriba, que no
-- pasan por esta policy (corren como el owner de la función).
create policy "fin_bs_ledger_ajuste_insert" on public.fin_bs_ledger
  for insert to authenticated with check (
    user_can('finanzas.distribucion.manage')
    and source = 'ajuste'
    and payment_id is null and fx_operation_id is null and distribution_id is null
    and exists (select 1 from public.fin_months m where m.id = month_id and not m.closed)
  );
create policy "fin_bs_ledger_ajuste_delete" on public.fin_bs_ledger
  for delete to authenticated using (
    user_can('finanzas.distribucion.manage')
    and source = 'ajuste'
    and exists (select 1 from public.fin_months m where m.id = month_id and not m.closed)
  );

alter publication supabase_realtime add table public.fin_rates;
alter publication supabase_realtime add table public.fin_fx_operations;
alter publication supabase_realtime add table public.fin_bs_ledger;

-- ── 9. Seed de la capability nueva (finanzas.cajabs, la tab de Caja Bs) ───────────
-- IMPORTANTE: va en esta misma migración — una capability sin fila en
-- module_permissions queda ABIERTA a todos (mismo criterio que las 2 migraciones
-- previas de Finanzas). No se crea capability de escritura nueva: comprar/vender
-- divisas, cargar la tasa BCV y el ajuste de cuadre reusan finanzas.distribucion.manage.
do $$
declare
  cid text;
  v_rule jsonb := jsonb_build_object(
    'deny', '[]'::jsonb,
    'rules', jsonb_build_array(
      jsonb_build_object('all', jsonb_build_array(
        jsonb_build_object('type', 'min_level', 'value', 4, 'ids', '[]'::jsonb)
      ))
    )
  );
begin
  for cid in
    select distinct company_id::text from public.users where company_id is not null
  loop
    insert into public.module_permissions (company_id, module_key, rules)
    values (cid, 'finanzas.cajabs', v_rule)
    on conflict (company_id, module_key) do nothing;
  end loop;
end;
$$;

-- ── 10. Backfill de datos existentes (§11) ────────────────────────────────────────
-- Corre como el owner de la migración (postgres): salta RLS. Todo idempotente por
-- los "on conflict"/"where not exists". El único cobro en Bs existente es el de
-- Jugos Los Ángeles (637.500 Bs @ 850, 2026-09-23) — se registró a esa tasa, que
-- se toma tal cual como la BCV de ese día (es el único dato disponible).
insert into public.fin_rates (company_id, rate_date, rate_bcv)
select m.company_id, p.paid_on, p.rate
from public.fin_payments p
join public.fin_invoices i on i.id = p.invoice_id
join public.fin_months   m on m.id = i.month_id
where p.amount_bs is not null and p.rate is not null
on conflict (company_id, rate_date) do nothing;

-- Este UPDATE dispara fin_payments_sync_bs, que ya inserta la fila del ledger.
update public.fin_payments
   set currency = 'Bs', rate_source = 'bcv'
 where amount_bs is not null and rate is not null;

-- Red de seguridad idempotente por si el trigger no llegó a correr en este orden.
insert into public.fin_bs_ledger
  (company_id, month_id, moved_on, kind, source, amount_bs, rate,
   amount_usd_ref, payment_id, concept)
select m.company_id, i.month_id, p.paid_on, 'in', 'cobro', p.amount_bs, p.rate,
       p.amount, p.id, 'Cobro ' || i.client_name
from public.fin_payments p
join public.fin_invoices i on i.id = p.invoice_id
join public.fin_months   m on m.id = i.month_id
where p.currency = 'Bs'
  and not exists (select 1 from public.fin_bs_ledger l where l.payment_id = p.id);
