-- Finanzas: ingresos extra donde MDN solo gana un margen.
--
-- Un ingreso extra (reventa o servicio de un tercero) se factura completo, pero
-- solo el margen es de MDN; el resto se le paga al tercero desde Gastos
-- operativos. Antes se cargaba como una factura normal y al distribuirla se le
-- aplicaba el reparto 72/18/10 a plata que en su mayoría no es de la agencia.
--
--   es_ingreso_extra  false por defecto: las facturas existentes no cambian.
--   margen_mdn        USD que se queda MDN (siempre en dólares, aunque se haya
--                     escrito como %). Obligatorio solo en un ingreso extra.
alter table fin_invoices
  add column if not exists es_ingreso_extra boolean not null default false,
  add column if not exists margen_mdn numeric(12,2);

alter table fin_invoices
  add constraint fin_invoices_ingreso_extra_margen
  check (
    (es_ingreso_extra and margen_mdn is not null and margen_mdn >= 0 and margen_mdn <= amount)
    or (not es_ingreso_extra and margen_mdn is null)
  );
