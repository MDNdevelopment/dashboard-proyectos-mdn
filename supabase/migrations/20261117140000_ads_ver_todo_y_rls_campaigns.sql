-- Campañas: todo el acceso pasa por capabilities (Empresa → Accesos).
--
-- (El company_id se toma de la fila ads.manage: no se escribe a mano porque Netlify lo trata como secreto
--  y el escaneo de secretos cancela el build si aparece en el repo.)
-- 1) ads.ver_todo: ver las campañas de todas las líneas. Antes era una regla fija en el código
--    (nivel >= 4, admin o users.tasks_view_all). Se siembra con el mismo alcance que tenían
--    (nivel >= 4, Juan Pedro Sierra y Andrea Garcia por tasks_view_all) más Luis Fernando González.
--    Admin siempre pasa. Ajustable desde Accesos.
-- 2) RLS de `campaigns` (Tácticas): escribir antes exigía access_level >= 3 fijo; ahora user_can('ads.manage'),
--    igual que `paid_campaigns`.

insert into public.module_permissions (company_id, module_key, rules)
select
  company_id,
  'ads.ver_todo',
  '{"deny":[],"rules":[
    {"all":[{"ids":[],"type":"min_level","value":4}]},
    {"all":[{"ids":["f498030a-77da-4160-be80-1f863ef50294"],"type":"user","value":1}]},
    {"all":[{"ids":["b0de0a55-cc32-41a5-bdbd-975102473c39"],"type":"user","value":1}]},
    {"all":[{"ids":["30185fc8-fd56-4d99-b7ae-426a5a356f1d"],"type":"user","value":1}]}
  ]}'::jsonb
from public.module_permissions
where module_key = 'ads.manage'
  and not exists (
    select 1 from public.module_permissions where module_key = 'ads.ver_todo'
  );

-- 3) Acceso completo para Luis Fernando González: además de ads.ver_todo (arriba), se le agrega
--    un grupo OR a ads.manage (crear/editar/eliminar). Se conservan los grupos que ya tenía.
update public.module_permissions
set rules = jsonb_set(
      rules,
      '{rules}',
      coalesce(rules->'rules', '[]'::jsonb)
        || '[{"all":[{"ids":["30185fc8-fd56-4d99-b7ae-426a5a356f1d"],"type":"user","value":1}]}]'::jsonb
    ),
    updated_at = now()
where module_key = 'ads.manage'
  and not (rules::text like '%30185fc8-fd56-4d99-b7ae-426a5a356f1d%');

drop policy if exists campaigns_insert on public.campaigns;
drop policy if exists campaigns_update on public.campaigns;
drop policy if exists campaigns_delete on public.campaigns;

create policy campaigns_insert on public.campaigns
  for insert to authenticated with check (public.user_can('ads.manage'));
create policy campaigns_update on public.campaigns
  for update to authenticated using (public.user_can('ads.manage'));
create policy campaigns_delete on public.campaigns
  for delete to authenticated using (public.user_can('ads.manage'));
