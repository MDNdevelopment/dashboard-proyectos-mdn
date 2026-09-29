import { vi } from 'vitest'
import { createSupabaseMock, makeQuery } from './helpers/supabaseMock'

vi.mock('../supabase', () => ({
  supabase: createSupabaseMock({
    tables: {
      fin_payments: [
        {
          id: 'p-new',
          invoice_id: 'inv-1',
          paid_on: '2026-08-05',
          amount: 100,
          amount_bs: null,
          rate: null,
          method: null,
          note: null,
        },
      ],
      fin_months: [
        {
          id: 'm-1',
          company_id: 'co-1',
          year: 2026,
          month: 8,
          closed: false,
          pct_gastos: 0.72,
          pct_socios: 0.18,
          pct_ganancia: 0.1,
        },
      ],
      fin_invoices: [
        {
          id: 'inv-1',
          month_id: 'm-1',
          client_id: 'c-1',
          client_name: 'Turbopre',
          concept: 'Gestión de redes',
          amount: 2600,
          currency: 'USD',
          recurring: true,
          payments: [
            {
              id: 'p-1',
              invoice_id: 'inv-1',
              paid_on: '2026-07-05',
              amount: 1000,
              method: 'Zelle',
              note: null,
            },
          ],
        },
      ],
      fin_month_totals: [
        {
          month_id: 'm-1',
          total_facturado: 5000,
          total_cobrado: 4800,
          total_gastos: 3456,
          total_socios: 864,
          total_ganancia: 480,
          note: 'del sheet',
          created_by: 'u-1',
          created_at: '2026-09-22T00:00:00Z',
        },
      ],
      fin_invoice_exclusions: [],
      fin_rates: [],
      fin_fx_operations: [],
      fin_bs_ledger: [],
      fin_distributions: [
        {
          id: 'd-new',
          month_id: 'm-1',
          partida: 'gastos',
          kind: 'out',
          moved_on: '2026-09-23',
          concept: 'Nómina',
          amount: 750,
          currency: 'Bs',
          amount_bs: 612000,
          rate: 816,
        },
      ],
    },
  }),
}))

import { supabase } from '../supabase'
import {
  loadInvoices,
  createInvoice,
  updateInvoice,
  createDistributionSplit,
  createDistributionsBatch,
  createDistribution,
  addPayment,
  updateMonthPcts,
  loadMonthTotals,
  loadAllMonthTotals,
  createSummaryMonth,
  syncMonthInvoices,
  loadInvoiceExclusions,
  addInvoiceExclusion,
  closeMonth,
  resolveRateBcv,
  createFxOperation,
  createBsAdjustment,
  __resetLiveRateCache,
} from '../components/finanzas/finanzasApi'

beforeEach(() => {
  vi.clearAllMocks()
  // El memo de la tasa en vivo es estado de módulo: sin limpiarlo, el primer
  // test que resuelve una tasa se la sirve cacheada a todos los siguientes.
  __resetLiveRateCache()
})

describe('finanzasApi — loadInvoices', () => {
  it('normaliza snake_case a camelCase, incluyendo pagos anidados', async () => {
    const { data, error } = await loadInvoices('m-1')
    expect(error).toBeNull()
    expect(data).toEqual([
      expect.objectContaining({
        id: 'inv-1',
        monthId: 'm-1',
        clientId: 'c-1',
        clientName: 'Turbopre',
        amount: 2600,
        payments: [
          expect.objectContaining({
            id: 'p-1',
            paidOn: '2026-07-05',
            amount: 1000,
            method: 'Zelle',
          }),
        ],
      }),
    ])
  })

  it('filtra por month_id', async () => {
    await loadInvoices('m-1')
    const query = supabase.from.mock.results.at(-1).value
    expect(query.eq).toHaveBeenCalledWith('month_id', 'm-1')
  })
})

