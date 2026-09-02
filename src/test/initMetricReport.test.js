import { describe, it, expect } from 'vitest'
import { initMetricReport } from '../utils/initMetricReport'
import { DEFAULT_SUBTAREAS } from '../components/metricas/constants'

const CLIENTS = [
  { id: 'c1', name: 'Cliente A', monthly_fee: 400 },
  { id: 'c2', name: 'Cliente B', monthly_fee: 600 },
]

// Cartera amplia para tests que verifican la lógica de `reuniones.meta` en sí
// (herencia/override), sin que el tope "meta <= cantidad de marcas activas" interfiera.
const MANY_CLIENTS = Array.from({ length: 25 }, (_, i) => ({ id: `m${i}`, name: `Marca ${i}` }))

function makePrevReport(overrides = {}) {
  return {
    reuniones: { realizadas: 15, meta: 20 },
    productividad: { tareas: [{ nombre: 'Métricas', realizado: 10, meta: 15 }] },
    crecimiento: { items: [{ clienteId: 'c1', seguidoresActuales: 1000, meta: 50 }] },
    solicitudes: { solicitudes: 10, editadas: 8 },
    pautas: { items: [{ clienteId: 'c1', realizadas: 5, meta: 5 }] },
    piezas: { piezas: 20, editadas: 18 },
    feedback: { items: [{ clienteId: 'c1', score: 8 }] },
    finanzas: {
      ingresos: [{ id: 'i1', descripcion: 'Ing A', monto: 1000 }],
      gastosOperativos: [],
      sueldos: [{ id: 's1', descripcion: 'Juan', monto: 500 }],
      otrosGastos: [],
    },
    ...overrides,
  }
}

describe('initMetricReport — sin mes anterior', () => {
  it('usa DEFAULT_SUBTAREAS cuando no hay prevReport ni lineMetas', () => {
    const r = initMetricReport(null, CLIENTS)
    expect(r.productividad.tareas).toHaveLength(DEFAULT_SUBTAREAS.length)
    expect(r.productividad.tareas[0].nombre).toBe(DEFAULT_SUBTAREAS[0].nombre)
    expect(r.productividad.tareas[0].realizado).toBeNull()
  })

  it('usa lineMetas.tareas cuando se proporcionan', () => {
    const lineMetas = {
      tareas: [
        { nombre: 'Calendario', meta: 10 },
        { nombre: 'Reportes', meta: 5 },
      ],
    }
    const r = initMetricReport(null, MANY_CLIENTS, lineMetas)
    expect(r.productividad.tareas).toHaveLength(2)
    expect(r.productividad.tareas[0].nombre).toBe('Calendario')
    expect(r.productividad.tareas[0].meta).toBe(10)
    expect(r.productividad.tareas[1].meta).toBe(5)
  })

  it('cae a defaults cuando lineMetas.tareas está vacío', () => {
    const r = initMetricReport(null, CLIENTS, { tareas: [] })
    expect(r.productividad.tareas).toHaveLength(DEFAULT_SUBTAREAS.length)
  })

  it('inicializa items de indicadores a partir de lineClients', () => {
    const r = initMetricReport(null, CLIENTS)
    expect(r.crecimiento.items).toHaveLength(2)
    expect(r.crecimiento.items[0].clienteId).toBe('c1')
    expect(r.crecimiento.items[0].seguidoresActuales).toBeNull()
    expect(r.pautas.items).toHaveLength(2)
    expect(r.feedback.items).toHaveLength(2)
    expect(r.feedback.items[0].score).toBeNull()
  })

  it('la meta de reuniones es 1 por cada marca de la cartera', () => {
    const r = initMetricReport(null, MANY_CLIENTS)
    expect(r.reuniones.meta).toBe(MANY_CLIENTS.length)
    expect(r.reuniones.realizadas).toBeNull()
  })

  it('la meta de reuniones es 0 cuando no hay marcas', () => {
    const r = initMetricReport(null, [])
    expect(r.reuniones.meta).toBe(0)
  })

  it('inicializa finanzas con sueldos/gastos vacíos cuando no hay empleados', () => {
    const r = initMetricReport(null, [])
    expect(r.finanzas.sueldos).toEqual([])
    expect(r.finanzas.gastosOperativos).toEqual([])
    expect(r.finanzas.otrosGastos).toEqual([])
  })

  it('siembra ingresos desde lineClients con su monthly_fee', () => {
    const r = initMetricReport(null, CLIENTS)
    expect(r.finanzas.ingresos).toHaveLength(2)
    expect(r.finanzas.ingresos[0]).toMatchObject({
      clienteId: 'c1',
      descripcion: 'Cliente A',
      monto: 400,
    })
    expect(r.finanzas.ingresos[1]).toMatchObject({
      clienteId: 'c2',
      descripcion: 'Cliente B',
      monto: 600,
    })
  })

  it('siembra ingresos con monto 0 cuando el cliente no tiene monthly_fee', () => {
    const clientSinFee = [{ id: 'cx', name: 'Sin Fee' }]
    const r = initMetricReport(null, clientSinFee)
    expect(r.finanzas.ingresos[0].monto).toBe(0)
  })

  it('deja ingresos vacíos cuando no hay clientes', () => {
    const r = initMetricReport(null, [])
    expect(r.finanzas.ingresos).toEqual([])
  })

  it('siembra sueldos desde lineEmployees con su monthly_salary', () => {
    const employees = [
      { user_id: 'u1', first_name: 'Juan', last_name: 'Pérez', monthly_salary: 500 },
      { user_id: 'u2', first_name: 'María', last_name: 'Gómez', monthly_salary: 450 },
    ]
    const r = initMetricReport(null, [], {}, employees)
    expect(r.finanzas.sueldos).toHaveLength(2)
    expect(r.finanzas.sueldos[0]).toMatchObject({
      empleadoId: 'u1',
      descripcion: 'Juan Pérez',
      monto: 500,
    })
    expect(r.finanzas.sueldos[1]).toMatchObject({
      empleadoId: 'u2',
      descripcion: 'María Gómez',
      monto: 450,
    })
  })

  it('siembra sueldos con monto 0 cuando el empleado no tiene monthly_salary', () => {
    const employees = [{ user_id: 'ux', first_name: 'Sin', last_name: 'Sueldo' }]
    const r = initMetricReport(null, [], {}, employees)
    expect(r.finanzas.sueldos[0].monto).toBe(0)
  })

  it('retro-compatibilidad: 2 args no genera sueldos de empleados', () => {
    const r = initMetricReport(null, [])
    expect(r.finanzas.sueldos).toEqual([])
  })
})

