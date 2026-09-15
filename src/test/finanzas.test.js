import { describe, it, expect } from 'vitest'
import {
  cobradoDe,
  pendienteDe,
  estadoFactura,
  totalFacturado,
  totalCobrado,
  totalPorCobrar,
  distribuidoDe,
  asignadoPorPartida,
  pagadoPorPartida,
  saldoArrastrado,
  saldoPartida,
  metaPartida,
  realPct,
  desviacionEnPuntos,
  cuentasPorCobrar,
  tasaCobranza,
  ticketPromedio,
} from '../utils/finanzas'

function invoice(overrides = {}) {
  return { id: 'i1', amount: 1000, payments: [], ...overrides }
}

describe('finanzas — facturas y cobros', () => {
  it('cobradoDe suma los abonos registrados', () => {
    const inv = invoice({ payments: [{ amount: 300 }, { amount: 200 }] })
    expect(cobradoDe(inv)).toBe(500)
  })

  it('cobradoDe devuelve 0 sin pagos', () => {
    expect(cobradoDe(invoice())).toBe(0)
  })

  it('pendienteDe resta lo cobrado del monto facturado', () => {
    const inv = invoice({ amount: 1000, payments: [{ amount: 400 }] })
    expect(pendienteDe(inv)).toBe(600)
  })

  it('estadoFactura es "pendiente" sin abonos', () => {
    expect(estadoFactura(invoice())).toBe('pendiente')
  })

  it('estadoFactura es "abonado" con un abono parcial', () => {
    const inv = invoice({ amount: 1000, payments: [{ amount: 400 }] })
    expect(estadoFactura(inv)).toBe('abonado')
  })

  it('estadoFactura es "cobrado" cuando el pendiente es menor a la tolerancia', () => {
    const inv = invoice({ amount: 1000, payments: [{ amount: 999.8 }] })
    expect(estadoFactura(inv)).toBe('cobrado')
  })

  it('totalFacturado/totalCobrado/totalPorCobrar agregan varias facturas', () => {
    const invoices = [
      invoice({ id: 'a', amount: 1000, payments: [{ amount: 1000 }] }),
      invoice({ id: 'b', amount: 500, payments: [{ amount: 200 }] }),
      invoice({ id: 'c', amount: 300, payments: [] }),
    ]
    expect(totalFacturado(invoices)).toBe(1800)
    expect(totalCobrado(invoices)).toBe(1200)
    expect(totalPorCobrar(invoices)).toBe(600)
  })

  it('totales devuelven 0 con lista vacía o nula', () => {
    expect(totalFacturado([])).toBe(0)
    expect(totalCobrado(undefined)).toBe(0)
    expect(totalPorCobrar(null)).toBe(0)
  })
})