describe('finanzasApi — createInvoice', () => {
  it('inserta con los nombres de columna en snake_case', async () => {
    await createInvoice('m-1', {
      clientId: 'c-1',
      clientName: 'Turbopre',
      concept: 'Gestión de redes',
      amount: 2600,
      currency: 'USD',
      recurring: true,
      createdBy: 'u-1',
    })
    const query = supabase.from.mock.results.at(-1).value
    expect(query.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        month_id: 'm-1',
        client_id: 'c-1',
        client_name: 'Turbopre',
        amount: 2600,
        created_by: 'u-1',
      }),
    )
  })

  it('manda amount_bs y rate cuando la factura es en Bs', async () => {
    await createInvoice('m-1', {
      clientId: 'c-1',
      clientName: 'Turbopre',
      concept: 'Gestión de redes',
      amount: 750,
      currency: 'Bs',
      amountBs: 637500,
      rate: 850,
      recurring: true,
      createdBy: 'u-1',
    })
    const query = supabase.from.mock.results.at(-1).value
    expect(query.insert).toHaveBeenCalledWith(
      expect.objectContaining({ currency: 'Bs', amount_bs: 637500, rate: 850 }),
    )
  })

  it('deja amount_bs y rate en null para una factura en USD', async () => {
    await createInvoice('m-1', {
      clientId: 'c-1',
      clientName: 'Turbopre',
      concept: 'Gestión de redes',
      amount: 2600,
      createdBy: 'u-1',
    })
    const query = supabase.from.mock.results.at(-1).value
    expect(query.insert).toHaveBeenCalledWith(
      expect.objectContaining({ amount_bs: null, rate: null }),
    )
  })
})

describe('finanzasApi — updateInvoice', () => {
  it('manda amount_bs/rate solo cuando vienen en las actualizaciones (patch condicional)', async () => {
    await updateInvoice('inv-1', { amountBs: 612000, rate: 816 })
    const query = supabase.from.mock.results.at(-1).value
    expect(query.update).toHaveBeenCalledWith({ amount_bs: 612000, rate: 816 })
  })
})

describe('finanzasApi — createDistributionsBatch', () => {
  it('inserta todas las filas en un solo insert, con los nombres de columna en snake_case', async () => {
    await createDistributionsBatch('m-1', [
      { partida: 'ganancia', kind: 'out', movedOn: '2026-09-22', concept: 'Traspaso', amount: 50 },
      { partida: 'gastos', kind: 'in', movedOn: '2026-09-22', concept: 'Traspaso', amount: 50 },
      { partida: 'gastos', kind: 'out', movedOn: '2026-09-22', concept: 'Nómina', amount: 150 },
    ])
    const query = supabase.from.mock.results.at(-1).value
    const inserted = query.insert.mock.calls[0][0]
    expect(inserted).toHaveLength(3)
    expect(inserted[0]).toEqual(
      expect.objectContaining({
        month_id: 'm-1',
        partida: 'ganancia',
        kind: 'out',
        moved_on: '2026-09-22',
        amount: 50,
      }),
    )
  })
})

describe('finanzasApi — createDistributionSplit', () => {
  it('solo inserta las partidas con monto > 0 (hasta 3 filas)', async () => {
    await createDistributionSplit('m-1', {
      invoiceId: 'inv-1',
      movedOn: '2026-07-10',
      amounts: { gastos: 660, socios: 0, ganancia: 140 },
      note: 'nota',
      createdBy: 'u-1',
    })
    const query = supabase.from.mock.results.at(-1).value
    const inserted = query.insert.mock.calls[0][0]
    expect(inserted).toHaveLength(2)
    expect(inserted.map((r) => r.partida)).toEqual(['gastos', 'ganancia'])
  })

  it('no llama insert si ninguna partida tiene monto', async () => {
    const { data, error } = await createDistributionSplit('m-1', {
      invoiceId: 'inv-1',
      movedOn: '2026-07-10',
      amounts: { gastos: 0, socios: 0, ganancia: 0 },
    })
    expect(data).toEqual([])
    expect(error).toBeNull()
  })
})

describe('finanzasApi — addPayment', () => {
  it('persiste amount_bs y rate cuando el cobro es en bolívares', async () => {
    await addPayment('inv-1', {
      paidOn: '2026-08-05',
      amount: 100,
      amountBs: 84000,
      rate: 840,
      method: 'Transferencia Bs',
      note: null,
    })
    const query = supabase.from.mock.results.at(-1).value
    expect(query.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        invoice_id: 'inv-1',
        amount: 100,
        amount_bs: 84000,
        rate: 840,
        method: 'Transferencia Bs',
      }),
    )
  })

  it('deja amount_bs y rate en null para un cobro en divisa', async () => {
    await addPayment('inv-1', { paidOn: '2026-08-05', amount: 100, method: 'Zelle' })
    const query = supabase.from.mock.results.at(-1).value
    expect(query.insert).toHaveBeenCalledWith(
      expect.objectContaining({ amount_bs: null, rate: null }),
    )
  })
})

