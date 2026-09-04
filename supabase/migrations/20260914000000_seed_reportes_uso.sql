-- Seed de capacidad `monitor_uso` — módulo Monitor de Uso por Línea Operativa (sidebar propio).
-- Es una vista de auditoría (conteos reales por jefa/equipo, semáforo relativo y narrativa),
-- pensada para dirección — no para las jefas de línea. Igual que
-- 20260715185717_seed_reportes_close.sql: sin este seed, "sin reglas configuradas" deja el
-- módulo abierto a todos (ver src/lib/permissions.js:78), así que hace falta sembrar el
-- default nivel 4+/admin explícitamente. Configurable después desde el módulo Permisos.

do $$
declare
  cid text;
begin
  for cid in
    select distinct company_id::text from public.users where company_id is not null
  loop
    insert into public.module_permissions (company_id, module_key, rules) values
      (cid, 'monitor_uso',
       '{"rules":[{"all":[{"type":"min_level","value":4,"ids":[]}]}]}'::jsonb)
    on conflict (company_id, module_key) do nothing;
  end loop;
end $$;
