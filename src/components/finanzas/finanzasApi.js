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
import { invoiceRowsForNewMonth } from '../../utils/finanzas'

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

/** Totales de todos los meses resumen de la empresa, con su año/mes — para la tendencia del Dashboard. */
export async function loadAllMonthTotals(companyId) {
  const { data, error } = await supabase
    .from('fin_month_totals')
    .select('*, month:fin_months!inner(year, month, company_id)')
    .eq('month.company_id', companyId)
  if (error) return { data: [], error }
  return {
    data: (data ?? []).map((row) => ({
      year: row.month.year,
      month: row.month.month,
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

// ─── Cierre de mes ───────────────────────────────────────────────────────────────

function nextYearMonth(year, month) {
  return month >= 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 }
}

function prevYearMonth(year, month) {
  return month <= 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 }
}

/**
 * Precarga la facturación de un mes copiando la del mes anterior tal cual
 * (montos/conceptos ya ajustados, incluidos los clientes externos), sembrando
 * solo las altas nuevas desde `monthly_fee` — ver `invoiceRowsForNewMonth`. La
 * factura siempre sale a inicio de mes independientemente de cuándo se cobre,
 * así que el mes debe abrir con sus clientes ya cargados. Idempotente: si el
 * mes ya tiene alguna factura no inserta nada, para no duplicar cuando
 * `closeMonth` ya la precargó.
 */
export async function seedRecurringInvoices({ companyId, monthId, year, month, clients }) {
  const { data: existing, error: existingErr } = await loadInvoices(monthId)
  if (existingErr) return { error: existingErr }
  if (existing?.length) return { error: null }

  const prev = prevYearMonth(year, month)
  const { data: prevMonth } = await loadMonth(companyId, prev.year, prev.month)
  let prevInvoices = []
  if (prevMonth) {
    const { data } = await loadInvoices(prevMonth.id)
    prevInvoices = data ?? []
  }

  const rows = invoiceRowsForNewMonth({ prevInvoices, clients, year, month })
  if (!rows.length) return { error: null }

  const { error } = await supabase.from('fin_invoices').insert(
    rows.map((r) => ({
      month_id: monthId,
      client_id: r.clientId,
      client_name: r.clientName,
      concept: r.concept,
      amount: r.amount,
      currency: r.currency,
      recurring: r.recurring,
    })),
  )
  return { error }
}

/**
 * Cierra el mes actual y abre el siguiente, precargando su facturación vía
 * `seedRecurringInvoices` — que ya copia también los cargos externos
 * recurrentes del mes cerrado, así que no hace falta un segundo camino para
 * ellos (antes duplicaba la lógica de `seedRecurringInvoices` para esto).
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

  const { error: seedErr } = await seedRecurringInvoices({
    companyId,
    monthId: nextMonth.id,
    year: next.year,
    month: next.month,
    clients,
  })
  if (seedErr) return { data: null, error: seedErr }

  return { data: nextMonth, error: null }
}
