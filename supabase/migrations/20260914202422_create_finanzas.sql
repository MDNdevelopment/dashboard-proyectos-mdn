-- Módulo Finanzas: facturación real de la agencia, cobranza y reparto en partidas
-- (Gastos operativos 66% / Socios 20% / Ganancia 14%). Distinto del `finanzas` embebido
-- en metric_reports.data (captura manual por línea/mes) — ver ARQUITECTURA.md §2.N.
--
-- Portado desde un prototipo HTML (localStorage, sin backend) que ya validó el circuito
-- real: facturar el mes → cobrar (con abonos) → distribuir cada cobro en partidas →
-- pagar contra el saldo de cada partida, con cierre mensual y saldos que se arrastran.
--
-- IMPORTANTE: el seed de module_permissions va en esta misma migración porque una
-- capability sin fila en module_permissions queda ABIERTA a todos.

-- ── fin_months: unidad de cierre ───────────────────────────────────────────────
create table public.fin_months (
  id          uuid primary key default gen_random_uuid(),
  company_id  text not null,
  year        int not null,
  month       int not null check (month between 1 and 12),
  closed      boolean not null default false,
  closed_at   timestamptz,
  closed_by   uuid references public.users(user_id),
  created_at  timestamptz not null default now(),
  unique (company_id, year, month)
);

create index fin_months_company_id_idx on public.fin_months (company_id, year, month);

-- ── fin_invoices: facturación del mes ──────────────────────────────────────────
-- client_id nulo = cliente externo (el prototipo lo llama "Otro / cliente externo").
-- client_name es snapshot del nombre, mismo patrón que paid_campaigns.client.
create table public.fin_invoices (
  id          uuid primary key default gen_random_uuid(),
  month_id    uuid not null references public.fin_months(id) on delete cascade,
  client_id   uuid references public.metric_clients(id) on delete set null,
  client_name text not null,
  concept     text not null,
  amount      numeric(12,2) not null check (amount > 0),
  currency    text not null default 'USD' check (currency in ('USD', 'Bs')),
  recurring   boolean not null default true,
  created_by  uuid references public.users(user_id),
  created_at  timestamptz not null default now()
);

create index fin_invoices_month_id_idx on public.fin_invoices (month_id);
create index fin_invoices_client_id_idx on public.fin_invoices (client_id);

-- ── fin_payments: abonos de una factura ────────────────────────────────────────
-- El estado de la factura (pendiente/abonado/cobrado) es derivado de la suma de sus
-- pagos, nunca una columna — ver src/utils/finanzas.js → estadoFactura().
create table public.fin_payments (
  id          uuid primary key default gen_random_uuid(),
  invoice_id  uuid not null references public.fin_invoices(id) on delete cascade,
  paid_on     date not null,
  amount      numeric(12,2) not null check (amount > 0),
  method      text,
  note        text,
  created_at  timestamptz not null default now()
);

create index fin_payments_invoice_id_idx on public.fin_payments (invoice_id);

-- ── fin_distributions: reparto de cobros en partidas y pagos contra ellas ──────
-- kind='in'  → asignación desde un cobro (invoice_id) o ajuste manual (invoice_id null).
-- kind='out' → pago/egreso contra el saldo de la partida (invoice_id siempre null).
create table public.fin_distributions (
  id          uuid primary key default gen_random_uuid(),
  month_id    uuid not null references public.fin_months(id) on delete cascade,
  partida     text not null check (partida in ('gastos', 'socios', 'ganancia')),
  kind        text not null default 'in' check (kind in ('in', 'out')),
  moved_on    date not null,
  concept     text not null,
  beneficiary text,
  amount      numeric(12,2) not null check (amount > 0),
  invoice_id  uuid references public.fin_invoices(id) on delete set null,
  note        text,
  created_by  uuid references public.users(user_id),
  created_at  timestamptz not null default now()
);

create index fin_distributions_month_id_idx on public.fin_distributions (month_id);
create index fin_distributions_invoice_id_idx on public.fin_distributions (invoice_id);

-- ── Trigger: bloquear escritura sobre un mes cerrado ───────────────────────────
-- El prototipo solo escondía botones en la UI cuando el mes estaba cerrado; esa
-- protección se salta por API. Este trigger la hace valer también desde ahí
-- (mismo criterio que 20260910000000_av_piezas_restrict_recurso.sql).
create or replace function public.fin_block_closed_month()
returns trigger
language plpgsql
as $$
declare
  v_month_id uuid;
  v_closed boolean;
