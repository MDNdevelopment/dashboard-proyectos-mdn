/**
 * Aritmética pura del módulo Finanzas (facturación, cobranza y distribución en
 * partidas). Portado desde el prototipo HTML original — ver ARQUITECTURA.md §2.N.
 *
 * Todos los cálculos son en USD: `currency` en `fin_invoices` es solo la etiqueta
 * del método de cobro (USD vs Bs), no hay conversión ni tasa del día.
 *
 * Shapes esperados (ya normalizados de snake_case por finanzasApi.js):
 *   Invoice      { id, monthId, clientId, clientName, concept, amount, currency,
 *                   recurring, payments: Payment[] }
 *   Payment      { id, paidOn, amount, method, note }
 *   Distribution { id, monthId, partida: 'gastos'|'socios'|'ganancia',
 *                   kind: 'in'|'out', movedOn, concept, beneficiary, amount,
 *                   invoiceId, note }
 */
import {
  PARTIDAS_PCT_DEFAULT,
  CONCEPTO_RECURRENTE,
  PARTIDA_CAMBIO,
  NOTA_TRASPASO_PARTIDA,
  MOVIMIENTO_TIPOS,
  FX_OP_TYPES,
} from '../components/finanzas/constants'
import { clientInMonth } from './clientInMonth'
import { netoDe, totalRetenido } from './retenciones'

/** Tolerancia usada en todo el módulo para tratar redondeos como iguales. */
const EPS = 0.5

// ─── Facturas y cobros ──────────────────────────────────────────────────────────

/** Un abono pagado en intercambio (canje): salda la factura pero no entra a caja. */
export function esIntercambio(payment) {
  return payment?.currency === 'Intercambio'
}

/**
 * Dinero que realmente entró de una factura (USD o Bs). Excluye el intercambio a
 * propósito: es la cifra de CAJA, y de ella cuelgan la distribución en partidas,
 * la divisa física y el cuadre. Para saber si la factura está saldada usa
 * `saldadoDe()`.
 */
export function cobradoDe(invoice) {
  return (invoice?.payments ?? [])
    .filter((p) => !esIntercambio(p))
    .reduce((a, p) => a + Number(p.amount ?? 0), 0)
}

/** Valor de la factura saldado en intercambio (no es dinero en caja). */
export function canjeadoDe(invoice) {
  return (invoice?.payments ?? [])
    .filter(esIntercambio)
    .reduce((a, p) => a + Number(p.amount ?? 0), 0)
}

/** Lo saldado de una factura: dinero cobrado + intercambio recibido. */
export function saldadoDe(invoice) {
  return cobradoDe(invoice) + canjeadoDe(invoice)
}

/**
 * Neto a cobrar de una factura: el monto facturado menos las retenciones que el
 * cliente le practica (ver utils/retenciones.js). Una factura sin retenciones
 * configuradas — toda la facturación anterior a esta feature — devuelve su
 * monto tal cual, así que nada del comportamiento histórico cambia.
 */
export function netoACobrarDe(invoice) {
  return netoDe(invoice)
}

/**
 * Monto que aún falta cobrar de una factura. Se mide contra el NETO, no contra
 * lo facturado: la retención nunca va a entrar a caja (la entera el cliente al
 * fisco), así que una factura queda saldada al recibir el neto. Si se midiera
 * contra el bruto, toda marca con retención quedaría "abonada" para siempre.
 */
export function pendienteDe(invoice) {
  return netoACobrarDe(invoice) - saldadoDe(invoice)
}

/**
 * Estado derivado de una factura — nunca se guarda como columna, siempre se
 * calcula desde sus pagos (evita la clase de bug que tuvo el prototipo: un
 * `status` que se desincroniza de la suma real de abonos).
 * @returns {'pendiente'|'abonado'|'cobrado'}
 */
export function estadoFactura(invoice) {
  if (saldadoDe(invoice) <= EPS) return 'pendiente'
  if (pendienteDe(invoice) > EPS) return 'abonado'
  return 'cobrado'
}

/**
 * Desglose de lo cobrado de una factura por la moneda en la que ENTRÓ el
 * dinero (`fin_payments`), nunca por `invoice.currency` — la moneda de
 * facturación es configuración (casi todas las marcas están en USD) y no dice
 * nada de cómo pagó el cliente. Esto es lo que alimenta la vista Cobros de
 * `FacturacionView.jsx`: su columna "Moneda", el monto mostrado y el filtro
 * Todas/USD/Bs.
 *
 * Un abono cuenta como Bs si tiene `amountBs` cargado (mismo criterio que
 * `cobradoPorMoneda()`); si no, es divisa. Un abono en intercambio no es
 * dinero: no suma a `usd` ni a `bs` (su monto sale de `canjeadoDe()`), solo
 * agrega `'Intercambio'` a `monedas`.
 *
 * @returns {{ usd: number, bs: number, monedas: ('USD'|'Bs'|'Intercambio')[] }}
 *   `usd` suma en dólares de los abonos en divisa; `bs` suma en bolívares de
 *   los abonos en Bs; `monedas` las formas de pago realmente presentes — vacío
 *   si la factura no tiene abonos, y con varias si el cobro fue mixto (ahí la
 *   factura aparece en cada filtro correspondiente).
 */
