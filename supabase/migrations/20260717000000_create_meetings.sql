-- Tabla "meetings": reuniones agendadas con clientes/empleados (módulo Reuniones).
-- Sustituye la gestión manual por WhatsApp: cada reunión tiene fecha/hora, cliente,
-- participantes (empleados) y modalidad (presencial o videollamada).
--
-- "Realizada" se marca a mano (no automático por fecha): status tiene 3 valores —
-- 'programada' (default), 'realizada' (marcada a mano, ✓ en el calendario), 'cancelada'
-- (✕ en el calendario). Una reunión 'programada' cuya starts_at ya pasó se muestra en
-- estado de alerta en el calendario hasta que alguien la marque o cancele. El contador de
-- Reportes → Operaciones (countMeetingsHeldForLine en meetingsApi.js) cuenta únicamente
-- status = 'realizada' — sin fallback por fecha vencida.
--
-- line_id se denormaliza desde metric_clients.line_id al crear/editar (snapshot), para que
-- si el cliente cambia de línea después, los reportes de meses ya cerrados no se recalculen.
create table if not exists public.meetings (
  id            uuid primary key default gen_random_uuid(),
  company_id    text not null,
  title         text not null,                        -- asunto de la reunión
  client_id     uuid references public.metric_clients(id) on delete set null,
  client_name   text,                                  -- snapshot del nombre (clientes tienen soft-delete)
  line_id       uuid references public.metric_lines(id) on delete set null,
  starts_at     timestamptz not null,
  ends_at       timestamptz,
  modality      text not null default 'presencial',    -- 'presencial' | 'videollamada'
  location      text,                                  -- lugar físico (si presencial), opcional
  meeting_url   text,                                  -- link de la videollamada (si videollamada), opcional
  notes         text,
  attendee_ids  text[] not null default '{}',           -- user_id[] (convención igual que tasks.assignee_ids)
  status        text not null default 'programada',    -- 'programada' | 'realizada' | 'cancelada' (marcado manual)
  created_by    text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint meetings_modality_check check (modality in ('presencial', 'videollamada')),
  constraint meetings_status_check check (status in ('programada', 'realizada', 'cancelada'))
);

alter table public.meetings enable row level security;

-- Lectura: cualquier autenticado (mismo criterio que metric_clients/ads).
create policy "meetings_select" on public.meetings
  for select to authenticated
  using (true);

-- Escritura: gated por capability 'reuniones.manage'.
create policy "meetings_manage_insert" on public.meetings
  for insert to authenticated
  with check (user_can('reuniones.manage'));

create policy "meetings_manage_update" on public.meetings
  for update to authenticated
  using     (user_can('reuniones.manage'))
  with check (user_can('reuniones.manage'));

create policy "meetings_manage_delete" on public.meetings
  for delete to authenticated
  using (user_can('reuniones.manage'));

-- Realtime: calendario en vivo entre usuarios (patrón AppLayout/Proyectos).
alter publication supabase_realtime add table public.meetings;

create index if not exists meetings_company_starts_idx on public.meetings (company_id, starts_at);
create index if not exists meetings_line_starts_idx on public.meetings (line_id, starts_at);

-- ── Seed de capacidad por defecto ────────────────────────────────────────────
-- reuniones.manage → nivel 2+ (jefes y coordinadores gestionan reuniones, igual que tareas.manage)
-- reuniones (acceso al módulo) → sin reglas = abierto a todos los autenticados
do $$
declare
  cid text;
begin
  for cid in
    select distinct company_id::text from public.users where company_id is not null
  loop
    insert into public.module_permissions (company_id, module_key, rules) values
      (cid, 'reuniones.manage',
       '{"rules":[{"all":[{"type":"min_level","value":2,"ids":[]}]}]}'::jsonb)
    on conflict (company_id, module_key) do nothing;
  end loop;
end;
$$;
