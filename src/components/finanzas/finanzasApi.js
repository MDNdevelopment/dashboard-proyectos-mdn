/**
 * Capa de acceso a datos del módulo Finanzas. Todas las funciones retornan
 * { data, error }. Normaliza las filas de Supabase (snake_case) al shape
 * camelCase que consume src/utils/finanzas.js.
 *
 * La cartera de clientes NO vive aquí: se deriva de `metric_clients` vía
 * `loadClients`/`loadLines` de metricsApi.js (ver ARQUITECTURA.md §2.N) para no
 * duplicar mensualidad/línea/fechas de alta-baja que ya mantiene Empresa → Clientes.
 */
import { supabase } from '../../supabase'
import {
  invoiceRowsForNewMonth,
  cuadreDivisas,
  hoyISO,
  ultimoDiaDelMesISO,
} from '../../utils/finanzas'
import { normalizarRetenciones } from '../../utils/retenciones'

/**
 * Config de retenciones → las 5 columnas de `fin_invoices`. `null` escribe los
 * defaults, que dan neto = monto. Solo la usa `updateInvoice`: las retenciones
 * se marcan al registrar el cobro, así que una factura nace sin ellas.
 */
function columnasRetencion(retenciones) {
  const r = normalizarRetenciones(retenciones)
  return {
    ret_isl: r.isl,
    ret_isl_rate: r.islRate,
    ret_iva: r.iva,
    ret_iva_rate: r.ivaRate,
    ret_municipal: r.municipal,
  }
}

function normalizeInvoice(row) {
  if (!row) return row
  return {
    id: row.id,
    monthId: row.month_id,
    clientId: row.client_id,
    clientName: row.client_name,
    concept: row.concept,
    amount: Number(row.amount),
    currency: row.currency,
    amountBs: row.amount_bs == null ? null : Number(row.amount_bs),
    rate: row.rate == null ? null : Number(row.rate),
    // Snapshot de las retenciones vigentes cuando se emitió la factura. Es lo
    // que hace que un mes cerrado siga cuadrando aunque después le cambien la
    // configuración fiscal al cliente. Ver utils/retenciones.js.
    retenciones: {
      isl: !!row.ret_isl,
      islRate: row.ret_isl_rate == null ? null : Number(row.ret_isl_rate),
      iva: !!row.ret_iva,
      ivaRate: row.ret_iva_rate == null ? null : Number(row.ret_iva_rate),
      municipal: !!row.ret_municipal,
    },
    recurring: row.recurring,
    createdBy: row.created_by,
    createdAt: row.created_at,
    payments: (row.payments ?? []).map(normalizePayment),
  }
}

function normalizePayment(row) {
  return {
    id: row.id,
    invoiceId: row.invoice_id,
    paidOn: row.paid_on,
    amount: Number(row.amount),
    amountBs: row.amount_bs == null ? null : Number(row.amount_bs),
    rate: row.rate == null ? null : Number(row.rate),
    method: row.method,
    note: row.note,
    currency: row.currency,
    rateSource: row.rate_source,
    // `paidOn` es una fecha sin hora, así que no desempata dos cobros del mismo día;
    // `createdAt` sí (lo necesita el orden de la tab Movimientos — mismo problema que
    // ya documenta DistribucionView con movedOn).
    createdAt: row.created_at,
  }
}

function normalizeDistribution(row) {
  return {
    id: row.id,
    monthId: row.month_id,
    partida: row.partida,
    kind: row.kind,
    movedOn: row.moved_on,
    concept: row.concept,
    beneficiary: row.beneficiary,
    amount: Number(row.amount),
    invoiceId: row.invoice_id,
    note: row.note,
    createdBy: row.created_by,
    createdAt: row.created_at,
    currency: row.currency,
    amountBs: row.amount_bs == null ? null : Number(row.amount_bs),
    rate: row.rate == null ? null : Number(row.rate),
    fxOperationId: row.fx_operation_id,
  }
}

function normalizeRate(row) {
  if (!row) return row
  return {
    companyId: row.company_id,
    rateDate: row.rate_date,
    rateBcv: Number(row.rate_bcv),
    createdBy: row.created_by,
    createdAt: row.created_at,
  }
}

function normalizeFxOperation(row) {
  if (!row) return row
  return {
    id: row.id,
    companyId: row.company_id,
    monthId: row.month_id,
    opType: row.op_type,
    movedOn: row.moved_on,
    amountBs: Number(row.amount_bs),
    amountUsd: Number(row.amount_usd),
    rateReal: Number(row.rate_real),
    rateBcv: Number(row.rate_bcv),
    counterparty: row.counterparty,
    purpose: row.purpose,
    note: row.note,
    createdBy: row.created_by,
    createdAt: row.created_at,
  }
}