export function cobrosPorMonedaDe(invoice) {
  let usd = 0
  let bs = 0
  let hayUsd = false
  let hayBs = false
  let hayIntercambio = false
  for (const p of invoice?.payments ?? []) {
    if (esIntercambio(p)) {
      hayIntercambio = true
    } else if (p.amountBs != null) {
      bs += Number(p.amountBs ?? 0)
      hayBs = true
    } else {
      usd += Number(p.amount ?? 0)
      hayUsd = true
    }
  }
  const monedas = []
  if (hayUsd) monedas.push('USD')
  if (hayBs) monedas.push('Bs')
  if (hayIntercambio) monedas.push('Intercambio')
  return { usd, bs, monedas }
}

export function totalFacturado(invoices) {
  return (invoices ?? []).reduce((a, i) => a + Number(i.amount ?? 0), 0)
}

/** Dinero cobrado del mes (sin intercambio — ver `cobradoDe`). */
export function totalCobrado(invoices) {
  return (invoices ?? []).reduce((a, i) => a + cobradoDe(i), 0)
}

/** Valor recibido en intercambio en el mes (KPI informativo, no es caja). */
export function totalCanjeado(invoices) {
  return (invoices ?? []).reduce((a, i) => a + canjeadoDe(i), 0)
}

/** Dinero + intercambio: lo que ya dejó de ser deuda del cliente. */
export function totalSaldado(invoices) {
  return totalCobrado(invoices) + totalCanjeado(invoices)
}

/**
 * Suma de los netos a cobrar del mes: lo que de verdad se espera que entre a
 * caja. Se diferencia de `totalFacturado()` en las retenciones, que el cliente
 * entera al fisco y nunca llegan a la agencia.
 */
export function totalNetoACobrar(invoices) {
  return (invoices ?? []).reduce((a, i) => a + netoACobrarDe(i), 0)
}

/** Total retenido del mes por los clientes (KPI informativo, no es un egreso). */
export function totalRetenidoDelMes(invoices) {
  return totalRetenido(invoices)
}

/**
 * Lo que falta cobrar del mes. Contra el neto, no contra lo facturado: si no,
 * las retenciones figurarían como deuda eterna de los clientes.
 */
export function totalPorCobrar(invoices) {
  return totalNetoACobrar(invoices) - totalSaldado(invoices)
}

/**
 * Desglosa lo cobrado del mes por moneda de entrada real (Bs vs divisa),
 * en USD equivalente. Un pago cuenta como "bs" si tiene `amountBs` cargado
 * (registrado con monto + tasa); el resto — incluida la cobranza histórica
 * sin este dato — cuenta como "divisa", igual que hacía `totalCobrado` antes.
 */
export function cobradoPorMoneda(invoices) {
  let bs = 0
  let divisa = 0
  for (const inv of invoices ?? []) {
    for (const p of inv.payments ?? []) {
      if (esIntercambio(p)) continue
      if (p.amountBs != null) bs += Number(p.amount ?? 0)
      else divisa += Number(p.amount ?? 0)
    }
  }
  return { bs, divisa }
}

/**
 * Desglosa lo FACTURADO del mes por la moneda elegida en la factura
 * (`invoice.currency`), en USD equivalente (`amount` siempre es USD, el monto en
 * Bs es solo referencia — ver InvoiceModal.jsx). Distinto de `cobradoPorMoneda()`,
 * que mira el pago real, no la factura.
 */
export function facturadoPorMoneda(invoices) {
  let usd = 0
  let bs = 0
  for (const inv of invoices ?? []) {
    if (inv.currency === 'Bs') bs += Number(inv.amount ?? 0)
    else usd += Number(inv.amount ?? 0)
  }
  return { usd, bs }
}

// ─── Distribución en partidas ───────────────────────────────────────────────────

/** Cuánto de lo cobrado en esta factura ya fue distribuido a alguna partida. */
export function distribuidoDe(invoice, distsDelMes) {
  return (distsDelMes ?? [])
    .filter((d) => d.kind === 'in' && d.invoiceId === invoice?.id)
    .reduce((a, d) => a + Number(d.amount ?? 0), 0)
}

/** Total asignado a una partida en los movimientos de un mes (kind='in'). */
export function asignadoPorPartida(distsDelMes, partida) {
  return (distsDelMes ?? [])
    .filter((d) => d.kind === 'in' && d.partida === partida)
    .reduce((a, d) => a + Number(d.amount ?? 0), 0)
}

/** Total pagado/egresado de una partida en un mes (kind='out'). */
export function pagadoPorPartida(distsDelMes, partida) {
  return (distsDelMes ?? [])
    .filter((d) => d.kind === 'out' && d.partida === partida)
    .reduce((a, d) => a + Number(d.amount ?? 0), 0)
}

/**
 * Saldo que arrastra una partida de todos los meses ANTERIORES al actual
 * (asignaciones menos pagos, acumulado). No incluye el mes en curso.
 * @param {Array} distsAnteriores - movimientos de todos los meses previos
 */
export function saldoArrastrado(distsAnteriores, partida) {
  return (distsAnteriores ?? [])
    .filter((d) => d.partida === partida)
    .reduce((a, d) => a + (d.kind === 'out' ? -Number(d.amount ?? 0) : Number(d.amount ?? 0)), 0)
}

/**
 * Saldo disponible de una partida al cierre del mes actual: lo arrastrado de
 * meses anteriores, más lo asignado este mes, menos lo pagado este mes.
 * El saldo se arrastra mes a mes, nunca se reinicia.
 */
