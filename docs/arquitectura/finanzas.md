### 2.15 Finanzas

## Resumen

Módulo de **nivel empresa**: facturación real de la agencia, cobranza y reparto del dinero cobrado en tres partidas (Gastos operativos / Socios / Ganancia, % por mes). Circuito: facturar el mes → cobrar (abonos parciales, en Bs o divisa) → distribuir cada cobro en partidas → pagar contra el saldo de cada partida; cierre mensual; saldos de partida que se arrastran mes a mes. El USD es la unidad de cuenta; la Caja Bs y las divisas dan visibilidad de la composición.
- No confundir con el `finanzas` embebido en `metric_reports.data` (§2.5, captura manual de ingresos/gastos por línea y mes, `src/components/metricas/FinanzasView.jsx`).

## Rutas

- `/finanzas` (Dashboard) · `/finanzas/facturacion` · `/finanzas/clientes` · `/finanzas/distribucion` (+ drill-down `/finanzas/distribucion/:partida`) · `/finanzas/movimientos`. Las rutas de tabs retiradas (`/finanzas/divisas`, `/finanzas/caja-bs`, `/finanzas/por-cobrar`) redirigen a `/finanzas` conservando `?mes` (`FinanzasRedirect` en `main.jsx`).
- Mes activo en query param `?mes=YYYY-MM` (mismo patrón que `?line=` en Ads).
- Sidebar: botón directo "Finanzas", gateado por `canR('finanzas')`.

## Archivos

- `src/pages/FinanzasPage.jsx` — orquestador multi-tab (patrón de `EmpresaPage.jsx`), centraliza la carga del mes activo (`fetchPeriod`), canal realtime `finanzas-view`.
- `src/components/finanzas/finanzasApi.js` — capa de datos: `closeMonth()`, `updateMonthPcts()`, `createSummaryMonth()`, `syncMonthInvoices()`, `loadOrCreateMonth()`, `resolveRateBcv()`, `upsertRate`, `loadUltimasRetenciones()`, `createDistributionsBatch()`, `addInvoiceExclusion`, `clearInvoiceExclusions`, `loadInvoiceExclusions`, `loadInvoicesUpTo`, `loadDistributionsUpTo`, `loadAllMonthTotals()`.
- `src/components/finanzas/constants.js` — `PARTIDAS`, `PARTIDA_KEYS`, `PARTIDAS_PCT_DEFAULT`, métodos de pago (`METODOS_PAGO_USD`/`METODOS_PAGO_BS`), conceptos sugeridos, `CATEGORIAS_GASTO`, `NOTA_TRASPASO_PARTIDA`.
- `src/utils/finanzas.js` — toda la aritmética, pura, testeada en `src/test/finanzas.test.js`.
- `src/utils/retenciones.js` — aritmética de retenciones.
- `src/utils/cobroPagos.js` — lógica pura de la lista de pagos de `CobroModal.jsx` (reparto entre dinero e intercambio, autocompletado, validación, filas para `addPaymentsBatch`).
- `src/utils/clientInMonth.js` — compartido con Reportes/Métricas/Tareas/Ads/Chequeo.
- `src/hooks/useCoalescedRefetch.js` — agrupa ráfagas realtime.
- Vistas en `src/components/finanzas/`: `DashboardView`, `FacturacionView`, `ClientesView`, `DistribucionView`, `PartidaView`, `MovimientosView`.
- Modales/componentes: `InvoiceModal.jsx`, `CobroModal.jsx`, `DistribucionModal.jsx`, `PagoPartidaModal.jsx`, `ClienteFinanzasModal.jsx`, `PartidasPctEditor.jsx`, `ResumenMesModal.jsx`.
- `netlify/functions/bcv-rate.js` — tasa BCV en vivo (`/api/bcv-rate`), gate `finanzas`, sin caché propia; fallback automático `pydolarve.org` → `ve.dolarapi.com`.
- Seed histórico `supabase/seed/finanzas_202608.sql`: ya NO refleja la BD; no aplicarlo sin confirmar con el usuario.

## Datos

