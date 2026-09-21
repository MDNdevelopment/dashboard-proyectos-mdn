import { vi } from 'vitest'
import { createSupabaseMock } from './helpers/supabaseMock'

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
    },
  }),
}))

import { supabase } from '../supabase'
import {
  loadInvoices,
  createInvoice,
  createDistributionSplit,
  addPayment,
  updateMonthPcts,
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