export function saldoPartida(distsAnteriores, distsDelMes, partida) {
  return (
    saldoArrastrado(distsAnteriores, partida) +
    asignadoPorPartida(distsDelMes, partida) -
    pagadoPorPartida(distsDelMes, partida)
  )
}

/**
 * % de reparto vigentes para un mes: lee las columnas `pct_*` de `fin_months`
 * (normalizadas a pctGastos/pctSocios/pctGanancia por finanzasApi.js), con
 * fallback a PARTIDAS_PCT_DEFAULT si el mes aún no existe (mes no abierto).
 * Guardarlos por mes (no como constante global) es lo que permite que un mes
 * cerrado quede auditable contra el % vigente cuando se cerró.
 */
export function pctsDelMes(finMonth) {
  return {
    gastos: Number(finMonth?.pctGastos ?? PARTIDAS_PCT_DEFAULT.gastos),
    socios: Number(finMonth?.pctSocios ?? PARTIDAS_PCT_DEFAULT.socios),
    ganancia: Number(finMonth?.pctGanancia ?? PARTIDAS_PCT_DEFAULT.ganancia),
  }
}

/** Meta presupuestada de una partida sobre lo cobrado del mes, según sus % vigentes. */
export function metaPartida(cobradoDelMes, partida, pcts) {
  return Number(cobradoDelMes ?? 0) * (pcts?.[partida] ?? 0)
}

/** % real que representa una partida sobre el total distribuido del mes. */
export function realPct(distsDelMes, partida) {
  const partidas = ['gastos', 'socios', 'ganancia']
  const total = partidas.reduce((a, p) => a + asignadoPorPartida(distsDelMes, p), 0)
  if (!total) return 0
  return asignadoPorPartida(distsDelMes, partida) / total
}

/**
 * Desviación en puntos porcentuales de una partida respecto a su meta, con la
 * regla asimétrica de "favorable": en Gastos operativos, estar por DEBAJO de
 * la meta es favorable (se gasta menos); en Socios y Ganancia, estar por
 * ENCIMA es favorable. Desviaciones menores a 0.3 pts se consideran neutras.
 */
export function desviacionEnPuntos(distsDelMes, partida, pcts) {
  const puntos = (realPct(distsDelMes, partida) - (pcts?.[partida] ?? 0)) * 100
  const neutral = Math.abs(puntos) < 0.3
  const favorable = partida === 'gastos' ? puntos <= 0 : puntos >= 0
  return { puntos, neutral, favorable: neutral ? null : favorable }
}

// ─── Arrastre de facturación mes a mes ───────────────────────────────────────────

/**
 * Facturas que le FALTAN a un mes para que estén TODOS los clientes activos, sin
 * que nadie los agregue a mano. Es un reconciliador, no un sembrado de una sola
 * vez: recibe lo que el mes ya tiene (`existingInvoices`) y devuelve solo lo que
 * hay que insertar, así que correrlo dos veces no duplica nada. Eso es lo que
 * permite llamarlo en cada visita a Facturación y que un mes creado por otro
 * camino (el que abre `closeMonth`, o una visita a otra tab) no se quede vacío.
 *
 * Monto de cada cliente que falta, por orden de prioridad:
 *   1. Su factura recurrente del mes anterior (conserva los ajustes hechos a
 *      mano: descuentos, conceptos editados, facturación en Bs con su tasa).
 *   2. `monthly_fee` del perfil de la marca (alta nueva, sin mes anterior).
 *   3. 0 — "Sin monto": el cargo aparece igual, marcado en la UI para que le
 *      asignen el monto. Antes estas marcas simplemente no aparecían y había que
 *      agregarlas a mano cada mes.
 *
 * Reglas:
 * - Las facturas `recurring: false` (cargos puntuales) nunca se arrastran.
 * - Una marca que ya no factura el mes (`clientInMonth` falso o cliente
 *   inexistente) se descarta, venga del mes anterior o de la cartera.
 * - `excludedClientIds` son las marcas cuya facturación se borró a propósito
 *   (`fin_invoice_exclusions`): no se vuelven a crear.
 * - Los cargos externos del mes anterior (sin `clientId`) solo se copian cuando
 *   el mes está todavía VACÍO. En un mes ya poblado no hay forma de saber si
 *   falta uno o si lo borraron a propósito — no tienen id estable contra el que
 *   comparar, como sí lo tienen los clientes.
 *
 * @returns {Array<{clientId, clientName, concept, amount, currency, recurring}>}
 */
