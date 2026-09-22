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
  pctsDelMes,
  cobradoPorMoneda,
  movimientoCartera,
  pctsEnterosPorPartida,
} from '../utils/finanzas'

const PCTS_66_20_14 = { gastos: 0.66, socios: 0.2, ganancia: 0.14 }

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
    expect(metaPartida(1000, 'gastos', PCTS_66_20_14)).toBeCloseTo(660)
    expect(metaPartida(1000, 'socios', PCTS_66_20_14)).toBeCloseTo(200)
    expect(metaPartida(1000, 'ganancia', PCTS_66_20_14)).toBeCloseTo(140)
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
    const d = desviacionEnPuntos(dists, 'gastos', PCTS_66_20_14)
    expect(d.puntos).toBeCloseTo(34) // (1 - 0.66) * 100
    expect(d.favorable).toBe(false) // por encima de la meta en gastos = desfavorable
  })

  it('desviacionEnPuntos marca neutral cuando la desviación es menor a 0.3 pts', () => {
    const dists = [
      { partida: 'gastos', kind: 'in', amount: 661 },
      { partida: 'socios', kind: 'in', amount: 200 },
      { partida: 'ganancia', kind: 'in', amount: 139 },
    ]
    const d = desviacionEnPuntos(dists, 'gastos', PCTS_66_20_14)
    expect(d.neutral).toBe(true)
    expect(d.favorable).toBeNull()
  })

  it('desviacionEnPuntos marca "socios"/"ganancia" favorable por encima de la meta', () => {
    const dists = [
      { partida: 'gastos', kind: 'in', amount: 400 },
      { partida: 'socios', kind: 'in', amount: 400 },
      { partida: 'ganancia', kind: 'in', amount: 200 },
    ]
    expect(desviacionEnPuntos(dists, 'socios', PCTS_66_20_14).favorable).toBe(true)
  })
})

describe('finanzas — pctsDelMes', () => {
  it('lee los % del mes normalizados', () => {
    const finMonth = { pctGastos: 0.72, pctSocios: 0.18, pctGanancia: 0.1 }
    expect(pctsDelMes(finMonth)).toEqual({ gastos: 0.72, socios: 0.18, ganancia: 0.1 })
  })

  it('usa el default 72/18/10 si el mes aún no existe', () => {
    expect(pctsDelMes(null)).toEqual({ gastos: 0.72, socios: 0.18, ganancia: 0.1 })
  })
})

describe('finanzas — cobradoPorMoneda', () => {
  it('separa lo cobrado en Bs (con amountBs) de lo cobrado en divisa', () => {
    const invoices = [
      invoice({
        payments: [
          { amount: 100, amountBs: 84000 },
          { amount: 50, amountBs: null },
        ],
      }),
    ]
    expect(cobradoPorMoneda(invoices)).toEqual({ bs: 100, divisa: 50 })
  })

  it('devuelve ceros sin facturas', () => {
    expect(cobradoPorMoneda([])).toEqual({ bs: 0, divisa: 0 })
  })
})

describe('finanzas — movimientoCartera', () => {
  function client(overrides = {}) {
    return { id: 'c1', name: 'Cliente', monthly_fee: 500, ...overrides }
  }

  it('detecta un cliente que entra este mes (alta en el mes actual)', () => {
    const clients = [client({ id: 'nuevo', mdn_since: '2026-08-10' })]
    const { entraron, salieron } = movimientoCartera(clients, 2026, 8)
    expect(entraron.map((c) => c.id)).toEqual(['nuevo'])
    expect(salieron).toEqual([])
  })

  it('detecta un cliente que sale este mes (contract_end en el mes anterior)', () => {
    const clients = [client({ id: 'baja', mdn_since: '2026-01-01', contract_end: '2026-07-15' })]
    const { entraron, salieron } = movimientoCartera(clients, 2026, 8)
    expect(entraron).toEqual([])
    expect(salieron.map((c) => c.id)).toEqual(['baja'])
  })

  it('respeta baja_incluye_mes=false: el cliente sale desde el mes de la baja, no el siguiente', () => {
    const clients = [
      client({
        id: 'baja-inmediata',
        mdn_since: '2026-01-01',
        deleted_at: '2026-08-05',
        baja_incluye_mes: false,
      }),
    ]
    const { salieron } = movimientoCartera(clients, 2026, 8)
    expect(salieron.map((c) => c.id)).toEqual(['baja-inmediata'])
  })

  it('no reporta movimiento para un cliente estable en ambos meses', () => {
    const clients = [client({ id: 'estable', mdn_since: '2025-01-01' })]
    const { entraron, salieron } = movimientoCartera(clients, 2026, 8)
    expect(entraron).toEqual([])
    expect(salieron).toEqual([])
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

describe('finanzas — pctsEnterosPorPartida', () => {
  it('con el split exacto 72/18/10, redondea a 72/18/10', () => {
    const montos = { gastos: 720, socios: 180, ganancia: 100 }
    expect(pctsEnterosPorPartida(montos, 1000)).toEqual({ gastos: 72, socios: 18, ganancia: 10 })
  })

  it('nunca deja que la suma pase de 100% aunque Math.round por separado sí lo haría', () => {
    // 24.5/37.8/37.7 → Math.round por separado da 25/38/38 = 101.
    const montos = { gastos: 245, socios: 378, ganancia: 377 }
    const pcts = pctsEnterosPorPartida(montos, 1000)
    expect(pcts.gastos + pcts.socios + pcts.ganancia).toBe(100)
  })

  it('reparte el resto a quien tenga el residuo más grande (método del resto mayor)', () => {
    // 33.33/33.33/33.34 → piso 33/33/33 = 99, falta 1 → se lo lleva ganancia (mayor resto).
    const montos = { gastos: 333.3, socios: 333.3, ganancia: 333.4 }
    expect(pctsEnterosPorPartida(montos, 1000)).toEqual({ gastos: 33, socios: 33, ganancia: 34 })
  })

  it('sin base (cobrado 0), todas quedan en 0 sin dividir por cero', () => {
    expect(pctsEnterosPorPartida({ gastos: 100, socios: 0, ganancia: 0 }, 0)).toEqual({
      gastos: 0,
      socios: 0,
      ganancia: 0,
    })
  })

  it('si no todo lo cobrado fue distribuido, la suma refleja eso (no fuerza a 100%)', () => {
    // Solo se distribuyó la mitad del cobrado — el total real es ~50%, no 100%.
    const montos = { gastos: 360, socios: 90, ganancia: 50 }
    const pcts = pctsEnterosPorPartida(montos, 1000)
    expect(pcts.gastos + pcts.socios + pcts.ganancia).toBe(50)
  })
})
