-- Añade granularidad por red social a las marcas de la tarea 'plataformas' (Tareas
-- Fijas). Antes había una sola marca por (cuenta, semana); ahora hay una por cada
-- red social de metric_clients.social_links (una cuenta con Instagram+TikTok tilda
-- 2 botones independientes). Las demás tareas (metricas/grilla/artes/calendario)
-- siguen usando una sola marca por cuenta/semana: `network` queda en '' para ellas.
--
-- '' en vez de NULL: Postgres no considera dos NULL iguales en un índice UNIQUE, así
-- que dos filas de la misma tarea/semana con network=NULL no colisionarían entre sí
-- (permitiría duplicados silenciosos). '' sí participa normalmente en la unicidad.
alter table public.fixed_task_marks
  add column if not exists network text not null default '';

alter table public.fixed_task_marks
  drop constraint if exists fixed_task_marks_unique;

alter table public.fixed_task_marks
  add constraint fixed_task_marks_unique
  unique (client_id, task_key, period_year, period_month, period_week, network);

-- Limpia las marcas de 'plataformas' de la granularidad vieja (sin red, network='').
-- Quedarían huérfanas bajo la lógica nueva (computeProductividad y la grilla ahora
-- buscan marcas de plataformas por red específica) — se borran para no dejar basura
-- de la sesión de datos de prueba anterior. No afecta ninguna otra tarea.
delete from public.fixed_task_marks
  where task_key = 'plataformas' and network = '';