export function invoiceRowsForNewMonth({
  prevInvoices,
  clients,
  year,
  month,
  existingInvoices = [],
  excludedClientIds = [],
}) {
  const clientById = new Map((clients ?? []).map((c) => [c.id, c]))
  const excluidos = new Set(excludedClientIds ?? [])
  const mesVacio = (existingInvoices ?? []).length === 0
  // Un cliente ya facturado este mes no se vuelve a agregar, tenga el concepto
  // que tenga: la unidad de reconciliación es la marca, no el cargo.
  const yaFacturados = new Set(
    (existingInvoices ?? []).map((inv) => inv.clientId).filter((id) => id != null),
  )
  const rows = []

  function puedeFacturar(clientId) {
    if (excluidos.has(clientId)) return false
    if (yaFacturados.has(clientId)) return false
    const client = clientById.get(clientId)
    if (!client) return false
    // Marca en intercambio: la agencia le trabaja pero no le cobra dinero, así
    // que no entra en la facturación del mes. El filtro va aquí y no en
    // clientInMonth(), que responde "¿existía esta cuenta este mes?" y la usan
    // Métricas, Tareas, Ads y Chequeo: meterlo allí borraría a estas marcas de
    // los reportes de trabajo, que sí las atienden.
    if (client.es_intercambio) return false
    return clientInMonth(client, year, month)
  }

  for (const inv of prevInvoices ?? []) {
    if (!inv.recurring) continue
    if (inv.clientId == null) {
      if (!mesVacio) continue
      rows.push({
        clientId: null,
        clientName: inv.clientName,
        concept: inv.concept,
        amount: inv.amount,
        currency: inv.currency,
        amountBs: inv.amountBs ?? null,
        rate: inv.rate ?? null,
        recurring: true,
      })
      continue
    }
    if (!puedeFacturar(inv.clientId)) continue
    yaFacturados.add(inv.clientId)
    rows.push({
      clientId: inv.clientId,
      clientName: inv.clientName,
      concept: inv.concept,
      amount: inv.amount,
      currency: inv.currency,
      // Se copian tal cual, mismo criterio que el monto: si la factura anterior
      // era en Bs, el monto/tasa de referencia arrastran hasta que alguien los
      // actualice a mano (ej. con la tasa BCV vigente ese mes).
      amountBs: inv.amountBs ?? null,
      rate: inv.rate ?? null,
      recurring: true,
    })
  }

  for (const c of clients ?? []) {
    if (!puedeFacturar(c.id)) continue
    yaFacturados.add(c.id)
    rows.push({
      clientId: c.id,
      clientName: c.name,
      concept: CONCEPTO_RECURRENTE,
      amount: Number(c.monthly_fee) > 0 ? Number(c.monthly_fee) : 0,
      currency: 'USD',
      recurring: true,
    })
  }

  return rows
}

/** Un cargo sin monto asignado: aparece en la lista para que lo editen, y suma 0. */
export function sinMonto(invoice) {
  return Number(invoice?.amount ?? 0) === 0
}

// ─── Fechas del módulo (locales, nunca vía toISOString) ─────────────────────────
//
// `toISOString()` convierte a UTC: `new Date(2026, 9, 0).toISOString()` es
// medianoche LOCAL serializada en UTC, así que en cualquier huso con offset
// positivo devuelve el día ANTERIOR, y `new Date().toISOString()` en Caracas
// (UTC-4) pasadas las 20:00 ya devuelve MAÑANA. Con esas dos cosas, comparar
// "último día del mes" contra "hoy" se desalinea justo en el borde de mes —
// que es cuando más importa. Estos dos helpers formatean a mano desde los
// componentes locales, que es el mismo marco en el que se eligió el periodo.

function isoLocal(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/** Hoy como 'YYYY-MM-DD' en hora local. */
export function hoyISO(ref = new Date()) {
  return isoLocal(ref)
}

/** Último día de (year, month) como 'YYYY-MM-DD'. `month` es 1-12. */
export function ultimoDiaDelMesISO(year, month) {
  return isoLocal(new Date(year, month, 0))
}

/**
 * Si un periodo puede prepararse solo (crear su mes y sembrar la facturación).
 * Solo el mes en curso y los anteriores: navegar por el selector hasta un mes
 * futuro no debe materializarlo — pasó, y quedaron meses de 2027 creados con la
 * facturación completa de una cartera que para entonces será otra.
 *
 * Compara año y mes como ENTEROS: nada de restar `Date`s ni de strings ISO, por
 * lo explicado arriba.
 */
export function esMesPreparable(year, month, ref = new Date()) {
  const y = ref.getFullYear()
  const m = ref.getMonth() + 1
  return year < y || (year === y && month <= m)
}

// ─── Análisis ───────────────────────────────────────────────────────────────────

/**
 * Tasa de cobranza del mes: cobrado / neto a cobrar (0 si no hay facturación).
 * Contra el neto y no contra lo facturado, porque si no una cartera con
 * retenciones nunca podría llegar al 100% aunque hubiera cobrado todo.
 */
export function tasaCobranza(invoices) {
  const neto = totalNetoACobrar(invoices)
  return neto ? totalSaldado(invoices) / neto : 0
}

/** Ticket promedio: facturado / clientes activos facturados (0 si no hay clientes). */
export function ticketPromedio(invoices, activeClientCount) {
  return activeClientCount ? totalFacturado(invoices) / activeClientCount : 0
}

// ─── Movimiento de cartera ────────────────────────────────────────────────────

function prevYearMonth(year, month) {
  return month <= 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 }
}

/**
 * Clientes que entraron o salieron de la cartera activa entre el mes anterior
 * y el mes dado, según la misma regla de alta/baja que usa Reportes
 * (`clientInMonth`) — no se reimplementa ni se captura a mano, se deriva de
 * `metric_clients` para no crear una segunda fuente de verdad.
 */
export function movimientoCartera(clients, year, month) {
  const prev = prevYearMonth(year, month)
  const entraron = []
  const salieron = []
  for (const c of clients ?? []) {
    const estabaAntes = clientInMonth(c, prev.year, prev.month)
    const estaAhora = clientInMonth(c, year, month)
    if (!estabaAntes && estaAhora) entraron.push(c)
    else if (estabaAntes && !estaAhora) salieron.push(c)
  }
  return { entraron, salieron }
}

