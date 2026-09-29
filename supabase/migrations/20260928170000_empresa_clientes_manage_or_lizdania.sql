-- 'empresa.clientes.manage' (crear/editar/archivar clientes en Empresa → Clientes, y por
-- tanto asignar el social, el diseñador y el/los audiovisual de cada marca) quedó con una
-- regla mal formada: un solo grupo `all` con min_level ≥ 3 Y ser Nairim (nivel 2). Como
-- dentro de un grupo `all` las condiciones son AND (ver src/lib/permissions.js y la función
-- SQL public.user_can), la capability era imposible de cumplir para cualquier no-admin:
-- nadie fuera de los admins podía editar un cliente.
--
-- Se reescribe como dos grupos en OR:
--   1. nivel ≥ 3 (dirección)
--   2. usuarios específicos: Nairim Fernández y Lizdania Andrade
-- Lizdania se agrega para que pueda asignar el empleado audiovisual de cada marca
-- (metric_clients.audiovisual_ids), que solo se edita desde ese modal. La mensualidad y el
-- día de pago siguen ocultos para ella (isFinancePrivileged exige nivel ≥ 3).
update public.module_permissions
set rules = '{"deny":[],"rules":[
  {"all":[{"ids":[],"type":"min_level","value":3}]},
  {"all":[{"ids":["be1b5087-bd15-4da3-96ff-1b7b31c9d8e4","967bedeb-54fa-4da1-b975-bfc4745989d9"],"type":"user","value":1}]}
]}'::jsonb
where module_key = 'empresa.clientes.manage';
