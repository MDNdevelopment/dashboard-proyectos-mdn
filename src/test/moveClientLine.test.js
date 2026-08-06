import { describe, it, expect } from 'vitest'
import { moveClientLine } from '../utils/moveClientLine'
import { syncReportClients } from '../utils/syncReportClients'

function makeReport(overrides = {}) {
  return {
    reuniones: { realizadas: 0, meta: 15, justificativos: {} },
    productividad: { tareas: [] },
    crecimiento: { items: [] },
    solicitudes: { solicitudes: 0, editadas: 0 },
    pautas: { items: [] },
    piezas: { piezas: 0, editadas: 0 },
    feedback: { items: [] },
    finanzas: { ingresos: [], gastosOperativos: [], sueldos: [], otrosGastos: [] },
    ...overrides,
  }
}

// Reporte de la línea vieja: la cuenta "cX" tiene datos operativos y su ingreso.
function oldReportWithClient() {
  return makeReport({
    crecimiento: {
      items: [
        {
          clienteId: 'cX',
          seguidoresGanados: 120,
          seguidoresGanadosPrev: 90,
          seguidoresActuales: 5000,
          seguidoresBase: 4880,
          meta: 100,
        },
        { clienteId: 'cKeep', seguidoresActuales: 10, seguidoresBase: 5, meta: 20 },
      ],
    },
    pautas: {
      items: [
        { clienteId: 'cX', realizadas: 4, meta: 6 },
        { clienteId: 'cKeep', realizadas: 1, meta: 2 },
      ],
    },
    feedback: {
      items: [
        { clienteId: 'cX', score: 9 },
        { clienteId: 'cKeep', score: 7 },
      ],
    },
    reuniones: { realizadas: 0, meta: 15, justificativos: { cX: 'reprogramado_cliente' } },
    finanzas: {
      ingresos: [
        { id: 'ing-cX', clienteId: 'cX', descripcion: 'Marca X', monto: 1000 },
        { id: 'ing-cKeep', clienteId: 'cKeep', descripcion: 'Keep', monto: 400 },
      ],
      gastosOperativos: [],
      sueldos: [],
      otrosGastos: [],
    },
  })
}

const BASE_ARGS = {
  clientId: 'cX',
  clientName: 'Marca X',
  effectiveLabel: '24/08/2026',
  oldAmount: 903.23,
  newAmount: 96.77,
}

describe('moveClientLine — línea vieja', () => {
  it('quita el operativo de la cuenta movida y conserva las demás', () => {
    const { oldReportData } = moveClientLine({
      ...BASE_ARGS,
      oldReportData: oldReportWithClient(),
      newReportData: makeReport(),
    })

    expect(oldReportData.crecimiento.items.find((i) => i.clienteId === 'cX')).toBeUndefined()
    expect(oldReportData.pautas.items.find((i) => i.clienteId === 'cX')).toBeUndefined()
    expect(oldReportData.feedback.items.find((i) => i.clienteId === 'cX')).toBeUndefined()
    expect(oldReportData.reuniones.justificativos.cX).toBeUndefined()

    // cKeep intacto
    expect(oldReportData.crecimiento.items.find((i) => i.clienteId === 'cKeep')).toMatchObject({
      seguidoresActuales: 10,
    })
  })

  it('reemplaza el ingreso ligado por una fila MANUAL prorrateada', () => {
    const { oldReportData } = moveClientLine({
      ...BASE_ARGS,
      oldReportData: oldReportWithClient(),
      newReportData: makeReport(),
    })

    // ya no hay fila ligada a cX
    expect(oldReportData.finanzas.ingresos.find((r) => r.clienteId === 'cX')).toBeUndefined()
    // hay una fila manual (clienteId null) con el monto viejo
    const manual = oldReportData.finanzas.ingresos.find(
      (r) => r.clienteId == null && r.monto === 903.23,
    )
    expect(manual).toBeTruthy()
    expect(manual.descripcion).toContain('Marca X')
    // el ingreso del otro cliente sigue
    expect(oldReportData.finanzas.ingresos.find((r) => r.clienteId === 'cKeep')).toBeTruthy()
  })
})