function normalizeBsLedgerEntry(row) {
  if (!row) return row
  return {
    id: row.id,
    companyId: row.company_id,
    monthId: row.month_id,
    movedOn: row.moved_on,
    kind: row.kind,
    source: row.source,
    amountBs: Number(row.amount_bs),
    rate: Number(row.rate),
    amountUsdRef: Number(row.amount_usd_ref),
    paymentId: row.payment_id,
    fxOperationId: row.fx_operation_id,
    distributionId: row.distribution_id,
    concept: row.concept,
    createdBy: row.created_by,
    createdAt: row.created_at,
  }
}

function normalizeMonth(row) {
  if (!row) return row
  return {
    id: row.id,
    companyId: row.company_id,
    year: row.year,
    month: row.month,
    closed: row.closed,
    closedAt: row.closed_at,
    closedBy: row.closed_by,
    pctGastos: Number(row.pct_gastos),
    pctSocios: Number(row.pct_socios),
    pctGanancia: Number(row.pct_ganancia),
    summaryOnly: !!row.summary_only,
  }
}

function normalizeMonthTotals(row) {
  if (!row) return row
  return {
    monthId: row.month_id,
    totalFacturado: Number(row.total_facturado),
    totalCobrado: Number(row.total_cobrado),
    totalGastos: Number(row.total_gastos),
    totalSocios: Number(row.total_socios),
    totalGanancia: Number(row.total_ganancia),
    totalDivisaFisica: Number(row.total_divisa_fisica ?? 0),
    saldoBs: Number(row.saldo_bs ?? 0),
    saldoBsUsdRef: Number(row.saldo_bs_usd_ref ?? 0),
    resultadoCambio: Number(row.resultado_cambio ?? 0),
    note: row.note,
    createdBy: row.created_by,
    createdAt: row.created_at,
  }
}

// ─── Meses ────────────────────────────────────────────────────────────────────

export async function loadMonths(companyId) {
  const { data, error } = await supabase
    .from('fin_months')
    .select('*')
    .eq('company_id', companyId)
    .order('year')
    .order('month')
  return { data: (data ?? []).map(normalizeMonth), error }
}

/** Solo lectura: null si el mes todavía no se ha abierto. No inserta (evita fallar por RLS
 *  a usuarios sin `finanzas.cerrar_mes` que solo están consultando). */
export async function loadMonth(companyId, year, month) {
  const { data, error } = await supabase
    .from('fin_months')
    .select('*')
    .eq('company_id', companyId)
    .eq('year', year)
    .eq('month', month)
    .maybeSingle()
  return { data: normalizeMonth(data), error }
}

export async function loadOrCreateMonth(companyId, year, month) {
  const { data: existing, error: findErr } = await supabase
    .from('fin_months')
    .select('*')
    .eq('company_id', companyId)
    .eq('year', year)
    .eq('month', month)
    .maybeSingle()
  if (findErr) return { data: null, error: findErr }
  if (existing) return { data: normalizeMonth(existing), error: null }

  const { data, error } = await supabase
    .from('fin_months')
    .insert({ company_id: companyId, year, month })
    .select()
    .single()
  return { data: normalizeMonth(data), error }
}

// ─── Mes resumen (totales sin desglose) ──────────────────────────────────────────

export async function loadMonthTotals(monthId) {
  const { data, error } = await supabase
    .from('fin_month_totals')
    .select('*')
    .eq('month_id', monthId)
    .maybeSingle()
  return { data: normalizeMonthTotals(data), error }
}

/**
 * Totales de TODOS los meses cerrados de la empresa (resumen o no — desde que
 * `closeMonth()` también snapshotea la composición en divisas de §10 al cerrar),
 * con su año/mes y si el mes es `summary_only` — para la tendencia del Dashboard,
 * que solo debe tomar `totalFacturado`/etc de un mes resumen (ver DashboardView.jsx:
 * un mes normal cerrado ya tiene su propio total derivado de `fin_invoices`, y este
 * snapshot no lo duplica para esas 5 columnas, solo para las 4 de divisas).
 */
export async function loadAllMonthTotals(companyId) {
  const { data, error } = await supabase
    .from('fin_month_totals')
    .select('*, month:fin_months!inner(year, month, company_id, summary_only)')
    .eq('month.company_id', companyId)
  if (error) return { data: [], error }
  return {
    data: (data ?? []).map((row) => ({
      year: row.month.year,
      month: row.month.month,
      summaryOnly: !!row.month.summary_only,
      totals: normalizeMonthTotals(row),
    })),
    error: null,
  }
}

/**
 * Crea (si no existe) un mes marcado `summary_only` y guarda sus 5 totales en un
 * solo movimiento. Se crea ya `closed` porque un mes de referencia sin desglose
 * no tiene un flujo de "cerrar" real — evita que quede abierto por accidente
 * aceptando facturación/cobros que nunca tendrán su detalle.
 */