describe('finanzasApi — updateMonthPcts', () => {
  it('rechaza porcentajes que no suman 100% sin llamar a Supabase', async () => {
    const fromCallsBefore = supabase.from.mock.calls.length
    const { data, error } = await updateMonthPcts('m-1', {
      gastos: 0.7,
      socios: 0.2,
      ganancia: 0.2,
    })
    expect(data).toBeNull()
    expect(error).toBeInstanceOf(Error)
    expect(supabase.from.mock.calls.length).toBe(fromCallsBefore)
  })

  it('acepta porcentajes que suman 100% y actualiza fin_months', async () => {
    const { error } = await updateMonthPcts('m-1', { gastos: 0.72, socios: 0.18, ganancia: 0.1 })
    expect(error).toBeNull()
    const query = supabase.from.mock.results.at(-1).value
    expect(query.update).toHaveBeenCalledWith({
      pct_gastos: 0.72,
      pct_socios: 0.18,
      pct_ganancia: 0.1,
    })
  })
})

describe('finanzasApi — loadAllMonthTotals', () => {
  it('incluye si el mes es summary_only, para que el Dashboard sepa cuáles usar en la tendencia', async () => {
    const query = makeQuery([
      {
        month_id: 'm-1',
        total_facturado: 5000,
        total_cobrado: 4800,
        total_gastos: 3456,
        total_socios: 864,
        total_ganancia: 480,
        month: { year: 2026, month: 8, company_id: 'co-1', summary_only: true },
      },
    ])
    const fromSpy = vi.spyOn(supabase, 'from').mockImplementationOnce(() => query)
    const { data, error } = await loadAllMonthTotals('co-1')
    expect(error).toBeNull()
    expect(data).toEqual([expect.objectContaining({ year: 2026, month: 8, summaryOnly: true })])
    fromSpy.mockRestore()
  })
})

describe('finanzasApi — loadMonthTotals', () => {
  it('normaliza snake_case a camelCase', async () => {
    const { data, error } = await loadMonthTotals('m-1')
    expect(error).toBeNull()
    expect(data).toEqual(
      expect.objectContaining({
        monthId: 'm-1',
        totalFacturado: 5000,
        totalCobrado: 4800,
        totalGastos: 3456,
        totalSocios: 864,
        totalGanancia: 480,
        note: 'del sheet',
      }),
    )
  })
})

describe('finanzasApi — createSummaryMonth', () => {
  it('rechaza si el mes ya existe', async () => {
    const { data, error } = await createSummaryMonth({
      companyId: 'co-1',
      year: 2026,
      month: 8,
      userId: 'u-1',
      totals: {
        totalFacturado: 100,
        totalCobrado: 100,
        totalGastos: 0,
        totalSocios: 0,
        totalGanancia: 0,
      },
    })
    expect(data).toBeNull()
    expect(error).toBeInstanceOf(Error)
  })

  it('crea el mes summary_only, guarda los totales y lo cierra, en ese orden', async () => {
    const findExistingQuery = makeQuery(null)
    const insertMonthQuery = makeQuery({
      id: 'm-new',
      company_id: 'co-1',
      year: 2025,
      month: 1,
      closed: false,
      summary_only: true,
      pct_gastos: 0.72,
      pct_socios: 0.18,
      pct_ganancia: 0.1,
    })
    const insertTotalsQuery = makeQuery([])
    const updateMonthQuery = makeQuery({
      id: 'm-new',
      company_id: 'co-1',
      year: 2025,
      month: 1,
      closed: true,
      closed_at: '2026-09-22T00:00:00Z',
      closed_by: 'u-1',
      summary_only: true,
      pct_gastos: 0.72,
      pct_socios: 0.18,
      pct_ganancia: 0.1,
    })

    const fromSpy = vi.spyOn(supabase, 'from')
    fromSpy
      .mockImplementationOnce(() => findExistingQuery)
      .mockImplementationOnce(() => insertMonthQuery)
      .mockImplementationOnce(() => insertTotalsQuery)
      .mockImplementationOnce(() => updateMonthQuery)

    const { data, error } = await createSummaryMonth({
      companyId: 'co-1',
      year: 2025,
      month: 1,
      userId: 'u-1',
      totals: {
        totalFacturado: 5000,
        totalCobrado: 4800,
        totalGastos: 3456,
        totalSocios: 864,
        totalGanancia: 480,
        note: 'del sheet',
      },
    })

    expect(error).toBeNull()
    expect(data).toMatchObject({ id: 'm-new', summaryOnly: true, closed: true })
    // Los totales se insertan ANTES de cerrar el mes: el trigger fin_block_closed_month()
    // rechazaría el insert en fin_month_totals si el mes ya estuviera closed=true.
    expect(insertTotalsQuery.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        month_id: 'm-new',
        total_facturado: 5000,
        total_ganancia: 480,
        note: 'del sheet',
      }),
    )
    expect(updateMonthQuery.update).toHaveBeenCalledWith(
      expect.objectContaining({ closed: true, closed_by: 'u-1' }),
    )

    fromSpy.mockRestore()
  })
})

