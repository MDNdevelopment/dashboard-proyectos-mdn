-- Capacidades granulares de RRHH: permiten dar acceso a empleados/vacaciones/sueldos/
-- niveles/calendario global sin necesitar `admin = true` (caso concreto: Sofía Lauretta,
-- Coord. de Desarrollo Laboral, hoy admin solo porque estas funciones estaban amarradas
-- a esa bandera). Ver ARQUITECTURA.md §2.6.
--
-- Regla sembrada para las 4 capacidades: nivel 4 (ya tenían ese piso antes de existir la
-- capacidad, ej. `empresa.empleados`), o el usuario indicado por su `user_id`. Admin
-- siempre pasa por encima (user_can/canAccessModule).
--
-- IMPORTANTE: una capacidad sin fila en module_permissions queda abierta a todos — por
-- eso el seed va en la misma migración que declara las claves nuevas en
-- src/config/modules.js, no después.

do $$
declare
  cid text;
  v_sofia_id text := '457bad92-e853-4c0a-ac46-11fb1fdc4d3c';
  v_rules jsonb := jsonb_build_object(
    'deny', '[]'::jsonb,
    'rules', jsonb_build_array(
      jsonb_build_object('all', jsonb_build_array(
        jsonb_build_object('type', 'min_level', 'value', 4, 'ids', '[]'::jsonb)
      )),
      jsonb_build_object('all', jsonb_build_array(
        jsonb_build_object('type', 'user', 'ids', jsonb_build_array(v_sofia_id))
      ))
    )
  );
begin
  for cid in
    select distinct company_id::text from public.users where company_id is not null
  loop
    insert into public.module_permissions (company_id, module_key, rules) values
      (cid, 'empresa.empleados.manage', v_rules)
    on conflict (company_id, module_key) do nothing;

    insert into public.module_permissions (company_id, module_key, rules) values
      (cid, 'empresa.vacaciones.manage', v_rules)
    on conflict (company_id, module_key) do nothing;

    insert into public.module_permissions (company_id, module_key, rules) values
      (cid, 'empresa.empleados.sensible', v_rules)
    on conflict (company_id, module_key) do nothing;

    insert into public.module_permissions (company_id, module_key, rules) values
      (cid, 'empresa.calendario.ver_todo', v_rules)
    on conflict (company_id, module_key) do nothing;
  end loop;
end;
$$;

-- ── RLS de `vacations`: las 4 policies eran `using(true)` para cualquier autenticado
-- (ver 20260827000000_vacations_normalize.sql) — cualquier nivel 2 podía crear/confirmar/
-- borrar vacaciones de cualquier persona. Se restringe escritura a la capacidad nueva;
-- lectura queda abierta (el calendario de equipo y "de vacaciones ahora" la necesitan).
drop policy if exists "Authenticated users can insert vacations" on vacations;
drop policy if exists "Authenticated users can update vacations" on vacations;
drop policy if exists "Authenticated users can delete vacations" on vacations;

create policy "Authenticated users with capability can insert vacations"
  on vacations for insert
  to authenticated
  with check (user_can('empresa.vacaciones.manage'));

create policy "Authenticated users with capability can update vacations"
  on vacations for update
  to authenticated
  using (user_can('empresa.vacaciones.manage'))
  with check (user_can('empresa.vacaciones.manage'));

create policy "Authenticated users with capability can delete vacations"
  on vacations for delete
  to authenticated
  using (user_can('empresa.vacaciones.manage'));
