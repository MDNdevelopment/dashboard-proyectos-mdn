-- Ajusta "publication_checks" (Chequeo) para navegación por mes con arrastre
-- ("carry-forward"): en vez de una única celda viva por (cliente, red, tipo), cada
-- publicación registrada queda asociada al mes en que se registra
-- (`period_year`/`period_month`), conservando el historial de meses anteriores.
--
-- La grilla, al navegar a un mes sin publicación nueva, muestra la fila más reciente
-- con período <= el mes elegido (arrastre — ver src/utils/chequeo.js →
-- mostRecentCheckForMonth): julio "18 jul" sigue apareciendo en agosto si no hubo
-- publicación nueva ese mes, y browsing hacia atrás sigue mostrando lo que se sabía en
-- ese momento aunque después se registre una fecha más nueva. El color de alerta sigue
-- comparándose siempre contra la fecha real de hoy (sin cambios en checkStatus).
--
-- Tabla sin filas en producción a la fecha de esta migración (feature aún no publicada
-- en el changelog) — no hace falta backfill de datos reales, solo de shape.
alter table public.publication_checks
  add column if not exists period_year int,
  add column if not exists period_month int;

update public.publication_checks
  set period_year = extract(year from last_published_at)::int,
      period_month = extract(month from last_published_at)::int
  where period_year is null and last_published_at is not null;

alter table public.publication_checks
  alter column period_year set not null,
  alter column period_month set not null;

alter table public.publication_checks
  add constraint publication_checks_period_check check (
    period_month between 1 and 12
  );

alter table public.publication_checks
  drop constraint if exists publication_checks_unique;

alter table public.publication_checks
  add constraint publication_checks_unique
  unique (client_id, network, content_type, period_year, period_month);