describe('moveClientLine — línea nueva', () => {
  it('migra el operativo con sus valores y agrega ingreso prorrateado ligado', () => {
    const { newReportData } = moveClientLine({
      ...BASE_ARGS,
      oldReportData: oldReportWithClient(),
      newReportData: makeReport(),
    })

    // crecimiento con los valores traídos (continuidad de seguidores)
    expect(newReportData.crecimiento.items.find((i) => i.clienteId === 'cX')).toMatchObject({
      seguidoresActuales: 5000,
      seguidoresBase: 4880,
      meta: 100,
    })
    expect(newReportData.pautas.items.find((i) => i.clienteId === 'cX')).toMatchObject({
      realizadas: 4,
      meta: 6,
    })
    expect(newReportData.feedback.items.find((i) => i.clienteId === 'cX')).toMatchObject({
      score: 9,
    })
    expect(newReportData.reuniones.justificativos.cX).toBe('reprogramado_cliente')

    // ingreso ligado al cliente con el monto nuevo
    const ingreso = newReportData.finanzas.ingresos.find((r) => r.clienteId === 'cX')
    expect(ingreso).toMatchObject({ monto: 96.77, descripcion: 'Marca X' })
  })

  it('si la línea nueva ya tenía el cliente, actualiza el monto sin duplicar', () => {
    const newReport = makeReport({
      finanzas: {
        ingresos: [{ id: 'ing-cX', clienteId: 'cX', descripcion: 'Marca X', monto: 0 }],
        gastosOperativos: [],
        sueldos: [],
        otrosGastos: [],
      },
      crecimiento: {
        items: [{ clienteId: 'cX', seguidoresActuales: 1, seguidoresBase: 1, meta: 1 }],
      },
    })
    const { newReportData } = moveClientLine({
      ...BASE_ARGS,
      oldReportData: oldReportWithClient(),
      newReportData: newReport,
    })
    expect(newReportData.finanzas.ingresos.filter((r) => r.clienteId === 'cX')).toHaveLength(1)
    expect(newReportData.finanzas.ingresos.find((r) => r.clienteId === 'cX').monto).toBe(96.77)
    expect(newReportData.crecimiento.items.filter((i) => i.clienteId === 'cX')).toHaveLength(1)
  })
})

describe('moveClientLine — sobrevive a syncReportClients (no corrupción)', () => {
  it('la fila manual de la vieja y los datos de la nueva persisten tras re-sync', () => {
    const { oldReportData, newReportData } = moveClientLine({
      ...BASE_ARGS,
      oldReportData: oldReportWithClient(),
      newReportData: makeReport(),
    })

    // Línea vieja: cartera SIN cX (ya se movió). El manual debe sobrevivir.
    const oldClients = [{ id: 'cKeep', name: 'Keep', monthly_fee: 400 }]
    const oldSynced = syncReportClients(oldReportData, oldClients, [])
    const manual = oldSynced.finanzas.ingresos.find(
      (r) => r.clienteId == null && r.monto === 903.23,
    )
    expect(manual).toBeTruthy()
    // cX no reaparece en operativo de la vieja
    expect(oldSynced.crecimiento.items.find((i) => i.clienteId === 'cX')).toBeUndefined()

    // Línea nueva: cartera CON cX. Los valores migrados deben conservarse.
    const newClients = [{ id: 'cX', name: 'Marca X', monthly_fee: 1000 }]
    const newSynced = syncReportClients(newReportData, newClients, [])
    expect(newSynced.crecimiento.items.find((i) => i.clienteId === 'cX')).toMatchObject({
      seguidoresActuales: 5000,
      seguidoresBase: 4880,
    })
    // el ingreso prorrateado nuevo se conserva (no lo pisa con el monthly_fee completo)
    expect(newSynced.finanzas.ingresos.find((r) => r.clienteId === 'cX').monto).toBe(96.77)
  })
})