- `fin_months`: `company_id, year, month, closed, closed_at, closed_by, pct_gastos, pct_socios, pct_ganancia, summary_only`; `unique(company_id,year,month)`. Padre de `fin_invoices`/`fin_distributions`/`fin_fx_operations`/`fin_bs_ledger`/`fin_month_totals`; guarda el reparto del periodo y el `closed`.
- `fin_invoices`: `month_id→fin_months`, `client_id→metric_clients` (nullable = cliente externo), `client_name` (snapshot), `concept, amount, currency, recurring`, `amount_bs, rate` (solo referencia), `ret_*` (retenciones). `check (amount >= 0)` (0 = "Sin monto").
- `fin_payments`: `invoice_id→fin_invoices, paid_on, amount, amount_bs, rate, method, note, currency, rate_source` (`'bcv'`|`'manual'`). `currency` ∈ `'USD'|'Bs'|'Intercambio'`; un abono en intercambio (canje) no lleva `amount_bs`/`rate`/`rate_source` (CHECK `fin_payments_intercambio_sin_bs`). Sin policy de UPDATE: inmutables (solo alta/baja).
- `fin_distributions`: `month_id, partida` (`gastos|socios|ganancia` + técnica `'cambio'`), `kind` (`in|out`), `moved_on, concept, beneficiary, amount, note, invoice_id→fin_invoices` (nullable), `currency, amount_bs, rate, fx_operation_id`.
- `fin_month_totals`: `month_id→fin_months` (PK), `total_facturado, total_cobrado, total_gastos, total_socios, total_ganancia, note`, + snapshot de divisas `total_divisa_fisica, saldo_bs, saldo_bs_usd_ref, resultado_cambio`.
- `fin_invoice_exclusions`: `company_id, client_id→metric_clients, year, month`, unique.
- `fin_rates`: BCV por fecha.
- `fin_fx_operations`: compras/ventas de divisas; **inmutable** (sin UPDATE: corregir = borrar y re-registrar); tiene `month_id`.
- `fin_bs_ledger`: libro único y ACUMULADO de la Caja Bs (nunca se cierra por mes; se filtra por mes solo para consultar). `source`: `cobro`, `pago_directo`, `compra_divisa`, `venta_divisa`, `ajuste`.
- De `metric_clients` (sin maestro propio de clientes): `monthly_fee`, `payment_day`, `es_intercambio`, `line_id`, `mdn_since`/`contract_end`/`deleted_at`, vía `loadClients`/`loadLines` de `metricsApi.js`. CHECK: `es_intercambio` exige `monthly_fee` = 0.

## Permisos

- Capability de módulo `finanzas`; por tab: `finanzas.dashboard`, `.facturacion`, `.clientes`, `.distribucion`, `finanzas.movimientos` (nivel 4+).
- Escritura (seis): `finanzas.facturacion.manage`, `finanzas.cobros.manage`, `finanzas.distribucion.manage`, `finanzas.cerrar_mes`, `finanzas.partidas.manage`, `finanzas.clientes.manage`.
- **Todas las `finanzas.*` comparten las reglas de `finanzas`** (min_level 4 + excepción del departamento Administración); quien entra al módulo entra a todo. Una capability nueva del módulo debe sembrarse con las reglas de `finanzas`, no con el default. Ajustables desde Empresa → Accesos (`module_permissions`), sin allowlist hardcodeado.
- Gotcha: una capability sin fila en `module_permissions` queda ABIERTA a todos; por eso los renombres (p. ej. `finanzas.cajabs` → `finanzas.divisas`) se hacen con `update`, nunca borrar+recrear.
- Reutilizaciones: `fin_month_totals`/mes resumen → `finanzas.cerrar_mes`; escritura de tasa → `finanzas.distribucion.manage`.
- `fin_months`: INSERT con `finanzas.facturacion.manage` (crear el mes al vuelo); UPDATE (`closed`, %) con `finanzas.cerrar_mes` (policy `fin_months_update_pcts`). Crear ≠ cerrar.
- `fin_payments` exige `finanzas.cobros.manage`; `fin_invoices` exige `finanzas.facturacion.manage` → registrar un cobro con retenciones necesita ambas (si se separan, el modal muestra el 42501).
- `finanzas.clientes.manage` se hace cumplir en BD: policy de UPDATE de `metric_clients` = `empresa.clientes.manage OR finanzas.clientes.manage`, y el trigger `metric_clients_guard_economico()` decide por columna: económicas (`monthly_fee`, `payment_day`, `es_intercambio`) exigen `finanzas.clientes.manage`; cualquier otra exige `empresa.clientes.manage` (rama obligatoria: RLS es por fila). Se eligió trigger y no RPC `SECURITY DEFINER` porque `updateClient()` seguiría abierto a `empresa.clientes.manage`. Deja pasar `auth.uid() is null` (cron, `service_role`). Ni `empresa.clientes.manage` alcanza para lo económico.
- Gotcha `ClientModal.jsx` (Empresa): manda el payload COMPLETO; sin la capability debe reenviar los valores económicos previos tal cual, o dispara 42501 y rompe la edición para todos.
- Movimientos no recibe ninguna capability de escritura.