export async function createSummaryMonth({ companyId, year, month, userId, totals }) {
  const { data: existing, error: findErr } = await supabase
    .from('fin_months')
    .select('*')
    .eq('company_id', companyId)
    .eq('year', year)
    .eq('month', month)
    .maybeSingle()
  if (findErr) return { data: null, error: findErr }
  if (existing) return { data: null, error: new Error('Ese mes ya existe.') }

  // Se crea SIN cerrar todavía: el trigger fin_block_closed_month() rechaza
  // cualquier insert en fin_month_totals si el mes ya está `closed` — hay que
  // guardar los totales primero y cerrar el mes después, en ese orden.
  const { data: monthRow, error: monthErr } = await supabase
    .from('fin_months')
    .insert({ company_id: companyId, year, month, summary_only: true })
    .select()
    .single()
  if (monthErr) return { data: null, error: monthErr }

  const { error: totalsErr } = await supabase.from('fin_month_totals').insert({
    month_id: monthRow.id,
    total_facturado: totals.totalFacturado,
    total_cobrado: totals.totalCobrado,
    total_gastos: totals.totalGastos,
    total_socios: totals.totalSocios,
    total_ganancia: totals.totalGanancia,
    note: totals.note ?? null,
    created_by: userId,
  })
  if (totalsErr) return { data: null, error: totalsErr }

  const { data: closedRow, error: closeErr } = await supabase
    .from('fin_months')
    .update({ closed: true, closed_at: new Date().toISOString(), closed_by: userId })
    .eq('id', monthRow.id)
    .select()
    .single()
  if (closeErr) return { data: null, error: closeErr }

  return { data: normalizeMonth(closedRow), error: null }
}

// ─── Facturas y cobros ──────────────────────────────────────────────────────────

/**
 * Últimas retenciones que se le aplicaron a un cliente, para precargar el modal
 * de cobro. Es una SUGERENCIA leída del historial, no una configuración: el
 * ISLR de una misma marca varía entre 2% y 5% de un mes a otro, así que quien
 * registra el cobro tiene que cotejarla contra el comprobante igual.
 *
 * @returns {{data: object|null, error}} config normalizada, o null si esa marca
 *   nunca tuvo retenciones (o es un cargo externo sin cliente).
 */
export async function loadUltimasRetenciones(clientId) {
  if (!clientId) return { data: null, error: null }
  const { data, error } = await supabase
    .from('fin_invoices')
    .select('ret_isl, ret_isl_rate, ret_iva, ret_iva_rate, ret_municipal, created_at')
    .eq('client_id', clientId)
    .or('ret_isl.eq.true,ret_iva.eq.true,ret_municipal.eq.true')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error || !data) return { data: null, error: error ?? null }
  return { data: normalizarRetenciones(data), error: null }
}

export async function loadInvoices(monthId) {
  const { data, error } = await supabase
    .from('fin_invoices')
    .select('*, payments:fin_payments(*)')
    .eq('month_id', monthId)
    .order('created_at')
  return { data: (data ?? []).map(normalizeInvoice), error }
}

/**
 * Todas las facturas de la empresa con el año/mes de su periodo, para "Por
 * cobrar" (cruza todos los meses) y para la tendencia del Dashboard.
 */
export async function loadAllInvoices(companyId) {
  const { data, error } = await supabase
    .from('fin_invoices')
    .select('*, payments:fin_payments(*), month:fin_months!inner(year, month, company_id)')
    .eq('month.company_id', companyId)
  if (error) return { data: [], error }
  return {
    data: (data ?? []).map((row) => ({
      year: row.month.year,
      month: row.month.month,
      invoice: normalizeInvoice(row),
    })),
    error: null,
  }
}

export async function createInvoice(monthId, fields) {
  const {
    clientId = null,
    clientName,
    concept,
    amount,
    currency = 'USD',
    amountBs = null,
    rate = null,
    recurring = true,
    createdBy = null,
  } = fields
  const { data, error } = await supabase
    .from('fin_invoices')
    .insert({
      month_id: monthId,
      client_id: clientId,
      client_name: clientName,
      concept,
      amount,
      currency,
      amount_bs: amountBs,
      rate,
      recurring,
      created_by: createdBy,
    })
    .select()
    .single()
  return { data: normalizeInvoice({ ...data, payments: [] }), error }
}

export async function updateInvoice(invoiceId, updates) {
  const patch = {}
  if ('clientId' in updates) patch.client_id = updates.clientId
  if ('clientName' in updates) patch.client_name = updates.clientName
  if ('concept' in updates) patch.concept = updates.concept
  if ('amount' in updates) patch.amount = updates.amount
  if ('currency' in updates) patch.currency = updates.currency
  if ('amountBs' in updates) patch.amount_bs = updates.amountBs
  if ('rate' in updates) patch.rate = updates.rate
  if ('retenciones' in updates) Object.assign(patch, columnasRetencion(updates.retenciones))
  if ('recurring' in updates) patch.recurring = updates.recurring
  const { data, error } = await supabase
    .from('fin_invoices')
    .update(patch)
    .eq('id', invoiceId)
    .select('*, payments:fin_payments(*)')
    .single()
  return { data: normalizeInvoice(data), error }
}

export async function deleteInvoice(invoiceId) {
  return supabase.from('fin_invoices').delete().eq('id', invoiceId)
}