begin
  v_month_id := coalesce(new.month_id, old.month_id);

  -- fin_payments no tiene month_id propio: se deriva de su factura.
  if v_month_id is null and tg_table_name = 'fin_payments' then
    select month_id into v_month_id
    from public.fin_invoices
    where id = coalesce(new.invoice_id, old.invoice_id);
  end if;

  select closed into v_closed from public.fin_months where id = v_month_id;

  if coalesce(v_closed, false) then
    raise exception 'El mes % ya está cerrado, no se puede modificar.', v_month_id;
  end if;

  return coalesce(new, old);
end;
$$;

create trigger fin_invoices_block_closed
  before insert or update or delete on public.fin_invoices
  for each row execute function public.fin_block_closed_month();

create trigger fin_payments_block_closed
  before insert or update or delete on public.fin_payments
  for each row execute function public.fin_block_closed_month();

create trigger fin_distributions_block_closed
  before insert or update or delete on public.fin_distributions
  for each row execute function public.fin_block_closed_month();

-- ── RLS ─────────────────────────────────────────────────────────────────────
alter table public.fin_months enable row level security;
alter table public.fin_invoices enable row level security;
alter table public.fin_payments enable row level security;
alter table public.fin_distributions enable row level security;

create policy "fin_months_read" on public.fin_months
  for select to authenticated using (user_can('finanzas'));
create policy "fin_months_insert" on public.fin_months
  for insert to authenticated with check (user_can('finanzas.cerrar_mes'));
create policy "fin_months_update" on public.fin_months
  for update to authenticated
  using (user_can('finanzas.cerrar_mes')) with check (user_can('finanzas.cerrar_mes'));

create policy "fin_invoices_read" on public.fin_invoices
  for select to authenticated using (user_can('finanzas'));
create policy "fin_invoices_insert" on public.fin_invoices
  for insert to authenticated with check (user_can('finanzas.facturacion.manage'));
create policy "fin_invoices_update" on public.fin_invoices
  for update to authenticated
  using (user_can('finanzas.facturacion.manage')) with check (user_can('finanzas.facturacion.manage'));
create policy "fin_invoices_delete" on public.fin_invoices
  for delete to authenticated using (user_can('finanzas.facturacion.manage'));

create policy "fin_payments_read" on public.fin_payments
  for select to authenticated using (user_can('finanzas'));
create policy "fin_payments_insert" on public.fin_payments
  for insert to authenticated with check (user_can('finanzas.cobros.manage'));
create policy "fin_payments_delete" on public.fin_payments
  for delete to authenticated using (user_can('finanzas.cobros.manage'));

create policy "fin_distributions_read" on public.fin_distributions
  for select to authenticated using (user_can('finanzas'));
create policy "fin_distributions_insert" on public.fin_distributions
  for insert to authenticated with check (user_can('finanzas.distribucion.manage'));
create policy "fin_distributions_update" on public.fin_distributions
  for update to authenticated
  using (user_can('finanzas.distribucion.manage')) with check (user_can('finanzas.distribucion.manage'));
create policy "fin_distributions_delete" on public.fin_distributions
  for delete to authenticated using (user_can('finanzas.distribucion.manage'));

alter publication supabase_realtime add table public.fin_months;
alter publication supabase_realtime add table public.fin_invoices;
alter publication supabase_realtime add table public.fin_payments;
alter publication supabase_realtime add table public.fin_distributions;

-- ── Seed de capabilities: nivel 4 en adelante, ajustable en Empresa → Accesos ──
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
  v_key text;
begin
  for cid in
    select distinct company_id::text from public.users where company_id is not null
  loop
    foreach v_key in array array[
      'finanzas',
      'finanzas.dashboard',
      'finanzas.facturacion',
      'finanzas.clientes',
      'finanzas.distribucion',
      'finanzas.porcobrar',
      'finanzas.facturacion.manage',
      'finanzas.cobros.manage',
      'finanzas.distribucion.manage',
      'finanzas.cerrar_mes'
    ]
    loop
      insert into public.module_permissions (company_id, module_key, rules)
      values (cid, v_key, v_rule)
      on conflict (company_id, module_key) do nothing;
    end loop;
  end loop;
end;
$$;
