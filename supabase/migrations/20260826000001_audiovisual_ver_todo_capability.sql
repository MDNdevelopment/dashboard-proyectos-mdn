-- Nueva capability 'audiovisual.ver_todo': separa "ver pautas de todas las líneas" de
-- "audiovisual.coordina" (agendar/declinar/marcar realizada). Antes cualquier
-- coordinador del depto Audiovisual (nivel≥2) veía automáticamente todas las líneas en
-- Solicitudes/Agenda/Realizadas; ahora eso queda acotado a dirección (nivel≥4, sin
-- cambios — ver AudiovisualView.jsx), admin (bypass automático de user_can), o quien
-- tenga esta capability explícita — configurable desde Empresa → Permisos como cualquier
-- otra (se registró en src/config/modules.js → tareas.manageActions).
--
-- Seed: solo Lizdania (coordinadora real de Audiovisual) por ahora.
insert into public.module_permissions (company_id, module_key, rules)
select company_id, 'audiovisual.ver_todo',
  '{"rules":[{"all":[{"type":"user","ids":["967bedeb-54fa-4da1-b975-bfc4745989d9"]}]}]}'::jsonb
from public.module_permissions
where module_key = 'audiovisual.coordina'
on conflict (company_id, module_key) do update set rules = excluded.rules;
