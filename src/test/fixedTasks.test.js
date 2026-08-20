import { describe, it, expect } from 'vitest'
import {
  buildFixedWeeks,
  tasksForWeek,
  taskDeadline,
  taskAppliesToClient,
  computeProductividad,
  aggregateEmployeeFixedTasks,
  TASK_KEYS,
} from '../utils/fixedTasks'

// Julio 2026: miércoles 1, 8, 15, 22, 29 → 5 semanas.
const YEAR = 2026
const MONTH = 7

function mark(overrides = {}) {
  return {
    client_id: 'c1',
    task_key: 'grilla',
    period_year: YEAR,
    period_week: 1,
    status: 'si',
    network: '',
    ...overrides,
  }
}

function client(overrides = {}) {
  return { id: 'c1', name: 'Cliente 1', fixed_tasks: null, ...overrides }
}

describe('buildFixedWeeks', () => {
  it('ancla las semanas al miércoles del mes', () => {
    const weeks = buildFixedWeeks(YEAR, MONTH)
    expect(weeks).toHaveLength(5)
    weeks.forEach((w) => expect(w.wed.getDay()).toBe(3))
    expect(weeks[0].isFirst).toBe(true)
    expect(weeks[0].isLast).toBe(false)
    expect(weeks.at(-1).isLast).toBe(true)
  })

  it('numera las semanas consecutivamente desde 1', () => {
    const weeks = buildFixedWeeks(YEAR, MONTH)
    expect(weeks.map((w) => w.n)).toEqual([1, 2, 3, 4, 5])
  })
})

describe('tasksForWeek', () => {
  const weeks = buildFixedWeeks(YEAR, MONTH)

  it('la semana 1 incluye métricas + base', () => {
    expect(tasksForWeek(1, weeks).sort()).toEqual(['artes', 'grilla', 'metricas'].sort())
  })

  it('una semana intermedia solo trae la base', () => {
    expect(tasksForWeek(3, weeks).sort()).toEqual(['artes', 'grilla'].sort())
  })

  it('la última semana incluye calendario + base', () => {
    const lastN = weeks.at(-1).n
    expect(tasksForWeek(lastN, weeks).sort()).toEqual(['artes', 'calendario', 'grilla'].sort())
  })
})

describe('taskDeadline', () => {
  const weeks = buildFixedWeeks(YEAR, MONTH)

  it('grilla vence el miércoles de su semana', () => {
    const { date } = taskDeadline('grilla', weeks[1], YEAR, MONTH)
    expect(date.getTime()).toBe(weeks[1].wed.getTime())
  })

  it('métricas vence el 5º día hábil del mes', () => {
    const { date } = taskDeadline('metricas', weeks[0], YEAR, MONTH)
    // Julio 2026 empieza miércoles: día 1 (mié), 2 (jue), 3 (vie), 6 (lun), 7 (mar) → 5º hábil = 7
    expect(date.getDate()).toBe(7)
  })

  it('calendario vence el último día hábil del mes', () => {
    const { date } = taskDeadline('calendario', weeks.at(-1), YEAR, MONTH)
    expect(date.getDay()).not.toBe(0)
    expect(date.getDay()).not.toBe(6)
  })
})

describe('taskAppliesToClient', () => {
  it('sin configuración, todas las tareas aplican', () => {
    expect(taskAppliesToClient(null, 'grilla')).toBe(true)
    expect(taskAppliesToClient(undefined, 'calendario')).toBe(true)
  })

  it('respeta false explícito', () => {
    expect(taskAppliesToClient({ grilla: false }, 'grilla')).toBe(false)
    expect(taskAppliesToClient({ grilla: false }, 'artes')).toBe(true)
  })
})

describe('computeProductividad', () => {
  it('meta cuenta solo celdas aplicables (excluye na y no-aplicables)', () => {
    const weeks = buildFixedWeeks(YEAR, MONTH)
    const clients = [client({ id: 'c1' })]
    const marks = [
      mark({ client_id: 'c1', task_key: 'grilla', period_week: 1, status: 'si' }),
      mark({ client_id: 'c1', task_key: 'grilla', period_week: 2, status: 'na' }),
      mark({ client_id: 'c1', task_key: 'grilla', period_week: 3, status: 'no' }),
      // semanas 4 y 5 sin marca (pendiente) → cuentan en meta, no en real
    ]
    const rows = computeProductividad(marks, clients, weeks)
    const grillaRow = rows.find((r) => r.nombre === 'Grillas Redes → Diseño')
    // meta = 5 semanas - 1 (na) = 4; real = 1 (si)
    expect(grillaRow.meta).toBe(4)
    expect(grillaRow.realizado).toBe(1)
  })

  it('excluye cuentas donde la tarea no aplica', () => {
    const weeks = buildFixedWeeks(YEAR, MONTH)
    const clients = [client({ id: 'c1', fixed_tasks: { calendario: false } })]
    const rows = computeProductividad([], clients, weeks)
    const calRow = rows.find((r) => r.nombre === 'Calendario')
    expect(calRow.meta).toBe(0)
    expect(calRow.realizado).toBe(0)
  })

  it('produce una fila por cada task_key, en el shape {nombre, realizado, meta}', () => {
    const weeks = buildFixedWeeks(YEAR, MONTH)
    const rows = computeProductividad([], [client()], weeks)
    expect(rows).toHaveLength(TASK_KEYS.length)
    rows.forEach((r) => {
      expect(r).toHaveProperty('nombre')
      expect(r).toHaveProperty('realizado')
      expect(r).toHaveProperty('meta')
    })
  })
})

describe('aggregateEmployeeFixedTasks', () => {
  it('devuelve ceros y null sin marcas', () => {
    const res = aggregateEmployeeFixedTasks([], ['c1'])
    expect(res.total).toBe(0)
    expect(res.entregadas).toBe(0)
    expect(res.cumplimientoPct).toBeNull()
  })

  it('excluye "na" del cálculo de cumplimiento', () => {
    const marks = [
      mark({ client_id: 'c1', status: 'si' }),
      mark({ client_id: 'c1', task_key: 'artes', status: 'no' }),
      mark({ client_id: 'c1', task_key: 'calendario', status: 'na' }),
    ]
    const res = aggregateEmployeeFixedTasks(marks, ['c1'])
    expect(res.total).toBe(2)
    expect(res.entregadas).toBe(1)
    expect(res.cumplimientoPct).toBe(50)
  })

  it('solo considera las cuentas indicadas', () => {
    const marks = [mark({ client_id: 'c1', status: 'si' }), mark({ client_id: 'c2', status: 'no' })]
    const res = aggregateEmployeeFixedTasks(marks, ['c1'])
    expect(res.total).toBe(1)
    expect(res.entregadas).toBe(1)
  })

  it('desglosa por task_key', () => {
    const marks = [
      mark({ client_id: 'c1', task_key: 'grilla', status: 'si' }),
      mark({ client_id: 'c1', task_key: 'artes', status: 'no' }),
    ]
    const res = aggregateEmployeeFixedTasks(marks, ['c1'])
    expect(res.byTaskKey.grilla).toEqual({ total: 1, entregadas: 1 })
    expect(res.byTaskKey.artes).toEqual({ total: 1, entregadas: 0 })
  })
})
