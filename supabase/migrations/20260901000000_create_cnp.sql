-- Tabla "cnp_requests": Contenido No Planificado — solicitudes que hacen los clientes
-- fuera de la planificación normal (llegan casi siempre por WhatsApp, con copy ya
-- redactado y a veces referencias visuales). Antes se cargaban como filas de `tasks`,
-- lo que ensuciaba esa base con datos que no aplican a una tarea interna. Este módulo
-- las separa en su propia tabla, con vida propia (ver src/pages/CnpPage.jsx).
--
-- line_id/client_id: mismo patrón que tasks — line_id se denormaliza para poder
-- filtrar/RLS por línea sin join; client_id sí es una FK real a metric_clients (a
-- diferencia de tasks.client, que arrastra un snapshot de texto legacy).
--
-- Doble check de impresión (is_print): cuando el CNP se imprime, requiere dos
-- aprobaciones secuenciales antes de poder cerrarse como "Terminado":
--   1. team_checked_at/by  — cualquiera con cnp.manage sobre la línea
--   2. print_approved_at/by — solo quien tenga la capability cnp.print.approve
--      (Paola / Stephanie, asignadas vía Empresa → Permisos con una condición
--      {"type":"user","ids":[...]} — no se modela como columna en `users` para no
--      duplicar el sistema de permisos ya existente, ver src/lib/permissions.js).
-- La regla "no se puede cerrar sin ambos checks si is_print" se aplica en
-- src/components/cnp/cnpApi.js (capa de aplicación), no en la base de datos.
create table if not exists public.cnp_requests (
  id                  uuid primary key default gen_random_uuid(),
  company_id          text not null,
  line_id             uuid references public.metric_lines(id) on delete set null,
  client_id           uuid not null references public.metric_clients(id) on delete cascade,
  title               text not null,
  content             text,
  assignee_id         text,
  refs                jsonb not null default '[]',
  notes               text,
  is_print            boolean not null default false,
  status              text not null default 'Pendiente',
  team_checked_at     timestamptz,
  team_checked_by     text,
  print_approved_at   timestamptz,
  print_approved_by   text,
  due_date            date,
  created_by          text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  deleted_at          timestamptz,
  constraint cnp_requests_status_check check (
    status in ('Pendiente', 'En proceso', 'Por revisar', 'Paralizado', 'Terminado')
  )
);

alter table public.cnp_requests enable row level security;

-- Lectura: cualquier autenticado (scope por línea se filtra client-side, mismo
-- criterio que tasks/fixed_task_marks/av_pautas).
create policy "cnp_requests_select" on public.cnp_requests
  for select to authenticated
  using (true);

-- Escritura: reusa los helpers security-definer de tasks_line_scoped_rls.sql.
create policy "cnp_requests_insert" on public.cnp_requests
  for insert to authenticated
  with check (
    user_can('cnp.manage')
    and (task_user_view_all() or task_user_in_line(line_id::text))
  );

create policy "cnp_requests_update" on public.cnp_requests
  for update to authenticated
  using (
    user_can('cnp.manage')
    and (task_user_view_all() or task_user_in_line(line_id::text))
  )
  with check (
    user_can('cnp.manage')
    and (task_user_view_all() or task_user_in_line(line_id::text))
  );

create policy "cnp_requests_delete" on public.cnp_requests
  for delete to authenticated
  using (
    user_can('cnp.manage')
    and (task_user_view_all() or task_user_in_line(line_id::text))
  );

alter publication supabase_realtime add table public.cnp_requests;

create index if not exists cnp_requests_company_line_idx
  on public.cnp_requests (company_id, line_id, created_at desc);

-- ── Seed de capacidades por defecto ──────────────────────────────────────────
-- cnp (acceso) y cnp.manage → nivel 2+ (mismo criterio que tareas.manage).
-- cnp.print.approve se deja SIN reglas amplias a propósito: por defecto el sistema
-- trata "sin reglas" como abierto a todos (ver src/lib/permissions.js), así que un
-- admin debe entrar a Empresa → Permisos y restringirlo explícitamente a Paola y
-- Stephanie con una condición {"type":"user","ids":[...]}. No se siembra aquí
-- porque este script no conoce sus user_id por empresa.
do $$
declare
  cid text;
begin
  for cid in
    select distinct company_id::text from public.users where company_id is not null
  loop
    insert into public.module_permissions (company_id, module_key, rules) values
      (cid, 'cnp.manage',
       '{"rules":[{"all":[{"type":"min_level","value":2,"ids":[]}]}]}'::jsonb)
    on conflict (company_id, module_key) do nothing;
  end loop;
end;
$$;
