-- Tabla "ads": pauta pagada (distinta de "campaigns" = tácticas orgánicas).
-- Cada ad pertenece a un cliente, tiene un monto asignado y un plazo (inicio/fin).
create table if not exists public.ads (
  id          uuid primary key default gen_random_uuid(),
  company_id  text not null,
  client_id   uuid references public.metric_clients(id) on delete set null,
  client      text,                                     -- snapshot del nombre del cliente
  name        text not null,                             -- nombre de campaña
  objective   text,                                       -- objetivo (texto libre)
  piece_url   text,                                       -- pieza: link de la publicación
  amount      numeric(12,2) not null default 0,           -- monto asignado (USD)
  start_date  date not null,
  end_date    date not null,
  status      text not null default 'Pendiente',
  created_by  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table public.ads enable row level security;

-- Lectura: cualquier autenticado (mismo criterio que metric_clients/campaigns).
create policy "ads_select" on public.ads
  for select to authenticated
  using (true);

-- Escritura: gated por capability 'ads.manage' (mismo criterio que el resto del módulo Ads).
create policy "ads_manage_insert" on public.ads
  for insert to authenticated
  with check (user_can('ads.manage'));

create policy "ads_manage_update" on public.ads
  for update to authenticated
  using     (user_can('ads.manage'))
  with check (user_can('ads.manage'));

create policy "ads_manage_delete" on public.ads
  for delete to authenticated
  using (user_can('ads.manage'));
