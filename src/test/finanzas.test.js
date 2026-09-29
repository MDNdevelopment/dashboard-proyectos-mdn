import { describe, it, expect } from 'vitest'
import {
  cobradoDe,
  cobrosPorMonedaDe,
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
  tasaCobranza,
  ticketPromedio,
  pctsDelMes,
  cobradoPorMoneda,
  facturadoPorMoneda,
  movimientoCartera,
  pctsEnterosPorPartida,
  invoiceRowsForNewMonth,
  esMesPreparable,
  hoyISO,
  ultimoDiaDelMesISO,
  deltaCambio,
  brechaPct,
  tasaRealFx,
  saldoCajaBs,
  ledgerConSaldo,
  divisaFisica,
  resultadoCambio,
  pagosRealesUsd,
  cuadreDivisas,
  brechaPromedioPonderada,
  movimientosDelMes,
  totalesMovimientos,
} from '../utils/finanzas'
import {
  PARTIDA_KEYS,
  partidaMeta,
  PARTIDA_CAMBIO_META,
  NOTA_TRASPASO_PARTIDA,
} from '../components/finanzas/constants'

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

describe('finanzas — cobrosPorMonedaDe', () => {
  it('sin abonos, no hay ninguna moneda (la factura no es un cobro)', () => {
    const inv = invoice({ currency: 'USD', payments: [] })
    expect(cobrosPorMonedaDe(inv)).toEqual({ usd: 0, bs: 0, monedas: [] })
  })

  it('factura en USD pagada en Bs: solo Bs, con la suma de amount_bs', () => {
    const inv = invoice({
      currency: 'USD',
      payments: [{ amount: 750, amountBs: 612000, rate: 816 }],
    })
    expect(cobrosPorMonedaDe(inv)).toEqual({ usd: 0, bs: 612000, monedas: ['Bs'] })
  })

  it('factura en USD pagada en USD: solo divisa', () => {
    const inv = invoice({ currency: 'USD', payments: [{ amount: 400 }] })
    expect(cobrosPorMonedaDe(inv)).toEqual({ usd: 400, bs: 0, monedas: ['USD'] })
  })

  it('factura en Bs pagada en Bs: la moneda de facturación no cambia nada', () => {
    const inv = invoice({
      currency: 'Bs',
      payments: [{ amount: 300, amountBs: 244800, rate: 816 }],
    })
    expect(cobrosPorMonedaDe(inv)).toEqual({ usd: 0, bs: 244800, monedas: ['Bs'] })
  })

  it('con abonos mixtos, reporta las dos monedas por separado', () => {
    const inv = invoice({
      currency: 'USD',
      payments: [{ amount: 400, amountBs: 326400, rate: 816 }, { amount: 350 }],
    })
    expect(cobrosPorMonedaDe(inv)).toEqual({ usd: 350, bs: 326400, monedas: ['USD', 'Bs'] })
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

describe('finanzas — facturadoPorMoneda', () => {
  it('separa lo facturado en USD de lo facturado en Bs, por invoice.currency', () => {
    const invoices = [
      invoice({ amount: 750, currency: 'Bs' }),
      invoice({ amount: 1000, currency: 'USD' }),
      invoice({ amount: 500 }), // sin currency explícita -> no es 'Bs', cuenta como USD
    ]
    expect(facturadoPorMoneda(invoices)).toEqual({ usd: 1500, bs: 750 })
  })

  it('devuelve ceros sin facturas', () => {
    expect(facturadoPorMoneda([])).toEqual({ usd: 0, bs: 0 })
    expect(facturadoPorMoneda(undefined)).toEqual({ usd: 0, bs: 0 })
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

describe('finanzas — análisis', () => {
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

describe('fechas del módulo y periodo preparable', () => {
  const HOY = new Date(2026, 8, 29) // 29 de septiembre de 2026, hora local

  it('esMesPreparable acepta el mes en curso y los anteriores', () => {
    expect(esMesPreparable(2026, 9, HOY)).toBe(true)
    expect(esMesPreparable(2026, 8, HOY)).toBe(true)
    expect(esMesPreparable(2025, 12, HOY)).toBe(true)
  })

  it('esMesPreparable rechaza meses futuros', () => {
    expect(esMesPreparable(2026, 10, HOY)).toBe(false)
    expect(esMesPreparable(2026, 11, HOY)).toBe(false)
    expect(esMesPreparable(2027, 3, HOY)).toBe(false)
  })

  it('esMesPreparable compara el año, no solo el número de mes', () => {
    // Enero de 2027 (mes 1) NO es preparable en septiembre de 2026 aunque 1 <= 9.
    expect(esMesPreparable(2027, 1, HOY)).toBe(false)
    // Y en enero de 2027, diciembre de 2026 sí lo es.
    expect(esMesPreparable(2026, 12, new Date(2027, 0, 5))).toBe(true)
  })

  it('ultimoDiaDelMesISO da el último día real, sin corrimiento de huso', () => {
    expect(ultimoDiaDelMesISO(2026, 9)).toBe('2026-09-30')
    expect(ultimoDiaDelMesISO(2026, 10)).toBe('2026-10-31')
    expect(ultimoDiaDelMesISO(2026, 2)).toBe('2026-02-28')
    expect(ultimoDiaDelMesISO(2028, 2)).toBe('2028-02-29') // bisiesto
    expect(ultimoDiaDelMesISO(2026, 12)).toBe('2026-12-31')
  })

  it('hoyISO formatea la fecha local con ceros a la izquierda', () => {
    expect(hoyISO(new Date(2026, 0, 5))).toBe('2026-01-05')
    expect(hoyISO(new Date(2026, 11, 31))).toBe('2026-12-31')
  })
})

describe('invoiceRowsForNewMonth', () => {
  const CLIENTES = [
    { id: 'c1', name: 'Turbopre', monthly_fee: 2600, mdn_since: '2025-01-01' },
    { id: 'c2', name: 'Punto Fit', monthly_fee: 800, mdn_since: '2026-06-01' },
  ]

  function prevInvoice(overrides = {}) {
    return {
      clientId: 'c1',
      clientName: 'Turbopre',
      concept: 'Gestión de redes',
      amount: 2600,
      currency: 'USD',
      recurring: true,
      ...overrides,
    }
  }

  it('sin mes anterior, cae al comportamiento original: un cargo por cliente activo con monthly_fee', () => {
    const rows = invoiceRowsForNewMonth({
      prevInvoices: [],
      clients: CLIENTES,
      year: 2026,
      month: 9,
    })
    expect(rows).toEqual([
      {
        clientId: 'c1',
        clientName: 'Turbopre',
        concept: 'Gestión de redes',
        amount: 2600,
        currency: 'USD',
        recurring: true,
      },
      {
        clientId: 'c2',
        clientName: 'Punto Fit',
        concept: 'Gestión de redes',
        amount: 800,
        currency: 'USD',
        recurring: true,
      },
    ])
  })

  it('con mes anterior, hereda el monto y el concepto editados a mano', () => {
    const rows = invoiceRowsForNewMonth({
      prevInvoices: [prevInvoice({ concept: 'Página web', amount: 3000 })],
      clients: CLIENTES,
      year: 2026,
      month: 9,
    })
    // Turbopre viene del mes anterior con su monto/concepto editado; Punto Fit es alta
    // nueva (no venía) y se siembra desde monthly_fee.
    expect(rows).toContainEqual({
      clientId: 'c1',
      clientName: 'Turbopre',
      concept: 'Página web',
      amount: 3000,
      currency: 'USD',
      amountBs: null,
      rate: null,
      recurring: true,
    })
    expect(rows).toContainEqual(
      expect.objectContaining({ clientId: 'c2', amount: 800, concept: 'Gestión de redes' }),
    )
    expect(rows).toHaveLength(2)
  })

  it('incluye a un cliente activo SIN mensualidad en el perfil, con monto 0 para editar', () => {
    const rows = invoiceRowsForNewMonth({
      prevInvoices: [],
      clients: [
        ...CLIENTES,
        { id: 'c3', name: 'Ecopack', monthly_fee: null, mdn_since: '2026-07-01' },
      ],
      year: 2026,
      month: 9,
    })
    expect(rows).toContainEqual(
      expect.objectContaining({ clientId: 'c3', clientName: 'Ecopack', amount: 0 }),
    )
  })

  it('solo devuelve lo que FALTA: no repite a los clientes que el mes ya tiene', () => {
    const rows = invoiceRowsForNewMonth({
      prevInvoices: [prevInvoice()],
      clients: CLIENTES,
      year: 2026,
      month: 9,
      existingInvoices: [{ id: 'inv-x', clientId: 'c1', amount: 2600 }],
    })
    expect(rows.map((r) => r.clientId)).toEqual(['c2'])
  })

  it('no recrea la facturación de un cliente excluido a propósito', () => {
    const rows = invoiceRowsForNewMonth({
      prevInvoices: [prevInvoice()],
      clients: CLIENTES,
      year: 2026,
      month: 9,
      excludedClientIds: ['c1'],
    })
    expect(rows.map((r) => r.clientId)).toEqual(['c2'])
  })

  it('en un mes ya poblado no re-copia los cargos externos del mes anterior', () => {
    const rows = invoiceRowsForNewMonth({
      prevInvoices: [prevInvoice({ clientId: null, clientName: 'Freelance externo' })],
      clients: [],
      year: 2026,
      month: 9,
      existingInvoices: [{ id: 'inv-x', clientId: 'c9', amount: 100 }],
    })
    expect(rows).toEqual([])
  })

  it('arrastra un cargo externo (client_id null) del mes anterior', () => {
    const rows = invoiceRowsForNewMonth({
      prevInvoices: [prevInvoice({ clientId: null, clientName: 'Freelance externo', amount: 300 })],
      clients: [],
      year: 2026,
      month: 9,
    })
    expect(rows).toEqual([
      {
        clientId: null,
        clientName: 'Freelance externo',
        concept: 'Gestión de redes',
        amount: 300,
        currency: 'USD',
        amountBs: null,
        rate: null,
        recurring: true,
      },
    ])
  })

  it('descarta la marca que ya no factura el mes nuevo (dada de baja)', () => {
    const rows = invoiceRowsForNewMonth({
      prevInvoices: [prevInvoice()],
      clients: [{ ...CLIENTES[0], deleted_at: '2026-08-15', baja_incluye_mes: false }],
      year: 2026,
      month: 9,
    })
    expect(rows).toEqual([])
  })

  it('ignora los cargos puntuales (recurring: false) del mes anterior', () => {
    const rows = invoiceRowsForNewMonth({
      prevInvoices: [prevInvoice({ recurring: false })],
      clients: [],
      year: 2026,
      month: 9,
    })
    expect(rows).toEqual([])
  })

  it('no duplica un cliente que ya viene del mes anterior aunque también tenga monthly_fee', () => {
    const rows = invoiceRowsForNewMonth({
      prevInvoices: [prevInvoice()],
      clients: [CLIENTES[0]],
      year: 2026,
      month: 9,
    })
    expect(rows).toHaveLength(1)
  })
})

// ─── Divisas y Caja Bs (spec MAPPI-Finanzas-Divisas) ────────────────────────────

describe('finanzas — divisas: aritmética básica', () => {
  it('deltaCambio en una compra (normalmente negativo)', () => {
    // 612.000 Bs -> $600, BCV 816 => usd_bcv = 750, delta = 600 - 750 = -150
    expect(
      deltaCambio({ opType: 'compra', amountBs: 612000, amountUsd: 600, rateBcv: 816 }),
    ).toBeCloseTo(-150, 2)
  })

  it('deltaCambio en una venta (normalmente positivo)', () => {
    expect(
      deltaCambio({ opType: 'venta', amountBs: 612000, amountUsd: 600, rateBcv: 816 }),
    ).toBeCloseTo(150, 2)
  })

  it('deltaCambio es 0 cuando la tasa real coincide con la BCV', () => {
    expect(
      deltaCambio({ opType: 'compra', amountBs: 81600, amountUsd: 100, rateBcv: 816 }),
    ).toBeCloseTo(0, 6)
  })

  it('deltaCambio es 0 sin BCV (no divide por cero)', () => {
    expect(deltaCambio({ opType: 'compra', amountBs: 612000, amountUsd: 600, rateBcv: 0 })).toBe(0)
  })

  it('tasaRealFx = Bs ÷ USD', () => {
    expect(tasaRealFx({ amountBs: 612000, amountUsd: 600 })).toBe(1020)
  })

  it('brechaPct de la tasa real sobre la BCV', () => {
    expect(brechaPct(1020, 816)).toBeCloseTo(0.25, 4)
  })

  it('brechaPct es 0 sin BCV', () => {
    expect(brechaPct(1020, 0)).toBe(0)
  })

  it('saldoCajaBs suma entradas y resta salidas', () => {
    const ledger = [
      { kind: 'in', amountBs: 612000 },
      { kind: 'out', amountBs: 100000 },
    ]
    expect(saldoCajaBs(ledger)).toBe(512000)
  })

  it('saldoCajaBs es 0 sin movimientos', () => {
    expect(saldoCajaBs([])).toBe(0)
    expect(saldoCajaBs(undefined)).toBe(0)
  })

  it('ledgerConSaldo calcula el saldo acumulado y lo muestra más reciente primero', () => {
    const ledger = [
      { movedOn: '2026-09-05', kind: 'in', amountBs: 100 },
      { movedOn: '2026-09-01', kind: 'in', amountBs: 500 },
      { movedOn: '2026-09-10', kind: 'out', amountBs: 200 },
    ]
    const conSaldo = ledgerConSaldo(ledger)
    // más reciente arriba
    expect(conSaldo.map((l) => l.movedOn)).toEqual(['2026-09-10', '2026-09-05', '2026-09-01'])
    // saldo acumulado en orden cronológico: 500 -> 600 -> 400
    expect(conSaldo.find((l) => l.movedOn === '2026-09-01').saldo).toBe(500)
    expect(conSaldo.find((l) => l.movedOn === '2026-09-05').saldo).toBe(600)
    expect(conSaldo.find((l) => l.movedOn === '2026-09-10').saldo).toBe(400)
  })

  it('resultadoCambio ignora las 3 partidas reales', () => {
    const dists = [
      { partida: 'gastos', kind: 'in', amount: 500 },
      { partida: 'cambio', kind: 'out', amount: 150 },
      { partida: 'cambio', kind: 'in', amount: 40 },
    ]
    expect(resultadoCambio(dists)).toBe(-110)
  })

  it('pagosRealesUsd ignora la partida cambio y el traspaso entre partidas', () => {
    const dists = [
      { partida: 'gastos', kind: 'out', amount: 500, note: null },
      { partida: 'cambio', kind: 'out', amount: 150, note: null },
      { partida: 'ganancia', kind: 'out', amount: 9.6, note: 'traspaso_entre_partidas' },
      { partida: 'gastos', kind: 'in', amount: 9.6, note: 'traspaso_entre_partidas' },
    ]
    expect(pagosRealesUsd(dists)).toBe(500)
  })

  it('divisaFisica no resta un pago hecho en bolívares (sale de Caja Bs, no de la divisa)', () => {
    const invoices = [{ payments: [{ amount: 750, currency: 'Bs' }] }]
    const distributions = [
      { partida: 'gastos', kind: 'out', amount: 750, currency: 'Bs', note: null },
    ]
    expect(divisaFisica({ invoices, fxOperations: [], distributions })).toBe(0)
  })

  it('divisaFisica suma compras y resta ventas y pagos en USD', () => {
    const invoices = [{ payments: [{ amount: 1000, currency: 'USD' }] }]
    const fxOperations = [
      { opType: 'compra', amountUsd: 600 },
      { opType: 'venta', amountUsd: 200 },
    ]
    const distributions = [{ partida: 'gastos', kind: 'out', amount: 100, currency: 'USD' }]
    expect(divisaFisica({ invoices, fxOperations, distributions })).toBe(1000 + 600 - 200 - 100)
  })
})

describe('finanzas — invariante de cuadre (cuadreDivisas)', () => {
  const BCV = 816

  function invoiceBs(amount, amountBs) {
    return { amount, payments: [{ amount, amountBs, currency: 'Bs' }] }
  }

  it('reproduce las 4 filas exactas de la tabla de §7 de la spec (BCV 816)', () => {
    // 1) Cobro en Bs: $750 cobrados como 612.000 Bs, distribuido 540/135/75
    const invoices = [invoiceBs(750, 612000, BCV)]
    let distributions = [
      { partida: 'gastos', kind: 'in', amount: 540, currency: 'USD' },
      { partida: 'socios', kind: 'in', amount: 135, currency: 'USD' },
      { partida: 'ganancia', kind: 'in', amount: 75, currency: 'USD' },
    ]
    let ledger = [{ kind: 'in', amountBs: 612000 }]
    let fxOperations = []

    let r = cuadreDivisas({ invoices, distributions, fxOperations, ledger, rateBcv: BCV })
    expect(r.diferencia).toBe(0)
    expect(r.divisaFisica).toBe(0)
    expect(r.saldoBs).toBe(612000)

    // 2) Comprar dólares: 612.000 Bs -> $600 (delta -150)
    fxOperations = [{ opType: 'compra', amountUsd: 600, amountBs: 612000, rateBcv: BCV }]
    ledger = [...ledger, { kind: 'out', amountBs: 612000 }]
    distributions = [
      ...distributions,
      { partida: 'cambio', kind: 'out', amount: 150, currency: 'USD' },
    ]

    r = cuadreDivisas({ invoices, distributions, fxOperations, ledger, rateBcv: BCV })
    expect(r.diferencia).toBe(0)
    expect(r.divisaFisica).toBe(600)
    expect(r.saldoBs).toBe(0)
    expect(r.cambio).toBe(-150)

    // 3) Vender dólares: $600 -> 612.000 Bs (delta +150, se recupera lo descontado)
    fxOperations = [
      ...fxOperations,
      { opType: 'venta', amountUsd: 600, amountBs: 612000, rateBcv: BCV },
    ]
    ledger = [...ledger, { kind: 'in', amountBs: 612000 }]
    distributions = [
      ...distributions,
      { partida: 'cambio', kind: 'in', amount: 150, currency: 'USD' },
    ]

    r = cuadreDivisas({ invoices, distributions, fxOperations, ledger, rateBcv: BCV })
    expect(r.diferencia).toBe(0)
    expect(r.divisaFisica).toBe(0)
    expect(r.saldoBs).toBe(612000)
    expect(r.cambio).toBe(0)

    // 4) Pago directo en Bs (nómina): 612.000 Bs, sin resultado por cambio
    distributions = [
      ...distributions,
      { partida: 'gastos', kind: 'out', amount: 750, currency: 'Bs', amountBs: 612000, rate: BCV },
    ]
    ledger = [...ledger, { kind: 'out', amountBs: 612000 }]

    r = cuadreDivisas({ invoices, distributions, fxOperations, ledger, rateBcv: BCV })
    expect(r.diferencia).toBe(0)
    expect(r.divisaFisica).toBe(0)
    expect(r.saldoBs).toBe(0)
  })

  it('cuadra sobre los datos reales de producción (septiembre 2026) — reprueba el query literal de §7', () => {
    // Zelle $1.000 (USD) + Jugos Los Ángeles $750 / 637.500 Bs @ 850.
    const invoices = [
      { payments: [{ amount: 1000, currency: 'USD' }] },
      { payments: [{ amount: 750, amountBs: 637500, currency: 'Bs' }] },
    ]
    // Los 10 movimientos reales de fin_distributions de septiembre 2026.
    const distributions = [
      { partida: 'gastos', kind: 'in', amount: 590.4, currency: 'USD' },
      { partida: 'ganancia', kind: 'in', amount: 82.0, currency: 'USD' },
      { partida: 'socios', kind: 'in', amount: 147.6, currency: 'USD' },
      { partida: 'gastos', kind: 'out', amount: 500.0, currency: 'USD' },
      {
        partida: 'gastos',
        kind: 'in',
        amount: 9.6,
        currency: 'USD',
        note: 'traspaso_entre_partidas',
      },
      {
        partida: 'ganancia',
        kind: 'out',
        amount: 9.6,
        currency: 'USD',
        note: 'traspaso_entre_partidas',
      },
      { partida: 'gastos', kind: 'out', amount: 100.0, currency: 'USD' },
      { partida: 'gastos', kind: 'in', amount: 800.0, currency: 'USD' },
      { partida: 'socios', kind: 'in', amount: 100.0, currency: 'USD' },
      { partida: 'ganancia', kind: 'in', amount: 100.0, currency: 'USD' },
    ]
    const ledger = [{ kind: 'in', amountBs: 637500 }]

    const r = cuadreDivisas({ invoices, distributions, fxOperations: [], ledger, rateBcv: 850 })
    expect(r.diferencia).toBe(0)
    expect(r.cobrado).toBe(1750)
    expect(r.pagosReales).toBe(600)
    expect(r.divisaFisica).toBe(400)
    expect(r.saldoBs).toBe(637500)

    // El query literal de §7 (Σ partidas + cambio = divisa física + Bs/BCV, SIN
    // excluir el traspaso ni el pendiente por distribuir) da distinto de cero
    // sobre estos mismos datos correctos:
    const partidasSumaIngenua =
      590.4 + 82.0 + 147.6 - 500.0 + 9.6 - 9.6 - 100.0 + 800.0 + 100.0 + 100.0
    const divisaFisicaSegun7 = 1000 - (500 + 100 + 9.6) // resta también el traspaso
    const diferenciaIngenua =
      Math.round((partidasSumaIngenua - (divisaFisicaSegun7 + 637500 / 850)) * 100) / 100
    expect(diferenciaIngenua).not.toBe(0)
  })

  it('el traspaso entre partidas no descuadra el invariante', () => {
    const invoices = [invoiceBs(750, 612000, BCV)]
    const distributions = [
      { partida: 'gastos', kind: 'in', amount: 750, currency: 'USD' },
      {
        partida: 'gastos',
        kind: 'out',
        amount: 100,
        currency: 'USD',
        note: 'traspaso_entre_partidas',
      },
      {
        partida: 'socios',
        kind: 'in',
        amount: 100,
        currency: 'USD',
        note: 'traspaso_entre_partidas',
      },
      { partida: 'socios', kind: 'out', amount: 100, currency: 'USD' },
    ]
    const ledger = [{ kind: 'in', amountBs: 612000 }]
    const r = cuadreDivisas({ invoices, distributions, fxOperations: [], ledger, rateBcv: BCV })
    expect(r.diferencia).toBe(0)
  })

  it('un cobro cobrado y sin distribuir no descuadra, y sinDistribuir lo reporta', () => {
    const invoices = [invoiceBs(750, 612000, BCV)]
    const distributions = [] // nada distribuido todavía
    const ledger = [{ kind: 'in', amountBs: 612000 }]
    const r = cuadreDivisas({ invoices, distributions, fxOperations: [], ledger, rateBcv: BCV })
    expect(r.diferencia).toBe(0)
    expect(r.sinDistribuir).toBe(750)
  })

  it('la sobre-distribución no descuadra el invariante, pero sinDistribuir queda negativo', () => {
    const inv = {
      id: 'i1',
      amount: 750,
      payments: [{ amount: 750, amountBs: 612000, currency: 'Bs' }],
    }
    // se asignó más de lo cobrado en esta factura (ajuste manual de más)
    const distributions = [
      { partida: 'gastos', kind: 'in', amount: 900, currency: 'USD', invoiceId: 'i1' },
    ]
    const ledger = [{ kind: 'in', amountBs: 612000 }]
    const r = cuadreDivisas({
      invoices: [inv],
      distributions,
      fxOperations: [],
      ledger,
      rateBcv: BCV,
    })
    expect(r.diferencia).toBe(0)
    expect(r.sinDistribuir).toBe(750 - 900)
  })

  it('acumulación multi-mes: el saldo de Caja Bs y la divisa física NO se reinician por mes', () => {
    // Mes 1: compra de dólares con 612.000 Bs (queda saldo en divisa, Caja Bs en 0).
    // Como toda compra, genera su fila de 'cambio' (delta = 600 - 612000/816 = -150).
    const ledgerM1 = [{ kind: 'out', amountBs: 612000 }]
    const fxM1 = [{ opType: 'compra', amountUsd: 600, amountBs: 612000, rateBcv: BCV }]
    const distM1 = [{ partida: 'cambio', kind: 'out', amount: 150, currency: 'USD' }]

    // Mes 2: sin ningún movimiento propio.
    const ledgerM2 = []
    const fxM2 = []
    const distM2 = []

    // Si se calculara SOLO con los movimientos del mes 2 (como el query de §7,
    // con month_id = $1), la Caja Bs y la divisa física parecerían en 0 — falso:
    // los $600 comprados en el mes 1 siguen físicamente en caja.
    const soloMes2 = cuadreDivisas({
      invoices: [],
      distributions: distM2,
      fxOperations: fxM2,
      ledger: ledgerM2,
      rateBcv: BCV,
    })
    expect(soloMes2.divisaFisica).toBe(0)
    expect(soloMes2.saldoBs).toBe(0)

    // Acumulado hasta el mes 2 (mes 1 + mes 2): el saldo real se mantiene.
    const acumulado = cuadreDivisas({
      invoices: [],
      distributions: [...distM1, ...distM2],
      fxOperations: [...fxM1, ...fxM2],
      ledger: [...ledgerM1, ...ledgerM2],
      rateBcv: BCV,
    })
    expect(acumulado.divisaFisica).toBe(600)
    expect(acumulado.saldoBs).toBe(-612000)
    expect(acumulado.diferencia).toBe(0)
  })

  it('marca bcvFaltante y no divide por cero sin tasa BCV', () => {
    const r = cuadreDivisas({
      invoices: [],
      distributions: [],
      fxOperations: [],
      ledger: [{ kind: 'in', amountBs: 1000 }],
      rateBcv: 0,
    })
    expect(r.bcvFaltante).toBe(true)
    expect(r.diferencia).toBeNull()
    expect(r.saldoBsUsdRef).toBe(0)
  })
})

describe('finanzas — divisas: brecha promedio ponderada (§9)', () => {
  it('pondera por volumen, no promedia las tasas reales', () => {
    const ops = [
      { amountBs: 612000, amountUsd: 600, rateBcv: 816 }, // real 1020
      { amountBs: 100000, amountUsd: 100, rateBcv: 800 }, // real 1000
    ]
    const r = brechaPromedioPonderada(ops)
    expect(r.tasaRealProm).toBeCloseTo(712000 / 700, 4)
    expect(r.bcvProm).toBeCloseTo(808, 4)
  })

  it('da todo en 0 sin operaciones', () => {
    const r = brechaPromedioPonderada([])
    expect(r).toEqual({ tasaRealProm: 0, bcvProm: 0, brechaPct: 0 })
  })
})

describe('finanzas — divisas: guard de regresión de la partida técnica cambio', () => {
  it('PARTIDA_KEYS no incluye cambio (no debe entrar en metas/% ni en el selector de pago)', () => {
    expect(PARTIDA_KEYS).toEqual(['gastos', 'socios', 'ganancia'])
    expect(PARTIDA_KEYS).not.toContain('cambio')
  })

  it('partidaMeta resuelve las 3 reales y también cambio', () => {
    expect(partidaMeta('gastos')?.name).toBe('Gastos operativos')
    expect(partidaMeta('cambio')).toEqual(PARTIDA_CAMBIO_META)
    expect(partidaMeta('inexistente')).toBeNull()
  })

  it('realPct sigue ignorando la partida cambio', () => {
    const dists = [
      { partida: 'gastos', kind: 'in', amount: 500 },
      { partida: 'cambio', kind: 'in', amount: 1000 },
    ]
    expect(realPct(dists, 'gastos')).toBe(1)
  })
})

// ─── Movimientos consolidados (tab Movimientos) ──────────────────────────────────

const MES = { year: 2026, month: 9 }

function invoiceCon(payments, extra = {}) {
  return {
    id: 'inv-1',
    clientName: 'Jugos Los Ángeles',
    concept: 'Gestión de redes',
    amount: 750,
    currency: 'USD',
    payments,
    ...extra,
  }
}

describe('movimientosDelMes — deduplicación de filas derivadas', () => {
  /**
   * El caso real del bug de septiembre: una compra de 637.500 Bs por $708 a BCV 850
   * deja 3 filas en la BD (la operación, su movimiento del libro de Bs y su
   * resultado por cambio de −$42). En Movimientos debe ser UNA.
   */
  it('una compra de divisas es una sola fila, con su pata en Bs y su resultado por cambio', () => {
    const rows = movimientosDelMes({
      ...MES,
      invoices: [],
      distributions: [
        {
          id: 'd-cambio',
          partida: 'cambio',
          kind: 'out',
          movedOn: '2026-09-28',
          concept: 'Resultado por cambio · compra',
          amount: 42,
          currency: 'USD',
          fxOperationId: 'fx-1',
        },
      ],
      fxOperations: [
        {
          id: 'fx-1',
          opType: 'compra',
          movedOn: '2026-09-28',
          amountBs: 637500,
          amountUsd: 708,
          rateReal: 900.42,
          rateBcv: 850,
          purpose: 'Nómina',
        },
      ],
      bsLedger: [
        {
          id: 'l-fx',
          movedOn: '2026-09-28',
          kind: 'out',
          source: 'compra_divisa',
          amountBs: 637500,
          rate: 900.42,
          amountUsdRef: 708,
          fxOperationId: 'fx-1',
          concept: 'Compra de divisas',
        },
      ],
    })

    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      tipo: 'compra_divisa',
      naturaleza: 'conversion',
      montoUsd: 708,
      montoBs: -637500,
      resultadoCambioUsd: -42,
      afectaCaja: 'ambas',
    })
    // La fila 'cambio' no se emite aparte: la pliega su operación.
    expect(rows.some((r) => r.tipo === 'cambio')).toBe(false)
  })

  it('un cobro en Bs es una sola fila (no también la del libro de Bs)', () => {
    const rows = movimientosDelMes({
      ...MES,
      invoices: [
        invoiceCon([{ id: 'p-1', paidOn: '2026-09-23', amount: 750, amountBs: 637500, rate: 850 }]),
      ],
      distributions: [],
      fxOperations: [],
      bsLedger: [
        {
          id: 'l-cobro',
          movedOn: '2026-09-23',
          kind: 'in',
          source: 'cobro',
          amountBs: 637500,
          rate: 850,
          amountUsdRef: 750,
          paymentId: 'p-1',
          concept: 'Cobro Jugos Los Ángeles',
        },
      ],
    })

    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      tipo: 'cobro',
      naturaleza: 'ingreso',
      moneda: 'Bs',
      montoUsd: 750,
      montoBs: 637500,
      contraparte: 'Jugos Los Ángeles',
      afectaCaja: 'bs',
    })
  })

  it('un pago directo en Bs es una sola fila (no también la del libro de Bs)', () => {
    const rows = movimientosDelMes({
      ...MES,
      invoices: [],
      distributions: [
        {
          id: 'd-1',
          partida: 'gastos',
          kind: 'out',
          movedOn: '2026-09-15',
          concept: 'Nómina',
          amount: 100,
          currency: 'Bs',
          amountBs: 85000,
          rate: 850,
        },
      ],
      fxOperations: [],
      bsLedger: [
        {
          id: 'l-pago',
          movedOn: '2026-09-15',
          kind: 'out',
          source: 'pago_directo',
          amountBs: 85000,
          rate: 850,
          amountUsdRef: 100,
          distributionId: 'd-1',
          concept: 'Nómina',
        },
      ],
    })

    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      tipo: 'pago',
      naturaleza: 'egreso',
      montoUsd: -100,
      montoBs: -85000,
      afectaCaja: 'bs',
    })
  })

  it('el ajuste de cuadre sí se lista: es la única fila del libro sin fuente', () => {
    const rows = movimientosDelMes({
      ...MES,
      invoices: [],
      distributions: [],
      fxOperations: [],
      bsLedger: [
        {
          id: 'l-aj',
          movedOn: '2026-09-10',
          kind: 'in',
          source: 'ajuste',
          amountBs: 1700,
          rate: 850,
          amountUsdRef: 2,
          concept: 'Intereses del banco',
        },
      ],
    })
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      tipo: 'ajuste_bs',
      naturaleza: 'ajuste',
      montoBs: 1700,
      montoUsd: 2,
    })
  })

  it('una fila de cambio huérfana (sin su operación) se muestra igual, no se pierde', () => {
    const rows = movimientosDelMes({
      ...MES,
      invoices: [],
      distributions: [
        {
          id: 'd-cambio',
          partida: 'cambio',
          kind: 'out',
          movedOn: '2026-09-28',
          concept: 'Resultado por cambio · compra',
          amount: 42,
          currency: 'USD',
          fxOperationId: 'fx-borrado',
        },
      ],
      fxOperations: [],
      bsLedger: [],
    })
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ tipo: 'cambio', naturaleza: 'interno', montoUsd: -42 })
  })

  it('el id es único aunque un cobro y una distribución compartan el mismo uuid', () => {
    const rows = movimientosDelMes({
      ...MES,
      invoices: [invoiceCon([{ id: 'x-1', paidOn: '2026-09-02', amount: 500 }])],
      distributions: [
        {
          id: 'x-1',
          partida: 'gastos',
          kind: 'out',
          movedOn: '2026-09-03',
          concept: 'Pago',
          amount: 50,
          currency: 'USD',
        },
      ],
      fxOperations: [],
      bsLedger: [],
    })
    expect(new Set(rows.map((r) => r.id)).size).toBe(2)
    expect(rows.map((r) => r.id).sort()).toEqual(['dist:x-1', 'pay:x-1'])
  })
})