describe('finanzasApi — syncMonthInvoices', () => {
  const CLIENTS = [
    { id: 'c-1', name: 'Turbopre', monthly_fee: 2600, mdn_since: '2025-01-01' },
    {
      id: 'c-2',
      name: 'Ex cliente',
      monthly_fee: 500,
      mdn_since: '2024-01-01',
      contract_end: '2026-06-30',
    },
    { id: 'c-3', name: 'Sin fee', monthly_fee: 0, mdn_since: '2025-01-01' },
  ]

  it('en un mes ya poblado no duplica lo cargado, pero agrega al cliente activo que falta', async () => {
    const fromSpy = vi.spyOn(supabase, 'from')
    // 'm-1' ya tiene inv-1 (Turbopre, c-1) en el fixture del mock; falta c-3.
    const { inserted, error } = await syncMonthInvoices({
      companyId: 'co-1',
      monthId: 'm-1',
      year: 2026,
      month: 9,
      clients: CLIENTS,
      userId: 'u-1',
    })
    expect(error).toBeNull()
    expect(inserted).toBe(1)
    const insertCall = fromSpy.mock.results
      .map((r) => r.value)
      .find((q) => q.insert.mock.calls.length)
    expect(insertCall.insert).toHaveBeenCalledWith([
      expect.objectContaining({ client_id: 'c-3', amount: 0, created_by: 'u-1' }),
    ])
    fromSpy.mockRestore()
  })

  it('no inserta nada cuando ya están todos los clientes activos del mes', async () => {
    const fullInvoicesQuery = makeQuery([
      { id: 'inv-1', month_id: 'm-1', client_id: 'c-1', amount: 2600, payments: [] },
      { id: 'inv-9', month_id: 'm-1', client_id: 'c-3', amount: 0, payments: [] },
    ])
    const noPrevMonthQuery = makeQuery([])
    const noExclusionsQuery = makeQuery([])
    const fromSpy = vi.spyOn(supabase, 'from')
    fromSpy
      .mockImplementationOnce(() => fullInvoicesQuery) // loadInvoices('m-1')
      .mockImplementationOnce(() => noPrevMonthQuery) // loadMonth(co-1, 2026, 8)
      .mockImplementationOnce(() => noExclusionsQuery) // loadInvoiceExclusions

    const { inserted, error } = await syncMonthInvoices({
      companyId: 'co-1',
      monthId: 'm-1',
      year: 2026,
      month: 9,
      clients: CLIENTS,
      userId: 'u-1',
    })
    expect(error).toBeNull()
    expect(inserted).toBe(0)
    expect(fromSpy).toHaveBeenCalledTimes(3) // sin insert
    fromSpy.mockRestore()
  })

  it('no recrea la facturación de un cliente excluido a propósito', async () => {
    const emptyInvoicesQuery = makeQuery([])
    const noPrevMonthQuery = makeQuery([])
    const exclusionsQuery = makeQuery([{ client_id: 'c-1', year: 2026, month: 9 }])
    const insertQuery = makeQuery([])
    const fromSpy = vi.spyOn(supabase, 'from')
    fromSpy
      .mockImplementationOnce(() => emptyInvoicesQuery)
      .mockImplementationOnce(() => noPrevMonthQuery)
      .mockImplementationOnce(() => exclusionsQuery)
      .mockImplementationOnce(() => insertQuery)

    const { error } = await syncMonthInvoices({
      companyId: 'co-1',
      monthId: 'm-empty',
      year: 2026,
      month: 9,
      clients: CLIENTS,
      userId: 'u-1',
    })
    expect(error).toBeNull()
    const inserted = insertQuery.insert.mock.calls[0][0]
    expect(inserted.map((r) => r.client_id)).toEqual(['c-3'])
    fromSpy.mockRestore()
  })

  it('sin mes anterior, siembra a TODOS los clientes activos (los que no tienen fee, en 0)', async () => {
    const emptyInvoicesQuery = makeQuery([])
    const noPrevMonthQuery = makeQuery([]) // maybeSingle → null, no hay mes anterior
    const noExclusionsQuery = makeQuery([])
    const insertQuery = makeQuery([])
    const fromSpy = vi.spyOn(supabase, 'from')
    fromSpy
      .mockImplementationOnce(() => emptyInvoicesQuery) // loadInvoices('m-empty')
      .mockImplementationOnce(() => noPrevMonthQuery) // loadMonth(companyId, año/mes anterior)
      .mockImplementationOnce(() => noExclusionsQuery) // loadInvoiceExclusions
      .mockImplementationOnce(() => insertQuery) // insert

    const { inserted, error } = await syncMonthInvoices({
      companyId: 'co-1',
      monthId: 'm-empty',
      year: 2026,
      month: 9,
      clients: CLIENTS,
      userId: 'u-1',
    })

    expect(error).toBeNull()
    expect(inserted).toBe(2) // c-1 y c-3; c-2 está de baja
    expect(insertQuery.insert).toHaveBeenCalledWith([
      expect.objectContaining({
        month_id: 'm-empty',
        client_id: 'c-1',
        client_name: 'Turbopre',
        amount: 2600,
        currency: 'USD',
        recurring: true,
      }),
      expect.objectContaining({
        month_id: 'm-empty',
        client_id: 'c-3',
        client_name: 'Sin fee',
        amount: 0, // sin monto en el perfil ni mes anterior: aparece para que lo editen
      }),
    ])
    fromSpy.mockRestore()
  })

  it('con mes anterior, copia su facturación tal cual en vez de derivarla de monthly_fee', async () => {
    const emptyInvoicesQuery = makeQuery([])
    // El mes anterior (m-1, 2026-08) tiene una sola factura de Turbopre en 2600 — el
    // fixture global la trae con ese monto, que coincide con monthly_fee, así que un
    // monto distinto (2800) deja claro que se copió la factura y no se recalculó.
    const prevInvoicesQuery = makeQuery([
      {
        id: 'inv-1',
        month_id: 'm-1',
        client_id: 'c-1',
        client_name: 'Turbopre',
        concept: 'Página web',
        amount: 2800,
        currency: 'USD',
        recurring: true,
        payments: [],
      },
      {
        // Cargo externo recurrente (sin cliente en metric_clients) — debe arrastrarse igual.
        id: 'inv-2',
        month_id: 'm-1',
        client_id: null,
        client_name: 'Freelance externo',
        concept: 'Diseño puntual',
        amount: 300,
        currency: 'USD',
        recurring: true,
        payments: [],
      },
      {
        // Cargo puntual (no recurrente) — no debe arrastrarse.
        id: 'inv-3',
        month_id: 'm-1',
        client_id: 'c-1',
        client_name: 'Turbopre',
        concept: 'Cargo puntual',
        amount: 100,
        currency: 'USD',
        recurring: false,
        payments: [],
      },
    ])
    const prevMonthQuery = makeQuery([{ id: 'm-1', company_id: 'co-1', year: 2026, month: 8 }])
    const noExclusionsQuery = makeQuery([])
    const insertQuery = makeQuery([])
    const fromSpy = vi.spyOn(supabase, 'from')
    fromSpy
      .mockImplementationOnce(() => emptyInvoicesQuery) // loadInvoices('m-new')
      .mockImplementationOnce(() => prevMonthQuery) // loadMonth(companyId, 2026, 8)
      .mockImplementationOnce(() => noExclusionsQuery) // loadInvoiceExclusions
      .mockImplementationOnce(() => prevInvoicesQuery) // loadInvoices('m-1')
      .mockImplementationOnce(() => insertQuery) // insert

    const { error } = await syncMonthInvoices({
      companyId: 'co-1',
      monthId: 'm-new',
      year: 2026,
      month: 9,
      clients: CLIENTS,
      userId: 'u-1',
    })

    expect(error).toBeNull()
    const inserted = insertQuery.insert.mock.calls[0][0]
    expect(inserted).toHaveLength(3) // los 2 arrastrados + c-3 (activo sin fee, en 0)
    expect(inserted).toContainEqual(
      expect.objectContaining({
        client_id: 'c-1',
        concept: 'Página web',
        amount: 2800,
        recurring: true,
      }),
    )
    expect(inserted).toContainEqual(
      expect.objectContaining({
        client_id: null,
        client_name: 'Freelance externo',
        amount: 300,
      }),
    )
    expect(inserted).toContainEqual(expect.objectContaining({ client_id: 'c-3', amount: 0 }))
    fromSpy.mockRestore()
  })
})

