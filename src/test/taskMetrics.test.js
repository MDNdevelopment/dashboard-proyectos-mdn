import { describe, it, expect } from 'vitest'
import {
  aggregateTaskMetrics,
  buildMonthlySeries,
  aggregateProjectParticipation,
} from '../utils/aggregateTaskMetrics'
import { monthIndex, currentMonthIndex } from '../components/tareas/constants'

// ─── Helpers ─────────────────────────────────────────────────────────────────

const USER_A = 'user-a'
const USER_B = 'user-b'

/** Crea una tarea mínima para tests */
function task(overrides = {}) {
  return {
    id: Math.random().toString(36).slice(2),
    assignee_id: USER_A,
    support_id: null,
    status: 'En proceso',
    request_date: '2026-01-01',
    due_date: null,
    closed_date: null,
    ...overrides,
  }
}

// Mes actual: 2026-06 → monthIndex = 2026*12+5 = 24317
const CURRENT_MONTH = currentMonthIndex()
// Mes pasado: 2026-05
const PAST_MONTH = monthIndex(new Date(2026, 4, 1)) // Mes anterior al actual

// ─── aggregateTaskMetrics ─────────────────────────────────────────────────────

describe('aggregateTaskMetrics', () => {
  it('devuelve ceros cuando no hay tareas', () => {
    const m = aggregateTaskMetrics([], USER_A)
    expect(m.total).toBe(0)
    expect(m.terminadas).toBe(0)
    expect(m.completionPct).toBe(0)
    expect(m.onTimePct).toBeNull()
    expect(m.avgDelayDays).toBeNull()
    expect(m.avgResolutionDays).toBeNull()
  })

  it('filtra solo las tareas del empleado como responsable', () => {
    const tasks = [
      task({ assignee_id: USER_A }),
      task({ assignee_id: USER_A }),
      task({ assignee_id: USER_B }),
    ]
    const m = aggregateTaskMetrics(tasks, USER_A, { role: 'assignee' })
    expect(m.total).toBe(2)
  })

  it('filtra solo las tareas del empleado como apoyo', () => {
    const tasks = [
      task({ support_id: USER_A }),
      task({ support_id: USER_A, status: 'Terminado', closed_date: '2026-02-10' }),
      task({ support_id: USER_B }),
    ]
    const m = aggregateTaskMetrics(tasks, USER_A, { role: 'support' })
    expect(m.total).toBe(2)
    expect(m.terminadas).toBe(1)
  })

  it('calcula completionPct correctamente', () => {
    const tasks = [
      task({ status: 'Terminado', closed_date: '2026-02-05', request_date: '2026-01-01' }),
      task({ status: 'En proceso' }),
      task({ status: 'Terminado', closed_date: '2026-03-01', request_date: '2026-02-01' }),
      task({ status: 'Pendiente' }),
    ]
    const m = aggregateTaskMetrics(tasks, USER_A)
    expect(m.total).toBe(4)
    expect(m.terminadas).toBe(2)
    expect(m.completionPct).toBe(50)
  })

  it('completionPct es 100 cuando todas terminadas', () => {
    const tasks = [
      task({ status: 'Terminado', closed_date: '2026-02-01', request_date: '2026-01-01' }),
      task({ status: 'Terminado', closed_date: '2026-03-01', request_date: '2026-02-01' }),
    ]
    const m = aggregateTaskMetrics(tasks, USER_A)
    expect(m.completionPct).toBe(100)
  })

  it('detecta tarea a tiempo (closed_date <= due_date)', () => {
    const tasks = [
      task({ status: 'Terminado', due_date: '2026-02-10', closed_date: '2026-02-08', request_date: '2026-01-01' }),
    ]
    const m = aggregateTaskMetrics(tasks, USER_A)
    expect(m.aTiempo).toBe(1)
    expect(m.tarde).toBe(0)
    expect(m.onTimePct).toBe(100)
    expect(m.avgDelayDays).toBeNull()
  })

  it('detecta tarea tarde (closed_date > due_date)', () => {
    const tasks = [
      task({ status: 'Terminado', due_date: '2026-02-05', closed_date: '2026-02-10', request_date: '2026-01-01' }),
    ]
    const m = aggregateTaskMetrics(tasks, USER_A)
    expect(m.aTiempo).toBe(0)
    expect(m.tarde).toBe(1)
    expect(m.onTimePct).toBe(0)
    expect(m.avgDelayDays).toBe(5)
  })

  it('calcula promedio de demora sobre múltiples tareas tarde', () => {
    const tasks = [
      task({ status: 'Terminado', due_date: '2026-02-01', closed_date: '2026-02-11', request_date: '2026-01-01' }), // 10 días tarde
      task({ status: 'Terminado', due_date: '2026-03-01', closed_date: '2026-03-06', request_date: '2026-02-01' }), // 5 días tarde
    ]
    const m = aggregateTaskMetrics(tasks, USER_A)
    expect(m.avgDelayDays).toBe(8) // redondeo de (10+5)/2 = 7.5 → 8
  })

  it('onTimePct combina a tiempo y tarde correctamente', () => {
    const tasks = [
      task({ status: 'Terminado', due_date: '2026-02-10', closed_date: '2026-02-08', request_date: '2026-01-01' }), // a tiempo
      task({ status: 'Terminado', due_date: '2026-03-01', closed_date: '2026-03-06', request_date: '2026-02-01' }), // tarde
      task({ status: 'Terminado', due_date: '2026-04-01', closed_date: '2026-03-30', request_date: '2026-03-01' }), // a tiempo
    ]
    const m = aggregateTaskMetrics(tasks, USER_A)
    // 2 a tiempo, 1 tarde → 67%
    expect(m.onTimePct).toBe(67)
  })

  it('ignora tareas sin due_date o closed_date para el cálculo de onTimePct', () => {
    const tasks = [
      task({ status: 'Terminado', due_date: null, closed_date: '2026-02-10', request_date: '2026-01-01' }),
      task({ status: 'Terminado', due_date: '2026-03-01', closed_date: null, request_date: '2026-02-01' }),
    ]
    const m = aggregateTaskMetrics(tasks, USER_A)
    expect(m.terminadas).toBe(2)
    expect(m.onTimePct).toBeNull() // sin datos suficientes
  })

  it('calcula avgResolutionDays correctamente', () => {
    const tasks = [
      task({ status: 'Terminado', request_date: '2026-01-01', closed_date: '2026-01-11' }), // 10 días
      task({ status: 'Terminado', request_date: '2026-02-01', closed_date: '2026-02-21' }), // 20 días
    ]
    const m = aggregateTaskMetrics(tasks, USER_A)
    expect(m.avgResolutionDays).toBe(15)
  })

  it('contabiliza bloqueadas correctamente', () => {
    const tasks = [
      task({ status: 'Paralizado' }),
      task({ status: 'Paralizado' }),
      task({ status: 'En proceso' }),
    ]
    const m = aggregateTaskMetrics(tasks, USER_A)
    expect(m.bloqueadas).toBe(2)
  })

  it('detecta tareas retrasadas (abiertas y vencidas)', () => {
    const tasks = [
      // Vencida en el pasado y aún abierta → retrasada
      task({ status: 'En proceso', due_date: '2020-01-01', request_date: '2019-12-01' }),
      // Vencida pero terminada → no retrasada
      task({ status: 'Terminado', due_date: '2020-01-01', closed_date: '2020-02-01', request_date: '2019-12-01' }),
      // Sin due_date → no retrasada
      task({ status: 'En proceso' }),
    ]
    const m = aggregateTaskMetrics(tasks, USER_A)
    expect(m.retrasadas).toBe(1)
  })

  it('detecta tareas arrastradas (abiertas desde un mes anterior)', () => {
    const tasks = [
      // Empezó en el pasado y sigue abierta → arrastrada
      task({ status: 'En proceso', request_date: '2025-01-01' }),
      // Terminada del pasado → no arrastrada
      task({ status: 'Terminado', request_date: '2025-01-01', closed_date: '2025-02-01' }),
    ]
    const m = aggregateTaskMetrics(tasks, USER_A)
    expect(m.arrastradas).toBe(1)
  })

  it('construye byStatus correctamente', () => {
    const tasks = [
      task({ status: 'En proceso' }),
      task({ status: 'En proceso' }),
      task({ status: 'Terminado', closed_date: '2026-02-01', request_date: '2026-01-01' }),
      task({ status: 'Paralizado' }),
    ]
    const m = aggregateTaskMetrics(tasks, USER_A)
    expect(m.byStatus['En proceso']).toBe(2)
    expect(m.byStatus['Terminado']).toBe(1)
    expect(m.byStatus['Paralizado']).toBe(1)
    expect(m.byStatus['Pendiente']).toBeUndefined()
  })
})

