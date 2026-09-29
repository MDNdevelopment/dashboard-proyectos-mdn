-- Abrir el mes deja de ser un paso manual.
--
-- La fila de `fin_months` sí hace falta (es el padre de facturas, distribuciones,
-- divisas y libro de Bs; guarda el reparto vigente del mes y el flag `closed`),
-- pero pedirle a alguien que pulse "Abrir mes" no aporta nada: los meses pasan
-- igual, y desde que la facturación se reconcilia sola (migración `20260929140000`)
-- el botón era lo único que quedaba entre entrar a Facturación y ver el mes listo.
--
-- El botón existía por esta policy: crear el mes exigía `finanzas.cerrar_mes`, así
-- que crearlo al vuelo habría fallado para quien solo gestiona facturación — y
-- fallaba en silencio, porque el botón se mostraba con `finanzas.facturacion.manage`
-- (FinanzasPage.jsx pasa `canManage={canManageFacturacion}`) mientras el insert
-- pedía la otra capability. Con ambas sembradas a nivel 4+ nadie lo notó, pero
-- bastaba separarlas en Empresa → Accesos para que el botón no hiciera nada.
--
-- CREAR un mes y CERRARLO son decisiones de peso muy distinto: crear solo abre el
-- periodo en blanco (con el reparto por defecto), cerrar congela el mes para
-- siempre — el trigger `fin_block_closed_month()` rechaza toda escritura posterior.
-- Por eso el insert pasa a `finanzas.facturacion.manage` y el cierre (un UPDATE de
-- `closed`) sigue exclusivo de `finanzas.cerrar_mes` — la policy de UPDATE
-- (`fin_months_update_pcts`, migración `20260918205117`) no se toca.
drop policy "fin_months_insert" on public.fin_months;

create policy "fin_months_insert" on public.fin_months
  for insert to authenticated
  with check (user_can('finanzas.cerrar_mes') or user_can('finanzas.facturacion.manage'));