describe('finanzas — distribución en partidas', () => {
  const distsDelMes = [
    { partida: 'gastos', kind: 'in', amount: 660, invoiceId: 'i1' },
    { partida: 'socios', kind: 'in', amount: 200, invoiceId: 'i1' },
    { partida: 'ganancia', kind: 'in', amount: 140, invoiceId: 'i1' },
    { partida: 'gastos', kind: 'out', amount: 300, invoiceId: null },
  ]

  it('distribuidoDe suma solo las asignaciones de esa factura', () => {
    expect(distribuidoDe(invoice({ id: 'i1' }), distsDelMes)).toBe(1000)
    expect(distribuidoDe(invoice({ id: 'otra' }), distsDelMes)).toBe(0)
  })

  it('asignadoPorPartida y pagadoPorPartida separan entradas y salidas', () => {
    expect(asignadoPorPartida(distsDelMes, 'gastos')).toBe(660)
    expect(pagadoPorPartida(distsDelMes, 'gastos')).toBe(300)
    expect(pagadoPorPartida(distsDelMes, 'socios')).toBe(0)
  })

  it('saldoArrastrado acumula asignaciones menos pagos de meses previos', () => {
    const anteriores = [
      { partida: 'gastos', kind: 'in', amount: 500 },
      { partida: 'gastos', kind: 'out', amount: 200 },
      { partida: 'socios', kind: 'in', amount: 100 },
    ]
    expect(saldoArrastrado(anteriores, 'gastos')).toBe(300)
    expect(saldoArrastrado(anteriores, 'socios')).toBe(100)
    expect(saldoArrastrado(anteriores, 'ganancia')).toBe(0)
  })

  it('saldoPartida arrastra el saldo previo y le suma el neto del mes', () => {
    const anteriores = [{ partida: 'gastos', kind: 'in', amount: 100 }]
    // arrastrado 100 + asignado 660 - pagado 300 = 460
    expect(saldoPartida(anteriores, distsDelMes, 'gastos')).toBe(460)
  })

  it('metaPartida aplica el % presupuestado sobre lo cobrado', () => {
    expect(metaPartida(1000, 'gastos')).toBeCloseTo(660)
    expect(metaPartida(1000, 'socios')).toBeCloseTo(200)
    expect(metaPartida(1000, 'ganancia')).toBeCloseTo(140)
  })

  it('realPct calcula el % real de cada partida sobre el total distribuido', () => {
    expect(realPct(distsDelMes, 'gastos')).toBeCloseTo(0.66)
    expect(realPct(distsDelMes, 'socios')).toBeCloseTo(0.2)
  })

  it('realPct devuelve 0 si no hay nada distribuido en el mes', () => {
    expect(realPct([], 'gastos')).toBe(0)
  })

  it('desviacionEnPuntos marca "gastos" favorable cuando está por debajo de la meta', () => {
    const dists = [{ partida: 'gastos', kind: 'in', amount: 500 }] // 100% del total, meta 66%
    const d = desviacionEnPuntos(dists, 'gastos')
    expect(d.puntos).toBeCloseTo(34) // (1 - 0.66) * 100
    expect(d.favorable).toBe(false) // por encima de la meta en gastos = desfavorable
  })

  it('desviacionEnPuntos marca neutral cuando la desviación es menor a 0.3 pts', () => {
    const dists = [
      { partida: 'gastos', kind: 'in', amount: 661 },
      { partida: 'socios', kind: 'in', amount: 200 },
      { partida: 'ganancia', kind: 'in', amount: 139 },
    ]
    const d = desviacionEnPuntos(dists, 'gastos')
    expect(d.neutral).toBe(true)
    expect(d.favorable).toBeNull()
  })

  it('desviacionEnPuntos marca "socios"/"ganancia" favorable por encima de la meta', () => {
    const dists = [
      { partida: 'gastos', kind: 'in', amount: 400 },
      { partida: 'socios', kind: 'in', amount: 400 },
      { partida: 'ganancia', kind: 'in', amount: 200 },
    ]
    expect(desviacionEnPuntos(dists, 'socios').favorable).toBe(true)
  })
})

describe('finanzas — por cobrar y análisis', () => {
  it('cuentasPorCobrar aplana varios meses e ignora lo ya cobrado', () => {
    const months = [
      {
        year: 2026,
        month: 6,
        invoices: [invoice({ id: 'a', amount: 500, payments: [{ amount: 500 }] })],
      },
      {
        year: 2026,
        month: 7,
        invoices: [
          invoice({ id: 'b', amount: 300, payments: [{ amount: 100 }] }),
          invoice({ id: 'c', amount: 200, payments: [] }),
        ],
      },
    ]
    const ar = cuentasPorCobrar(months)
    expect(ar).toHaveLength(2)
    expect(ar[0]).toMatchObject({ year: 2026, month: 7, cobrado: 100, pendiente: 200 })
    expect(ar[1]).toMatchObject({ year: 2026, month: 7, cobrado: 0, pendiente: 200 })
  })

  it('cuentasPorCobrar devuelve vacío si no hay meses', () => {
    expect(cuentasPorCobrar([])).toEqual([])
    expect(cuentasPorCobrar(undefined)).toEqual([])
  })

  it('tasaCobranza es cobrado/facturado, 0 sin facturación', () => {
    const invoices = [invoice({ amount: 1000, payments: [{ amount: 500 }] })]
    expect(tasaCobranza(invoices)).toBeCloseTo(0.5)
    expect(tasaCobranza([])).toBe(0)
  })

  it('ticketPromedio divide lo facturado entre clientes activos', () => {
    const invoices = [invoice({ amount: 1000 }), invoice({ id: 'b', amount: 500 })]
    expect(ticketPromedio(invoices, 3)).toBeCloseTo(500)
    expect(ticketPromedio(invoices, 0)).toBe(0)
  })
})
