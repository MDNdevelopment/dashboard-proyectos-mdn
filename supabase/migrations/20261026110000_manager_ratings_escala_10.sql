-- Evaluación del jefe: la escala pasa de 1–5 a 1–10 (la nota general también va sobre 10;
-- ver docs/arquitectura/evaluaciones.md).
--
-- 1. `promedio` pasa de numeric(3,2) a numeric(4,2) para admitir 10.00, y el CHECK de 1–5
--    pasa a 1–10.
-- 2. Las evaluaciones ya cargadas (escala 1–5) se convierten multiplicando por 2: tanto
--    `promedio` como el `score` de cada item de `items`. Así toda la tabla queda con un
--    único significado y el código no necesita distinguir "evaluaciones viejas".
--
-- OJO: la conversión NO es idempotente (correrla dos veces duplicaría las notas). Va dentro
-- de la misma transacción que el cambio de CHECK, que se aplica una sola vez.
-- Aplicar junto con el despliegue del código que pide notas de 1 a 10: si el código se
-- despliega antes, las evaluaciones viejas se ven con la mitad de su nota.
-- NO aplicar a producción sin confirmación del desarrollador.

alter table public.manager_ratings
  drop constraint if exists manager_ratings_promedio_check;

alter table public.manager_ratings
  alter column promedio type numeric(4, 2);

update public.manager_ratings
set
  promedio = promedio * 2,
  items = coalesce(
    (
      select jsonb_agg(
        case
          when i ->> 'score' is null then i
          else jsonb_set(i, '{score}', to_jsonb(((i ->> 'score')::numeric) * 2))
        end
        order by ord
      )
      from jsonb_array_elements(items) with ordinality as t(i, ord)
    ),
    '[]'::jsonb
  );

alter table public.manager_ratings
  add constraint manager_ratings_promedio_check
  check (promedio >= 1 and promedio <= 10);
