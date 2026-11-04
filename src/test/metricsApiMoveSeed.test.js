/**
 * metricsApi.moveClientToLine — si el reporte del mes de transición no existe, se siembra con el
 * carry-forward del mes anterior (sueldos, gastos, ingresos) en vez de guardarse vacío.
 * Bug real: Daniellys/Bianca octubre 2026 quedaron con 1 ingreso y sin sueldos ni gastos.
 */
import { vi } from 'vitest'

const { rpc, state, from } = vi.hoisted(() => {
  const state = { reports: {}, clients: {} }
  // Cadena que acumula filtros eq y resuelve al final (await o maybeSingle/order).
  const chain = () => {
    const f = {}
    const api = {
      select: () => api,
      eq: (k, v) => {
        f[k] = v
        return api
      },
      is: () => api,
      update: () => api,
      insert: () => Promise.resolve({ error: null }),
      order: () => Promise.resolve({ data: state.clients[f.line_id] ?? [], error: null }),
      maybeSingle: () =>
        Promise.resolve({
          data: state.reports[`${f.line_id}:${f.year}:${f.month}`] ?? null,
          error: null,
        }),
      single: () => Promise.resolve({ data: { id: 'c-1' }, error: null }),
      then: (res) => res({ data: null, error: null }),
    }
    return api
  }
  return {
    rpc: vi.fn().mockResolvedValue({ error: null }),
    state,
    from: vi.fn(() => chain()),
  }
})

vi.mock('../supabase', () => ({ supabase: { from, rpc } }))

import { moveClientToLine } from '../components/metricas/metricsApi'

const finanzasSep = {
  ingresos: [
    { id: 'ing-a', clienteId: 'a', descripcion: 'A', monto: 500 },
    { id: 'ing-fk', clienteId: 'fk', descripcion: 'Fein Kaffee', monto: 1000 },
  ],
  sueldos: [{ id: 'sue-1', empleadoId: 'u1', descripcion: 'Ana', monto: 300 }],
  otrosGastos: [{ id: 'og-1', descripcion: 'Local', monto: 500 }],
  gastosOperativos: [],
}

describe('metricsApi.moveClientToLine — reporte del mes inexistente', () => {
  it('siembra ambos reportes desde septiembre y conserva sueldos/gastos/ingresos', async () => {
    state.reports['old:2026:9'] = { data: { finanzas: finanzasSep } }
    state.reports['new:2026:9'] = {
      data: {
        finanzas: {
          ingresos: [{ id: 'ing-z', clienteId: 'z', descripcion: 'Z', monto: 700 }],
          sueldos: [{ id: 'sue-9', empleadoId: 'u9', descripcion: 'Eva', monto: 250 }],
          otrosGastos: [],
          gastosOperativos: [],
        },
      },
    }
    state.clients.old = [
      { id: 'a', name: 'A', monthly_fee: 500, line_id: 'old' },
      { id: 'fk', name: 'Fein Kaffee', monthly_fee: 1000, line_id: 'old' },
    ]
    state.clients.new = [{ id: 'z', name: 'Z', monthly_fee: 700, line_id: 'new' }]

    await moveClientToLine({
      companyId: 'co',
      client: { id: 'fk', name: 'Fein Kaffee', line_id: 'old' },
      toLineId: 'new',
      effectiveDate: '2026-10-12',
      oldAmount: 354.84,
      newAmount: 645.16,
    })

    const args = rpc.mock.calls.find((c) => c[0] === 'move_client_line_reports')[1]
    const fromFin = args.p_from_data.finanzas
    const to = args.p_to_data.finanzas

    // Línea vieja: hereda sueldo y gasto, conserva A y deja a Fein Kaffee como parcial.
    expect(fromFin.sueldos).toHaveLength(1)
    expect(fromFin.otrosGastos).toHaveLength(1)
    expect(fromFin.ingresos.map((i) => i.descripcion)).toEqual([
      'A',
      'Fein Kaffee (parcial hasta 12/10/2026)',
    ])
    // Línea nueva: hereda su nómina y su cartera, y suma Fein Kaffee prorrateado.
    expect(to.sueldos).toHaveLength(1)
    expect(to.ingresos.map((i) => i.descripcion)).toEqual(['Z', 'Fein Kaffee'])
    expect(to.ingresos.find((i) => i.clienteId === 'fk').monto).toBe(645.16)
  })
})
