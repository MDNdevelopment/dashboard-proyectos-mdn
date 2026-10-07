import { describe, it, expect } from 'vitest'
import {
  MAX_PAGOS,
  nuevoPago,
  montoMostrado,
  montosNumericos,
  totalesDePagos,
  usdEnBs,
  pagosReducer,
  validarPagos,
  filasParaGuardar,
} from '../utils/cobroPagos'

const pago = (id, over = {}) => ({ ...nuevoPago(id), ...over })

describe('cobroPagos — montoMostrado (autocompletado derivado)', () => {
  it('un solo pago sin tocar muestra todo el pendiente', () => {
    expect(montoMostrado([pago(1)], 0, 1000)).toBe('1000')
  })

  it('con el pendiente en cero no muestra nada (en vez de "0")', () => {
    expect(montoMostrado([pago(1)], 0, 0)).toBe('')
  })

  it('un pago tocado muestra lo que escribió el usuario, no el saldo', () => {
    expect(montoMostrado([pago(1, { monto: '500', tocado: true })], 0, 1000)).toBe('500')
  })

  it('solo el ÚLTIMO pago sin tocar toma lo que falta', () => {
    const pagos = [pago(1, { monto: '300', tocado: true }), pago(2)]
    expect(montoMostrado(pagos, 0, 1000)).toBe('300')
    expect(montoMostrado(pagos, 1, 1000)).toBe('700')
  })

  it('editar otro pago mueve el autocompletado del último', () => {
    const pagos = [pago(1, { monto: '600', tocado: true }), pago(2)]
    expect(montoMostrado(pagos, 1, 1000)).toBe('400')
  })

  it('sigue al pendiente cuando este cambia (p. ej. al marcar retenciones)', () => {
    const pagos = [pago(1)]
    expect(montoMostrado(pagos, 0, 1000)).toBe('1000')
    expect(montoMostrado(pagos, 0, 956.9)).toBe('956.9')
  })

  it('nunca es negativo si los demás ya pasan del pendiente', () => {
    const pagos = [pago(1, { monto: '1200', tocado: true }), pago(2)]
    expect(montoMostrado(pagos, 1, 1000)).toBe('')
  })

  it('redondea a centavos', () => {
    const pagos = [pago(1, { monto: '333.33', tocado: true }), pago(2)]
    expect(montoMostrado(pagos, 1, 1000)).toBe('666.67')
  })
})

describe('cobroPagos — totalesDePagos', () => {
  it('asignado, falta y hayBs', () => {
    const pagos = [
      pago(1, { monto: '300', tocado: true }),
      pago(2, { forma: 'Bs', monto: '200', tocado: true }),
      pago(3, { forma: 'Intercambio' }),
    ]
    expect(totalesDePagos(pagos, 1000)).toEqual({ asignado: 1000, falta: 0, hayBs: true })
  })

  it('un pago Bs sin monto no cuenta como Bs', () => {
    const pagos = [pago(1, { forma: 'Bs', tocado: true, monto: '' })]
    expect(totalesDePagos(pagos, 1000).hayBs).toBe(false)
  })

  it('un pago Bs que solo existe por el autocompletado SÍ cuenta como Bs', () => {
    const pagos = [pago(1, { monto: '400', tocado: true }), pago(2, { forma: 'Bs' })]
    expect(totalesDePagos(pagos, 1000)).toEqual({ asignado: 1000, falta: 0, hayBs: true })
  })

  it('falta positiva cuando no se ha asignado todo', () => {
    const pagos = [pago(1, { monto: '250', tocado: true })]
    expect(totalesDePagos(pagos, 1000).falta).toBe(750)
  })
})