export async function addPayment(
  invoiceId,
  {
    paidOn,
    amount,
    amountBs = null,
    rate = null,
    method = null,
    note = null,
    currency = 'USD',
    rateSource = null,
  },
) {
  const { data, error } = await supabase
    .from('fin_payments')
    .insert({
      invoice_id: invoiceId,
      paid_on: paidOn,
      amount,
      amount_bs: amountBs,
      rate,
      method,
      note,
      currency,
      rate_source: rateSource,
    })
    .select()
    .single()
  return { data: normalizePayment(data), error }
}

/**
 * Registra varios abonos de una misma factura en UN solo insert (p. ej. parte en
 * dinero y parte en intercambio dentro del mismo cobro). A propósito no es un
 * bucle de `addPayment()`: `fin_payments` es inmutable, y si la segunda llamada
 * fallara quedaría la factura abonada con solo una parte de lo que el usuario
 * registró. Un solo insert es atómico: entran todas las filas o ninguna.
 * @param {string} invoiceId
 * @param {Array<{paidOn, amount, amountBs?, rate?, method?, note?, currency?, rateSource?}>} rows
 */
export async function addPaymentsBatch(invoiceId, rows) {
  const { data, error } = await supabase
    .from('fin_payments')
    .insert(
      rows.map((r) => ({
        invoice_id: invoiceId,
        paid_on: r.paidOn,
        amount: r.amount,
        amount_bs: r.amountBs ?? null,
        rate: r.rate ?? null,
        method: r.method ?? null,
        note: r.note ?? null,
        currency: r.currency ?? 'USD',
        rate_source: r.rateSource ?? null,
      })),
    )
    .select()
  return { data: (data ?? []).map(normalizePayment), error }
}

export async function deletePayment(paymentId) {
  return supabase.from('fin_payments').delete().eq('id', paymentId)
}

/** Actualiza el reparto del mes. Valida que sumen 1 (con tolerancia de redondeo) antes de escribir. */
export async function updateMonthPcts(monthId, { gastos, socios, ganancia }) {
  const suma = Number(gastos) + Number(socios) + Number(ganancia)
  if (Math.abs(suma - 1) > 0.005) {
    return { data: null, error: new Error('Los porcentajes deben sumar 100%') }
  }
  const { data, error } = await supabase
    .from('fin_months')
    .update({ pct_gastos: gastos, pct_socios: socios, pct_ganancia: ganancia })
    .eq('id', monthId)
    .select()
    .single()
  return { data: normalizeMonth(data), error }
}

// ─── Distribución en partidas ───────────────────────────────────────────────────

export async function loadDistributions(monthId) {
  const { data, error } = await supabase
    .from('fin_distributions')
    .select('*')
    .eq('month_id', monthId)
    .order('moved_on')
  return { data: (data ?? []).map(normalizeDistribution), error }
}

/** Movimientos de TODOS los meses anteriores a (year, month), para arrastrar el saldo de partida. */
export async function loadDistributionsBefore(companyId, year, month) {
  const { data, error } = await supabase
    .from('fin_distributions')
    .select('*, month:fin_months!inner(year, month, company_id)')
    .eq('month.company_id', companyId)
    .or(`year.lt.${year},and(year.eq.${year},month.lt.${month})`, { foreignTable: 'month' })
  if (error) return { data: [], error }
  return { data: (data ?? []).map(normalizeDistribution), error: null }
}

export async function createDistribution(monthId, fields) {
  const {
    partida,
    kind = 'in',
    movedOn,
    concept,
    beneficiary = null,
    amount,
    invoiceId = null,
    note = null,
    createdBy = null,
    currency = 'USD',
    amountBs = null,
    rate = null,
  } = fields
  const { data, error } = await supabase
    .from('fin_distributions')
    .insert({
      month_id: monthId,
      partida,
      kind,
      moved_on: movedOn,
      concept,
      beneficiary,
      amount,
      invoice_id: invoiceId,
      note,
      created_by: createdBy,
      currency,
      amount_bs: amountBs,
      rate,
    })
    .select()
    .single()
  return { data: normalizeDistribution(data), error }
}

/**
 * Inserta varios movimientos de golpe en un solo insert (una sola llamada, atómica
 * a nivel de fila en Postgres) — usada por PagoPartidaModal para registrar, en un
 * único paso, el traspaso entre partidas y el pago cuando el saldo de la partida no
 * alcanza (ver "Pagar con traspaso" en ARQUITECTURA.md §2.15).
 */
export async function createDistributionsBatch(monthId, rows) {
  const { data, error } = await supabase
    .from('fin_distributions')
    .insert(
      rows.map((r) => ({
        month_id: monthId,
        partida: r.partida,
        kind: r.kind ?? 'in',
        moved_on: r.movedOn,
        concept: r.concept,
        beneficiary: r.beneficiary ?? null,
        amount: r.amount,
        invoice_id: r.invoiceId ?? null,
        note: r.note ?? null,
        created_by: r.createdBy ?? null,
        currency: r.currency ?? 'USD',
        amount_bs: r.amountBs ?? null,
        rate: r.rate ?? null,
      })),
    )
    .select()
  return { data: (data ?? []).map(normalizeDistribution), error }
}

