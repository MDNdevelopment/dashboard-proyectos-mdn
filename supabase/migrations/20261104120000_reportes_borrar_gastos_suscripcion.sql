-- Los gastos de suscripciones asignadas a una línea dejaron de sembrarse solos en el reporte
-- mensual: cada línea carga sus gastos a mano. Esta migración borra las filas que ya habían
-- quedado guardadas (marcadas con fuente = 'suscripcion' en finanzas.gastosOperativos);
-- las demás filas del reporte no se tocan.
--
-- Operación destructiva: aplicar solo con confirmación del desarrollador.
update public.metric_reports r
set data = jsonb_set(
  r.data,
  '{finanzas,gastosOperativos}',
  coalesce(
    (
      select jsonb_agg(e)
      from jsonb_array_elements(r.data->'finanzas'->'gastosOperativos') e
      where e->>'fuente' is distinct from 'suscripcion'
    ),
    '[]'::jsonb
  )
)
where jsonb_typeof(r.data->'finanzas'->'gastosOperativos') = 'array'
  and exists (
    select 1
    from jsonb_array_elements(r.data->'finanzas'->'gastosOperativos') e
    where e->>'fuente' = 'suscripcion'
  );
