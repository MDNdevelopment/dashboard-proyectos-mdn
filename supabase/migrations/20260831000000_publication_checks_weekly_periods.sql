-- Periodiza "publication_checks" (Chequeo) por semana fija del mes (misma noción de
-- semana que fixed_task_marks/utils/fixedTasks.js → buildFixedWeeks: semanas ancladas al
-- miércoles, 1-indexadas dentro del mes, 4 o 5 según el mes).
--
-- Esto ya se intentó en 20260821000001 y se revirtió en 20260821000002 porque el
-- semáforo de entonces medía "días desde hoy" contra una única fecha viva — periodizar
-- rompía esa cuenta. Ahora el semáforo pasa a ser "cumplimiento de la semana" (¿hubo
-- registro en esa semana sí/no?, ver src/utils/chequeo.js → weekCheckStatus), que no
-- depende de la fecha de hoy, así que periodizar ya no genera esa contradicción.
--
-- Cada celda (cliente × red × tipo de contenido) pasa a tener una fila por semana en la
-- que se registró/corrigió una publicación, en vez de una única fila sobrescrita —
-- mismo patrón que fixed_task_marks (period_year/period_month/period_week).
create or replace function public.fixed_week_of(d date)
returns int
language sql
immutable
as $$
  -- Nº de miércoles (1-indexado) del mes de `d` con fecha <= d + 2 días, acotado al
  -- total de miércoles del mes. Replica utils/fixedTasks.js → buildFixedWeeks: cada
  -- semana "pertenece" a su miércoles, y cubre hasta el domingo siguiente ese miércoles
  -- (miércoles + 4 días) — por eso el tope de pertenencia es miércoles + 2 (viernes)
  -- salvo la última semana del mes, que arrastra el resto de días hasta fin de mes.
  with month_weds as (
    select generate_series(
             date_trunc('month', d)::date,
             (date_trunc('month', d) + interval '1 month - 1 day')::date,
             interval '1 day'
           )::date as day
  ),
  weds as (
    select day, row_number() over (order by day) as n
    from month_weds
    where extract(dow from day) = 3
  )
  select coalesce(
    (select n from weds where day <= d + 2 order by day desc limit 1),
    1
  )
$$;

alter table public.publication_checks
  add column if not exists period_year int,
  add column if not exists period_month int,
  add column if not exists period_week int;

update public.publication_checks
  set period_year = extract(year from coalesce(last_published_at, current_date))::int,
      period_month = extract(month from coalesce(last_published_at, current_date))::int,
      period_week = public.fixed_week_of(coalesce(last_published_at, current_date))
  where period_year is null;

alter table public.publication_checks
  alter column period_year set not null,
  alter column period_month set not null,
  alter column period_week set not null;

alter table public.publication_checks
  add constraint publication_checks_period_month_check check (
    period_month between 1 and 12
  ),
  add constraint publication_checks_period_week_check check (
    period_week between 1 and 5
  );

alter table public.publication_checks
  drop constraint if exists publication_checks_unique;

alter table public.publication_checks
  add constraint publication_checks_unique
  unique (client_id, network, content_type, period_year, period_month, period_week);

create index if not exists publication_checks_company_line_period_idx
  on public.publication_checks (company_id, line_id, period_year, period_month);

-- `publication_check_events` queda en desuso: con una celda por semana, el conteo de
-- «Actualización de Plataformas» sale de publication_checks (ver utils/chequeo.js →
-- computePlataformasProductividad). Ya no tiene lectores ni escritores en el código.
drop table if exists public.publication_check_events;
