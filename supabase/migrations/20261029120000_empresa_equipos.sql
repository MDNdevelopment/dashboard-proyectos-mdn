-- Empresa → Equipos: inventario de iPhones de la agencia, con su responsable, la línea (team)
-- a la que pertenecen y el correo de iCloud con el que están vinculados. Cada cambio de
-- responsable o de línea queda en `company_equipment_assignments`, que escribe un trigger
-- (no el cliente) para que el historial no dependa de un segundo insert ni se pueda saltar.
--
-- IMPORTANTE: el seed de module_permissions va en esta misma migración porque una
-- capability sin fila queda ABIERTA a todos (ver 20260924000000_create_employee_permissions.sql).
create table public.company_equipment (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  -- Modelo del iPhone en texto libre (ej. "iPhone 13 Pro Max"); la UI sugiere los comunes.
  model text not null,
  serial text,
  -- Cuenta de iCloud del equipo; suele compartirse entre los iPhones de un mismo team.
  icloud_email text,
  line_id uuid references public.metric_lines(id) on delete set null,
  responsible_user_id uuid references public.users(user_id) on delete set null,
  status text not null default 'en_uso',
  notes text,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint company_equipment_model_check check (length(btrim(model)) > 0),
  constraint company_equipment_status_check
    check (status in ('en_uso', 'disponible', 'en_reparacion', 'baja'))
);

create index company_equipment_company_idx on public.company_equipment (company_id);
create index company_equipment_responsible_idx on public.company_equipment (responsible_user_id);
create index company_equipment_line_idx on public.company_equipment (line_id);

-- Un mismo serial no se registra dos veces en la empresa (sin distinguir mayúsculas).
create unique index company_equipment_serial_uniq
  on public.company_equipment (company_id, lower(btrim(serial)))
  where serial is not null and length(btrim(serial)) > 0;

create table public.company_equipment_assignments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  equipment_id uuid not null references public.company_equipment(id) on delete cascade,
  user_id uuid references public.users(user_id) on delete set null,
  line_id uuid references public.metric_lines(id) on delete set null,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  changed_by uuid
);

create index cea_equipment_idx on public.company_equipment_assignments (equipment_id, started_at desc);
create index cea_user_idx on public.company_equipment_assignments (user_id);

-- ── Trigger de historial ──────────────────────────────────────────────────────
-- Al crear con responsable/línea, o al cambiar cualquiera de los dos: cierra la asignación
-- abierta y abre una nueva (si queda algo asignado). security definer porque los clientes
-- no tienen INSERT/UPDATE sobre el historial.
create or replace function public.company_equipment_track_assignment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' then
    if new.responsible_user_id is not distinct from old.responsible_user_id
       and new.line_id is not distinct from old.line_id then
      return new;
    end if;
    update public.company_equipment_assignments
       set ended_at = now()
     where equipment_id = new.id and ended_at is null;
  end if;

  if new.responsible_user_id is not null or new.line_id is not null then
    insert into public.company_equipment_assignments
      (company_id, equipment_id, user_id, line_id, changed_by)
    values
      (new.company_id, new.id, new.responsible_user_id, new.line_id, auth.uid());
  end if;
  return new;
end;
$$;

create trigger company_equipment_track_assignment
  after insert or update of responsible_user_id, line_id on public.company_equipment
  for each row execute function public.company_equipment_track_assignment();

-- ── RLS ───────────────────────────────────────────────────────────────────────
alter table public.company_equipment enable row level security;
alter table public.company_equipment_assignments enable row level security;

create policy "company_equipment_read"
  on public.company_equipment for select
  to authenticated
  using (user_can('empresa.equipos'));

create policy "company_equipment_insert"
  on public.company_equipment for insert
  to authenticated
  with check (
    user_can('empresa.equipos.manage')
    and company_id::text = (select u.company_id::text from public.users u where u.user_id = auth.uid())
  );

create policy "company_equipment_update"
  on public.company_equipment for update
  to authenticated
  using (user_can('empresa.equipos.manage'))
  with check (
    user_can('empresa.equipos.manage')
    and company_id::text = (select u.company_id::text from public.users u where u.user_id = auth.uid())
  );

create policy "company_equipment_delete"
  on public.company_equipment for delete
  to authenticated
  using (user_can('empresa.equipos.manage'));

-- El historial es de solo lectura para los clientes: lo escribe el trigger.
create policy "company_equipment_assignments_read"
  on public.company_equipment_assignments for select
  to authenticated
  using (user_can('empresa.equipos'));

alter publication supabase_realtime add table public.company_equipment;

-- ── Seed de capabilities ──────────────────────────────────────────────────────
-- Ver: nivel >= 3. Editar: nivel >= 4. Admin siempre pasa. Ajustable desde Accesos.
do $$
declare
  cid text;
begin
  for cid in
    select distinct company_id::text from public.users where company_id is not null
  loop
    insert into public.module_permissions (company_id, module_key, rules) values
      (cid, 'empresa.equipos', jsonb_build_object(
        'deny', '[]'::jsonb,
        'rules', jsonb_build_array(
          jsonb_build_object('all', jsonb_build_array(
            jsonb_build_object('type', 'min_level', 'value', 3, 'ids', '[]'::jsonb)
          ))
        )
      )),
      (cid, 'empresa.equipos.manage', jsonb_build_object(
        'deny', '[]'::jsonb,
        'rules', jsonb_build_array(
          jsonb_build_object('all', jsonb_build_array(
            jsonb_build_object('type', 'min_level', 'value', 4, 'ids', '[]'::jsonb)
          ))
        )
      ))
    on conflict (company_id, module_key) do nothing;
  end loop;
end;
$$;

-- ── Distribución inicial de iPhones por team ──────────────────────────────────
-- Hoja "Correos de equipos audiovisuales". Sin responsable ni serial: se completan desde la
-- UI. Cada fila se une a la línea por nombre; si una línea no existe en la empresa, esa fila
-- simplemente no se inserta.
insert into public.company_equipment (company_id, model, icloud_email, line_id)
select l.company_id::uuid, s.model, s.icloud_email, l.id
from (values
  ('Team Georgina', 'iPhone 13 Pro Max', 'redesmdn1@gmail.com'),
  ('Team Georgina', 'iPhone 13 Pro Max', 'redesmdn1@gmail.com'),
  ('Team Sabrina',  'iPhone 13 Pro Max', 'mdnpublicidadcol@gmail.com'),
  ('Team Sabrina',  'iPhone 14',         'mdnpublicidadcol@gmail.com'),
  ('Team Daniellys','iPhone 13 Pro Max', 'mdnpublicidadcol@gmail.com'),
  ('Team Daniellys','iPhone 12',         'mdnpublicidadcol@gmail.com'),
  ('Team Bianca',   'iPhone 15',         'redesmdn1@gmail.com'),
  ('Team Bianca',   'iPhone 11',         'redesmdn1@gmail.com')
) as s(line_name, model, icloud_email)
join public.metric_lines l on l.name = s.line_name;