/** Registra el split de un cobro en hasta 3 movimientos (uno por partida con monto > 0). */
export async function createDistributionSplit(
  monthId,
  { invoiceId, movedOn, amounts, note, createdBy },
) {
  const rows = Object.entries(amounts)
    .filter(([, amount]) => Number(amount) > 0)
    .map(([partida, amount]) => ({
      month_id: monthId,
      partida,
      kind: 'in',
      moved_on: movedOn,
      concept: 'Distribución de cobro',
      amount,
      invoice_id: invoiceId,
      note,
      created_by: createdBy,
    }))
  if (!rows.length) return { data: [], error: null }
  const { data, error } = await supabase.from('fin_distributions').insert(rows).select()
  return { data: (data ?? []).map(normalizeDistribution), error }
}

export async function deleteDistribution(distributionId) {
  return supabase.from('fin_distributions').delete().eq('id', distributionId)
}

/** Borra todas las distribuciones ligadas a una factura (revertir un cobro). */
export async function deleteDistributionsForInvoice(invoiceId) {
  return supabase.from('fin_distributions').delete().eq('invoice_id', invoiceId)
}

// ─── Divisas y Caja Bs (spec MAPPI-Finanzas-Divisas) ────────────────────────────
//
// `fin_bs_ledger` y la fila de la partida 'cambio' NO se insertan desde aquí: las
// generan los triggers de la migración 20260928100000 a partir de un cobro en Bs
// (fin_payments), una operación de divisas (fin_fx_operations) o un pago directo
// en Bs (fin_distributions) — ver el comentario de esa migración. Esta capa solo
// LEE el ledger y escribe las 2 operaciones de divisas + el ajuste de cuadre.

/**
 * Tasa BCV en vivo desde `/api/bcv-rate` (Netlify Function con fallback entre
 * pydolarve.org y ve.dolarapi.com — ver netlify/functions/bcv-rate.js). Nunca
 * lanza: devuelve `null` ante cualquier falla (sin sesión, red, 502, forma
 * inesperada) para que `resolveRateBcv()` caiga sola al histórico de `fin_rates`.
 */
/**
 * Memo de sesión de la tasa en vivo. `resolveRateBcv` corre dentro de CADA
 * recarga del periodo, y sin esto cada una repetía `getSession()` + el fetch a
 * `/api/bcv-rate` (que a su vez pega contra APIs externas desde la Netlify
 * Function) + el upsert a `fin_rates`. La tasa BCV del día no cambia dentro de
 * una sesión de trabajo; el TTL cubre el caso raro de que sí.
 */
const liveRateCache = new Map() // `${companyId}|${date}` -> { rate, at }
const LIVE_RATE_TTL_MS = 10 * 60 * 1000

/** Vacía el memo — solo para tests, que comparten el módulo entre casos. */
export function __resetLiveRateCache() {
  liveRateCache.clear()
}

async function fetchLiveBcvRate() {
  const {
    data: { session },
  } = await supabase.auth.getSession()
  if (!session?.access_token) return null
  try {
    const res = await fetch('/api/bcv-rate', {
      headers: { Authorization: `Bearer ${session.access_token}` },
    })
    if (!res.ok) return null
    const payload = await res.json()
    const rate = Number(payload?.rate)
    return rate > 0 ? rate : null
  } catch {
    return null
  }
}

/**
 * Tasa BCV vigente para una fecha. Si `date` es hoy, intenta primero la API en
 * vivo (`fetchLiveBcvRate`) y, si responde, la deja cacheada en `fin_rates`
 * (best-effort: si el `upsert` falla por RLS — el caller puede no tener
 * `finanzas.distribucion.manage` — igual se usa la tasa, solo no queda guardada
 * para los demás). Si la API no respondió o `date` no es hoy (ej. `closeMonth()`
 * resolviendo el último día de un mes pasado), cae a los 3 escalones históricos
 * de `fin_rates` (ninguno bloqueante — antes era el único camino, con el botón
 * manual de `TasaBcvModal.jsx`, ya eliminado):
 *  - 'bcv': hay una fila exacta para esa fecha (o la que acaba de traer la API).
 *  - 'stale': no hay fila exacta, se usa la más reciente ANTERIOR (§5.1 lo pide así).
 *  - 'missing': no hay ninguna fila anterior — el caller debe pedir la tasa a mano.
 */