## Reglas de negocio

### Estado de factura y mes cerrado
- Estado (`pendiente`/`abonado`/`cobrado`) siempre derivado de la suma de `fin_payments` (`estadoFactura()`), nunca columna.
- Trigger `fin_block_closed_month()` rechaza insert/update/delete en `fin_invoices`, `fin_payments` (mes resuelto vía su factura, rama aparte), `fin_distributions`, `fin_fx_operations` y `fin_month_totals` si `fin_months.closed`. Vale también por API/MCP.
- `fin_bs_ledger` NO lleva ese trigger (un BEFORE DELETE abortaría cascades legítimos); para `source='ajuste'` el chequeo de mes abierto va en el `WITH CHECK` de la policy de insert/delete.

### Facturación fija del mes (`syncMonthInvoices`)
- `finanzasApi.syncMonthInvoices({ companyId, monthId, year, month, clients, userId })` es un **reconciliador**: inserta solo lo que falta para que el mes tenga la facturación de todos sus clientes activos, vía la pura `invoiceRowsForNewMonth()`.
- Lo corre `FacturacionView.jsx` en un `useEffect` al entrar a un mes no cerrado con `finanzas.facturacion.manage` (guardado por un ref por periodo); el mismo efecto crea `fin_months` con `loadOrCreateMonth()` si no existe ("Preparando el mes…"). No hay botón "Abrir mes". Sin permiso: aviso de que el mes se carga cuando entre alguien con permiso.
- Solo mes en curso y anteriores (`esMesPreparable()`): navegar a un mes futuro no lo materializa. El aviso de mes futuro exige además `!finMonth` (el mes siguiente creado por `closeMonth()` se ve normal).
- Monto por prioridad: (1) factura `recurring` del mes anterior tal cual (montos/conceptos ajustados, con `amount_bs`/`rate`; como el carry-forward de `initMetricReport.js`); (2) `monthly_fee`; (3) 0 = "Sin monto" (badge ámbar + aviso con nombres, para editar el monto).
- Se descartan: marcas dadas de baja (`clientInMonth` falso), `es_intercambio`, cargos puntuales (`recurring: false`), clientes con exclusión vigente. Cargos externos (sin `client_id`) del mes anterior se copian solo si el mes está VACÍO.
- La factura sale a inicio de mes; la cobranza es 100% manual (`CobroModal.jsx`).
- Cambiar una marca a intercambio borra su facturación ya emitida en meses ABIERTOS sin cobros ni distribuciones: trigger `metric_clients_limpia_facturas_intercambio` (AFTER UPDATE OF `es_intercambio` false→true, SECURITY DEFINER para no depender de `finanzas.facturacion.manage`; migración `20261005150000`). Las facturas con cobros o en meses cerrados se conservan; el modal lo avisa.

### Exclusiones de facturación
- Borrar en `FacturacionView.jsx` un cargo con `client_id` inserta exclusión (`addInvoiceExclusion`); `InvoiceModal.jsx` la levanta al volver a facturar a esa marca (`clearInvoiceExclusions`).
- Aplica de su mes en adelante (`loadInvoiceExclusions` filtra `(year, month) <= mes consultado`).
- Cargo externo borrado: no genera exclusión (tampoco se recrea).

### Cartera de clientes
- Tab Clientes: click en fila → `ClienteFinanzasModal.jsx`, solo financiero (mensualidad, día de pago, intercambio); contactos/redes/equipo siguen en Empresa → Clientes; impuestos NO se configuran aquí. Gate `finanzas.clientes.manage`; único camino para esos campos.
- `metric_clients.es_intercambio` (canje): no paga en dinero; fuera de la facturación fija, del total y del % de cartera. El filtro vive en `invoiceRowsForNewMonth()`, NO en `clientInMonth()` (que responde "¿existía la cuenta este mes?" y lo usan Métricas, Tareas, Ads y Chequeo).
- `clientInMonth()` decide qué clientes facturan; el Dashboard lo reutiliza en la card "Movimiento de cartera" (`movimientoCartera()`: cartera activa del mes vs anterior, sin capturar altas/bajas a mano).