/**
 * Redondea el % de cada partida sobre `base` a un entero, garantizando que los
 * tres SIEMPRE sumen el total real redondeado (método del resto mayor / Hamilton).
 * Redondear cada partida por separado con Math.round puede dar una suma que no
 * cuadra (ej. 24.5/37.8/37.7 → 25/38/38 = 101%) — ver card "Distribución · meta
 * vs real" del Dashboard.
 * @param {Record<string, number>} montos - monto real de cada partida, ej. {gastos, socios, ganancia}
 * @param {number} base - total sobre el que se calcula el %, ej. cobrado del mes
 * @returns {Record<string, number>} mismo shape de `montos`, con el % entero de cada una
 */
export function pctsEnterosPorPartida(montos, base) {
  const keys = Object.keys(montos ?? {})
  if (!base || base <= 0) return Object.fromEntries(keys.map((k) => [k, 0]))

  const exactos = keys.map((k) => ((Number(montos[k]) || 0) / base) * 100)
  const totalRedondeado = Math.round(exactos.reduce((a, v) => a + v, 0))
  const filas = keys.map((k, i) => ({
    key: k,
    piso: Math.floor(exactos[i]),
    resto: exactos[i] - Math.floor(exactos[i]),
  }))

  const resultado = Object.fromEntries(filas.map((f) => [f.key, f.piso]))
  const faltan = Math.max(0, totalRedondeado - filas.reduce((a, f) => a + f.piso, 0))
  const porResto = [...filas].sort((a, b) => b.resto - a.resto)
  for (let i = 0; i < faltan && i < porResto.length; i++) {
    resultado[porResto[i].key] += 1
  }
  return resultado
}

// ─── Divisas y Caja Bs (spec MAPPI-Finanzas-Divisas) ────────────────────────────
//
// Shapes nuevos (normalizados por finanzasApi.js):
//   FxOperation { id, monthId, opType: 'compra'|'venta', movedOn, amountBs,
//                 amountUsd, rateReal, rateBcv, counterparty, purpose }
//   BsLedgerEntry { id, monthId, movedOn, kind: 'in'|'out', source, amountBs,
//                   rate, amountUsdRef, paymentId, fxOperationId, distributionId }
//
// El único movimiento que se llena a mano es el ajuste de cuadre (source='ajuste');
// el resto lo generan los triggers de la migración 20260928100000. Estas funciones
// solo LEEN esas filas — nunca las calculan de forma distinta a como las calculó
// la BD, para no tener dos fórmulas del mismo número.

/** Tasa real de una operación de divisas: Bs entregados/recibidos ÷ USD recibidos/entregados. */
export function tasaRealFx({ amountBs, amountUsd }) {
  const usd = Number(amountUsd ?? 0)
  return usd ? Number(amountBs ?? 0) / usd : 0
}

/** Brecha de la tasa real sobre la BCV, como fracción (0.25 = 25%). */
export function brechaPct(rateReal, rateBcv) {
  const bcv = Number(rateBcv ?? 0)
  return bcv ? Number(rateReal ?? 0) / bcv - 1 : 0
}

/**
 * Resultado por cambio de una operación de divisas, con signo (mismo cálculo que
 * el trigger `fin_fx_sync` en SQL — ver spec §5.1). Positivo = ganancia.
 * compra: delta = amountUsd - amountBs/rateBcv (normalmente negativo)
 * venta:  delta = amountBs/rateBcv - amountUsd (normalmente positivo)
 */
export function deltaCambio({ opType, amountBs, amountUsd, rateBcv }) {
  const bcv = Number(rateBcv ?? 0)
  if (!bcv) return 0
  const usdBcv = Number(amountBs ?? 0) / bcv
  const usd = Number(amountUsd ?? 0)
  return opType === 'compra' ? usd - usdBcv : usdBcv - usd
}

/** Saldo de la Caja Bs: Σ entradas − Σ salidas del libro (acumulado, nunca se reinicia). */
export function saldoCajaBs(ledger) {
  return (ledger ?? []).reduce(
    (a, l) => a + (l.kind === 'out' ? -Number(l.amountBs ?? 0) : Number(l.amountBs ?? 0)),
    0,
  )
}

/**
 * Filas del libro con su saldo acumulado a esa fila, más recientes primero (orden
 * de exhibición del §8.4). El saldo se calcula en orden cronológico ascendente y
 * luego se invierte — calcularlo fila por fila ya invertido daría el saldo al
 * revés (restando lo que aún no había "pasado").
 */
export function ledgerConSaldo(ledger) {
  const asc = [...(ledger ?? [])].sort((a, b) => {
    if (a.movedOn !== b.movedOn) return a.movedOn < b.movedOn ? -1 : 1
    return (a.createdAt ?? '') < (b.createdAt ?? '') ? -1 : 1
  })
  let saldo = 0
  const conSaldo = asc.map((l) => {
    saldo += l.kind === 'out' ? -Number(l.amountBs ?? 0) : Number(l.amountBs ?? 0)
    return { ...l, saldo }
  })
  return conSaldo.reverse()
}

/** Pagos reales en USD (kind='out', excluye la partida técnica 'cambio' y el traspaso interno entre partidas). */
export function pagosRealesUsd(distributions) {
  return (distributions ?? [])
    .filter(
      (d) => d.kind === 'out' && d.partida !== PARTIDA_CAMBIO && d.note !== NOTA_TRASPASO_PARTIDA,
    )
    .reduce((a, d) => a + Number(d.amount ?? 0), 0)
}