export async function resolveRateBcv(companyId, date) {
  const today = hoyISO()
  if (date === today) {
    const cacheKey = `${companyId}|${date}`
    const cached = liveRateCache.get(cacheKey)
    if (cached && Date.now() - cached.at < LIVE_RATE_TTL_MS) {
      return { data: { rate: cached.rate, rateDate: date, source: 'bcv' }, error: null }
    }
    const live = await fetchLiveBcvRate()
    if (live) {
      liveRateCache.set(cacheKey, { rate: live, at: Date.now() })
      try {
        await upsertRate({ companyId, rateDate: date, rateBcv: live, userId: null })
      } catch {
        // best-effort: sin permiso de escritura en fin_rates, se usa la tasa igual.
      }
      return { data: { rate: live, rateDate: date, source: 'bcv' }, error: null }
    }
  }

  const { data: exact, error: exactErr } = await supabase
    .from('fin_rates')
    .select('rate_bcv, rate_date')
    .eq('company_id', companyId)
    .eq('rate_date', date)
    .maybeSingle()
  if (exactErr) return { data: null, error: exactErr }
  if (exact) {
    return {
      data: { rate: Number(exact.rate_bcv), rateDate: exact.rate_date, source: 'bcv' },
      error: null,
    }
  }

  const { data: prev, error: prevErr } = await supabase
    .from('fin_rates')
    .select('rate_bcv, rate_date')
    .eq('company_id', companyId)
    .lte('rate_date', date)
    .order('rate_date', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (prevErr) return { data: null, error: prevErr }
  if (prev) {
    return {
      data: { rate: Number(prev.rate_bcv), rateDate: prev.rate_date, source: 'stale' },
      error: null,
    }
  }

  return { data: { rate: null, rateDate: null, source: 'missing' }, error: null }
}

export async function loadRates(companyId) {
  const { data, error } = await supabase
    .from('fin_rates')
    .select('*')
    .eq('company_id', companyId)
    .order('rate_date', { ascending: false })
  return { data: (data ?? []).map(normalizeRate), error }
}

export async function upsertRate({ companyId, rateDate, rateBcv, userId }) {
  const { data, error } = await supabase
    .from('fin_rates')
    .upsert(
      { company_id: companyId, rate_date: rateDate, rate_bcv: rateBcv, created_by: userId },
      { onConflict: 'company_id,rate_date' },
    )
    .select()
    .single()
  return { data: normalizeRate(data), error }
}

export async function loadFxOperations(monthId) {
  const { data, error } = await supabase
    .from('fin_fx_operations')
    .select('*')
    .eq('month_id', monthId)
    .order('moved_on')
  return { data: (data ?? []).map(normalizeFxOperation), error }
}

/** Todas las operaciones de divisas de la empresa con año/mes <= (year, month) — para el cuadre y el cierre. */
export async function loadFxOperationsUpTo(companyId, year, month) {
  const { data, error } = await supabase
    .from('fin_fx_operations')
    .select('*, month:fin_months!inner(year, month, company_id)')
    .eq('month.company_id', companyId)
    .or(`year.lt.${year},and(year.eq.${year},month.lte.${month})`, { foreignTable: 'month' })
  if (error) return { data: [], error }
  return { data: (data ?? []).map(normalizeFxOperation), error: null }
}

/**
 * Registra una compra o venta de divisas. El trigger `fin_fx_sync` genera solo
 * la fila del libro de Bs y, si hubo brecha, la fila de la partida 'cambio' —
 * esta función no las inserta.
 */
export async function createFxOperation(monthId, fields) {
  const {
    companyId,
    opType,
    movedOn,
    amountBs,
    amountUsd,
    rateBcv,
    counterparty = null,
    purpose = null,
    note = null,
    createdBy = null,
  } = fields
  const { data, error } = await supabase
    .from('fin_fx_operations')
    .insert({
      company_id: companyId,
      month_id: monthId,
      op_type: opType,
      moved_on: movedOn,
      amount_bs: amountBs,
      amount_usd: amountUsd,
      rate_bcv: rateBcv,
      counterparty,
      purpose,
      note,
      created_by: createdBy,
    })
    .select()
    .single()
  return { data: normalizeFxOperation(data), error }
}

/**
 * Borra una operación de divisas. Inmutable a propósito (sin `updateFxOperation`):
 * corregir un error es borrar y volver a registrar — el `on delete cascade` de
 * `fin_bs_ledger.fx_operation_id` y `fin_distributions.fx_operation_id` limpia sus
 * 2 filas derivadas sin necesitar lógica de resincronización.
 */
export async function deleteFxOperation(id) {
  return supabase.from('fin_fx_operations').delete().eq('id', id)
}

export async function loadBsLedger(monthId) {
  const { data, error } = await supabase
    .from('fin_bs_ledger')
    .select('*')
    .eq('month_id', monthId)
    .order('moved_on')
  return { data: (data ?? []).map(normalizeBsLedgerEntry), error }
}

/** Todo el libro de Caja Bs con año/mes <= (year, month) — es un libro ACUMULADO, nunca se cierra por mes (§10). */
export async function loadBsLedgerUpTo(companyId, year, month) {
  const { data, error } = await supabase
    .from('fin_bs_ledger')
    .select('*, month:fin_months!inner(year, month, company_id)')
    .eq('month.company_id', companyId)
    .or(`year.lt.${year},and(year.eq.${year},month.lte.${month})`, { foreignTable: 'month' })
  if (error) return { data: [], error }
  return { data: (data ?? []).map(normalizeBsLedgerEntry), error: null }
}

/**
 * Ajuste de cuadre contra el banco — el único movimiento del libro de Bs que se
 * llena a mano (`source: 'ajuste'`), para conciliar intereses, comisiones o
 * diferencias de redondeo (§8.4). La policy de `fin_bs_ledger` solo permite
 * insertar con este `source` y sin ninguno de los 3 FK de origen.
 */
export async function createBsAdjustment({
  companyId,
  monthId,
  movedOn,
  kind,
  amountBs,
  rate,
  concept,
  createdBy = null,
}) {
  const amountUsdRef = rate ? Math.round((Number(amountBs) / Number(rate)) * 100) / 100 : 0
  const { data, error } = await supabase
    .from('fin_bs_ledger')
    .insert({
      company_id: companyId,
      month_id: monthId,
      moved_on: movedOn,
      kind,
      source: 'ajuste',
      amount_bs: amountBs,
      rate,
      amount_usd_ref: amountUsdRef,
      // Explícitos en null: la policy de insert exige que un ajuste NO traiga
      // ninguna fila fuente (ver fin_bs_ledger_ajuste_insert en la migración).
      payment_id: null,
      fx_operation_id: null,
      distribution_id: null,
      concept,
      created_by: createdBy,
    })
    .select()
    .single()
  return { data: normalizeBsLedgerEntry(data), error }
}

export async function deleteBsLedgerEntry(id) {
  return supabase.from('fin_bs_ledger').delete().eq('id', id)
}

/**
 * Todas las facturas de la empresa con año/mes <= (year, month) — para el
 * snapshot de cierre y para el invariante de cuadre en vivo (Caja Bs, §7).
 */
export async function loadInvoicesUpTo(companyId, year, month) {
  const { data, error } = await supabase
    .from('fin_invoices')
    .select('*, payments:fin_payments(*), month:fin_months!inner(year, month, company_id)')
    .eq('month.company_id', companyId)
    .or(`year.lt.${year},and(year.eq.${year},month.lte.${month})`, { foreignTable: 'month' })
  if (error) return { data: [], error }
  return { data: (data ?? []).map(normalizeInvoice), error: null }
}

/**
 * Todas las distribuciones de la empresa con año/mes <= (year, month) — para el
 * snapshot de cierre y para el invariante de cuadre en vivo.
 */
export async function loadDistributionsUpTo(companyId, year, month) {
  const { data, error } = await supabase
    .from('fin_distributions')
    .select('*, month:fin_months!inner(year, month, company_id)')
    .eq('month.company_id', companyId)
    .or(`year.lt.${year},and(year.eq.${year},month.lte.${month})`, { foreignTable: 'month' })
  if (error) return { data: [], error }
  return { data: (data ?? []).map(normalizeDistribution), error: null }
}

// ─── Cierre de mes ───────────────────────────────────────────────────────────────

function nextYearMonth(year, month) {
  return month >= 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 }
}

