import { describe, it, expect } from 'vitest'
import { statusUpdatePatch } from '../components/tareas/taskStatus'

describe('statusUpdatePatch', () => {
  it('sets closed_date to today when status is Terminado', () => {
    const today = new Date().toISOString().slice(0, 10)
    const patch = statusUpdatePatch('Terminado')
    expect(patch.status).toBe('Terminado')
    expect(patch.closed_date).toBe(today)
  })

  it('clears closed_date for any non-Terminado status', () => {
    for (const status of ['En proceso', 'Por revisar', 'Paralizado', 'Pendiente']) {
      const patch = statusUpdatePatch(status)
      expect(patch.status).toBe(status)
      expect(patch.closed_date).toBeNull()
    }
  })

  it('returns exactly two keys', () => {
    const patch = statusUpdatePatch('En proceso')
    expect(Object.keys(patch)).toHaveLength(2)
    expect(patch).toHaveProperty('status')
    expect(patch).toHaveProperty('closed_date')
  })
})
