/**
 * Contract tests for the notify-dispatch Edge Function logic.
 * Mirrors the email-building and validation logic from
 * supabase/functions/notify-dispatch/index.ts as pure JS
 * so it can be tested without Deno or a live server.
 */
import { describe, it, expect } from 'vitest'

// ── Mirrors of Edge Function helpers ────────────────────────────────────────

function subjectForType(type, body) {
  const subjects = {
    task_assigned: `Nueva tarea asignada: ${body.slice(0, 60)}`,
    project_added: `Te incluyeron en el proyecto: ${body.slice(0, 60)}`,
  }
  return subjects[type] ?? `Nueva notificación MDN: ${body.slice(0, 80)}`
}

function buildEmailHtml(notif, firstName) {
  const introLines = {
    task_assigned: `Has sido asignado/a a una nueva <strong>tarea</strong>:<br><em>${notif.body}</em>`,
    project_added: `Fuiste incluido/a en el proyecto <strong>"${notif.body}"</strong>.`,
  }
  const intro = introLines[notif.type]
    ?? `Tienes una nueva notificación de <strong>${notif.type}</strong>: ${notif.body}`

  return `<!DOCTYPE html><html lang="es"><body>Hola ${firstName},${intro}MDN Publicidad</body></html>`
}

function buildEmailPayload({ notif, user, fromEmail }) {
  return {
    from: fromEmail,
    to: [user.email],
    subject: subjectForType(notif.type, notif.body),
    html: buildEmailHtml(notif, user.first_name),
  }
}

function shouldSkip(record) {
  return !record?.email
}

// ── Test data ────────────────────────────────────────────────────────────────

const sampleUser = { user_id: 'u1', email: 'ana@mdn.com', first_name: 'Ana', last_name: 'García' }
const fromEmail = 'noreply@mdnpublicidad.com'

const taskNotif = {
  id: 'n1', user_id: 'u1', type: 'task_assigned',
  title: 'Te asignaron una tarea',
  body: 'Diseño del banner de navidad',
  entity_type: 'task', entity_id: 'task-abc',
  email: true, read: false,
}

const projectNotif = {
  id: 'n2', user_id: 'u1', type: 'project_added',
  title: 'Te incluyeron en un proyecto',
  body: 'Campaña Navidad 2026',
  entity_type: 'project', entity_id: 'proj-abc',
  email: true, read: false,
}

const dateNotif = {
  id: 'n3', user_id: 'u1', type: 'employee_birthday',
  title: '🎂 Cumpleaños de Ana García',
  body: '¡Hoy es el cumpleaños de Ana García! 🎉',
  entity_type: 'employee', entity_id: 'u1',
  email: false, read: false,
}

// ── Skip logic ───────────────────────────────────────────────────────────────

describe('notify-dispatch: skip logic', () => {
  it('skips notifications where email is false', () => {
    expect(shouldSkip(dateNotif)).toBe(true)
  })

  it('does not skip notifications where email is true', () => {
    expect(shouldSkip(taskNotif)).toBe(false)
    expect(shouldSkip(projectNotif)).toBe(false)
  })

  it('skips null record', () => {
    expect(shouldSkip(null)).toBe(true)
  })

  it('skips record without email field', () => {
    expect(shouldSkip({ id: 'x' })).toBe(true)
  })
})

// ── Subject line ─────────────────────────────────────────────────────────────

describe('notify-dispatch: subject line', () => {
  it('builds subject for task_assigned', () => {
    const s = subjectForType('task_assigned', 'Diseño del banner')
    expect(s).toContain('Nueva tarea asignada')
    expect(s).toContain('Diseño del banner')
  })

  it('builds subject for project_added', () => {
    const s = subjectForType('project_added', 'Campaña Navidad')
    expect(s).toContain('Te incluyeron en el proyecto')
    expect(s).toContain('Campaña Navidad')
  })

  it('truncates long body at 60 chars for task and project types', () => {
    const longBody = 'A'.repeat(100)
    const s = subjectForType('task_assigned', longBody)
    expect(s.length).toBeLessThanOrEqual('Nueva tarea asignada: '.length + 60)
  })

  it('falls back gracefully for unknown types', () => {
    const s = subjectForType('client_anniversary', 'Cliente Acme S.A.')
    expect(s).toContain('Nueva notificación MDN')
    expect(s).toContain('Cliente Acme S.A.')
  })
})

// ── Email HTML ────────────────────────────────────────────────────────────────

describe('notify-dispatch: email HTML', () => {
  it('includes the recipient first name', () => {
    const html = buildEmailHtml(taskNotif, 'Ana')
    expect(html).toContain('Hola Ana')
  })

  it('includes task description for task_assigned', () => {
    const html = buildEmailHtml(taskNotif, 'Ana')
    expect(html).toContain('Diseño del banner de navidad')
  })

  it('includes project name for project_added', () => {
    const html = buildEmailHtml(projectNotif, 'Ana')
    expect(html).toContain('Campaña Navidad 2026')
  })

  it('includes MDN Publicidad branding', () => {
    expect(buildEmailHtml(taskNotif, 'Ana')).toContain('MDN Publicidad')
    expect(buildEmailHtml(projectNotif, 'Ana')).toContain('MDN Publicidad')
  })

  it('renders gracefully for unknown notification types', () => {
    const unknownNotif = { ...taskNotif, type: 'unknown_type', body: 'Algo pasó' }
    const html = buildEmailHtml(unknownNotif, 'Ana')
    expect(html).toContain('Hola Ana')
    expect(html).toContain('Algo pasó')
  })
})

// ── Resend payload shape ──────────────────────────────────────────────────────

describe('notify-dispatch: Resend payload shape', () => {
  it('has all required Resend fields', () => {
    const payload = buildEmailPayload({ notif: taskNotif, user: sampleUser, fromEmail })
    expect(payload).toHaveProperty('from')
    expect(payload).toHaveProperty('to')
    expect(payload).toHaveProperty('subject')
    expect(payload).toHaveProperty('html')
  })

  it('"to" is an array with the recipient email', () => {
    const payload = buildEmailPayload({ notif: taskNotif, user: sampleUser, fromEmail })
    expect(Array.isArray(payload.to)).toBe(true)
    expect(payload.to).toContain('ana@mdn.com')
  })

  it('"from" matches the configured sender email', () => {
    const payload = buildEmailPayload({ notif: taskNotif, user: sampleUser, fromEmail })
    expect(payload.from).toBe('noreply@mdnpublicidad.com')
  })

  it('payload is valid for project_added notifications', () => {
    const payload = buildEmailPayload({ notif: projectNotif, user: sampleUser, fromEmail })
    expect(payload.subject).toContain('Campaña Navidad 2026')
    expect(payload.to).toEqual(['ana@mdn.com'])
  })
})
