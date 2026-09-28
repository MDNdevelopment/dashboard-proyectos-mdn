-- Facturación en bolívares: monto en Bs + tasa de referencia (no derivan `amount`,
-- que sigue siendo USD siempre — son solo el dato para relacionar el pago cuando
-- llegue). Mismo patrón que `fin_distributions_bs_complete` de la migración
-- 20260928100000_finanzas_divisas_bs.sql, sin trigger de derivación: acá `amount`
-- se escribe a mano, no se calcula desde `amount_bs`/`rate`.

alter table public.fin_invoices
  add column amount_bs numeric(18,2) check (amount_bs > 0),
  add column rate      numeric(18,4) check (rate > 0);

alter table public.fin_invoices
  add constraint fin_invoices_bs_complete
  check (currency = 'USD' or (amount_bs is not null and rate is not null));
