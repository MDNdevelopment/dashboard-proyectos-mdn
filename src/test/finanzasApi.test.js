import { vi } from 'vitest'
import { createSupabaseMock, makeQuery } from './helpers/supabaseMock'

vi.mock('../supabase', () => ({
  supabase: createSupabaseMock({
    tables: {
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