describe('finanzasApi — exclusiones de facturación', () => {
  it('loadInvoiceExclusions devuelve solo los clientIds, filtrando hasta el mes consultado', async () => {
    const query = makeQuery([
      { client_id: 'c-1', year: 2026, month: 8 },
      { client_id: 'c-5', year: 2026, month: 9 },
    ])
    const fromSpy = vi.spyOn(supabase, 'from').mockImplementationOnce(() => query)
    const { data, error } = await loadInvoiceExclusions('co-1', 2026, 9)
    expect(error).toBeNull()
    expect(data).toEqual(['c-1', 'c-5'])
    // La exclusión aplica de su mes en adelante: se piden las <= (2026, 9).
    expect(query.or).toHaveBeenCalledWith('year.lt.2026,and(year.eq.2026,month.lte.9)')
    fromSpy.mockRestore()
  })

  it('addInvoiceExclusion hace upsert con la clave (empresa, cliente, año, mes)', async () => {
    const query = makeQuery([])
    const fromSpy = vi.spyOn(supabase, 'from').mockImplementationOnce(() => query)
    await addInvoiceExclusion({
      companyId: 'co-1',
      clientId: 'c-1',
      year: 2026,
      month: 10,
      userId: 'u-1',
    })
    expect(query.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        company_id: 'co-1',
        client_id: 'c-1',
        year: 2026,
        month: 10,
        created_by: 'u-1',
      }),
      expect.objectContaining({ onConflict: 'company_id,client_id,year,month' }),
    )
    fromSpy.mockRestore()
  })
})

