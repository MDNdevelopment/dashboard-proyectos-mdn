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
import { PARTIDAS } from '../components/finanzas/constants'

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

/** Meta presupuestada de una partida sobre lo cobrado del mes (66/20/14%). */
export function metaPartida(cobradoDelMes, partida) {
  return Number(cobradoDelMes ?? 0) * (PARTIDAS[partida]?.pct ?? 0)
}

/** % real que representa una partida sobre el total distribuido del mes. */
export function realPct(distsDelMes, partida) {
  const total = Object.keys(PARTIDAS).reduce((a, p) => a + asignadoPorPartida(distsDelMes, p), 0)
  if (!total) return 0
  return asignadoPorPartida(distsDelMes, partida) / total
}

/**
 * Desviación en puntos porcentuales de una partida respecto a su meta, con la
 * regla asimétrica de "favorable": en Gastos operativos, estar por DEBAJO de
 * la meta es favorable (se gasta menos); en Socios y Ganancia, estar por
 * ENCIMA es favorable. Desviaciones menores a 0.3 pts se consideran neutras.
 */
export function desviacionEnPuntos(distsDelMes, partida) {
  const puntos = (realPct(distsDelMes, partida) - (PARTIDAS[partida]?.pct ?? 0)) * 100
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
