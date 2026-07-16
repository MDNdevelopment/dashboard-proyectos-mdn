-- Dos indicadores nuevos para los resultados de un Ad (pauta pagada), sumados a los
-- 4 existentes (reach, interactions, followers, impressions) de 20260719000000_add_ads_results.sql.
-- Nullable, sin CHECK, mismo patrón que el resto de columnas de resultados: ahora el
-- usuario elige cuáles de los 6 indicadores capturar al finalizar (mínimo 1), así que
-- todos deben poder quedar en null.
alter table public.paid_campaigns
  add column if not exists views          integer,
  add column if not exists profile_visits integer;
