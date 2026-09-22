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
    },
  }),
}))

import { supabase } from '../supabase'
import {
  loadInvoices,
  createInvoice,
  createDistributionSplit,
  createDistributionsBatch,
  addPayment,
  updateMonthPcts,
  loadMonthTotals,
  loadAllMonthTotals,
  createSummaryMonth,
  seedRecurringInvoices,
} from '../components/finanzas/finanzasApi'

beforeEach(() => {
  vi.clearAllMocks()
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

describe('finanzasApi — seedRecurringInvoices', () => {
  it('es idempotente: no inserta nada si el mes ya tiene alguna factura', async () => {
    const fromSpy = vi.spyOn(supabase, 'from')
    // 'm-1' ya tiene inv-1 en el fixture del mock.
    const { error } = await seedRecurringInvoices('m-1', 2026, 9, [
      { id: 'c-1', name: 'Turbopre', monthly_fee: 2600, mdn_since: '2025-01-01' },
    ])
    expect(error).toBeNull()
    const finInvoicesCalls = fromSpy.mock.calls.filter(([table]) => table === 'fin_invoices')
    expect(finInvoicesCalls).toHaveLength(1) // solo el loadInvoices del chequeo, sin insert
    fromSpy.mockRestore()
  })

  it('con el mes vacío, inserta un cargo por cada cliente activo con monthly_fee > 0', async () => {
    const emptyInvoicesQuery = makeQuery([])
    const insertQuery = makeQuery([])
    const fromSpy = vi.spyOn(supabase, 'from')
    fromSpy
      .mockImplementationOnce(() => emptyInvoicesQuery)
      .mockImplementationOnce(() => insertQuery)

    const clients = [
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

    const { error } = await seedRecurringInvoices('m-empty', 2026, 9, clients)

    expect(error).toBeNull()
    expect(insertQuery.insert).toHaveBeenCalledWith([
      expect.objectContaining({
        month_id: 'm-empty',
        client_id: 'c-1',
        client_name: 'Turbopre',
        amount: 2600,
        currency: 'USD',
        recurring: true,
      }),
    ])
    fromSpy.mockRestore()
  })
})