/** Resultado por cambio acumulado: Σ `in` − Σ `out` de la partida técnica 'cambio'. */
export function resultadoCambio(distributions) {
  return (distributions ?? [])
    .filter((d) => d.partida === PARTIDA_CAMBIO)
    .reduce((a, d) => a + (d.kind === 'out' ? -Number(d.amount ?? 0) : Number(d.amount ?? 0)), 0)
}

/**
 * Divisa física en mano: lo cobrado en USD (no en Bs) + lo comprado − lo vendido
 * de divisas − lo pagado EN USD (excluida la partida técnica 'cambio' y el
 * traspaso entre partidas). A propósito NO usa `pagosRealesUsd()`: un pago
 * directo en bolívares (nómina, §6.5) sale de la Caja Bs, no de la divisa física,
 * aunque su `amount` (USD-equivalente) sí cuente como "pago real" en el
 * invariante de `cuadreDivisas()`.
 */
export function divisaFisica({ invoices, fxOperations, distributions }) {
  const cobradoUsd = (invoices ?? []).reduce(
    (a, inv) =>
      a +
      (inv.payments ?? [])
        .filter((p) => p.currency === 'USD' || p.currency == null)
        .reduce((b, p) => b + Number(p.amount ?? 0), 0),
    0,
  )
  const netoFx = (fxOperations ?? []).reduce(
    (a, op) =>
      a + (op.opType === 'compra' ? Number(op.amountUsd ?? 0) : -Number(op.amountUsd ?? 0)),
    0,
  )
  const pagosUsd = (distributions ?? [])
    .filter(
      (d) =>
        d.kind === 'out' &&
        d.partida !== PARTIDA_CAMBIO &&
        d.note !== NOTA_TRASPASO_PARTIDA &&
        d.currency !== 'Bs',
    )
    .reduce((a, d) => a + Number(d.amount ?? 0), 0)
  return cobradoUsd + netoFx - pagosUsd
}

/**
 * Lo cobrado del mes que aún no se ha repartido a ninguna partida — el término
 * que le falta al invariante de cuadre cuando el reparto es manual (ver §7 de la
 * spec, corregido: no todo cobro se distribuye el mismo día que se registra).
 * Reusa `cobradoDe()`/`distribuidoDe()`, ya existentes, para no duplicar esa cuenta.
 */
export function sinDistribuir(invoices, distributions) {
  return (invoices ?? []).reduce(
    (a, inv) => a + (cobradoDe(inv) - distribuidoDe(inv, distributions)),
    0,
  )
}

/**
 * El invariante de cuadre real del módulo (identidad de CAJA, no de partidas —
 * ver "Tres correcciones a la spec" en el plan de implementación). Todo lo que
 * recibe debe venir ACUMULADO hasta el mes seleccionado, inclusive — igual que
 * `saldoArrastrado()`/`saldoPartida()` ya hacen para las partidas:
 *
 *   cobrado − pagosReales + resultadoCambio  =  divisaFisica + saldoBs/rateBcv
 *
 * Es independiente de cuánto se haya repartido a partidas (por eso NO es el query
 * de §7 de la spec, que asume reparto automático e instantáneo y por eso da
 * distinto de cero incluso con datos correctos). La descomposición por partidas
 * de §7 se expone igual en el resultado, como lectura de panel, no como el test
 * de cuadre: `partidasNetas + sinDistribuir + cambio` debería reproducir `cobrado
 * − pagosReales + cambio` — si no, hay sobre-distribución (algo asignado de más).
 */
export function cuadreDivisas({ invoices, distributions, fxOperations, ledger, rateBcv }) {
  const cobrado = totalCobrado(invoices)
  const pagosReales = pagosRealesUsd(distributions)
  const cambio = resultadoCambio(distributions)
  const divisaFisicaVal = divisaFisica({ invoices, fxOperations, distributions })
  const saldoBs = saldoCajaBs(ledger)
  const bcv = Number(rateBcv ?? 0)
  const bcvFaltante = !bcv
  const saldoBsUsdRef = bcvFaltante ? 0 : saldoBs / bcv

  const partidasNetas = ['gastos', 'socios', 'ganancia'].reduce(
    (a, p) => a + (asignadoPorPartida(distributions, p) - pagadoPorPartida(distributions, p)),
    0,
  )

  return {
    cobrado,
    pagosReales,
    cambio,
    partidasNetas,
    sinDistribuir: sinDistribuir(invoices, distributions),
    divisaFisica: divisaFisicaVal,
    saldoBs,
    saldoBsUsdRef,
    bcvFaltante,
    diferencia: bcvFaltante
      ? null
      : Math.round((cobrado - pagosReales + cambio - (divisaFisicaVal + saldoBsUsdRef)) * 100) /
        100,
  }
}

// ─── Movimientos consolidados (tab Movimientos) ─────────────────────────────────
//
// Diario único del módulo Finanzas: cobros, asignaciones y pagos de partida,
// traspasos, compras/ventas de divisas y ajustes de la Caja Bs, en una sola lista.
// Es SOLO LECTURA — borrar y editar sigue siendo cosa de la tab de origen.

/** `true` si una fecha ISO (`YYYY-MM-DD`) cae dentro de `monthKey` (`YYYY-MM`). */
function enMes(fecha, monthKey) {
  return String(fecha ?? '').slice(0, 7) === monthKey
}

/** Monto firmado: positivo si entra, negativo si sale. */
function firmado(monto, kind) {
  const n = Math.abs(Number(monto ?? 0))
  return kind === 'out' ? -n : n
}

