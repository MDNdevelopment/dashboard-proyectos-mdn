-- Resultados de un Ad (pauta pagada) capturados al marcarlo como Finalizado.
-- Nullable: ads existentes y ads no finalizados no los tienen. Sin CHECK,
-- coherente con el resto de columnas de paid_campaigns.
alter table public.paid_campaigns
  add column if not exists reach         integer,
  add column if not exists interactions  integer,
  add column if not exists followers     integer,
  add column if not exists impressions   integer;