// ─── aggregateTaskMetrics con filtro de mes ───────────────────────────────────

describe('aggregateTaskMetrics – filtro por monthIdx', () => {
  it('incluye solo tareas activas en el mes especificado', () => {
    // taskInMonth para tareas abiertas: visible desde start hasta mes actual
    // Para tareas cerradas: visible desde start hasta closed month
    const may2026 = monthIndex(new Date(2026, 4, 1)) // 2026-05
    const tasks = [
      // Empezó en abril y terminó en mayo → activa en mayo
      task({ status: 'Terminado', request_date: '2026-04-01', closed_date: '2026-05-15' }),
      // Empezó y terminó en abril → NO en mayo
      task({ status: 'Terminado', request_date: '2026-04-01', closed_date: '2026-04-20' }),
      // Empezó en mayo y sigue abierta → activa en mayo
      task({ status: 'En proceso', request_date: '2026-05-01' }),
    ]
    const m = aggregateTaskMetrics(tasks, USER_A, { monthIdx: may2026 })
    expect(m.total).toBe(2)
    expect(m.terminadas).toBe(1)
  })

  it('histórico (monthIdx null) devuelve todas las tareas del empleado', () => {
    const tasks = [
      task({ status: 'Terminado', request_date: '2024-01-01', closed_date: '2024-02-01' }),
      task({ status: 'En proceso', request_date: '2026-05-01' }),
      task({ assignee_id: USER_B }),
    ]
    const m = aggregateTaskMetrics(tasks, USER_A, { monthIdx: null })
    expect(m.total).toBe(2)
  })
})