### Retenciones (impuestos)
- ISL 5%|2%, IVA 75%|100%, municipal 1%, opcionales; se marcan al registrar el cobro (`CobroModal.jsx`) y se guardan en la factura (`fin_invoices.ret_*`). No son configuración de la marca.
- Precarga con lo que la marca retuvo la última vez (`loadUltimasRetenciones()`, lee historial de `fin_invoices`); es sugerencia.
- Son de la FACTURA: un segundo abono hereda las de su factura.
- Orden de guardado: primero la factura, después el pago (al revés, un fallo deja deuda fantasma).
- Fórmulas (`src/utils/retenciones.js`): `amount` ya incluye IVA; `base = amount/1.16`, `retIVA = (amount−base)×tasa`, `retISL = base×tasa`, `retMun = base×0.01`, `neto = amount − Σ`, cada línea redondeada a céntimos. Ej.: $1.000 con 5%/75%/1% → base 862,07 · IVA 137,93 · 103,45 + 43,10 + 8,62 → neto 844,83.
- Sin retenciones el neto = `amount` (no hay backfill).
- Contra el neto: `pendienteDe`, `estadoFactura`, `totalPorCobrar`, `tasaCobranza`. NO cambian (usan `fin_payments`, que ya entraron netos): distribución en partidas, Movimientos, `cuadreDivisas()`. `totalFacturado` sigue siendo el bruto.

### Moneda y cobros
- Toda la aritmética en USD (`fin_invoices.amount`). En `InvoiceModal.jsx` y `CobroModal.jsx` el monto se escribe SIEMPRE en USD; si la moneda es Bs solo se pide/confirma la tasa.
- `fin_invoices.amount_bs` / `fin_payments.amount_bs` = `amount × tasa`, siempre derivado, nunca a mano; `rate` guarda la tasa usada.
- "Usar tasa personalizada" (precargada con la BCV) reemplaza la tasa solo para esa factura/pago (`rate_source='manual'` en pagos); nunca sobrescribe `fin_rates`. Con `source: 'missing'` el usuario solo puede usar tasa personalizada (no cargar oficial vía `upsertRate`).
- `CobroModal.jsx`: un cobro es una LISTA de pagos ("+ Agregar pago", máx. `MAX_PAGOS`); cada pago tiene forma (USD · Bs · Intercambio), monto en USD, método (`METODOS_PAGO_USD`/`METODOS_PAGO_BS`/`METODOS_PAGO_INTERCAMBIO`) y nota, y puede repetirse una forma (Zelle + Efectivo $). Todos se guardan en UN solo insert con `addPaymentsBatch()` (atómico: `fin_payments` es inmutable, un bucle de `addPayment()` podía dejar la factura abonada a medias). Los pagos en Bs comparten UNA tasa (BCV o personalizada): la fecha del cobro es una, así que la BCV del día también. Solo el ÚLTIMO pago sin tocar se autocompleta con lo que falta (neto − saldado − los demás pagos); es un valor derivado al renderizar, no un efecto; en cuanto el usuario escribe en un pago deja de autocompletarse, INCLUSO si vacía el campo (si un input vacío volviera al autocompletado, al borrar el último dígito reaparecería el monto sugerido y no se podría escribir otro); al agregar un pago el anterior se "congela". Un pago en Intercambio muestra que su monto es el equivalente en $ de lo recibido. Toda esa aritmética (autocompletado, reducer, validación, filas a guardar) es pura y vive en `src/utils/cobroPagos.js` (tests en `src/test/cobroPagos.test.js`); el modal solo pinta. La fecha por defecto usa `hoyISO()` (hora local), no `toISOString()`. Tras un cobro parcial el modal sigue abierto con un pago nuevo que trae el restante; `FacturacionView.jsx` le pasa la factura viva (`invoices.find`) y `onSaved` refresca con `refetch(false)` (con la carga visible se desmontaría el modal).
- **Cobro mixto dinero + intercambio** (no confundir con `metric_clients.es_intercambio`, que es una marca entera sin facturación en dinero): el canje SALDA la factura pero NO es caja. `cobradoDe()`/`totalCobrado()` suman solo dinero → de ahí cuelgan distribución en partidas (`sinDistribuir`, `DistribucionModal`), `divisaFisica()` (filtra `currency === 'USD'`), `cuadreDivisas()` y el `total_cobrado` del cierre. `canjeadoDe()`/`totalCanjeado()` suman el canje y `saldadoDe()`/`totalSaldado()` ambos; `pendienteDe`, `estadoFactura`, `totalPorCobrar`, `tasaCobranza` y el avance de Facturación miden contra lo saldado. `cobradoPorMoneda()` lo ignora; `cobrosPorMonedaDe()` lo agrega como `'Intercambio'` en `monedas` (su monto sale de `canjeadoDe()`, no de `usd`/`bs`).
- `cobradoPorMoneda()`: Bs vs divisa de lo cobrado (Dashboard y cards de Cobros). `facturadoPorMoneda()`: por `invoice.currency` para las cards de composición de Facturación (sin filtrar).
- `FacturacionView.jsx` tiene toggle `[Facturación | Cobros]`:
  - Facturación: todas las facturas (Cliente / Facturado / Pendiente / Estado / Acciones); sin columna de moneda, sin "Cobrado", sin filtro de moneda.
  - Cobros: solo facturas con ≥1 abono (Cliente / Facturado / Cobrado / Moneda / Estado / Acciones, sin Editar ni Eliminar); cards Total cobrado / Cobrado en divisa / Cobrado en Bs (+ "Recibido en intercambio" si hay canje); el filtro de moneda incluye Intercambio; filtro Todas/USD/Bs por la moneda en que ENTRÓ el pago vía `cobrosPorMonedaDe(invoice)` → `{ usd, bs, monedas }` (sin fallback a `invoice.currency`). Pagada en Bs → badge "Bs"; mixta → "USD + Bs" y aparece en ambos filtros. "Facturado" siempre en USD (`invoice.amount`).