describe('cobroPagos — pagosReducer', () => {
  it('agregar congela el monto autocompletado del último y crea uno nuevo', () => {
    const next = pagosReducer([pago(1, { monto: '400', tocado: true })], {
      tipo: 'agregar',
      id: 2,
      pendiente: 1000,
    })
    expect(next).toHaveLength(2)
    expect(next[1]).toMatchObject({ id: 2, forma: 'Intercambio', monto: '', tocado: false })
    // El nuevo toma el resto sin que el usuario haga cuentas.
    expect(montoMostrado(next, 1, 1000)).toBe('600')
  })

  it('agregar sobre un pago autocompletado conserva su cifra (queda congelado)', () => {
    const next = pagosReducer([pago(1)], { tipo: 'agregar', id: 2, pendiente: 1000 })
    expect(next[0]).toMatchObject({ monto: '1000', tocado: true })
    // No queda saldo para el nuevo, pero bajar el primero se lo da al instante.
    expect(montoMostrado(next, 1, 1000)).toBe('')
    const editado = pagosReducer(next, { tipo: 'editar', id: 1, campo: 'monto', valor: '500' })
    expect(montoMostrado(editado, 1, 1000)).toBe('500')
  })

  it('la forma por defecto del nuevo pago es la primera no usada', () => {
    let pagos = [pago(1)]
    pagos = pagosReducer(pagos, { tipo: 'agregar', id: 2, pendiente: 1000 })
    expect(pagos[1].forma).toBe('Intercambio')
    pagos = pagosReducer(pagos, { tipo: 'agregar', id: 3, pendiente: 1000 })
    expect(pagos[2].forma).toBe('Bs')
    // Con las tres usadas vuelve a USD: se puede repetir forma.
    pagos = pagosReducer(pagos, { tipo: 'agregar', id: 4, pendiente: 1000 })
    expect(pagos[3].forma).toBe('USD')
  })

  it(`no pasa de ${MAX_PAGOS} pagos`, () => {
    let pagos = [pago(1)]
    for (let id = 2; id <= MAX_PAGOS + 3; id++) {
      pagos = pagosReducer(pagos, { tipo: 'agregar', id, pendiente: 1000 })
    }
    expect(pagos).toHaveLength(MAX_PAGOS)
  })

  it('quitar saca el pago y el último sin tocar vuelve a autocompletarse', () => {
    const pagos = [
      pago(1, { monto: '300', tocado: true }),
      pago(2, { monto: '200', tocado: true }),
      pago(3),
    ]
    const next = pagosReducer(pagos, { tipo: 'quitar', id: 2 })
    expect(next.map((p) => p.id)).toEqual([1, 3])
    expect(montoMostrado(next, 1, 1000)).toBe('700')
  })

  it('nunca deja la lista vacía', () => {
    const uno = [pago(1)]
    expect(pagosReducer(uno, { tipo: 'quitar', id: 1 })).toBe(uno)
  })

  it('editar el monto lo marca como tocado; vaciarlo lo devuelve al autocompletado', () => {
    let pagos = [pago(1)]
    pagos = pagosReducer(pagos, { tipo: 'editar', id: 1, campo: 'monto', valor: '250' })
    expect(pagos[0]).toMatchObject({ monto: '250', tocado: true })
    pagos = pagosReducer(pagos, { tipo: 'editar', id: 1, campo: 'monto', valor: '' })
    expect(pagos[0].tocado).toBe(false)
    expect(montoMostrado(pagos, 0, 1000)).toBe('1000')
  })

  it('cambiar la forma reinicia el método al primero de esa forma', () => {
    const next = pagosReducer([pago(1)], { tipo: 'editar', id: 1, campo: 'forma', valor: 'Bs' })
    expect(next[0]).toMatchObject({ forma: 'Bs', metodo: 'Transferencia Bs' })
    const canje = pagosReducer(next, {
      tipo: 'editar',
      id: 1,
      campo: 'forma',
      valor: 'Intercambio',
    })
    expect(canje[0]).toMatchObject({ forma: 'Intercambio', metodo: 'Productos' })
  })

  it('se puede repetir una forma con métodos distintos (Zelle + Efectivo $)', () => {
    let pagos = [pago(1, { monto: '600', tocado: true })]
    pagos = pagosReducer(pagos, { tipo: 'agregar', id: 2, pendiente: 1000 })
    pagos = pagosReducer(pagos, { tipo: 'editar', id: 2, campo: 'forma', valor: 'USD' })
    pagos = pagosReducer(pagos, { tipo: 'editar', id: 2, campo: 'metodo', valor: 'Efectivo $' })
    const filas = filasParaGuardar(pagos, 1000, { fecha: '2026-10-07' })
    expect(filas.map((f) => [f.currency, f.method, f.amount])).toEqual([
      ['USD', 'Zelle', 600],
      ['USD', 'Efectivo $', 400],
    ])
  })

  it('reiniciar vuelve a un solo pago autocompletado', () => {
    const pagos = [pago(1, { monto: '1', tocado: true }), pago(2)]
    const next = pagosReducer(pagos, { tipo: 'reiniciar', id: 9 })
    expect(next).toHaveLength(1)
    expect(next[0]).toMatchObject({ id: 9, forma: 'USD', tocado: false })
  })
})