// ─── Divisas y Caja Bs ────────────────────────────────────────────────────────────

describe('finanzasApi — createFxOperation', () => {
  it('inserta la operación en snake_case y NO inserta el ledger ni la fila cambio (eso lo hace el trigger)', async () => {
    const fromCallsBefore = supabase.from.mock.calls.length
    await createFxOperation('m-1', {
      companyId: 'co-1',
      opType: 'compra',
      movedOn: '2026-09-23',
      amountBs: 612000,
      amountUsd: 600,
      rateBcv: 816,
      purpose: 'Para nómina',
      createdBy: 'u-1',
    })
    const query = supabase.from.mock.results.at(-1).value
    expect(query.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        company_id: 'co-1',
        month_id: 'm-1',
        op_type: 'compra',
        moved_on: '2026-09-23',
        amount_bs: 612000,
        amount_usd: 600,
        rate_bcv: 816,
        purpose: 'Para nómina',
        created_by: 'u-1',
      }),
    )
    // Un solo insert (a fin_fx_operations) — nada más se llama desde JS.
    const fxCalls = supabase.from.mock.calls
      .slice(fromCallsBefore)
      .filter(([table]) => table === 'fin_fx_operations')
    const otherInsertCalls = supabase.from.mock.calls
      .slice(fromCallsBefore)
      .filter(([table]) => table === 'fin_bs_ledger' || table === 'fin_distributions')
    expect(fxCalls).toHaveLength(1)
    expect(otherInsertCalls).toHaveLength(0)
  })
})

describe('finanzasApi — createBsAdjustment', () => {
  it('fuerza source=ajuste con los 3 FK de origen en null', async () => {
    await createBsAdjustment({
      companyId: 'co-1',
      monthId: 'm-1',
      movedOn: '2026-09-23',
      kind: 'in',
      amountBs: 5000,
      rate: 850,
      concept: 'Ajuste de cuadre',
      createdBy: 'u-1',
    })
    const query = supabase.from.mock.results.at(-1).value
    expect(query.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'ajuste',
        kind: 'in',
        amount_bs: 5000,
        rate: 850,
        amount_usd_ref: Math.round((5000 / 850) * 100) / 100,
        payment_id: null,
        fx_operation_id: null,
        distribution_id: null,
      }),
    )
  })
})

