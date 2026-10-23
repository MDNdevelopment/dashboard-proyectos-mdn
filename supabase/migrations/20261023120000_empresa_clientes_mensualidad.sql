-- 'empresa.clientes.mensualidad': capacidad de SOLO LECTURA para ver la mensualidad y el día
-- de pago de los clientes (Empresa → Clientes, ficha del cliente, ficha de línea). Editar lo
-- económico sigue siendo exclusivo de 'finanzas.clientes.manage' (trigger
-- metric_clients_guard_economico); esta capacidad no lo toca.
--
-- IMPORTANTE: el seed va en esta misma migración porque una capability sin fila queda ABIERTA
-- a todos (ver 20260924000000_create_employee_permissions.sql). Aplicar ANTES de desplegar el
-- frontend, o por un rato todos verían las mensualidades.
--
-- Dos grupos en OR (no AND: dentro de un grupo `all` las condiciones se encadenan con AND):
--   1. nivel ≥ 3 (dirección; ya veía la mensualidad vía isFinancePrivileged)
--   2. usuario: Lizdania Andrade (nivel 2)
-- Desde Empresa → Accesos se puede agregar a cualquier otro empleado.
do $$
declare
  cid text;
  v_rules jsonb := jsonb_build_object(
    'deny', '[]'::jsonb,
    'rules', jsonb_build_array(
      jsonb_build_object('all', jsonb_build_array(
        jsonb_build_object('type', 'min_level', 'value', 3, 'ids', '[]'::jsonb)
      )),
      jsonb_build_object('all', jsonb_build_array(
        jsonb_build_object('type', 'user', 'value', 1,
          'ids', jsonb_build_array('967bedeb-54fa-4da1-b975-bfc4745989d9'))
      ))
    )
  );
begin
  for cid in
    select distinct company_id::text from public.users where company_id is not null
  loop
    insert into public.module_permissions (company_id, module_key, rules)
    values (cid, 'empresa.clientes.mensualidad', v_rules)
    on conflict (company_id, module_key) do nothing;
  end loop;
end;
$$;
