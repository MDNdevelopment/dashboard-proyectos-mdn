-- Cobro mixto: una factura puede saldarse parte en dinero y parte en intercambio (canje).
--
-- Un abono en intercambio es un fin_payments con currency = 'Intercambio'. Salda la
-- factura (estadoFactura / pendienteDe) pero NO es caja: no lleva monto en Bs ni tasa,
-- y el trigger fin_payment_sync_bs ya lo ignora (solo genera libro con currency = 'Bs').
-- RLS sin cambios: sigue bajo finanzas.cobros.manage.

alter table public.fin_payments
  drop constraint if exists fin_payments_currency_check;

alter table public.fin_payments
  add constraint fin_payments_currency_check
  check (currency in ('USD', 'Bs', 'Intercambio'));

alter table public.fin_payments
  add constraint fin_payments_intercambio_sin_bs
  check (currency <> 'Intercambio' or (amount_bs is null and rate is null and rate_source is null));