describe('initMetricReport — con mes anterior (carry-forward)', () => {
  it('NO hereda la meta de reuniones del mes anterior — siempre derivada de la cartera', () => {
    const r = initMetricReport(makePrevReport(), MANY_CLIENTS) // prevReport.meta = 20
    expect(r.reuniones.meta).toBe(MANY_CLIENTS.length)
    expect(r.reuniones.realizadas).toBeNull() // reseteada
  })

  it('resetea los valores pero conserva las metas de tareas', () => {
    const r = initMetricReport(makePrevReport(), [])
    expect(r.productividad.tareas[0].nombre).toBe('Métricas')
    expect(r.productividad.tareas[0].meta).toBe(15)
    expect(r.productividad.tareas[0].realizado).toBeNull() // reseteado
  })

  it('resetea seguidores pero conserva clientes y metas de crecimiento', () => {
    const r = initMetricReport(makePrevReport(), [])
    expect(r.crecimiento.items[0].clienteId).toBe('c1')
    expect(r.crecimiento.items[0].meta).toBe(50) // heredada
    expect(r.crecimiento.items[0].seguidoresActuales).toBeNull() // reseteada
    expect(r.crecimiento.items[0].seguidoresBase).toBeNull()
  })

  it('resetea realizadas en pautas pero conserva metas', () => {
    const r = initMetricReport(makePrevReport(), [])
    expect(r.pautas.items[0].realizadas).toBeNull()
    expect(r.pautas.items[0].meta).toBe(5)
  })

  it('resetea scores de feedback', () => {
    const r = initMetricReport(makePrevReport(), [])
    expect(r.feedback.items[0].score).toBeNull()
  })

  it('resetea solicitudes y piezas a null', () => {
    const r = initMetricReport(makePrevReport(), [])
    expect(r.solicitudes.solicitudes).toBeNull()
    expect(r.solicitudes.editadas).toBeNull()
    expect(r.piezas.piezas).toBeNull()
    expect(r.piezas.editadas).toBeNull()
  })

  it('hereda las finanzas del mes anterior con sus montos', () => {
    const r = initMetricReport(makePrevReport(), [])
    expect(r.finanzas.ingresos).toHaveLength(1)
    expect(r.finanzas.ingresos[0].monto).toBe(1000)
    expect(r.finanzas.sueldos[0].monto).toBe(500)
  })

  it('no muta el reporte previo (copia profunda)', () => {
    const prev = makePrevReport()
    const r = initMetricReport(prev, [])
    r.finanzas.ingresos[0].monto = 9999
    expect(prev.finanzas.ingresos[0].monto).toBe(1000) // sin mutar
  })
})

describe('initMetricReport — lineMetas tiene prioridad sobre carry-forward', () => {
  it('lineMetas.tareas pisa las tareas del carry-forward', () => {
    // prevReport tiene [{ nombre: "Métricas", meta: 15 }]
    // La línea ahora tiene "Grillas" con meta 42
    const lineMetas = {
      tareas: [{ nombre: 'Grillas', meta: 42 }],
    }
    const r = initMetricReport(makePrevReport(), [], lineMetas)
    expect(r.productividad.tareas).toHaveLength(1)
    expect(r.productividad.tareas[0].nombre).toBe('Grillas')
    expect(r.productividad.tareas[0].meta).toBe(42)
    expect(r.productividad.tareas[0].realizado).toBe(0)
  })

  it('lineMetas.tareas pisa las tareas del carry-forward; reuniones sigue siendo derivada', () => {
    const lineMetas = { tareas: [{ nombre: 'Calendario', meta: 30 }] }
    const r = initMetricReport(makePrevReport(), MANY_CLIENTS, lineMetas)
    expect(r.reuniones.meta).toBe(MANY_CLIENTS.length)
    expect(r.productividad.tareas[0].nombre).toBe('Calendario')
    expect(r.productividad.tareas[0].meta).toBe(30)
  })

  it('sin lineMetas ({}) las tareas del carry-forward quedan intactas', () => {
    const r = initMetricReport(makePrevReport(), MANY_CLIENTS, {})
    expect(r.reuniones.meta).toBe(MANY_CLIENTS.length) // siempre derivada de la cartera
    expect(r.productividad.tareas[0].nombre).toBe('Métricas')
    expect(r.productividad.tareas[0].meta).toBe(15)
  })

  it('lineMetas.tareas vacío NO reemplaza las tareas del carry-forward', () => {
    const r = initMetricReport(makePrevReport(), [], { tareas: [] })
    // tareas vacías → no se aplica override; carry-forward queda
    expect(r.productividad.tareas[0].nombre).toBe('Métricas')
  })
})