### Reparto y partidas
- % por mes en `fin_months.pct_gastos/pct_socios/pct_ganancia` (default 72/18/10, `PARTIDAS_PCT_DEFAULT`); `pctsDelMes()` lee con fallback al default. Mes cerrado queda auditable contra su %.
- Edición en Distribución (`PartidasPctEditor.jsx`), gate `finanzas.partidas.manage`, deshabilitado con mes cerrado; `updateMonthPcts()` valida suma 100%.
- Saldos de partida acumulados: `saldoArrastrado()`/`saldoPartida()`.
- Dashboard "Distribución · meta vs real": % real sobre lo cobrado redondeado con `pctsEnterosPorPartida()` (resto mayor/Hamilton; `Math.round` por partida podía sumar 101%); marca de meta `meta-linea-<partida>` en `metaPct = pcts[p]*100`; excedente sobre la meta con borde + rayado diagonal (`excedente-<partida>`).
- Partida `'cambio'` (resultado por cambio): fuera de `PARTIDAS`/`PARTIDA_KEYS`, sin meta, %, ni pago; se resuelve con `partidaMeta()`.

### Pagar con traspaso (`PagoPartidaModal.jsx`)
- Si el monto excede el saldo de la partida, pide de cuál de las otras dos tomar la diferencia (deshabilitado si tampoco alcanza).
- `createDistributionsBatch()` inserta en un solo `insert` 3 movimientos: `out` de la partida origen por la diferencia, `in` a la partida que paga por la diferencia, `out` del pago por el monto completo.
- Los 2 del traspaso llevan `note = NOTA_TRASPASO_PARTIDA`; `DashboardView.jsx` usa `distributionsParaMeta` (sin traspasos) para "Ganancia real" y "Distribución · meta vs real". El ledger completo sigue en Distribución → Acumulado por partida y Movimientos.

### Rubros de gasto
- Categoría de un pago de **Gastos**: lista cerrada de 10 rubros (`CATEGORIAS_GASTO`), con `DescribedSelect` (§5) para mostrar descripciones. `'Sin clasificar'` como escape.
- En `fin_distributions.concept` se guarda el `label` del rubro, no la key (pagos históricos en texto libre conviven).
- Socios y Ganancia: texto libre (`beneficiary` o detalle).
- Campo **Nota** opcional → `fin_distributions.note`, mostrado bajo el concepto en Distribución, Partida y Movimientos (y buscable). **Todo render de `note` debe excluir `NOTA_TRASPASO_PARTIDA`.**