describe('finanzasApi — resolveRateBcv', () => {
  it('devuelve source=bcv cuando hay una tasa exacta para la fecha', async () => {
    const exactQuery = makeQuery({ rate_bcv: 850, rate_date: '2026-09-23' })
    const fromSpy = vi.spyOn(supabase, 'from').mockImplementationOnce(() => exactQuery)
    const { data, error } = await resolveRateBcv('co-1', '2026-09-23')
    expect(error).toBeNull()
    expect(data).toEqual({ rate: 850, rateDate: '2026-09-23', source: 'bcv' })
    fromSpy.mockRestore()
  })

  it('cae a la tasa anterior más reciente y lo marca como stale', async () => {
    const exactQuery = makeQuery(null)
    const prevQuery = makeQuery([{ rate_bcv: 816, rate_date: '2026-09-20' }])
    const fromSpy = vi
      .spyOn(supabase, 'from')
      .mockImplementationOnce(() => exactQuery)
      .mockImplementationOnce(() => prevQuery)
    const { data } = await resolveRateBcv('co-1', '2026-09-23')
    expect(data).toEqual({ rate: 816, rateDate: '2026-09-20', source: 'stale' })
    fromSpy.mockRestore()
  })

  it('reporta missing sin ninguna tasa cargada', async () => {
    const exactQuery = makeQuery(null)
    const prevQuery = makeQuery(null)
    const fromSpy = vi
      .spyOn(supabase, 'from')
      .mockImplementationOnce(() => exactQuery)
      .mockImplementationOnce(() => prevQuery)
    const { data } = await resolveRateBcv('co-1', '2026-09-23')
    expect(data).toEqual({ rate: null, rateDate: null, source: 'missing' })
    fromSpy.mockRestore()
  })
})

describe('finanzasApi — resolveRateBcv con la API en vivo (solo para la fecha de hoy)', () => {
  const today = new Date().toISOString().slice(0, 10)

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('si hay sesión y la API responde, usa esa tasa y la cachea en fin_rates (best-effort)', async () => {
    supabase.auth.getSession.mockResolvedValueOnce({
      data: { session: { access_token: 'tok' } },
      error: null,
    })
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({ rate: 197.6, source: 'pydolarve' }) })
    vi.stubGlobal('fetch', fetchMock)
    const upsertQuery = makeQuery({ company_id: 'co-1', rate_date: today, rate_bcv: 197.6 })
    const fromSpy = vi.spyOn(supabase, 'from').mockImplementationOnce(() => upsertQuery)

    const { data, error } = await resolveRateBcv('co-1', today)

    expect(error).toBeNull()
    expect(data).toEqual({ rate: 197.6, rateDate: today, source: 'bcv' })
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/bcv-rate',
      expect.objectContaining({ headers: { Authorization: 'Bearer tok' } }),
    )
    expect(upsertQuery.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ company_id: 'co-1', rate_date: today, rate_bcv: 197.6 }),
      expect.anything(),
    )
    fromSpy.mockRestore()
  })

  it('memoriza la tasa del día: la segunda llamada no repite el fetch ni el upsert', async () => {
    supabase.auth.getSession.mockResolvedValue({
      data: { session: { access_token: 'tok' } },
      error: null,
    })
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({ rate: 197.6, source: 'pydolarve' }) })
    vi.stubGlobal('fetch', fetchMock)
    const upsertQuery = makeQuery({})
    const fromSpy = vi.spyOn(supabase, 'from').mockImplementation(() => upsertQuery)

    const primera = await resolveRateBcv('co-1', today)
    const segunda = await resolveRateBcv('co-1', today)

    // Sin el memo, cada recarga del periodo repetía getSession + fetch a la API
    // externa + upsert — y ese upsert era el que realimentaba el realtime.
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(upsertQuery.upsert).toHaveBeenCalledTimes(1)
    expect(segunda.data).toEqual(primera.data)
    fromSpy.mockRestore()
  })

  it('el memo es por fecha: otra fecha vuelve a resolverse', async () => {
    supabase.auth.getSession.mockResolvedValue({
      data: { session: { access_token: 'tok' } },
      error: null,
    })
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({ rate: 197.6, source: 'pydolarve' }) })
    vi.stubGlobal('fetch', fetchMock)
    const query = makeQuery({})
    const fromSpy = vi.spyOn(supabase, 'from').mockImplementation(() => query)

    await resolveRateBcv('co-1', today)
    // Una fecha que no es hoy ni siquiera pasa por la API en vivo: va al histórico.
    await resolveRateBcv('co-1', '2026-01-15')

    expect(fetchMock).toHaveBeenCalledTimes(1)
    fromSpy.mockRestore()
  })

  it('si el upsert a fin_rates falla, igual devuelve la tasa en vivo (best-effort, no bloquea)', async () => {
    supabase.auth.getSession.mockResolvedValueOnce({
      data: { session: { access_token: 'tok' } },
      error: null,
    })
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ rate: 200 }) }),
    )
    const fromSpy = vi.spyOn(supabase, 'from').mockImplementationOnce(() => {
      throw new Error('RLS: sin permiso')
    })

    const { data, error } = await resolveRateBcv('co-1', today)

    expect(error).toBeNull()
    expect(data).toEqual({ rate: 200, rateDate: today, source: 'bcv' })
    fromSpy.mockRestore()
  })

  it('si la API no responde, cae al histórico de fin_rates aunque la fecha sea hoy', async () => {
    supabase.auth.getSession.mockResolvedValueOnce({
      data: { session: { access_token: 'tok' } },
      error: null,
    })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }))
    const exactQuery = makeQuery({ rate_bcv: 850, rate_date: today })
    const fromSpy = vi.spyOn(supabase, 'from').mockImplementationOnce(() => exactQuery)

    const { data } = await resolveRateBcv('co-1', today)
    expect(data).toEqual({ rate: 850, rateDate: today, source: 'bcv' })
    fromSpy.mockRestore()
  })

  it('sin sesión activa, no llama a la API y cae directo al histórico', async () => {
    supabase.auth.getSession.mockResolvedValueOnce({ data: { session: null }, error: null })
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const exactQuery = makeQuery({ rate_bcv: 850, rate_date: today })
    const fromSpy = vi.spyOn(supabase, 'from').mockImplementationOnce(() => exactQuery)

    await resolveRateBcv('co-1', today)
    expect(fetchMock).not.toHaveBeenCalled()
    fromSpy.mockRestore()
  })

  it('para una fecha que no es hoy, nunca llama a la API (ej. closeMonth resolviendo un mes pasado)', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const exactQuery = makeQuery({ rate_bcv: 850, rate_date: '2026-08-31' })
    const fromSpy = vi.spyOn(supabase, 'from').mockImplementationOnce(() => exactQuery)

    await resolveRateBcv('co-1', '2026-08-31')
    expect(fetchMock).not.toHaveBeenCalled()
    fromSpy.mockRestore()
  })
})

