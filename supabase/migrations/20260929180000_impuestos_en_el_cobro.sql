-- ─────────────────────────────────────────────────────────────────────────────
-- Las retenciones se marcan al COBRAR, no en el perfil del cliente.
--
-- La migración anterior (`20260929170000`) las puso como configuración de la
-- marca, en `metric_clients.ret_*`, y de ahí se copiaban a la facturación de
-- cada mes. No calza con la realidad: un mismo cliente varía el ISLR entre 5% y
-- 2% de un mes a otro, así que un valor fijo en su ficha envejece mal y —peor—
-- invita a facturar con la tasa equivocada porque "ya venía puesta". La
-- retención real se conoce cuando el cliente paga y entrega su comprobante.
--
-- A partir de aquí los tres checks viven únicamente en el modal de registrar
-- cobro (`CobroModal.jsx`), que los escribe en la factura. Para no obligar a
-- recordar qué se usó, el modal los precarga con lo que esa marca retuvo la
-- última vez, leyéndolo del historial de `fin_invoices` — una sugerencia, no una
-- configuración que haya que mantener.
--
-- `fin_invoices.ret_*` NO SE TOCA: sigue siendo donde se guardan (son de la
-- factura, no de cada abono) y toda la aritmética del neto queda igual. Lo que
-- se elimina son las columnas gemelas de `metric_clients`, que quedan sin uso.
--
-- Seguro de aplicar: ningún cliente tenía retenciones configuradas (verificado
-- antes de escribir esta migración), así que el drop no pierde información.
-- `es_intercambio` y su CHECK se conservan — eso sí es un atributo de la marca.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. La guarda por columna deja de vigilar las retenciones ─────────────────
-- VA PRIMERO: la función referencia `new.ret_isl` y compañía, así que si se
-- dropearan las columnas con la versión vieja en pie, el trigger reventaría en
-- el siguiente update de cualquier cliente.
create or replace function public.metric_clients_guard_economico()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  econ_cols text[] := array['monthly_fee','payment_day','es_intercambio'];
  econ_changed  boolean;
  otros_changed boolean;
begin
  -- Cron, service_role y funciones SECURITY DEFINER sin JWT no son un usuario
  -- pidiendo permiso (p. ej. apply_due_client_line_moves): pasan de largo.
  if auth.uid() is null then
    return new;
  end if;

  if tg_op = 'INSERT' then
    econ_changed := coalesce(new.monthly_fee, 0) <> 0
                 or new.payment_day is not null
                 or new.es_intercambio;
    otros_changed := true;
  else
    econ_changed := new.monthly_fee    is distinct from old.monthly_fee
                 or new.payment_day    is distinct from old.payment_day
                 or new.es_intercambio is distinct from old.es_intercambio;
    -- Todas las columnas MENOS las económicas, en bloque: una columna que se
    -- agregue en el futuro queda protegida por defecto, que es el lado seguro.
    otros_changed := (to_jsonb(new) - econ_cols) is distinct from (to_jsonb(old) - econ_cols);
  end if;

  if econ_changed and not public.user_can('finanzas.clientes.manage') then
    raise exception 'Solo Finanzas puede modificar los datos económicos de un cliente'
      using errcode = '42501';
  end if;

  if otros_changed and not public.user_can('empresa.clientes.manage') then
    raise exception 'No tienes permiso para modificar los datos del cliente'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

-- ── 2. Fuera los CHECK de las columnas que se van ────────────────────────────
alter table public.metric_clients
  drop constraint if exists metric_clients_ret_isl_rate_chk,
  drop constraint if exists metric_clients_ret_iva_rate_chk,
  drop constraint if exists metric_clients_ret_isl_coherente_chk,
  drop constraint if exists metric_clients_ret_iva_coherente_chk;

-- ── 3. Fuera las columnas ────────────────────────────────────────────────────
alter table public.metric_clients
  drop column if exists ret_isl,
  drop column if exists ret_isl_rate,
  drop column if exists ret_iva,
  drop column if exists ret_iva_rate,
  drop column if exists ret_municipal;

-- Se conservan, porque siguen teniendo sentido:
--   • es_intercambio + metric_clients_intercambio_sin_fee_chk
--   • la capability finanzas.clientes.manage (ahora cubre mensualidad, día de
--     pago e intercambio)
--   • la policy metric_clients_manage_update y el trigger de arriba
--   • TODAS las columnas ret_* de fin_invoices
