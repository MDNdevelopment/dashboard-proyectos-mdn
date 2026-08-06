import { describe, it, expect } from 'vitest'
import { stripClientFromReport, reportHasClient } from '../utils/stripClientFromReport'

function makeReport() {
  return {
    reuniones: {
      realizadas: 0,
      meta: 15,
      justificativos: { cX: 'no_cumplio', cKeep: 'no_aplica' },
    },
    productividad: { tareas: [] },
    crecimiento: {
      items: [
        { clienteId: 'cX', seguidoresActuales: 100, meta: 10 },
        { clienteId: 'cKeep', seguidoresActuales: 50, meta: 5 },
      ],
    },
    solicitudes: { solicitudes: 0, editadas: 0 },
    pautas: {
      items: [
        { clienteId: 'cX', realizadas: 2, meta: 4 },
        { clienteId: 'cKeep', realizadas: 1, meta: 2 },
      ],
    },
    piezas: { piezas: 0, editadas: 0 },
    feedback: {
      items: [
        { clienteId: 'cX', score: 8 },
        { clienteId: 'cKeep', score: 9 },
      ],
    },
    finanzas: {
      ingresos: [
        { id: 'ing-cX', clienteId: 'cX', descripcion: 'Marca X', monto: 500 },
        { id: 'ing-cKeep', clienteId: 'cKeep', descripcion: 'Keep', monto: 300 },
        { id: 'man-1', clienteId: null, descripcion: 'Otro ingreso', monto: 100 },
      ],
      gastosOperativos: [],
      sueldos: [],
      otrosGastos: [],
    },
  }
}

describe('reportHasClient', () => {
  it('detecta al cliente en cualquier rama', () => {
    expect(reportHasClient(makeReport(), 'cX')).toBe(true)
    expect(reportHasClient(makeReport(), 'noExiste')).toBe(false)
    expect(reportHasClient(null, 'cX')).toBe(false)
  })
})

describe('stripClientFromReport', () => {
  it('quita al cliente de todas las ramas y conserva a los demás', () => {
    const out = stripClientFromReport(makeReport(), 'cX')

    expect(out.crecimiento.items.find((i) => i.clienteId === 'cX')).toBeUndefined()
    expect(out.pautas.items.find((i) => i.clienteId === 'cX')).toBeUndefined()
    expect(out.feedback.items.find((i) => i.clienteId === 'cX')).toBeUndefined()
    expect(out.reuniones.justificativos.cX).toBeUndefined()
    expect(out.finanzas.ingresos.find((r) => r.clienteId === 'cX')).toBeUndefined()

    // cKeep intacto en todas las ramas
    expect(out.crecimiento.items.find((i) => i.clienteId === 'cKeep')).toBeTruthy()
    expect(out.pautas.items.find((i) => i.clienteId === 'cKeep')).toBeTruthy()
    expect(out.feedback.items.find((i) => i.clienteId === 'cKeep')).toBeTruthy()
    expect(out.reuniones.justificativos.cKeep).toBe('no_aplica')
    expect(out.finanzas.ingresos.find((r) => r.clienteId === 'cKeep')).toBeTruthy()
    // fila manual (clienteId null) se conserva
    expect(out.finanzas.ingresos.find((r) => r.id === 'man-1')).toBeTruthy()

    expect(reportHasClient(out, 'cX')).toBe(false)
  })

  it('no muta el objeto original', () => {
    const original = makeReport()
    stripClientFromReport(original, 'cX')
    expect(original.crecimiento.items.find((i) => i.clienteId === 'cX')).toBeTruthy()
  })
})