function prevYearMonth(year, month) {
  return month <= 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 }
}

// ─── Exclusiones de facturación ─────────────────────────────────────────────────
//
// Marcas cuya facturación se borró a propósito. Sin esto, la reconciliación de
// `syncMonthInvoices` volvería a crearla en la siguiente visita y no habría forma
// de sacar a una marca del mes salvo darle de baja en Empresa.

/**
 * clientIds excluidos para (year, month): la exclusión aplica desde el mes en
 * que se registró hacia adelante, así que basta con que su (year, month) sea
 * <= al consultado — borrar el cargo de una marca en octubre la deja fuera
 * también de noviembre, en vez de reaparecer sola cada mes.
 */
export async function loadInvoiceExclusions(companyId, year, month) {
  const { data, error } = await supabase
    .from('fin_invoice_exclusions')
    .select('client_id, year, month')
    .eq('company_id', companyId)
    .or(`year.lt.${year},and(year.eq.${year},month.lte.${month})`)
  if (error) return { data: [], error }
  return { data: (data ?? []).map((r) => r.client_id), error: null }
}

export async function addInvoiceExclusion({ companyId, clientId, year, month, userId = null }) {
  const { error } = await supabase
    .from('fin_invoice_exclusions')
    .upsert(
      { company_id: companyId, client_id: clientId, year, month, created_by: userId },
      { onConflict: 'company_id,client_id,year,month' },
    )
  return { error }
}

/**
 * Levanta la exclusión de una marca al volver a darle facturación. Borra también
 * las de meses anteriores: si no, la exclusión vieja (que aplica "de ahí en
 * adelante") seguiría tapando a la marca en los meses siguientes.
 */
export async function clearInvoiceExclusions(companyId, clientId, year, month) {
  const { error } = await supabase
    .from('fin_invoice_exclusions')
    .delete()
    .eq('company_id', companyId)
    .eq('client_id', clientId)
    .or(`year.lt.${year},and(year.eq.${year},month.lte.${month})`)
  return { error }
}