describe('movimientosDelMes — pertenencia al mes y orden', () => {
  it('manda la fecha del movimiento: un cobro de septiembre sobre factura de agosto entra', () => {
    const rows = movimientosDelMes({
      ...MES,
      // Factura de agosto (llega porque invoices viene ACUMULADO hasta el mes).
      invoices: [
        invoiceCon([{ id: 'p-tarde', paidOn: '2026-09-03', amount: 300 }], { id: 'inv-ago' }),
      ],
      distributions: [],
      fxOperations: [],
      bsLedger: [],
    })
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ tipo: 'cobro', fecha: '2026-09-03', montoUsd: 300 })
  })

  it('un cobro de octubre sobre una factura de septiembre NO entra en septiembre', () => {
    const rows = movimientosDelMes({
      ...MES,
      invoices: [invoiceCon([{ id: 'p-oct', paidOn: '2026-10-02', amount: 300 }])],
      distributions: [],
      fxOperations: [],
      bsLedger: [],
    })
    expect(rows).toHaveLength(0)
  })

  it('las operaciones de divisas de meses anteriores (llegan acumuladas) quedan fuera', () => {
    const rows = movimientosDelMes({
      ...MES,
      invoices: [],
      distributions: [],
      fxOperations: [
        { id: 'fx-ago', opType: 'compra', movedOn: '2026-08-20', amountBs: 100, amountUsd: 1 },
        { id: 'fx-sep', opType: 'compra', movedOn: '2026-09-20', amountBs: 100, amountUsd: 1 },
      ],
      bsLedger: [],
    })
    expect(rows.map((r) => r.sourceId)).toEqual(['fx-sep'])
  })

  it('ordena de más reciente a más antiguo, desempatando el mismo día por createdAt', () => {
    const dist = (id, movedOn, createdAt) => ({
      id,
      partida: 'gastos',
      kind: 'out',
      movedOn,
      createdAt,
      concept: id,
      amount: 10,
      currency: 'USD',
    })
    const rows = movimientosDelMes({
      ...MES,
      invoices: [],
      distributions: [
        dist('viejo', '2026-09-01', '2026-09-01T10:00:00Z'),
        dist('mismo-dia-temprano', '2026-09-10', '2026-09-10T08:00:00Z'),
        dist('mismo-dia-tarde', '2026-09-10', '2026-09-10T18:00:00Z'),
      ],
      fxOperations: [],
      bsLedger: [],
    })
    expect(rows.map((r) => r.sourceId)).toEqual(['mismo-dia-tarde', 'mismo-dia-temprano', 'viejo'])
  })

  it('tolera entradas vacías o ausentes', () => {
    expect(movimientosDelMes({ ...MES })).toEqual([])
    expect(
      movimientosDelMes({
        ...MES,
        invoices: [],
        distributions: [],
        fxOperations: [],
        bsLedger: [],
      }),
    ).toEqual([])
  })
})

