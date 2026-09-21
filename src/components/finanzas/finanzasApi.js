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
import { clientInMonth } from '../../utils/clientInMonth'
import { CONCEPTO_RECURRENTE } from './constants'

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

// ─── Facturas y cobros ──────────────────────────────────────────────────────────

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
  { paidOn, amount, amountBs = null, rate = null, method = null, note = null },
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
    })
    .select()
    .single()
  return { data: normalizePayment(data), error }
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
    })
    .select()
    .single()
  return { data: normalizeDistribution(data), error }
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

// ─── Cierre de mes ───────────────────────────────────────────────────────────────

function nextYearMonth(year, month) {
  return month >= 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 }
}

/**
 * Cierra el mes actual y abre el siguiente, precargando su facturación
 * recurrente: un cargo por cada cliente activo según `clientInMonth` (fuente
 * única de verdad compartida con Reportes) tomando `monthly_fee`, más una
 * copia de las facturas recurrentes externas (sin client_id) del mes cerrado.
 * No es un RPC de Postgres a propósito: reimplementar clientInMonth() en SQL
 * duplicaría una regla con varios casos (mdn_since/contract_end/deleted_at/
 * baja_incluye_mes) que ya vive una sola vez en JS.
 */
export async function closeMonth({ companyId, monthId, year, month, userId, clients }) {
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

  const recurringClients = (clients ?? []).filter(
    (c) => Number(c.monthly_fee) > 0 && clientInMonth(c, next.year, next.month),
  )
  const { data: externalInvoices } = await loadInvoices(monthId)
  const externalRecurring = (externalInvoices ?? []).filter(
    (i) => i.recurring && i.clientId == null,
  )

  const rows = [
    ...recurringClients.map((c) => ({
      month_id: nextMonth.id,
      client_id: c.id,
      client_name: c.name,
      concept: CONCEPTO_RECURRENTE,
      amount: c.monthly_fee,
      currency: 'USD',
      recurring: true,
    })),
    ...externalRecurring.map((i) => ({
      month_id: nextMonth.id,
      client_id: null,
      client_name: i.clientName,
      concept: i.concept,
      amount: i.amount,
      currency: i.currency,
      recurring: true,
    })),
  ]

  if (rows.length) {
    const { error: insErr } = await supabase.from('fin_invoices').insert(rows)
    if (insErr) return { data: null, error: insErr }
  }

  return { data: nextMonth, error: null }
}
