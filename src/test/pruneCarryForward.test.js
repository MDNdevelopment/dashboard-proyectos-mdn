import { describe, it, expect } from 'vitest'
import { pruneCarryForward } from '../utils/pruneCarryForward'

// Escenario real que motivó el fix: el reporte de agosto 2026 de Team Bianca se creó el
// 2 de septiembre, cuando agosto ya era pasado (frozen), así que initMetricReport copió la
// nómina de julio tal cual y syncReportClients nunca corrió. Andrés y Paula (bajas del 4/8)
// quedaron dentro; Osnel (baja el 31/8) sí trabajó el mes y debe quedarse.
const ANDRES = {
  user_id: 'u-andres',
  first_name: 'Andres',
  deleted_at: '2026-08-04T19:34:04Z',
  baja_incluye_mes: false,
}
const PAULA = {
  user_id: 'u-paula',
  first_name: 'Paula',
  deleted_at: '2026-08-04T19:24:45Z',
  baja_incluye_mes: false,
}
const OSNEL = {
  user_id: 'u-osnel',
  first_name: 'Osnel',
  deleted_at: '2026-08-31T13:31:12Z',
  baja_incluye_mes: true,
}
const BIANCA = { user_id: 'u-bianca', first_name: 'Bianca', deleted_at: null }

const ALL_EMPLOYEES = [ANDRES, PAULA, OSNEL, BIANCA]

const julioSueldos = [
  { id: 'sue-u-andres', empleadoId: 'u-andres', descripcion: 'Andres Barboza', monto: 300 },
  { id: 'sue-u-paula', empleadoId: 'u-paula', descripcion: 'Paula Viloria', monto: 225 },
  { id: 'sue-u-osnel', empleadoId: 'u-osnel', descripcion: 'Osnel Pacheco', monto: 350 },
  { id: 'sue-u-bianca', empleadoId: 'u-bianca', descripcion: 'Bianca Rodríguez', monto: 750 },
  { id: 'manual1', empleadoId: null, descripcion: 'Lizdania Andrade', monto: 112.5 },
]

const makeData = (overrides = {}) => ({
  finanzas: { sueldos: julioSueldos, ingresos: [], gastosOperativos: [], otrosGastos: [] },
  ...overrides,
})

const pruneAgosto = (data, allClients = []) =>
  pruneCarryForward(data, { allEmployees: ALL_EMPLOYEES, allClients, year: 2026, month: 8 })

describe('pruneCarryForward — sueldos', () => {
  it('descarta a quien se dio de baja con baja_incluye_mes false en el mes destino', () => {
    const out = pruneAgosto(makeData())
    const ids = out.finanzas.sueldos.map((r) => r.empleadoId)
    expect(ids).not.toContain('u-andres')
    expect(ids).not.toContain('u-paula')
  })

  it('conserva a quien se dio de baja durante el mes contando el mes completo', () => {
    const out = pruneAgosto(makeData())
    expect(out.finanzas.sueldos.map((r) => r.empleadoId)).toContain('u-osnel')
  })

  it('conserva a los empleados activos y las filas manuales', () => {
    const out = pruneAgosto(makeData())
    expect(out.finanzas.sueldos.map((r) => r.empleadoId)).toContain('u-bianca')
    expect(out.finanzas.sueldos.filter((r) => r.empleadoId == null)).toHaveLength(1)
    expect(out.finanzas.sueldos).toHaveLength(3)
  })

  it('conserva filas cuyo empleado no se encuentra en el listado', () => {
    const data = makeData({
      finanzas: {
        sueldos: [{ id: 'x', empleadoId: 'u-desconocido', descripcion: 'Fulano', monto: 100 }],
      },
    })
    expect(pruneAgosto(data).finanzas.sueldos).toHaveLength(1)
  })

  it('no toca los meses anteriores a la baja', () => {
    const out = pruneCarryForward(makeData(), {
      allEmployees: ALL_EMPLOYEES,
      allClients: [],
      year: 2026,
      month: 7,
    })
    expect(out.finanzas.sueldos).toHaveLength(5)
  })

  it('no muta el objeto original', () => {
    const data = makeData()
    pruneAgosto(data)
    expect(data.finanzas.sueldos).toHaveLength(5)
  })
})

describe('pruneCarryForward — ingresos', () => {
  const CLIENTE_BAJA = {
    id: 'c1',
    name: 'Cuenta cerrada',
    created_at: '2025-01-01T00:00:00Z',
    contract_end: '2026-07-31',
  }
  const CLIENTE_ACTIVO = {
    id: 'c2',
    name: 'Cuenta viva',
    created_at: '2025-01-01T00:00:00Z',
    contract_end: null,
    deleted_at: null,
  }

  it('descarta ingresos de clientes cuyo contrato terminó antes del mes destino', () => {
    const data = {
      finanzas: {
        sueldos: [],
        ingresos: [
          { id: 'i1', clienteId: 'c1', descripcion: 'Cuenta cerrada', monto: 400 },
          { id: 'i2', clienteId: 'c2', descripcion: 'Cuenta viva', monto: 500 },
          { id: 'i3', clienteId: null, descripcion: 'Extra manual', monto: 50 },
        ],
      },
    }
    const out = pruneAgosto(data, [CLIENTE_BAJA, CLIENTE_ACTIVO])
    const ids = out.finanzas.ingresos.map((r) => r.clienteId)
    expect(ids).not.toContain('c1')
    expect(ids).toContain('c2')
    expect(ids).toContain(null)
  })
})

describe('pruneCarryForward — defensivo', () => {
  it('devuelve el data intacto si no hay bloque finanzas', () => {
    const data = { reuniones: { realizadas: 3 } }
    expect(
      pruneCarryForward(data, { allEmployees: [], allClients: [], year: 2026, month: 8 }),
    ).toEqual(data)
  })

  it('tolera finanzas sin arrays de sueldos/ingresos', () => {
    const out = pruneAgosto({ finanzas: {} })
    expect(out.finanzas.sueldos).toEqual([])
    expect(out.finanzas.ingresos).toEqual([])
  })
})
