-- Empresa → Suscripciones: catálogo de servicios recurrentes que paga la agencia
-- (software, hosting, IA, etc.), con la tarjeta (solo últimos 4 dígitos), el día de
-- cobro y el responsable. Es solo REGISTRO: no alimenta Finanzas (el próximo cobro se
-- deriva en el cliente desde billing_day/frequency/billing_month, no se guarda).
--
-- IMPORTANTE: el seed de module_permissions va en esta misma migración porque una
-- capability sin fila queda ABIERTA a todos (ver 20260924000000_create_employee_permissions.sql).
create table public.company_subscriptions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  name text not null,
  -- Mismas keys que CATEGORIAS_GASTO (src/components/finanzas/constants.js) para que
  -- una futura integración con Finanzas caiga en el mismo rubro.
  category text not null default 'conectividad',
  amount numeric(12, 2) not null default 0,
  currency text not null default 'USD',
  frequency text not null default 'mensual',
  billing_day smallint not null,
  -- Mes ancla del cobro; obligatorio si la frecuencia no es mensual.
  billing_month smallint,
  card_last4 text,
  owner_user_id uuid references public.users(user_id),
  account_email text,
  url text,
  status text not null default 'activa',
  start_date date,
  cancelled_at date,
  comment text,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint company_subscriptions_name_check check (length(btrim(name)) > 0),
  constraint company_subscriptions_category_check check (
    category in (
      'nomina', 'beneficios', 'sede', 'conectividad', 'equipos', 'movilidad',
      'impuestos', 'financieros', 'marca', 'sin_clasificar'
    )
  ),
  constraint company_subscriptions_amount_check check (amount >= 0),
  constraint company_subscriptions_currency_check check (currency in ('USD', 'Bs', 'EUR')),
  constraint company_subscriptions_frequency_check
    check (frequency in ('mensual', 'trimestral', 'anual')),
  constraint company_subscriptions_billing_day_check check (billing_day between 1 and 31),
  constraint company_subscriptions_billing_month_check
    check (billing_month is null or billing_month between 1 and 12),
  constraint company_subscriptions_month_required_check
    check (frequency = 'mensual' or billing_month is not null),
  constraint company_subscriptions_card_last4_check
    check (card_last4 is null or card_last4 ~ '^[0-9]{4}$'),
  constraint company_subscriptions_status_check
    check (status in ('activa', 'pausada', 'cancelada'))
);

create index company_subscriptions_company_idx on public.company_subscriptions (company_id);

alter table public.company_subscriptions enable row level security;

-- Lectura: empresa.suscripciones. Escritura: empresa.suscripciones.manage. Ambas con las
-- reglas de `finanzas` (seed abajo). El company_id de la fila debe ser el del usuario.
create policy "company_subscriptions_read"
  on public.company_subscriptions for select
  to authenticated
  using (user_can('empresa.suscripciones'));

create policy "company_subscriptions_insert"
  on public.company_subscriptions for insert
  to authenticated
  with check (
    user_can('empresa.suscripciones.manage')
    and company_id::text = (select u.company_id::text from public.users u where u.user_id = auth.uid())
  );

create policy "company_subscriptions_update"
  on public.company_subscriptions for update
  to authenticated
  using (user_can('empresa.suscripciones.manage'))
  with check (
    user_can('empresa.suscripciones.manage')
    and company_id::text = (select u.company_id::text from public.users u where u.user_id = auth.uid())
  );

create policy "company_subscriptions_delete"
  on public.company_subscriptions for delete
  to authenticated
  using (user_can('empresa.suscripciones.manage'));

alter publication supabase_realtime add table public.company_subscriptions;

-- ── Seed de capabilities ──────────────────────────────────────────────────────
-- Mismas reglas que `finanzas` (nivel >= 4 o departamento Administración; admin siempre
-- pasa). Si una empresa no tiene fila `finanzas`, se cae a nivel >= 4.
do $$
declare
  cid text;
  v_rules jsonb;
  v_default jsonb := jsonb_build_object(
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
    select rules into v_rules
      from public.module_permissions
     where company_id = cid and module_key = 'finanzas';

    insert into public.module_permissions (company_id, module_key, rules) values
      (cid, 'empresa.suscripciones', coalesce(v_rules, v_default)),
      (cid, 'empresa.suscripciones.manage', coalesce(v_rules, v_default))
    on conflict (company_id, module_key) do nothing;
  end loop;
end;
$$;
