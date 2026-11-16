-- Chequeo de temporada (Gestión de Tareas → Chequeo → Temporada).
--
-- Reemplaza la hoja «Seguimiento - Navidad»: por cada cliente y cada "slot" de la temporada
-- (una fecha de publicación o una tarjeta) se registra qué piezas hay (diseño, foto, reel) y
-- el estado de cada una.
--
-- Dos tablas:
--  · seasonal_campaigns: la temporada y sus slots (jsonb). No hay pantalla para
--    administrarlas: agregar una temporada nueva es un INSERT.
--  · seasonal_pieces: UNA fila por pieza (cliente × slot × tipo). Elegir un formato crea la
--    fila y quitarlo la borra, así que "N/A" nunca se guarda: la grilla se deriva de las
--    piezas que existen. Mismo patrón de "una fila por celda" que publication_checks.
--
-- RLS de seasonal_pieces: espejo exacto de publication_checks (chequeo.manage + línea propia,
-- línea general o permiso de ver todo). No hay capability nueva.

create table if not exists public.seasonal_campaigns (
  id          uuid primary key default gen_random_uuid(),
  company_id  text not null,
  name        text not null,
  starts_on   date,
  ends_on     date,
  -- [{ "key": "2026-12-24", "label": "24/12", "kind": "post" },
  --  { "key": "tarjeta_navidad", "label": "Tarjeta navidad", "kind": "tarjeta" }, …]
  slots       jsonb not null default '[]'::jsonb,
  created_at  timestamptz not null default now(),
  constraint seasonal_campaigns_slots_is_array check (jsonb_typeof(slots) = 'array')
);

create table if not exists public.seasonal_pieces (
  id           uuid primary key default gen_random_uuid(),
  company_id   text not null,
  campaign_id  uuid not null references public.seasonal_campaigns(id) on delete cascade,
  client_id    uuid not null references public.metric_clients(id) on delete cascade,
  -- Snapshot de la línea al guardar (filtrar/RLS sin join). Para cuentas sin línea se
  -- persiste el id de la línea general, nunca null (ver effectiveLineId en utils/chequeo.js).
  line_id      uuid references public.metric_lines(id) on delete set null,
  slot_key     text not null,
  piece_type   text not null,
  status       text not null default 'pendiente',
  updated_by   text,
  updated_at   timestamptz not null default now(),
  constraint seasonal_pieces_piece_type_check check (piece_type in ('diseno', 'foto', 'reel')),
  constraint seasonal_pieces_status_check check (
    status in (
      'pendiente', 'en_produccion', 'en_edicion', 'enviado_cliente',
      'ajustes', 'aprobado', 'publicado'
    )
  ),
  constraint seasonal_pieces_unique unique (campaign_id, client_id, slot_key, piece_type)
);

create index if not exists seasonal_pieces_company_campaign_line_idx
  on public.seasonal_pieces (company_id, campaign_id, line_id);

alter table public.seasonal_campaigns enable row level security;
alter table public.seasonal_pieces enable row level security;

-- Lectura abierta a autenticados (el scope por línea se filtra client-side, igual que
-- publication_checks). seasonal_campaigns no tiene policies de escritura: solo migraciones
-- o service role.
create policy "seasonal_campaigns_select" on public.seasonal_campaigns
  for select to authenticated
  using (true);

create policy "seasonal_pieces_select" on public.seasonal_pieces
  for select to authenticated
  using (true);

create policy "seasonal_pieces_insert" on public.seasonal_pieces
  for insert to authenticated
  with check (
    user_can('chequeo.manage')
    and (
      task_user_view_all()
      or user_can('chequeo.ver_todo')
      or task_user_in_line(line_id::text)
      or task_is_general_line(line_id::text)
    )
  );

create policy "seasonal_pieces_update" on public.seasonal_pieces
  for update to authenticated
  using (
    user_can('chequeo.manage')
    and (
      task_user_view_all()
      or user_can('chequeo.ver_todo')
      or task_user_in_line(line_id::text)
      or task_is_general_line(line_id::text)
    )
  )
  with check (
    user_can('chequeo.manage')
    and (
      task_user_view_all()
      or user_can('chequeo.ver_todo')
      or task_user_in_line(line_id::text)
      or task_is_general_line(line_id::text)
    )
  );

create policy "seasonal_pieces_delete" on public.seasonal_pieces
  for delete to authenticated
  using (
    user_can('chequeo.manage')
    and (
      task_user_view_all()
      or user_can('chequeo.ver_todo')
      or task_user_in_line(line_id::text)
      or task_is_general_line(line_id::text)
    )
  );

-- Realtime: grilla en vivo entre usuarios (patrón publication_checks).
alter publication supabase_realtime add table public.seasonal_pieces;

-- ── Seed: Navidad 2026 ───────────────────────────────────────────────────────
do $$
declare
  cid text;
begin
  for cid in
    select distinct company_id::text from public.users where company_id is not null
  loop
    insert into public.seasonal_campaigns (company_id, name, starts_on, ends_on, slots)
    select
      cid,
      'Navidad 2026',
      date '2026-12-24',
      date '2027-01-01',
      '[
        {"key":"2026-12-24","label":"24/12","kind":"post"},
        {"key":"2026-12-25","label":"25/12","kind":"post"},
        {"key":"tarjeta_navidad","label":"Tarjeta navidad","kind":"tarjeta"},
        {"key":"2026-12-31","label":"31/12","kind":"post"},
        {"key":"2027-01-01","label":"01/01","kind":"post"},
        {"key":"tarjeta_ano_nuevo","label":"Tarjeta año nuevo","kind":"tarjeta"}
      ]'::jsonb
    where not exists (
      select 1 from public.seasonal_campaigns
      where company_id = cid and name = 'Navidad 2026'
    );
  end loop;
end;
$$;
