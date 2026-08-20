-- Tabla "publication_check_events": registro append-only de cada publicación guardada
-- en Chequeo (cliente × red social × tipo de contenido), módulo Gestión de Tareas →
-- Chequeo.
--
-- `publication_checks` guarda una sola "celda viva" por (cliente, red, tipo) que se
-- SOBRESCRIBE en cada publicación nueva — perfecta para el semáforo (última fecha vs.
-- hoy), pero inútil para contar cuántas publicaciones hubo en un mes concreto (ya se
-- intentó periodizar esa tabla en 20260821000001 y se revirtió en 20260821000002 porque
-- rompe el cálculo del semáforo). Esta tabla resuelve eso por separado: cada guardado de
-- fecha en Chequeo inserta también un evento aquí, sin sobrescribir nada — de acá sale el
-- número real de actualizaciones del mes que alimenta «2. Productividad – Tareas Fijas»
-- (antes derivado de la columna "Actualización de Plataformas" de fixed_task_marks, ver
-- src/utils/chequeo.js → computePlataformasProductividad).
--
-- client_id/line_id: mismo patrón que publication_checks/fixed_task_marks — line_id se
-- denormaliza al guardar para poder filtrar/RLS por línea sin join.
create table if not exists public.publication_check_events (
  id            uuid primary key default gen_random_uuid(),
  company_id    text not null,
  client_id     uuid not null references public.metric_clients(id) on delete cascade,
  line_id       uuid references public.metric_lines(id) on delete set null,
  network       text not null,
  content_type  text not null,
  published_at  date not null,
  created_by    text,
  created_at    timestamptz not null default now(),
  constraint publication_check_events_content_type_check check (
    content_type in ('publicaciones', 'reels', 'highlights')
  ),
  -- Idempotencia: re-guardar la misma fecha en la misma celda no debe sumar dos veces.
  constraint publication_check_events_unique unique (client_id, network, content_type, published_at)
);

alter table public.publication_check_events enable row level security;

-- Lectura: cualquier autenticado (scope por línea se filtra client-side, mismo criterio
-- que publication_checks/fixed_task_marks/av_pautas).
create policy "publication_check_events_select" on public.publication_check_events
  for select to authenticated
  using (true);

-- Escritura: mismos helpers y misma capability que publication_checks — quien puede
-- registrar una fecha en Chequeo es quien puede generar el evento correspondiente.
create policy "publication_check_events_insert" on public.publication_check_events
  for insert to authenticated
  with check (
    user_can('chequeo.manage')
    and (task_user_view_all() or task_user_in_line(line_id::text))
  );

create policy "publication_check_events_update" on public.publication_check_events
  for update to authenticated
  using (
    user_can('chequeo.manage')
    and (task_user_view_all() or task_user_in_line(line_id::text))
  )
  with check (
    user_can('chequeo.manage')
    and (task_user_view_all() or task_user_in_line(line_id::text))
  );

create policy "publication_check_events_delete" on public.publication_check_events
  for delete to authenticated
  using (
    user_can('chequeo.manage')
    and (task_user_view_all() or task_user_in_line(line_id::text))
  );

-- Sin realtime: se consulta bajo demanda al cargar el mes (OperacionesView/Tareas Fijas),
-- no hace falta un canal en vivo como en la grilla de Chequeo.
create index if not exists publication_check_events_company_line_month_idx
  on public.publication_check_events (company_id, line_id, published_at);
