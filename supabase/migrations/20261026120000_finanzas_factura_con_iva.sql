-- Finanzas: el IVA se suma sobre la mensualidad en las facturas fiscales.
--
-- Hasta ahora `fin_invoices.amount` se leía como monto con IVA incluido (base =
-- amount / 1,16). Administración pide que la base imponible sea siempre la
-- mensualidad (p. ej. $625) y que el IVA 16% se sume encima ($725 de total).
--
--   null  = factura anterior a esta columna → sigue leyéndose con IVA incluido,
--           para que los meses ya cuadrados no cambien.
--   true  = factura fiscal: `amount` es la base y el IVA se suma.
--   false = sin factura fiscal: se cobra `amount` tal cual, sin retenciones.
alter table fin_invoices
  add column if not exists factura_con_iva boolean;

-- No puede haber retenciones en una factura marcada como no fiscal.
alter table fin_invoices
  add constraint fin_invoices_retenciones_requieren_iva
  check (
    factura_con_iva is distinct from false
    or not (coalesce(ret_isl, false) or coalesce(ret_iva, false) or coalesce(ret_municipal, false))
  );
