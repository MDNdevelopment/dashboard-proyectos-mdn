-- Las jefas nivel 3 deben poder editar todo lo de un cliente, incluida la mensualidad
-- (monthly_fee), el día de pago y es_intercambio. Esas tres columnas solo las cambia quien
-- cumple 'finanzas.clientes.manage' (UI en ClientModal y trigger metric_clients_guard_economico),
-- que estaba en: nivel ≥ 4, departamento Administración (5) y un usuario puntual.
-- Se agrega un grupo OR con nivel ≥ 3 (cada condición en su propio grupo `all`: dentro de uno
-- son AND). Idempotente: no duplica el grupo si ya existe.
update public.module_permissions
set rules = jsonb_set(
  rules,
  '{rules}',
  coalesce(rules->'rules', '[]'::jsonb)
    || '[{"all":[{"ids":[],"type":"min_level","value":3}]}]'::jsonb
)
where module_key = 'finanzas.clientes.manage'
  and not exists (
    select 1
    from jsonb_array_elements(coalesce(rules->'rules', '[]'::jsonb)) g
    where g = '{"all":[{"ids":[],"type":"min_level","value":3}]}'::jsonb
  );