describe('movimientosDelMes — internos vs dinero real', () => {
  it('un traspaso entre partidas son 2 filas internas que no mueven caja', () => {
    const rows = movimientosDelMes({
      ...MES,
      invoices: [],
      distributions: [
        {
          id: 'd-out',
          partida: 'socios',
          kind: 'out',
          movedOn: '2026-09-12',
          concept: 'Traspaso a Gastos',
          amount: 100,
          currency: 'USD',
          note: NOTA_TRASPASO_PARTIDA,
        },
        {
          id: 'd-in',
          partida: 'gastos',
          kind: 'in',
          movedOn: '2026-09-12',
          concept: 'Traspaso desde Socios',
          amount: 100,
          currency: 'USD',
          note: NOTA_TRASPASO_PARTIDA,
        },
      ],
      fxOperations: [],
      bsLedger: [],
    })
    expect(rows).toHaveLength(2)
    for (const r of rows) {
      expect(r.tipo).toBe('traspaso')
      expect(r.naturaleza).toBe('interno')
      expect(r.interno).toBe(true)
      expect(r.afectaCaja).toBe('ninguna')
    }
  })

  it('una asignación a partida es interna; un pago es egreso real', () => {
    const rows = movimientosDelMes({
      ...MES,
      invoices: [],
      distributions: [
        {
          id: 'd-asig',
          partida: 'gastos',
          kind: 'in',
          movedOn: '2026-09-05',
          concept: 'Asignación',
          amount: 720,
          currency: 'USD',
        },
        {
          id: 'd-pago',
          partida: 'gastos',
          kind: 'out',
          movedOn: '2026-09-06',
          concept: 'Pago proveedor',
          amount: 300,
          currency: 'USD',
        },
      ],
      fxOperations: [],
      bsLedger: [],
    })
    const porId = Object.fromEntries(rows.map((r) => [r.sourceId, r]))
    expect(porId['d-asig']).toMatchObject({
      tipo: 'asignacion',
      naturaleza: 'interno',
      montoUsd: 720,
      afectaCaja: 'ninguna',
    })
    expect(porId['d-pago']).toMatchObject({
      tipo: 'pago',
      naturaleza: 'egreso',
      montoUsd: -300,
      afectaCaja: 'divisa',
    })
  })
})

