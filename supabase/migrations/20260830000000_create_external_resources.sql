-- Recursos externos (grabación/edición/ads) que la agencia contrata pero que NO son
-- empleados: no deben aparecer en Tareas, Líneas ni Evaluaciones, solo en el módulo
-- Pautas como recurso (quién graba) y/o editor. Tabla totalmente desacoplada de
-- `users` a propósito — ver ARQUITECTURA.md.
create table public.external_resources (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  full_name text not null,
  roles text[] not null default '{}',
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  constraint external_resources_roles_check check (
    roles <@ array['grabacion', 'edicion', 'ads']::text[]
  )
);

create index external_resources_company_idx on public.external_resources (company_id);

alter table public.external_resources enable row level security;

-- Mismo criterio permisivo que metric_line_members / av_pautas: cualquier usuario
-- autenticado de la empresa puede leer/escribir (no hay scoping por rol en este módulo).
create policy external_resources_all on public.external_resources
  for all to authenticated
  using (true)
  with check (true);
