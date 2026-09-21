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
import { PARTIDAS_PCT_DEFAULT } from '../components/finanzas/constants'
import { clientInMonth } from './clientInMonth'

/** Tolerancia usada en todo el módulo para tratar redondeos como iguales. */
const EPS = 0.5

// ─── Facturas y cobros ──────────────────────────────────────────────────────────

/** Suma de los abonos registrados a una factura. */
export function cobradoDe(invoice) {
  return (invoice?.payments ?? []).reduce((a, p) => a + Number(p.amount ?? 0), 0)
}

/** Monto que aún falta cobrar de una factura. */
export function pendienteDe(invoice) {
  return Number(invoice?.amount ?? 0) - cobradoDe(invoice)
}

/**
 * Estado derivado de una factura — nunca se guarda como columna, siempre se
 * calcula desde sus pagos (evita la clase de bug que tuvo el prototipo: un
 * `status` que se desincroniza de la suma real de abonos).
 * @returns {'pendiente'|'abonado'|'cobrado'}
 */
export function estadoFactura(invoice) {
  const cobrado = cobradoDe(invoice)
  if (cobrado <= EPS) return 'pendiente'
  if (pendienteDe(invoice) > EPS) return 'abonado'
  return 'cobrado'
}

export function totalFacturado(invoices) {
  return (invoices ?? []).reduce((a, i) => a + Number(i.amount ?? 0), 0)
}

export function totalCobrado(invoices) {
  return (invoices ?? []).reduce((a, i) => a + cobradoDe(i), 0)
}

export function totalPorCobrar(invoices) {
  return totalFacturado(invoices) - totalCobrado(invoices)
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
      if (p.amountBs != null) bs += Number(p.amount ?? 0)
      else divisa += Number(p.amount ?? 0)
    }
  }
  return { bs, divisa }
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

// ─── Por cobrar / análisis ───────────────────────────────────────────────────────

/**
 * Aplana las facturas de varios meses en una sola lista de cuentas por cobrar,
 * incluyendo solo las que aún tienen pendiente > tolerancia.
 * @param {Array<{year:number, month:number, invoices:Array}>} monthsWithInvoices
 * @returns {Array<{year, month, invoice, cobrado, pendiente}>}
 */
export function cuentasPorCobrar(monthsWithInvoices) {
  const out = []
  for (const { year, month, invoices } of monthsWithInvoices ?? []) {
    for (const invoice of invoices ?? []) {
      const cobrado = cobradoDe(invoice)
      const pendiente = Number(invoice.amount ?? 0) - cobrado
      if (pendiente > EPS) out.push({ year, month, invoice, cobrado, pendiente })
    }
  }
  return out
}

/** Tasa de cobranza del mes: cobrado / facturado (0 si no hay facturación). */
export function tasaCobranza(invoices) {
  const fac = totalFacturado(invoices)
  return fac ? totalCobrado(invoices) / fac : 0
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