describe('finanzasApi — createDistribution con Bs', () => {
  it('manda amount_bs y rate cuando currency es Bs', async () => {
    await createDistribution('m-1', {
      partida: 'gastos',
      kind: 'out',
      movedOn: '2026-09-23',
      concept: 'Nómina',
      amount: 750,
      currency: 'Bs',
      amountBs: 612000,
      rate: 816,
    })
    const query = supabase.from.mock.results.at(-1).value
    expect(query.insert).toHaveBeenCalledWith(
      expect.objectContaining({ currency: 'Bs', amount_bs: 612000, rate: 816 }),
    )
  })
})

describe('finanzasApi — closeMonth', () => {
  it('si falla el snapshot en fin_month_totals, NO llega a marcar el mes cerrado', async () => {
    const monthsQuery = makeQuery({
      id: 'm-1',
      company_id: 'co-1',
      year: 2026,
      month: 9,
      closed: false,
    })
    const totalsQuery = makeQuery([], { error: new Error('boom') })

    const fromSpy = vi.spyOn(supabase, 'from').mockImplementation((table) => {
      if (table === 'fin_month_totals') return totalsQuery
      if (table === 'fin_months') return monthsQuery
      return makeQuery([])
    })

    const { data, error } = await closeMonth({
      companyId: 'co-1',
      monthId: 'm-1',
      year: 2026,
      month: 9,
      userId: 'u-1',
      clients: [],
    })

    expect(error).toBeInstanceOf(Error)
    expect(data).toBeNull()
    expect(totalsQuery.upsert).toHaveBeenCalled()
    // El único `update` posible en fin_months es el de marcar closed=true — no debe
    // haberse llamado si el snapshot de divisas falló antes (mismo orden que
    // createSummaryMonth: totales primero, cierre después).
    expect(monthsQuery.update).not.toHaveBeenCalled()

    fromSpy.mockRestore()
  })
})
