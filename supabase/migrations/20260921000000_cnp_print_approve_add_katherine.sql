-- Suma a Katherine Mora al grant de `cnp.print.approve` (aprobación del doble check de
-- impresión de CNP, ver 20260901000000_create_cnp.sql), junto a Paola Urdaneta y
-- Stephanie Portillo — mismo criterio de la regla ya sembrada (rules.rules[0].all[0], tipo
-- "user"). No se toca la regla en sí, solo se agrega su user_id al arreglo `ids`.
update public.module_permissions
set rules = jsonb_set(
  rules,
  '{rules,0,all,0,ids}',
  (rules #> '{rules,0,all,0,ids}') || '["b5ab09f3-9c67-472b-9bed-48b5ca91adab"]'::jsonb
)
where module_key = 'cnp.print.approve'
  and not (rules #> '{rules,0,all,0,ids}') @> '["b5ab09f3-9c67-472b-9bed-48b5ca91adab"]'::jsonb;
