-- Auditoría de movimientos de una cuenta (metric_clients) de una línea a otra.
-- No se usa para recalcular ownership por mes: el dato correcto se materializa en el
-- jsonb de los reportes del mes de transición (ver src/utils/moveClientLine.js).
-- Esta tabla solo registra QUIÉN movió QUÉ, CUÁNDO y con qué reparto de ingreso.

create table public.metric_client_line_moves (
  id             uuid primary key default gen_random_uuid(),
  company_id     uuid not null,
  client_id      uuid not null references public.metric_clients(id) on delete cascade,
  from_line_id   uuid references public.metric_lines(id) on delete set null,
  to_line_id     uuid references public.metric_lines(id) on delete set null,
  effective_date date not null,
  split_old      numeric,
  split_new      numeric,
  created_at     timestamptz not null default now(),
  created_by     text
);

create index metric_client_line_moves_client_idx on public.metric_client_line_moves (client_id);
create index metric_client_line_moves_company_idx on public.metric_client_line_moves (company_id);

alter table public.metric_client_line_moves enable row level security;

-- Mismo criterio abierto que metric_clients: cualquier usuario autenticado.
create policy "auth users full access" on public.metric_client_line_moves
  for all to authenticated using (true) with check (true);