### Vista de Distribución (`DistribucionView.jsx`)
- Orden: Acumulado por partida → Cobros por distribuir → Movimientos.
- Movimientos: todos los del mes, paginados de a 30 (`MOV_PAGE_SIZE`, estado `movPage`, reset al cambiar de mes); orden `movedOn` desc y luego `createdAt` desc.
- Distribuir cobros es manual (`DistribucionModal.jsx`).

### Movimientos (tab)
- Diario consolidado del mes: cobros, asignaciones y pagos de partida, traspasos, compras/ventas de divisas, ajustes de Caja Bs. SOLO LECTURA (borrar/editar en la tab de origen). No lista facturas emitidas.
- Aplanado puro en `movimientosDelMes()`/`totalesMovimientos()`; `MovimientosView.jsx` solo filtra, ordena y pinta.
- (1) Una fila por hecho económico desde su tabla fuente: las filas generadas por triggers (`fin_bs_ledger`, partida `'cambio'`) se pliegan como columnas (`montoBs`, `tasa`, `resultadoCambioUsd`); del libro de Bs solo entra `source='ajuste'`. Una fila `'cambio'` sin operación visible se emite como fila propia.
- (2) Pertenencia al mes por fecha del movimiento (`paidOn`/`movedOn`), no por `month_id`; por eso carga `loadInvoicesUpTo`/`loadDistributionsUpTo` además de los de `shared`. Límite: universo `month_id <= mes activo` (un prepago bajo `month_id` posterior no aparecería; hoy no existe).
- (3) `naturaleza`: `ingreso`/`egreso` suman; `conversion`, `interno` (asignación y traspaso), `ajuste` y `canje` no (mismo criterio que `pagosRealesUsd()`). El abono en intercambio sale como tipo `canje` ("Cobro en intercambio", `afectaCaja: 'ninguna'`) y el filtro Flujo "real" lo excluye.
- Cards Entradas/Salidas/Neto del MES (no de la selección filtrada). Sin card de "neto de caja": su dueño único es `cuadreDivisas()` (cards de divisas del Dashboard).

### Caja Bs y divisas (sin tab propia)
- Spec `MAPPI-Finanzas-Divisas` v1.0. Sin alcance por línea operativa (Bs se convierten en bloque).
- `fin_bs_ledger` y la fila `partida='cambio'` NO se escriben desde UI/JS: las generan 3 triggers `SECURITY DEFINER` — `fin_payment_sync_bs` (cobro en Bs), `fin_fx_sync` (operación de divisas), `fin_distribution_sync_bs` (pago directo en Bs). La UI ya no registra compras/ventas de divisas ni ajustes de Caja Bs: la compra de divisas se paga por la partida de Gastos. Los datos históricos (`fin_fx_operations`, `fin_bs_ledger`) y los triggers siguen vivos y alimentan las cards de divisas del Dashboard (solo lectura) y el snapshot de `closeMonth()`.
- Borrado por la fuente: `fin_fx_operations` (`on delete cascade` borra fila del libro y la `'cambio'`); `cobro`/`pago_directo` → solo desde Cobros/Distribución. `PartidaView.jsx`, al eliminar una fila `'cambio'` con `fxOperationId`, borra la operación de divisas, no la distribución.
- "Caja Bs" es el nombre de la card del saldo en Bs en el Dashboard.
- Tasa BCV: `resolveRateBcv()` intenta la API en vivo (`/api/bcv-rate`) solo si la fecha es hoy, cachea en `fin_rates` (best-effort: si el `upsert` falla por RLS la tasa igual se usa) y memoriza la tasa del día (TTL 10 min, evita repetir `getSession()` + fetch + upsert); si no, cae a los escalones históricos bcv/stale/missing. `closeMonth()` resuelve solo contra `fin_rates`, nunca la API. No hay carga manual de tasa.

