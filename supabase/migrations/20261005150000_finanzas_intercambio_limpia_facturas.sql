-- Finanzas → marcas en intercambio: limpiar la facturación ya emitida.
--
-- Al marcar una marca como intercambio (`es_intercambio` false → true) el filtro de
-- `invoiceRowsForNewMonth()` solo impide que se le generen facturas NUEVAS; las que ya
-- estaban emitidas seguían en la tabla de Facturación con su monto (caso Lavoflux y
-- Montana, 2026-10-05). Este trigger las quita en el mismo guardado.
--
-- Qué se borra: facturas de esa marca en meses ABIERTOS que no tengan cobros ni
-- distribuciones. Qué se respeta:
--   • meses cerrados: ya hay un trigger que los protege (fin_block_closed_month) y,
--     además, son historia contable;
--   • facturas con cobros o distribuciones: ya tocaron caja o partidas, así que borrarlas
--     la desbalancearía (fin_payments se borra en cascada); alguien debe resolverlas a mano.
--
-- Se hace en la base y no en la app porque quien marca el intercambio tiene
-- `finanzas.clientes.manage`, que no implica `finanzas.facturacion.manage`: desde el
-- cliente el borrado fallaría para esa persona. SECURITY DEFINER hace que el borrado no
-- dependa de la RLS de fin_invoices; el permiso que se exige sigue siendo el del UPDATE de
-- la marca (metric_clients_guard_economico).

create or replace function public.metric_clients_limpia_facturas_intercambio()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.fin_invoices i
  using public.fin_months m
  where i.client_id = new.id
    and m.id = i.month_id
    and not coalesce(m.closed, false)
    and not exists (select 1 from public.fin_payments p where p.invoice_id = i.id)
    and not exists (select 1 from public.fin_distributions d where d.invoice_id = i.id);

  return null;
end;
$$;

comment on function public.metric_clients_limpia_facturas_intercambio() is
  'AFTER UPDATE OF es_intercambio (false → true): borra las facturas de la marca en meses abiertos sin cobros ni distribuciones. Ver 20261005150000.';

drop trigger if exists metric_clients_limpia_facturas_intercambio on public.metric_clients;
create trigger metric_clients_limpia_facturas_intercambio
  after update of es_intercambio on public.metric_clients
  for each row
  when (new.es_intercambio and not old.es_intercambio)
  execute function public.metric_clients_limpia_facturas_intercambio();
