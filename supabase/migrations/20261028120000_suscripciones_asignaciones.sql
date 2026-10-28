-- Empresa → Suscripciones: asignación de cada suscripción a líneas (metric_lines) y/o
-- departamentos. Una suscripción activa en USD asignada a una línea aparece como gasto en
-- el reporte mensual de esa línea (Métricas → Finanzas); si hay varias asignaciones el costo
-- mensual se reparte en partes iguales o por % manual (la regla vive en src/utils/subscriptions.js).
--
-- `departments` vive en una base compartida sin CREATE TABLE en este repo, por eso
-- department_id no lleva FK (se valida en la UI).
create table public.company_subscription_allocations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  subscription_id uuid not null references public.company_subscriptions(id) on delete cascade,
  line_id uuid references public.metric_lines(id) on delete cascade,
  department_id integer,
  -- null = partes iguales. Si una asignación trae %, todas de la suscripción deben traerlo (UI).
  share_pct numeric(5, 2),
  created_at timestamptz not null default now(),
  constraint csa_target_check check (num_nonnulls(line_id, department_id) = 1),
  constraint csa_share_check check (share_pct is null or (share_pct > 0 and share_pct <= 100)),
  constraint csa_unique_line unique (subscription_id, line_id),
  constraint csa_unique_department unique (subscription_id, department_id)
);

create index csa_subscription_idx on public.company_subscription_allocations (subscription_id);
create index csa_line_idx on public.company_subscription_allocations (line_id);

alter table public.company_subscription_allocations enable row level security;

create policy "csa_read"
  on public.company_subscription_allocations for select
  to authenticated
  using (user_can('empresa.suscripciones'));

create policy "csa_insert"
  on public.company_subscription_allocations for insert
  to authenticated
  with check (
    user_can('empresa.suscripciones.manage')
    and company_id::text = (select u.company_id::text from public.users u where u.user_id = auth.uid())
  );

create policy "csa_update"
  on public.company_subscription_allocations for update
  to authenticated
  using (user_can('empresa.suscripciones.manage'))
  with check (
    user_can('empresa.suscripciones.manage')
    and company_id::text = (select u.company_id::text from public.users u where u.user_id = auth.uid())
  );

create policy "csa_delete"
  on public.company_subscription_allocations for delete
  to authenticated
  using (user_can('empresa.suscripciones.manage'));

alter publication supabase_realtime add table public.company_subscription_allocations;

-- ── RPC para el reporte de línea ──────────────────────────────────────────────
-- Los jefes de línea (nivel 3) ven el reporte pero no tienen `empresa.suscripciones`, así
-- que no pueden leer las tablas. Esta función devuelve SOLO nombre, tipo, frecuencia, monto y
-- el reparto de las suscripciones activas en USD asignadas a líneas que el usuario ya puede
-- ver (mismo criterio que la RLS de metric_reports): nivel >= 4 / admin → todas; nivel 3 →
-- solo las líneas donde es miembro. No expone correo, tarjeta ni URL.
create or replace function public.line_subscription_costs(p_company_id text)
returns table (
  line_id uuid,
  subscription_id uuid,
  name text,
  service_type text,
  frequency text,
  amount numeric,
  allocations jsonb
)
language sql stable security definer set search_path = public as $$
  select
    a.line_id,
    s.id,
    s.name,
    s.service_type,
    s.frequency,
    s.amount,
    (
      select jsonb_agg(
        jsonb_build_object(
          'line_id', x.line_id,
          'department_id', x.department_id,
          'share_pct', x.share_pct
        ) order by x.created_at, x.id
      )
      from public.company_subscription_allocations x
      where x.subscription_id = s.id
    )
  from public.company_subscription_allocations a
  join public.company_subscriptions s on s.id = a.subscription_id
  where a.line_id is not null
    and s.company_id::text = p_company_id
    and s.company_id::text = (select u.company_id::text from public.users u where u.user_id = auth.uid())
    and s.status = 'activa'
    and s.currency = 'USD'
    and public.metrics_user_can_view()
    and (
      public.metrics_user_view_all()
      or exists (
        select 1 from public.metric_line_members m
        where m.line_id = a.line_id and m.user_id = auth.uid()::text
      )
    )
$$;

revoke all on function public.line_subscription_costs(text) from public;
grant execute on function public.line_subscription_costs(text) to authenticated;
