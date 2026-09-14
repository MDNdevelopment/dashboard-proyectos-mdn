-- Permisos de colaboradores (RRHH): permisos, ausencias injustificadas y reposos médicos.
-- Análogo estructural de `vacations` (rango de fechas por empleado, scoping por user_id),
-- pero sin flujo de status tentativa/confirmada: lo que RRHH registra ya ocurrió.
--
-- Ver ARQUITECTURA.md §2.6. Caso concreto: Sofía Lauretta (Coord. de Desarrollo Laboral,
-- nivel 2, admin=false) es quien registra; niveles 3/4 solo consultan el reporte mensual.
--
-- IMPORTANTE: el seed de module_permissions va en esta misma migración porque una
-- capability sin fila en module_permissions queda ABIERTA a todos (ver advertencia en
-- 20260907000000_rrhh_capabilities.sql).

create table public.employee_permissions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(user_id),
  company_id uuid,
  type text not null,
  start_date date not null,
  end_date date not null,
  reason text,
  created_by uuid,
  created_at timestamptz not null default now(),
  -- Vocabulario cerrado, mismo criterio que vacations_status_check
  -- (20260827000000_vacations_normalize.sql). Agregar un tipo futuro (p.ej.
  -- 'tardanza') es solo reescribir este CHECK, sin migrar filas ni columnas.
  constraint employee_permissions_type_check
    check (type in ('permiso', 'ausencia', 'reposo')),
  constraint employee_permissions_range_check
    check (end_date >= start_date)
);

create index employee_permissions_user_id_start_date_idx
  on public.employee_permissions (user_id, start_date);

alter table public.employee_permissions enable row level security;

-- Lectura: nivel >= 3 (configurable desde Empresa → Accesos vía `empresa.permisos`).
create policy "employee_permissions_read"
  on public.employee_permissions for select
  to authenticated
  using (user_can('empresa.permisos'));

-- Escritura: nivel 4, o el user_id de Sofía Lauretta (grant explícito, ver abajo).
create policy "employee_permissions_insert"
  on public.employee_permissions for insert
  to authenticated
  with check (user_can('empresa.permisos.manage'));

create policy "employee_permissions_update"
  on public.employee_permissions for update
  to authenticated
  using (user_can('empresa.permisos.manage'))
  with check (user_can('empresa.permisos.manage'));

create policy "employee_permissions_delete"
  on public.employee_permissions for delete
  to authenticated
  using (user_can('empresa.permisos.manage'));

alter publication supabase_realtime add table public.employee_permissions;

-- ── Seed de capabilities ──────────────────────────────────────────────────────
-- Estado real en prod verificado antes de esta migración: `empresa.permisos` tiene
-- hoy la fila `{"rules":[{"all":[{"type":"min_level","value":4}]}]}` — es la key que
-- gatea la pestaña de configuración de accesos (label "Permisos" hasta ahora).
--
-- Se reasigna esa key a la sección nueva de RRHH, así que se actualiza (no "do nothing")
-- a min_level 3. La pestaña de configuración pasa a gatearse con una key nueva,
-- `empresa.accesos`, sembrada con la MISMA regla que `empresa.permisos` tenía
-- (min_level 4) para no cambiar su comportamiento actual.
do $$
declare
  cid text;
  v_sofia_id uuid := '457bad92-e853-4c0a-ac46-11fb1fdc4d3c';
  v_view jsonb := jsonb_build_object(
    'deny', '[]'::jsonb,
    'rules', jsonb_build_array(
      jsonb_build_object('all', jsonb_build_array(
        jsonb_build_object('type', 'min_level', 'value', 3, 'ids', '[]'::jsonb)
      ))
    )
  );
  v_manage jsonb := jsonb_build_object(
    'deny', '[]'::jsonb,
    'rules', jsonb_build_array(
      jsonb_build_object('all', jsonb_build_array(
        jsonb_build_object('type', 'min_level', 'value', 4, 'ids', '[]'::jsonb)
      )),
      jsonb_build_object('all', jsonb_build_array(
        jsonb_build_object('type', 'user', 'ids', jsonb_build_array(v_sofia_id::text))
      ))
    )
  );
  v_accesos jsonb := jsonb_build_object(
    'deny', '[]'::jsonb,
    'rules', jsonb_build_array(
      jsonb_build_object('all', jsonb_build_array(
        jsonb_build_object('type', 'min_level', 'value', 4, 'ids', '[]'::jsonb)
      ))
    )
  );
begin
  for cid in
    select distinct company_id::text from public.users where company_id is not null
  loop
    -- empresa.permisos: reasignada a la sección de RRHH → nivel 3 (upsert, no "do nothing").
    insert into public.module_permissions (company_id, module_key, rules)
    values (cid, 'empresa.permisos', v_view)
    on conflict (company_id, module_key) do update set rules = excluded.rules;

    insert into public.module_permissions (company_id, module_key, rules) values
      (cid, 'empresa.permisos.manage', v_manage)
    on conflict (company_id, module_key) do nothing;

    -- empresa.accesos: nueva key para la pestaña de configuración de accesos, con la
    -- regla que `empresa.permisos` tenía antes de esta migración (min_level 4).
    insert into public.module_permissions (company_id, module_key, rules) values
      (cid, 'empresa.accesos', v_accesos)
    on conflict (company_id, module_key) do nothing;
  end loop;
end;
$$;
