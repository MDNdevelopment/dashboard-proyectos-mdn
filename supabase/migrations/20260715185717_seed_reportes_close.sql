-- Seed de capacidad `reportes.close` — nivel 4+ (o admin) puede cerrar permanentemente
-- un reporte de Métricas (Operaciones + Finanzas de una línea/mes). Sigue el mismo
-- patrón de 20260706000002_seed_capability_defaults.sql: un insert por company_id
-- existente, ON CONFLICT DO NOTHING para no pisar configuraciones ya guardadas por
-- el admin desde el módulo Permisos.

do $$
declare
  cid text;
begin
  for cid in
    select distinct company_id::text from public.users where company_id is not null
  loop
    insert into public.module_permissions (company_id, module_key, rules) values
      (cid, 'reportes.close',
       '{"rules":[{"all":[{"type":"min_level","value":4,"ids":[]}]}]}'::jsonb)
    on conflict (company_id, module_key) do nothing;
  end loop;
end $$;