/**
 * Deja el mes con la facturación de TODOS sus clientes activos, insertando solo
 * los que falten (ver `invoiceRowsForNewMonth`, que decide monto y descarta
 * excluidos). Idempotente y sin efecto sobre las facturas ya cargadas, así que
 * puede correrse en cada visita a Facturación: es lo que hace que la lista esté
 * siempre fija sin agregar marcas a mano, incluso en un mes que se creó vacío
 * por otro camino (antes `seedRecurringInvoices` abortaba en cuanto el mes tenía
 * una sola factura, y solo corría desde el botón "Abrir mes").
 *
 * @returns {{ inserted: number, error: any }} `inserted` = filas creadas, para
 *   que la vista solo refresque cuando algo cambió.
 */
export async function syncMonthInvoices({ companyId, monthId, year, month, clients, userId }) {
  const { data: existing, error: existingErr } = await loadInvoices(monthId)
  if (existingErr) return { inserted: 0, error: existingErr }

  const prev = prevYearMonth(year, month)
  const [{ data: prevMonth }, { data: excludedClientIds }] = await Promise.all([
    loadMonth(companyId, prev.year, prev.month),
    loadInvoiceExclusions(companyId, year, month),
  ])
  let prevInvoices = []
  if (prevMonth) {
    const { data } = await loadInvoices(prevMonth.id)
    prevInvoices = data ?? []
  }

  const rows = invoiceRowsForNewMonth({
    prevInvoices,
    clients,
    year,
    month,
    existingInvoices: existing ?? [],
    excludedClientIds: excludedClientIds ?? [],
  })
  if (!rows.length) return { inserted: 0, error: null }

  const { error } = await supabase.from('fin_invoices').insert(
    rows.map((r) => ({
      month_id: monthId,
      client_id: r.clientId,
      client_name: r.clientName,
      concept: r.concept,
      amount: r.amount,
      currency: r.currency,
      amount_bs: r.amountBs ?? null,
      rate: r.rate ?? null,
      recurring: r.recurring,
      created_by: userId ?? null,
    })),
  )
  return { inserted: error ? 0 : rows.length, error }
}

/**
 * Cierra el mes actual y abre el siguiente, precargando su facturación vía
 * `syncMonthInvoices` — que ya copia también los cargos externos recurrentes del
 * mes cerrado, así que no hace falta un segundo camino para ellos (antes
 * duplicaba la lógica del sembrado para esto).
 *
 * Antes de cerrar, snapshotea en `fin_month_totals` las 4 cifras de composición
 * en divisas del mes que se cierra (§10 de la spec): divisa física, saldo de
 * Caja Bs, su equivalente en USD y el resultado por cambio, TODO acumulado hasta
 * este mes inclusive (la Caja Bs y la divisa física nunca se reinician por mes).
 * El orden es el mismo que `createSummaryMonth()`: los totales se escriben ANTES
 * de marcar `closed`, porque el trigger `fin_block_closed_month()` rechaza
 * cualquier escritura en `fin_month_totals` de un mes ya cerrado.
 */
export async function closeMonth({ companyId, monthId, year, month, userId, clients }) {
  const [
    { data: invoicesUpTo },
    { data: distributionsUpTo },
    { data: fxOperationsUpTo },
    { data: ledgerUpTo },
  ] = await Promise.all([
    loadInvoicesUpTo(companyId, year, month),
    loadDistributionsUpTo(companyId, year, month),
    loadFxOperationsUpTo(companyId, year, month),
    loadBsLedgerUpTo(companyId, year, month),
  ])
  const lastDayOfMonth = ultimoDiaDelMesISO(year, month)
  const { data: rateInfo } = await resolveRateBcv(companyId, lastDayOfMonth)
  const cuadre = cuadreDivisas({
    invoices: invoicesUpTo,
    distributions: distributionsUpTo,
    fxOperations: fxOperationsUpTo,
    ledger: ledgerUpTo,
    rateBcv: rateInfo?.rate,
  })
  const { error: totalsErr } = await supabase.from('fin_month_totals').upsert(
    {
      month_id: monthId,
      total_divisa_fisica: cuadre.divisaFisica,
      saldo_bs: cuadre.saldoBs,
      saldo_bs_usd_ref: cuadre.saldoBsUsdRef,
      resultado_cambio: cuadre.cambio,
      created_by: userId,
    },
    { onConflict: 'month_id' },
  )
  if (totalsErr) return { data: null, error: totalsErr }

  const { error: closeErr } = await supabase
    .from('fin_months')
    .update({ closed: true, closed_at: new Date().toISOString(), closed_by: userId })
    .eq('id', monthId)
  if (closeErr) return { data: null, error: closeErr }

  const next = nextYearMonth(year, month)
  const { data: nextMonth, error: nextErr } = await loadOrCreateMonth(
    companyId,
    next.year,
    next.month,
  )
  if (nextErr) return { data: null, error: nextErr }

  const { error: seedErr } = await syncMonthInvoices({
    companyId,
    monthId: nextMonth.id,
    year: next.year,
    month: next.month,
    clients,
    userId,
  })
  if (seedErr) return { data: null, error: seedErr }

  return { data: nextMonth, error: null }
}