/**
 * Aplana en UNA sola lista todos los movimientos de dinero del mes, ordenados de
 * más reciente a más antiguo.
 *
 * REGLA DE DEDUPLICACIÓN — una fila por HECHO económico, emitida desde la tabla
 * donde el usuario lo creó. Las filas que escriben los triggers (`fin_bs_ledger` y
 * la partida técnica `cambio`) nunca son filas propias: se pliegan como columnas de
 * su fuente. Es la misma doctrina que ya rige el borrado (la cascada de borrado
 * vive en `deleteFxOperation`/`deleteBsLedgerEntry`). Sin esto, una compra de divisas ocuparía 3 renglones y cualquier
 * suma daría basura.
 *   - compra/venta de divisas → 1 fila desde `fin_fx_operations`; su pata en Bs va
 *     en `montoBs` y su resultado por cambio en `resultadoCambioUsd`.
 *   - cobro en Bs / pago directo en Bs → 1 fila desde su fuente (`amountBs`/`rate`
 *     ya viven ahí).
 *   - del libro de Bs SOLO entra `source === 'ajuste'`, que es la única fila del
 *     libro sin fila fuente (la única excepción manual del módulo).
 *
 * REGLA DE PERTENENCIA AL MES — manda la fecha DEL MOVIMIENTO (`paidOn`/`movedOn`),
 * no su `month_id`. Movimientos es un diario de caja: importa cuándo se movió el
 * dinero. Un cobro de la factura de agosto pagado el 3 de septiembre es un
 * movimiento de septiembre. Por eso `invoices`/`distributions` deben venir
 * ACUMULADOS hasta el mes (`loadInvoicesUpTo`/`loadDistributionsUpTo`), igual que
 * `fxOperations`/`bsLedger`: con solo el mes activo, ese cobro tardío no estaría en
 * memoria y desaparecería de las dos tabs.
 *
 * Límite conocido: la regla de fecha manda para MOSTRAR, pero solo dentro del
 * universo `month_id <= mes activo`. Un movimiento fechado en el mes M y guardado
 * bajo un `month_id` posterior (prepago) no aparece. Hoy no existe ese flujo en el
 * módulo (se factura a inicio de mes y se cobra después).
 *
 * @returns {Array<object>} filas con { id, tipo, naturaleza, sourceTable, sourceId,
 *   fecha, createdAt, concepto, contraparte, partida, moneda, montoUsd (firmado),
 *   montoBs (firmado), tasa, tasaBcv, resultadoCambioUsd, afectaCaja, interno }
 */
