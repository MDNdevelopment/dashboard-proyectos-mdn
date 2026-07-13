-- Presupuesto mensual para campañas (Ads) por cliente.
-- Nullable; se llena opcionalmente desde ClientModal. Visible a todos (no gated financiero).
alter table metric_clients
  add column if not exists campaign_budget numeric(12,2);
