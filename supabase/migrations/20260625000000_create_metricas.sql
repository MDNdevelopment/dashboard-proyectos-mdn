-- ─── metric_lines: las "jefas"/líneas operativas ──────────────────────────────
create table public.metric_lines (
  id         uuid        primary key default gen_random_uuid(),
  company_id text        not null,
  name       text        not null,
  color      text,
  sort_order int         not null default 0,
  created_at timestamptz not null default now()
);

alter table public.metric_lines enable row level security;

create policy "metric_lines_authenticated_read"
  on public.metric_lines for select
  to authenticated using (true);

create policy "metric_lines_authenticated_insert"
  on public.metric_lines for insert
  to authenticated with check (true);

create policy "metric_lines_authenticated_update"
  on public.metric_lines for update
  to authenticated using (true) with check (true);

create policy "metric_lines_authenticated_delete"
  on public.metric_lines for delete
  to authenticated using (true);

alter publication supabase_realtime add table public.metric_lines;

-- ─── metric_clients: cartera de clientes por línea ────────────────────────────
create table public.metric_clients (
  id         uuid        primary key default gen_random_uuid(),
  company_id text        not null,
  line_id    uuid        not null references public.metric_lines(id) on delete cascade,
  name       text        not null,
  created_at timestamptz not null default now()
);

alter table public.metric_clients enable row level security;

create policy "metric_clients_authenticated_read"
  on public.metric_clients for select
  to authenticated using (true);

create policy "metric_clients_authenticated_insert"
  on public.metric_clients for insert
  to authenticated with check (true);

create policy "metric_clients_authenticated_update"
  on public.metric_clients for update
  to authenticated using (true) with check (true);

create policy "metric_clients_authenticated_delete"
  on public.metric_clients for delete
  to authenticated using (true);

alter publication supabase_realtime add table public.metric_clients;

-- ─── metric_reports: un reporte por (línea, año, mes) ─────────────────────────
-- metric_reports.data (jsonb) sigue la forma:
-- { reuniones:{realizadas,meta},
--   productividad:{tareas:[{nombre,realizado,meta}]},
--   crecimiento:{items:[{clienteId,seguidoresActuales,seguidoresBase,meta}]},
--   solicitudes:{solicitudes,editadas},
--   pautas:{items:[{clienteId,realizadas,meta}]},
--   piezas:{piezas,editadas},
--   feedback:{items:[{clienteId,score}]},
--   finanzas:{ingresos:[],gastosOperativos:[],sueldos:[],otrosGastos:[]} }
create table public.metric_reports (
  id         uuid        primary key default gen_random_uuid(),
  company_id text        not null,
  line_id    uuid        not null references public.metric_lines(id) on delete cascade,
  year       int         not null,
  month      int         not null check (month between 1 and 12),
  data       jsonb       not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (line_id, year, month)
);

alter table public.metric_reports enable row level security;

create policy "metric_reports_authenticated_read"
  on public.metric_reports for select
  to authenticated using (true);

create policy "metric_reports_authenticated_insert"
  on public.metric_reports for insert
  to authenticated with check (true);

create policy "metric_reports_authenticated_update"
  on public.metric_reports for update
  to authenticated using (true) with check (true);

create policy "metric_reports_authenticated_delete"
  on public.metric_reports for delete
  to authenticated using (true);

alter publication supabase_realtime add table public.metric_reports;