describe('totalesMovimientos', () => {
  /**
   * El test que impide que alguien "arregle" las cards sumando todo: solo los cobros
   * y los pagos reales mueven el neto. Si las asignaciones contaran, el mes se
   * infla ~1.72× (el dólar ya entró en su cobro).
   */
  it('solo suma cobros y pagos reales: internos, conversiones y ajustes quedan fuera', () => {
    const rows = movimientosDelMes({
      ...MES,
      invoices: [invoiceCon([{ id: 'p-1', paidOn: '2026-09-02', amount: 1000 }])],
      distributions: [
        {
          id: 'd-asig',
          partida: 'gastos',
          kind: 'in',
          movedOn: '2026-09-03',
          concept: 'Asignación',
          amount: 720,
          currency: 'USD',
        },
        {
          id: 'd-tras',
          partida: 'socios',
          kind: 'out',
          movedOn: '2026-09-04',
          concept: 'Traspaso',
          amount: 100,
          currency: 'USD',
          note: NOTA_TRASPASO_PARTIDA,
        },
        {
          id: 'd-pago',
          partida: 'gastos',
          kind: 'out',
          movedOn: '2026-09-05',
          concept: 'Pago',
          amount: 300,
          currency: 'USD',
        },
      ],
      fxOperations: [
        { id: 'fx-1', opType: 'compra', movedOn: '2026-09-06', amountBs: 637500, amountUsd: 708 },
      ],
      bsLedger: [
        {
          id: 'l-aj',
          movedOn: '2026-09-07',
          kind: 'in',
          source: 'ajuste',
          amountBs: 1700,
          rate: 850,
          amountUsdRef: 2,
          concept: 'Intereses',
        },
      ],
    })

    expect(totalesMovimientos(rows)).toEqual({
      entradas: 1000,
      salidas: 300,
      neto: 700,
      cuenta: 6,
    })
  })

  it('sin filas devuelve todo en cero', () => {
    expect(totalesMovimientos([])).toEqual({ entradas: 0, salidas: 0, neto: 0, cuenta: 0 })
    expect(totalesMovimientos()).toEqual({ entradas: 0, salidas: 0, neto: 0, cuenta: 0 })
  })
})
