import {
  IVA_RATE,
  MUNICIPAL_RATE,
  normalizarRetenciones,
  hayRetenciones,
  retencionesDe,
  netoDe,
  totalRetenido,
} from '../utils/retenciones'

// Configuración de referencia acordada con el negocio: ISL 5%, IVA 75%, municipal.
const TODAS = { isl: true, islRate: 0.05, iva: true, ivaRate: 0.75, municipal: true }

describe('retencionesDe — caso de referencia', () => {
  // Este es EL caso que define la feature. Si cambia, cambió el negocio.
  it('desglosa $1.000 con las tres retenciones en 844,83 neto', () => {
    const r = retencionesDe(1000, TODAS)
    expect(r.base).toBe(862.07)
    expect(r.iva).toBe(137.93)
    expect(r.retIva).toBe(103.45)
    expect(r.retIsl).toBe(43.1)
    expect(r.retMunicipal).toBe(8.62)
    expect(r.totalRetenido).toBe(155.17)
    expect(r.neto).toBe(844.83)
  })

  // Cada línea del desglose es una cifra del comprobante de retención que
  // entrega el cliente, así que va redondeada a céntimos por sí misma — no en
  // bruto con todos sus decimales. Guarda contra el refactor que encadena todo
  // en una sola expresión y deja un desglose cuyas partes no suman el total.
  it('redondea cada línea del desglose a céntimos', () => {
    const r = retencionesDe(1000, TODAS)
    for (const v of [r.base, r.iva, r.retIva, r.retIsl, r.retMunicipal, r.totalRetenido, r.neto]) {
      expect(v).toBe(Math.round(v * 100) / 100)
    }
    // Y las partes suman exactamente el total y el neto mostrados.
    expect(r.retIva + r.retIsl + r.retMunicipal).toBeCloseTo(r.totalRetenido, 10)
    expect(r.totalRetenido + r.neto).toBeCloseTo(1000, 10)
  })
})

describe('retencionesDe — cada retención por separado', () => {
  it('solo ISL 5%', () => {
    const r = retencionesDe(1000, { isl: true, islRate: 0.05 })
    expect(r.retIsl).toBe(43.1)
    expect(r.retIva).toBe(0)
    expect(r.retMunicipal).toBe(0)
    expect(r.neto).toBe(956.9)
  })

  it('solo IVA 75%', () => {
    const r = retencionesDe(1000, { iva: true, ivaRate: 0.75 })
    expect(r.retIva).toBe(103.45)
    expect(r.neto).toBe(896.55)
  })

  it('solo municipal 1%', () => {
    const r = retencionesDe(1000, { municipal: true })
    expect(r.retMunicipal).toBe(8.62)
    expect(r.neto).toBe(991.38)
  })

  it('acepta las tasas alternativas ISL 2% e IVA 100%', () => {
    const r = retencionesDe(1000, { isl: true, islRate: 0.02, iva: true, ivaRate: 1.0 })
    expect(r.retIsl).toBe(17.24)
    expect(r.retIva).toBe(137.93)
    expect(r.neto).toBe(844.83)
  })
})

describe('retencionesDe — bordes y retrocompatibilidad', () => {
  it('sin ninguna retención activa el neto es el monto', () => {
    expect(retencionesDe(1000, null).neto).toBe(1000)
    expect(retencionesDe(1000, {}).neto).toBe(1000)
    expect(retencionesDe(1000, null).totalRetenido).toBe(0)
  })

  it('un cargo sin monto (0) no retiene nada', () => {
    const r = retencionesDe(0, TODAS)
    expect(r.neto).toBe(0)
    expect(r.totalRetenido).toBe(0)
    expect(r.base).toBe(0)
  })

  it('un monto no numérico se trata como 0 y no explota', () => {
    expect(retencionesDe(undefined, TODAS).neto).toBe(0)
    expect(retencionesDe('abc', TODAS).neto).toBe(0)
  })

  it('el IVA es el 16% y el municipal el 1%', () => {
    expect(IVA_RATE).toBe(0.16)
    expect(MUNICIPAL_RATE).toBe(0.01)
  })
})

describe('normalizarRetenciones', () => {
  it('acepta las columnas snake_case de la base de datos', () => {
    const c = normalizarRetenciones({
      ret_isl: true,
      ret_isl_rate: 0.02,
      ret_iva: true,
      ret_iva_rate: 1,
      ret_municipal: true,
    })
    expect(c).toEqual({ isl: true, islRate: 0.02, iva: true, ivaRate: 1, municipal: true })
  })

  it('trata como inactiva una retención marcada sin tasa (estado intermedio del form)', () => {
    const c = normalizarRetenciones({ isl: true, islRate: null, iva: true, ivaRate: null })
    expect(c.isl).toBe(false)
    expect(c.iva).toBe(false)
    expect(hayRetenciones({ isl: true, islRate: null })).toBe(false)
  })

  it('null o un valor no-objeto devuelven la config vacía', () => {
    expect(normalizarRetenciones(null).isl).toBe(false)
    expect(normalizarRetenciones('x').municipal).toBe(false)
  })
})

describe('netoDe', () => {
  it('usa el snapshot de la factura', () => {
    expect(netoDe({ amount: 1000, retenciones: TODAS })).toBe(844.83)
  })

  it('una factura sin snapshot (facturación vieja) devuelve su monto', () => {
    expect(netoDe({ amount: 1000 })).toBe(1000)
    expect(netoDe({ amount: 1000, retenciones: null })).toBe(1000)
  })

  it('una factura sin monto devuelve 0', () => {
    expect(netoDe({ amount: 0, retenciones: TODAS })).toBe(0)
    expect(netoDe(null)).toBe(0)
  })
})

describe('totalRetenido', () => {
  it('suma lo retenido de una lista mixta', () => {
    const invoices = [
      { amount: 1000, retenciones: TODAS },
      { amount: 500, retenciones: null },
      { amount: 1000, retenciones: { municipal: true } },
    ]
    expect(totalRetenido(invoices)).toBe(163.79) // 155.17 + 0 + 8.62
  })

  it('lista vacía → 0', () => {
    expect(totalRetenido([])).toBe(0)
    expect(totalRetenido(null)).toBe(0)
  })
})