export function movimientosDelMes({
  invoices,
  distributions,
  fxOperations,
  bsLedger,
  year,
  month,
}) {
  const monthKey = `${year}-${String(month).padStart(2, '0')}`
  const rows = []

  const fila = (tipo, extra) => ({
    tipo,
    naturaleza: MOVIMIENTO_TIPOS[tipo].naturaleza,
    interno: MOVIMIENTO_TIPOS[tipo].naturaleza === 'interno',
    partida: null,
    contraparte: null,
    nota: null,
    montoBs: null,
    tasa: null,
    tasaBcv: null,
    resultadoCambioUsd: null,
    ...extra,
  })

  // 1. Cobros (fin_payments), por su fecha de pago.
  for (const inv of invoices ?? []) {
    for (const p of inv.payments ?? []) {
      if (!enMes(p.paidOn, monthKey)) continue
      // Mismo criterio de moneda que cobrosPorMonedaDe(): un abono cuenta como Bs si
      // trae amountBs, no por invoice.currency (que es configuración del cliente).
      const enBs = p.amountBs != null
      const canje = esIntercambio(p)
      rows.push(
        fila(canje ? 'canje' : 'cobro', {
          id: `pay:${p.id}`,
          sourceTable: 'fin_payments',
          sourceId: p.id,
          fecha: p.paidOn,
          createdAt: p.createdAt ?? null,
          concepto: inv.concept ?? 'Cobro',
          contraparte: inv.clientName ?? null,
          moneda: enBs ? 'Bs' : 'USD',
          montoUsd: firmado(p.amount, 'in'),
          montoBs: enBs ? firmado(p.amountBs, 'in') : null,
          tasa: p.rate ?? null,
          afectaCaja: canje ? 'ninguna' : enBs ? 'bs' : 'divisa',
        }),
      )
    }
  }

  // 2. Distribuciones: asignaciones, pagos y traspasos. Una fila 'cambio' se excluye
  //    SOLO si su operación de divisas está presente para plegarla; si la operación
  //    no aparece (borrado a medias, o fuera del rango cargado) se muestra como fila
  //    propia: mejor una fila rara visible que un dólar invisible.
  const fxIds = new Set((fxOperations ?? []).map((op) => op.id))
  const cambioPorFx = new Map()
  for (const d of distributions ?? []) {
    if (d.partida === PARTIDA_CAMBIO && d.fxOperationId && fxIds.has(d.fxOperationId)) {
      cambioPorFx.set(d.fxOperationId, d)
      continue
    }
    if (!enMes(d.movedOn, monthKey)) continue

    const tipo =
      d.partida === PARTIDA_CAMBIO
        ? 'cambio'
        : d.note === NOTA_TRASPASO_PARTIDA
          ? 'traspaso'
          : d.kind === 'out'
            ? 'pago'
            : 'asignacion'
    const enBs = d.currency === 'Bs'
    const mueveCaja = tipo === 'pago'
    rows.push(
      fila(tipo, {
        id: `dist:${d.id}`,
        sourceTable: 'fin_distributions',
        sourceId: d.id,
        fecha: d.movedOn,
        createdAt: d.createdAt ?? null,
        concepto: d.concept ?? '',
        contraparte: d.beneficiary ?? null,
        nota: d.note === NOTA_TRASPASO_PARTIDA ? null : (d.note ?? null),
        partida: d.partida,
        moneda: enBs ? 'Bs' : 'USD',
        montoUsd: firmado(d.amount, d.kind),
        montoBs: enBs && mueveCaja ? firmado(d.amountBs, d.kind) : null,
        tasa: enBs ? (d.rate ?? null) : null,
        afectaCaja: mueveCaja ? (enBs ? 'bs' : 'divisa') : 'ninguna',
      }),
    )
  }

  // 3. Compras y ventas de divisas: una fila que ya lleva su pata en Bs y su
  //    resultado por cambio. El delta se LEE de la fila 'cambio' que insertó el
  //    trigger, no se recalcula con deltaCambio(): una sola fórmula por número.
  for (const op of fxOperations ?? []) {
    if (!enMes(op.movedOn, monthKey)) continue
    const esCompra = op.opType === 'compra'
    const cambio = cambioPorFx.get(op.id)
    rows.push(
      fila(esCompra ? 'compra_divisa' : 'venta_divisa', {
        id: `fx:${op.id}`,
        sourceTable: 'fin_fx_operations',
        sourceId: op.id,
        fecha: op.movedOn,
        createdAt: op.createdAt ?? null,
        // El destino, no el tipo: la columna Tipo ya dice "Compra/Venta de divisas",
        // así que repetirlo en el concepto no aporta nada.
        concepto: op.purpose || (FX_OP_TYPES[op.opType]?.label ?? 'Operación de divisas'),
        contraparte: op.counterparty ?? null,
        moneda: 'Bs',
        // Una compra mete divisa y saca bolívares; una venta, al revés.
        montoUsd: firmado(op.amountUsd, esCompra ? 'in' : 'out'),
        montoBs: firmado(op.amountBs, esCompra ? 'out' : 'in'),
        tasa: op.rateReal ?? null,
        tasaBcv: op.rateBcv ?? null,
        resultadoCambioUsd: cambio ? firmado(cambio.amount, cambio.kind) : 0,
        afectaCaja: 'ambas',
      }),
    )
  }

  // 4. Ajustes de cuadre de la Caja Bs: su propia fuente.
  for (const l of bsLedger ?? []) {
    if (l.source !== 'ajuste' || !enMes(l.movedOn, monthKey)) continue
    rows.push(
      fila('ajuste_bs', {
        id: `bsl:${l.id}`,
        sourceTable: 'fin_bs_ledger',
        sourceId: l.id,
        fecha: l.movedOn,
        createdAt: l.createdAt ?? null,
        concepto: l.concept ?? 'Ajuste de cuadre',
        moneda: 'Bs',
        montoUsd: l.amountUsdRef == null ? null : firmado(l.amountUsdRef, l.kind),
        montoBs: firmado(l.amountBs, l.kind),
        tasa: l.rate ?? null,
        afectaCaja: 'bs',
      }),
    )
  }

  // Más reciente primero. `fecha` no tiene hora, así que dos movimientos del mismo
  // día empatarían y quedarían en el orden en que se cargaron (los más viejos
  // primero) — `createdAt` sí es un timestamp real y desempata bien. Mismo bug y
  // misma solución que DistribucionView.
  return rows.sort((a, b) => {
    if (a.fecha !== b.fecha) return a.fecha < b.fecha ? 1 : -1
    return String(a.createdAt ?? '') < String(b.createdAt ?? '') ? 1 : -1
  })
}

/**
 * Totales de un conjunto de filas de `movimientosDelMes()`. Solo agrega lo que de
 * verdad entra y sale de la empresa: las conversiones de divisa, las asignaciones,
 * los traspasos y los ajustes quedan fuera del neto a propósito — si se sumaran, el
 * neto contradiría el cuadre de caja que publica el Dashboard (`cuadreDivisas()`),
 * que es el dueño de ese número.
 */
export function totalesMovimientos(rows) {
  let entradas = 0
  let salidas = 0
  for (const r of rows ?? []) {
    if (r.naturaleza === 'ingreso') entradas += Math.abs(Number(r.montoUsd ?? 0))
    else if (r.naturaleza === 'egreso') salidas += Math.abs(Number(r.montoUsd ?? 0))
  }
  return { entradas, salidas, neto: entradas - salidas, cuenta: (rows ?? []).length }
}

/**
 * Brecha promedio ponderada del mes sobre las compras de divisas (spec §9): tasa
 * real promedio (ponderada por volumen) vs BCV promedio simple de esas compras.
 */
export function brechaPromedioPonderada(fxOperationsCompra) {
  const ops = fxOperationsCompra ?? []
  const totalBs = ops.reduce((a, o) => a + Number(o.amountBs ?? 0), 0)
  const totalUsd = ops.reduce((a, o) => a + Number(o.amountUsd ?? 0), 0)
  const bcvProm = ops.length ? ops.reduce((a, o) => a + Number(o.rateBcv ?? 0), 0) / ops.length : 0
  const tasaRealProm = totalUsd ? totalBs / totalUsd : 0
  return {
    tasaRealProm,
    bcvProm,
    brechaPct: bcvProm ? tasaRealProm / bcvProm - 1 : 0,
  }
}
