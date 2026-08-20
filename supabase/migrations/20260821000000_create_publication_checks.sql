-- Tabla "publication_checks": última fecha de publicación conocida por cliente × red
-- social × tipo de contenido (módulo Gestión de Tareas → Chequeo).
--
-- A diferencia de fixed_task_marks (periodizada por semana/mes, estado sí/no/na), aquí
-- cada fila es una "celda viva": UNA sola fecha por (cliente, red, tipo) que se
-- sobrescribe cada vez que la community manager publica algo nuevo. El estado de alerta
-- (normal/naranja/rojo) se calcula en el cliente comparando esa fecha contra hoy — así
-- una fecha de julio sin actualizar sigue en rojo en agosto, sin necesidad de arrastrar
-- filas mes a mes (ver src/utils/chequeo.js → checkStatus).
--
-- client_id/line_id: mismo patrón que fixed_task_marks — line_id se denormaliza al
-- guardar para poder filtrar/RLS por línea sin join. La red (`network`) sale de
-- metric_clients.social_links (no se recaptura aquí, ver src/utils/fixedTasks.js →
-- clientNetworks).
create table if not exists public.publication_checks (
  id                 uuid primary key default gen_random_uuid(),
  company_id         text not null,
  client_id          uuid not null references public.metric_clients(id) on delete cascade,
  line_id            uuid references public.metric_lines(id) on delete set null,
  network            text not null,
  content_type       text not null,
  last_published_at  date,
  updated_by         text,
  updated_at         timestamptz not null default now(),
  constraint publication_checks_content_type_check check (
    content_type in ('publicaciones', 'reels', 'highlights')
  ),
  constraint publication_checks_unique unique (client_id, network, content_type)
);

alter table public.publication_checks enable row level security;

-- Lectura: cualquier autenticado (scope por línea se filtra client-side, mismo criterio
-- que fixed_task_marks/av_pautas).
create policy "publication_checks_select" on public.publication_checks
  for select to authenticated
  using (true);

-- Escritura: reusa los helpers security-definer de 20260709000000_tasks_line_scoped_rls.sql
-- (mismo patrón que fixed_task_marks/av_pautas). chequeo.manage + dirección (view_all) o
-- jefa de línea sobre su propia línea.
create policy "publication_checks_insert" on public.publication_checks
  for insert to authenticated
  with check (
    user_can('chequeo.manage')
    and (task_user_view_all() or task_user_in_line(line_id::text))
  );

create policy "publication_checks_update" on public.publication_checks
  for update to authenticated
  using (
    user_can('chequeo.manage')
    and (task_user_view_all() or task_user_in_line(line_id::text))
  )
  with check (
    user_can('chequeo.manage')
    and (task_user_view_all() or task_user_in_line(line_id::text))
  );

create policy "publication_checks_delete" on public.publication_checks
  for delete to authenticated
  using (
    user_can('chequeo.manage')
    and (task_user_view_all() or task_user_in_line(line_id::text))
  );

-- Realtime: grilla en vivo entre usuarios (patrón fixed_task_marks/av_pautas).
alter publication supabase_realtime add table public.publication_checks;

create index if not exists publication_checks_company_line_idx
  on public.publication_checks (company_id, line_id);

-- ── Seed de capacidades por defecto ──────────────────────────────────────────
-- chequeo.manage → nivel 2+ (jefas de línea registran las fechas de su equipo).
do $$
declare
  cid text;
begin
  for cid in
    select distinct company_id::text from public.users where company_id is not null
  loop
    insert into public.module_permissions (company_id, module_key, rules) values
      (cid, 'chequeo.manage',
       '{"rules":[{"all":[{"type":"min_level","value":2,"ids":[]}]}]}'::jsonb)
    on conflict (company_id, module_key) do nothing;
  end loop;
end;
$$;
