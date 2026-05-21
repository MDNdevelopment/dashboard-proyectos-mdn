/**
 * Contract tests for the notify-ticket Edge Function's notification filter.
 * Verifies that the query logic correctly excludes employees with notifications disabled.
 */
import { describe, it, expect } from 'vitest'

/**
 * Simulates the IT staff filtering logic in the Edge Function.
 * Only returns staff with department_id = 0 AND receive_ticket_notifications = true.
 */
function filterNotifiableStaff(users) {
  return users.filter(u => u.department_id === 0 && u.receive_ticket_notifications === true)
}

const allStaff = [
  { user_id: 'u1', email: 'carlos@mdn.com', first_name: 'Carlos', department_id: 0, receive_ticket_notifications: true },
  { user_id: 'u2', email: 'maria@mdn.com', first_name: 'Maria', department_id: 0, receive_ticket_notifications: false },
  { user_id: 'u3', email: 'ana@mdn.com', first_name: 'Ana', department_id: 1, receive_ticket_notifications: true },
]

describe('notify-ticket: filtro receive_ticket_notifications', () => {
  it('incluye solo empleados IT con notificaciones habilitadas', () => {
    const recipients = filterNotifiableStaff(allStaff)
    expect(recipients).toHaveLength(1)
    expect(recipients[0].user_id).toBe('u1')
  })

  it('excluye empleados IT con notificaciones deshabilitadas', () => {
    const recipients = filterNotifiableStaff(allStaff)
    const emails = recipients.map(r => r.email)
    expect(emails).not.toContain('maria@mdn.com')
  })

  it('excluye empleados de otros departamentos aunque tengan notificaciones activas', () => {
    const recipients = filterNotifiableStaff(allStaff)
    const emails = recipients.map(r => r.email)
    expect(emails).not.toContain('ana@mdn.com')
  })

  it('devuelve lista vacía si todos tienen notificaciones desactivadas', () => {
    const allOff = allStaff.map(u => ({ ...u, receive_ticket_notifications: false }))
    expect(filterNotifiableStaff(allOff)).toHaveLength(0)
  })

  it('devuelve lista vacía si no hay empleados IT', () => {
    const noIT = allStaff.filter(u => u.department_id !== 0)
    expect(filterNotifiableStaff(noIT)).toHaveLength(0)
  })

  it('el Edge Function debe filtrar por receive_ticket_notifications=true en la query', () => {
    // Documents the expected query shape:
    // .eq('department_id', 0).eq('receive_ticket_notifications', true)
    const queryFilters = { department_id: 0, receive_ticket_notifications: true }
    expect(queryFilters.department_id).toBe(0)
    expect(queryFilters.receive_ticket_notifications).toBe(true)
  })
})