describe('cobroPagos — validarPagos', () => {
  it('lista válida: sin error', () => {
    expect(validarPagos([pago(1)], 1000)).toBeNull()
  })

  it('montos negativos', () => {
    const pagos = [pago(1, { monto: '-5', tocado: true })]
    expect(validarPagos(pagos, 1000)).toBe('Los montos no pueden ser negativos')
  })

  it('nada asignado', () => {
    expect(validarPagos([pago(1)], 0)).toBe('El monto debe ser mayor a 0')
  })

  it('más de lo pendiente (con tolerancia de 0.5)', () => {
    const pagos = [pago(1, { monto: '500', tocado: true }), pago(2, { monto: '501', tocado: true })]
    expect(validarPagos(pagos, 1000)).toBe('No puedes cobrar más de lo pendiente')
    const justo = [
      pago(1, { monto: '500', tocado: true }),
      pago(2, { monto: '500.4', tocado: true }),
    ]
    expect(validarPagos(justo, 1000)).toBeNull()
  })

  it('un pago en Bs exige tasa', () => {
    const pagos = [pago(1, { forma: 'Bs', monto: '100', tocado: true })]
    expect(validarPagos(pagos, 1000, { tasa: null })).toBe('Ingresa o confirma la tasa BCV')
    expect(validarPagos(pagos, 1000, { tasa: 0 })).toBe('Ingresa o confirma la tasa BCV')
    expect(validarPagos(pagos, 1000, { tasa: 816 })).toBeNull()
  })

  it('sin pagos en Bs no pide tasa', () => {
    expect(validarPagos([pago(1)], 1000, { tasa: null })).toBeNull()
  })
})

describe('cobroPagos — filasParaGuardar', () => {
  const FECHA = '2026-10-07'

  it('dinero + intercambio: una fila por pago, en orden, con nulos explícitos', () => {
    const pagos = [
      pago(1, { monto: '500', tocado: true, metodo: 'Zelle' }),
      pago(2, { forma: 'Intercambio', metodo: 'Servicios', nota: '  3 sesiones de fotos ' }),
    ]
    expect(filasParaGuardar(pagos, 1000, { fecha: FECHA })).toEqual([
      {
        paidOn: FECHA,
        amount: 500,
        amountBs: null,
        rate: null,
        rateSource: null,
        method: 'Zelle',
        note: null,
        currency: 'USD',
      },
      {
        paidOn: FECHA,
        amount: 500, // autocompletado: 1000 − 500
        amountBs: null,
        rate: null,
        rateSource: null,
        method: 'Servicios',
        note: '3 sesiones de fotos',
        currency: 'Intercambio',
      },
    ])
  })

  it('un pago en Bs deriva amountBs de monto × tasa y marca el origen de la tasa', () => {
    const pagos = [pago(1, { forma: 'Bs', monto: '750', tocado: true, metodo: 'Transferencia Bs' })]
    expect(filasParaGuardar(pagos, 750, { fecha: FECHA, tasa: 816 })[0]).toMatchObject({
      currency: 'Bs',
      amount: 750,
      amountBs: 612000,
      rate: 816,
      rateSource: 'bcv',
    })
    expect(
      filasParaGuardar(pagos, 750, { fecha: FECHA, tasa: 800, tasaManual: true })[0],
    ).toMatchObject({ amountBs: 600000, rate: 800, rateSource: 'manual' })
  })

  it('dos pagos en Bs comparten la misma tasa', () => {
    const pagos = [
      pago(1, { forma: 'Bs', monto: '100', tocado: true }),
      pago(2, { forma: 'Bs', monto: '200', tocado: true }),
    ]
    const filas = filasParaGuardar(pagos, 1000, { fecha: FECHA, tasa: 800 })
    expect(filas.map((f) => [f.amount, f.amountBs, f.rate])).toEqual([
      [100, 80000, 800],
      [200, 160000, 800],
    ])
  })

  it('ignora los pagos sin monto', () => {
    const pagos = [pago(1, { monto: '500', tocado: true }), pago(2, { forma: 'Bs', tocado: true })]
    expect(filasParaGuardar(pagos, 1000, { fecha: FECHA, tasa: 816 })).toHaveLength(1)
  })

  it('montosNumericos usa el autocompletado del último pago', () => {
    const pagos = [pago(1, { monto: '250', tocado: true }), pago(2)]
    expect(montosNumericos(pagos, 1000)).toEqual([250, 750])
  })
})

describe('cobroPagos — usdEnBs', () => {
  it('suma solo los pagos en Bs, incluido el autocompletado del último', () => {
    const pagos = [
      pago(1, { monto: '300', tocado: true }),
      pago(2, { forma: 'Bs', monto: '100', tocado: true }),
      pago(3, { forma: 'Bs' }),
    ]
    // 1000 − 300 − 100 = 600 autocompletado en el último (Bs) → 100 + 600.
    expect(usdEnBs(pagos, 1000)).toBe(700)
  })

  it('sin pagos en Bs es 0', () => {
    expect(usdEnBs([pago(1)], 1000)).toBe(0)
  })
})
