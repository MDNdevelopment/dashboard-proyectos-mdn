import { describe, it, expect } from 'vitest'
import {
  newChecklistItem,
  clampItemDueDate,
  checklistProgress,
} from '../components/tareas/taskChecklist'

// ── newChecklistItem ─────────────────────────────────────────

describe('newChecklistItem', () => {
  it('crea un ítem con defaults correctos', () => {
    const item = newChecklistItem()
    expect(item.done).toBe(false)
    expect(item.title).toBe('')
    expect(item.assignee_id).toBeNull()
    expect(item.due_date).toBe('')
    expect(typeof item.id).toBe('string')
    expect(item.id.length).toBeGreaterThan(0)
  })

  it('genera ids únicos en llamadas sucesivas', () => {
    const ids = Array.from({ length: 20 }, () => newChecklistItem().id)
    expect(new Set(ids).size).toBe(20)
  })
})

// ── clampItemDueDate ─────────────────────────────────────────

describe('clampItemDueDate', () => {
  it('devuelve la fecha sin cambios si está dentro del rango', () => {
    expect(clampItemDueDate('2026-01-15', { request_date: '2026-01-10', due_date: '2026-01-31' })).toBe('2026-01-15')
  })

  it('recorta al request_date cuando la fecha es anterior', () => {
    expect(clampItemDueDate('2026-01-05', { request_date: '2026-01-10', due_date: '2026-01-31' })).toBe('2026-01-10')
  })

  it('recorta al due_date cuando la fecha es posterior', () => {
    expect(clampItemDueDate('2026-02-15', { request_date: '2026-01-10', due_date: '2026-01-31' })).toBe('2026-01-31')
  })

  it('no recorta si la tarea no tiene fechas', () => {
    expect(clampItemDueDate('2026-02-15', {})).toBe('2026-02-15')
  })

  it('devuelve la cadena vacía tal cual', () => {
    expect(clampItemDueDate('', { request_date: '2026-01-10', due_date: '2026-01-31' })).toBe('')
  })

  it('solo recorta al due_date si no hay request_date', () => {
    expect(clampItemDueDate('2026-03-01', { due_date: '2026-01-31' })).toBe('2026-01-31')
    expect(clampItemDueDate('2026-01-01', { due_date: '2026-01-31' })).toBe('2026-01-01')
  })
})

// ── checklistProgress ────────────────────────────────────────

describe('checklistProgress', () => {
  it('devuelve 0/0 para checklist vacío o nulo', () => {
    expect(checklistProgress([])).toEqual({ done: 0, total: 0 })
    expect(checklistProgress(null)).toEqual({ done: 0, total: 0 })
    expect(checklistProgress(undefined)).toEqual({ done: 0, total: 0 })
  })

  it('cuenta correctamente hechos y total', () => {
    const checklist = [
      { done: true }, { done: false }, { done: true }, { done: false }, { done: false },
    ]
    expect(checklistProgress(checklist)).toEqual({ done: 2, total: 5 })
  })

  it('todos hechos', () => {
    expect(checklistProgress([{ done: true }, { done: true }])).toEqual({ done: 2, total: 2 })
  })

  it('ninguno hecho', () => {
    expect(checklistProgress([{ done: false }, { done: false }])).toEqual({ done: 0, total: 2 })
  })
})