### Invariante de cuadre (`cuadreDivisas()`)
- Identidad de caja, acumulada hasta el mes seleccionado: `cobrado − pagosReales + resultadoCambio = divisaFisica + saldoBs÷BCV`. Independiente de cuánto se repartió.
- La descomposición por partidas de la spec §7 se expone aparte como `sinDistribuir` (panel), no como test. La fórmula literal de §7 (`Σ partidas + resultado por cambio = divisa física + Caja Bs÷BCV` por `month_id = $1`) no se usa: falla con datos correctos (cobros sin distribuir y `out` de traspaso).
- Residuo por cambio de BCV entre movimientos = revaluación del saldo en Bs parado; `DashboardView.jsx` lo etiqueta así, nunca como descuadre en rojo.
- Test: `src/test/finanzas.test.js` → describe `finanzas — invariante de cuadre (cuadreDivisas)`.

### Cierre de mes (`finanzasApi.closeMonth()`)
- JS, no RPC (para no reimplementar `clientInMonth()` en SQL). Gate `finanzas.cerrar_mes`.
- Orden: snapshot en `fin_month_totals` de la composición en divisas acumulada (para todo mes cerrado) → marca `closed=true` → crea el mes siguiente (con `PARTIDAS_PCT_DEFAULT`; `unique(company_id,year,month)` evita doble cierre) → `syncMonthInvoices()` precarga su facturación (incluye cargos externos recurrentes).
- Lo pendiente de cobro no se arrastra: queda en su mes de origen.

### Mes resumen
- `fin_months.summary_only`: mes cargado con solo 5 totales en `fin_month_totals` (una fila por mes), para periodos históricos sin desglose (p. ej. agosto 2026).
- `createSummaryMonth()` desde `ResumenMesModal.jsx` (Dashboard, cuando el mes no existe), gate `finanzas.cerrar_mes`. Queda `closed` de inmediato; los totales se insertan ANTES de cerrar (el trigger bloquearía después).
- Dashboard usa `monthTotals` para KPIs y tendencia de 6 meses; "Top clientes" y "Cobranza por línea" muestran aviso; Facturación y Distribución también.
- `DashboardView.jsx` filtra por `summaryOnly` al leer `loadAllMonthTotals()` para que el snapshot de cierre no pise el facturado derivado de `fin_invoices`.

### Recarga del periodo (realtime)
- Suscripciones `postgres_changes` del canal `finanzas-view` (refrescan entre otros `rateBcv`/`rates`) pasan por `useCoalescedRefetch` (debounce de cola 500 ms + guarda "en vuelo" que deja UNA pendiente). Gotcha: Postgres notifica por FILA (un `.insert([...])` de 67 facturas = 67 eventos).
- Refetch por realtime usa `fetchPeriod(false)` (no toca `loading`): con `loading=true`, `FacturacionView.jsx` hace early return "Cargando…" y desmonta `InvoiceModal` abierto. Solo carga inicial y acciones explícitas (guardar) muestran carga.
- `fin_rates` queda FUERA del canal: su escritor es `resolveRateBcv()` dentro de `fetchPeriod` (sería un bucle).

### Fechas
- `hoyISO()` y `ultimoDiaDelMesISO()` formatean desde componentes LOCALES, nunca `toISOString()`: `new Date(year, month, 0).toISOString()` y `new Date().toISOString()` desfasan un día en el borde de mes (Caracas después de las 20:00). Los usan `fetchPeriod()` y `closeMonth()`.

## Gotchas

- `fin_payments` y `fin_fx_operations` son inmutables: corregir = borrar y recrear.
- `/api/bcv-rate` no responde con `npm run dev` (Vite solo, no lee `netlify.toml`); usar `netlify dev` (`:8888`). En producción/preview funciona.
- El chequeo de mes cerrado debe considerar `fin_payments` vía su factura (no tiene `month_id`).
- Estado de datos: agosto 2026 se carga como mes resumen; septiembre 2026 fue el primer mes con la dinámica de cobro y distribución el mismo día.

## Conexiones con otros módulos

- Empresa → Clientes (`metric_clients`, `ClientModal.jsx`, `empresa.clientes.manage`): fuente de cartera; guard por columna compartido.
- Reportes/Métricas/Tareas/Ads/Chequeo: comparten `clientInMonth()`; Reportes (`initMetricReport.js`) inspira el carry-forward.
- Métricas §2.5: `finanzas` en `metric_reports.data` es otra cosa.
- Empresa → Accesos: reglas de las capabilities (`module_permissions`).
- §5: `DescribedSelect`.
- Futuro: un escenario de n8n podría escribir `fin_rates` a diario.