// ─── buildMonthlySeries ───────────────────────────────────────────────────────

describe('buildMonthlySeries', () => {
  it('devuelve array vacío si el empleado no tiene tareas', () => {
    const series = buildMonthlySeries([], USER_A)
    expect(series).toEqual([])
  })

  it('genera un punto por mes de actividad, ordenado cronológicamente', () => {
    const tasks = [
      task({ status: 'Terminado', request_date: '2026-03-01', closed_date: '2026-03-20' }),
      task({ status: 'Terminado', request_date: '2026-04-01', closed_date: '2026-04-15' }),
    ]
    const series = buildMonthlySeries(tasks, USER_A)
    const indices = series.map(s => s.monthIdx)
    // Deben estar en orden ascendente
    for (let i = 1; i < indices.length; i++) {
      expect(indices[i]).toBeGreaterThan(indices[i - 1])
    }
    // Cada punto tiene los campos esperados
    for (const point of series) {
      expect(point).toHaveProperty('monthIdx')
      expect(point).toHaveProperty('label')
      expect(point).toHaveProperty('total')
      expect(point).toHaveProperty('terminadas')
      expect(point).toHaveProperty('completionPct')
    }
  })

  it('completionPct por mes es correcto', () => {
    const mar2026 = monthIndex(new Date(2026, 2, 1))
    const tasks = [
      task({ status: 'Terminado', request_date: '2026-03-01', closed_date: '2026-03-20' }),
      task({ status: 'Terminado', request_date: '2026-03-05', closed_date: '2026-03-25' }),
      task({ status: 'En proceso', request_date: '2026-03-10' }), // sigue activa hasta hoy
    ]
    const series = buildMonthlySeries(tasks, USER_A)
    const marPt = series.find(s => s.monthIdx === mar2026)
    expect(marPt).toBeDefined()
    // En marzo hay 3 tareas activas (las abiertas siguen hasta hoy)
    // 2 terminadas → 67%
    expect(marPt.terminadas).toBe(2)
    expect(marPt.completionPct).toBe(67)
  })

  it('no incluye tareas del otro rol (apoyo)', () => {
    const tasks = [
      task({ assignee_id: USER_B, support_id: USER_A, request_date: '2026-03-01' }),
    ]
    // role assignee → USER_A no aparece
    const series = buildMonthlySeries(tasks, USER_A, { role: 'assignee' })
    expect(series).toEqual([])
  })

  it('usa role support cuando se indica', () => {
    const tasks = [
      task({ assignee_id: USER_B, support_id: USER_A, request_date: '2026-03-01' }),
    ]
    const series = buildMonthlySeries(tasks, USER_A, { role: 'support' })
    expect(series.length).toBeGreaterThan(0)
  })
})

// ─── aggregateProjectParticipation ───────────────────────────────────────────

describe('aggregateProjectParticipation', () => {
  it('devuelve ceros cuando no hay proyectos', () => {
    const r = aggregateProjectParticipation([], USER_A)
    expect(r.total).toBe(0)
    expect(r.completedPct).toBe(0)
  })

  it('filtra solo proyectos donde el usuario es miembro', () => {
    const projects = [
      { id: '1', status: 'Completado', members: [USER_A, USER_B] },
      { id: '2', status: 'En proceso', members: [USER_A] },
      { id: '3', status: 'Pendiente', members: [USER_B] }, // no incluye USER_A
    ]
    const r = aggregateProjectParticipation(projects, USER_A)
    expect(r.total).toBe(2)
  })

  it('calcula byStatus y completedPct correctamente', () => {
    const projects = [
      { id: '1', status: 'Completado', members: [USER_A] },
      { id: '2', status: 'Completado', members: [USER_A] },
      { id: '3', status: 'En proceso', members: [USER_A] },
      { id: '4', status: 'Pendiente', members: [USER_A] },
    ]
    const r = aggregateProjectParticipation(projects, USER_A)
    expect(r.total).toBe(4)
    expect(r.byStatus['Completado']).toBe(2)
    expect(r.byStatus['En proceso']).toBe(1)
    expect(r.byStatus['Pendiente']).toBe(1)
    expect(r.completedPct).toBe(50)
  })

  it('completedPct es 100 cuando todos completados', () => {
    const projects = [
      { id: '1', status: 'Completado', members: [USER_A] },
      { id: '2', status: 'Completado', members: [USER_A] },
    ]
    const r = aggregateProjectParticipation(projects, USER_A)
    expect(r.completedPct).toBe(100)
  })

  it('maneja correctamente members null o no array', () => {
    const projects = [
      { id: '1', status: 'En proceso', members: null },
      { id: '2', status: 'Completado', members: undefined },
      { id: '3', status: 'Completado', members: [USER_A] },
    ]
    const r = aggregateProjectParticipation(projects, USER_A)
    expect(r.total).toBe(1)
  })
})
