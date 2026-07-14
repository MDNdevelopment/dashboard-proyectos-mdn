/**
 * Tests for src/utils/notificationFormat.js
 * Covers notifIcon, notifLabel, notifRoute, notifTimeAgo.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  notifIcon,
  notifLabel,
  notifRoute,
  notifTimeAgo,
} from '../utils/notificationFormat'

// ── notifIcon ────────────────────────────────────────────────────────────────

describe('notifIcon', () => {
  it('returns 📋 for task_assigned', () => {
    expect(notifIcon('task_assigned')).toBe('📋')
  })
  it('returns 📁 for project_added', () => {
    expect(notifIcon('project_added')).toBe('📁')
  })
  it('returns 🎂 for client_anniversary', () => {
    expect(notifIcon('client_anniversary')).toBe('🎂')
  })
  it('returns 🤝 for client_mdn_anniversary', () => {
    expect(notifIcon('client_mdn_anniversary')).toBe('🤝')
  })
  it('returns 🎂 for client_contact_birthday', () => {
    expect(notifIcon('client_contact_birthday')).toBe('🎂')
  })
  it('returns 🎂 for employee_birthday', () => {
    expect(notifIcon('employee_birthday')).toBe('🎂')
  })
  it('returns 🎊 for employee_mdn_anniversary', () => {
    expect(notifIcon('employee_mdn_anniversary')).toBe('🎊')
  })
  it('returns 📅 for meeting_invite', () => {
    expect(notifIcon('meeting_invite')).toBe('📅')
  })
  it('returns 📅 for meeting_reminder_day', () => {
    expect(notifIcon('meeting_reminder_day')).toBe('📅')
  })
  it('returns ⏰ for meeting_reminder_hour', () => {
    expect(notifIcon('meeting_reminder_hour')).toBe('⏰')
  })
  it('returns 🔔 for unknown types', () => {
    expect(notifIcon('unknown_type')).toBe('🔔')
    expect(notifIcon('')).toBe('🔔')
  })
})

// ── notifLabel ───────────────────────────────────────────────────────────────

describe('notifLabel', () => {
  it('returns human-readable label for task_assigned', () => {
    expect(notifLabel('task_assigned')).toBe('Tarea asignada')
  })
  it('returns human-readable label for project_added', () => {
    expect(notifLabel('project_added')).toBe('Proyecto')
  })
  it('returns human-readable label for employee_birthday', () => {
    expect(notifLabel('employee_birthday')).toBe('Cumpleaños')
  })
  it('returns human-readable label for employee_mdn_anniversary', () => {
    expect(notifLabel('employee_mdn_anniversary')).toBe('Aniversario MDN')
  })
  it('returns human-readable label for meeting_invite', () => {
    expect(notifLabel('meeting_invite')).toBe('Reunión agendada')
  })
  it('returns human-readable label for meeting_reminder_day', () => {
    expect(notifLabel('meeting_reminder_day')).toBe('Recordatorio de reunión')
  })
  it('returns human-readable label for meeting_reminder_hour', () => {
    expect(notifLabel('meeting_reminder_hour')).toBe('Recordatorio de reunión')
  })
  it('returns fallback for unknown types', () => {
    expect(notifLabel('whatever')).toBe('Notificación')
  })
})

// ── notifRoute ───────────────────────────────────────────────────────────────

describe('notifRoute', () => {
  it('routes task_assigned to /tareas', () => {
    expect(notifRoute({ type: 'task_assigned', entity_type: 'task', entity_id: 'abc' }))
      .toBe('/tareas')
  })

  it('routes project_added to /?projectId=<id> when entity_id is present', () => {
    const route = notifRoute({ type: 'project_added', entity_type: 'project', entity_id: 'proj-123' })
    expect(route).toBe('/?projectId=proj-123')
  })

  it('routes project_added to / when entity_id is null', () => {
    expect(notifRoute({ type: 'project_added', entity_type: 'project', entity_id: null }))
      .toBe('/')
  })

  it('routes client entity types to /empresa/clientes', () => {
    expect(notifRoute({ type: 'client_anniversary', entity_type: 'client', entity_id: 'c1' }))
      .toBe('/empresa/clientes')
    expect(notifRoute({ type: 'client_mdn_anniversary', entity_type: 'client', entity_id: 'c1' }))
      .toBe('/empresa/clientes')
    expect(notifRoute({ type: 'client_contact_birthday', entity_type: 'client', entity_id: 'c1' }))
      .toBe('/empresa/clientes')
  })

  it('routes employee entity types to /empresa/empleados', () => {
    expect(notifRoute({ type: 'employee_birthday', entity_type: 'employee', entity_id: 'u1' }))
      .toBe('/empresa/empleados')
    expect(notifRoute({ type: 'employee_mdn_anniversary', entity_type: 'employee', entity_id: 'u1' }))
      .toBe('/empresa/empleados')
  })

  it('routes meeting types to /reuniones?meetingId=<id> (deeplink al detalle de la reunión)', () => {
    expect(notifRoute({ type: 'meeting_invite', entity_type: 'meeting', entity_id: 'm1' }))
      .toBe('/reuniones?meetingId=m1')
    expect(notifRoute({ type: 'meeting_reminder_day', entity_type: 'meeting', entity_id: 'm1' }))
      .toBe('/reuniones?meetingId=m1')
    expect(notifRoute({ type: 'meeting_reminder_hour', entity_type: 'meeting', entity_id: 'm1' }))
      .toBe('/reuniones?meetingId=m1')
  })

  it('routes meeting types to /reuniones (sin query) cuando no hay entity_id', () => {
    expect(notifRoute({ type: 'meeting_invite', entity_type: 'meeting', entity_id: null }))
      .toBe('/reuniones')
  })

  it('falls back to / for unknown types', () => {
    expect(notifRoute({ type: 'unknown', entity_type: null, entity_id: null }))
      .toBe('/')
  })
})

// ── notifTimeAgo ─────────────────────────────────────────────────────────────

describe('notifTimeAgo', () => {
  beforeEach(() => {
    // Freeze "now" to 2026-07-03T15:00:00Z
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-03T15:00:00Z'))
  })
  afterEach(() => { vi.useRealTimers() })

  it('returns "Ahora" for very recent timestamps (< 1 min)', () => {
    expect(notifTimeAgo('2026-07-03T14:59:30Z')).toBe('Ahora')
  })

  it('returns "hace N min" for timestamps within the hour', () => {
    expect(notifTimeAgo('2026-07-03T14:45:00Z')).toBe('hace 15 min')
  })

  it('returns "hace N h" for timestamps within 24 hours', () => {
    expect(notifTimeAgo('2026-07-03T12:00:00Z')).toBe('hace 3 h')
  })

  it('returns "hace N d" for timestamps within 7 days', () => {
    expect(notifTimeAgo('2026-07-01T15:00:00Z')).toBe('hace 2 d')
  })

  it('returns a formatted date for older timestamps', () => {
    const result = notifTimeAgo('2026-06-01T15:00:00Z')
    // Should be a date string in DD/MM/YYYY or similar
    expect(result).toMatch(/\d{2}\/\d{2}\/\d{4}/)
  })

  it('returns empty string for null', () => {
    expect(notifTimeAgo(null)).toBe('')
  })

  it('returns empty string for empty string', () => {
    expect(notifTimeAgo('')).toBe('')
  })

  it('returns empty string for invalid date', () => {
    expect(notifTimeAgo('not-a-date')).toBe('')
  })
})
