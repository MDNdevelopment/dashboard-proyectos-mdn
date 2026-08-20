-- Revierte la periodización de "publication_checks" (Chequeo): vuelve al diseño de
-- celda viva original (una sola fila por client_id/network/content_type, sobrescrita
-- en cada publicación nueva) en vez de una fila por mes con arrastre. La página deja de
-- navegarse por mes: siempre muestra el estado más reciente, recalculado contra la
-- fecha de hoy en cada carga (ver src/utils/chequeo.js → checkStatus).
--
-- Antes de quitar `period_year`/`period_month` se colapsan filas duplicadas de la
-- misma celda (una por mes) a la más reciente por `last_published_at`, para no violar
-- la unique constraint original al recrearla.
delete from public.publication_checks a
  using public.publication_checks b
  where a.client_id = b.client_id
    and a.network = b.network
    and a.content_type = b.content_type
    and (
      a.last_published_at < b.last_published_at
      or (a.last_published_at = b.last_published_at and a.id < b.id)
    );

alter table public.publication_checks
  drop constraint if exists publication_checks_unique;

alter table public.publication_checks
  drop constraint if exists publication_checks_period_check;

alter table public.publication_checks
  drop column if exists period_year,
  drop column if exists period_month;

alter table public.publication_checks
  add constraint publication_checks_unique
  unique (client_id, network, content_type);
