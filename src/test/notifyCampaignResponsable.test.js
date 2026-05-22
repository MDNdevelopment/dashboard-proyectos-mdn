/**
 * Contract tests for the notify-campaign-assignee Edge Function logic.
 * Verifies email construction, validation, and body contract.
 */
import { describe, it, expect } from 'vitest'

/**
 * Simulates the request body validation in the Edge Function.
 */
function validateBody(body) {
  if (!body?.assignee_id || !body?.campaign_name) {
    return { valid: false, error: 'assignee_id y campaign_name son requeridos' }
  }
  return { valid: true }
}

/**
 * Simulates the email HTML construction in the Edge Function.
 */
function buildEmailHtml({ firstName, campaignName, createdByName }) {
  return `
        <p>Hola ${firstName},</p>
        <p>
          Has sido asignado como <strong>responsable</strong> de la campaña
          <strong>"${campaignName}"</strong>.
        </p>
        ${createdByName ? `<p>Asignado por: ${createdByName}</p>` : ''}
        <p>Ingresa al dashboard para ver los detalles de la campaña.</p>
        <p>— MDN Publicidad</p>
      `
}

/**
 * Simulates building the Resend email payload.
 */
function buildEmailPayload({ user, campaignName, createdByName, fromEmail }) {
  return {
    from: fromEmail,
    to: [user.email],
    subject: `Nueva campaña asignada: ${campaignName}`,
    html: buildEmailHtml({ firstName: user.first_name, campaignName, createdByName }),
  }
}

// --- Test data ---

const sampleUser = {
  user_id: 'u1',
  email: 'ana@mdn.com',
  first_name: 'Ana',
  last_name: 'García',
}

describe('notify-campaign-assignee: body validation', () => {
  it('accepts a valid body with assignee_id and campaign_name', () => {
    const result = validateBody({ assignee_id: 'u1', campaign_name: 'Campaña Digital' })
    expect(result.valid).toBe(true)
  })

  it('rejects if assignee_id is missing', () => {
    const result = validateBody({ campaign_name: 'Campaña Digital' })
    expect(result.valid).toBe(false)
    expect(result.error).toMatch(/assignee_id/)
  })

  it('rejects if campaign_name is missing', () => {
    const result = validateBody({ assignee_id: 'u1' })
    expect(result.valid).toBe(false)
    expect(result.error).toMatch(/campaign_name/)
  })

  it('rejects an empty body', () => {
    const result = validateBody({})
    expect(result.valid).toBe(false)
  })

  it('rejects a null body', () => {
    const result = validateBody(null)
    expect(result.valid).toBe(false)
  })
})

describe('notify-campaign-assignee: email construction', () => {
  it('includes the campaign name in the subject', () => {
    const payload = buildEmailPayload({
      user: sampleUser,
      campaignName: 'Campaña Navidad 2026',
      createdByName: 'Juan Pérez',
      fromEmail: 'noreply@mdnpublicidad.com',
    })
    expect(payload.subject).toContain('Campaña Navidad 2026')
  })

  it('sends to the assignee email', () => {
    const payload = buildEmailPayload({
      user: sampleUser,
      campaignName: 'Test',
      createdByName: 'Juan',
      fromEmail: 'noreply@mdnpublicidad.com',
    })
    expect(payload.to).toEqual(['ana@mdn.com'])
  })

  it('includes the assignee first name in the body', () => {
    const html = buildEmailHtml({
      firstName: 'Ana',
      campaignName: 'Campaña Test',
      createdByName: 'Juan',
    })
    expect(html).toContain('Hola Ana')
  })

  it('includes the creator name when provided', () => {
    const html = buildEmailHtml({
      firstName: 'Ana',
      campaignName: 'Campaña Test',
      createdByName: 'Juan Pérez',
    })
    expect(html).toContain('Juan Pérez')
  })

  it('omits the "Asignado por" line when created_by_name is not provided', () => {
    const html = buildEmailHtml({
      firstName: 'Ana',
      campaignName: 'Campaña Test',
      createdByName: null,
    })
    expect(html).not.toContain('Asignado por')
  })

  it('includes the campaign name in the body', () => {
    const html = buildEmailHtml({
      firstName: 'Ana',
      campaignName: 'Campaña Navidad',
      createdByName: 'Juan',
    })
    expect(html).toContain('Campaña Navidad')
  })

  it('mentions MDN Publicidad as the sender', () => {
    const html = buildEmailHtml({
      firstName: 'Ana',
      campaignName: 'Test',
      createdByName: null,
    })
    expect(html).toContain('MDN Publicidad')
  })
})

describe('notify-campaign-assignee: Resend payload shape', () => {
  it('has all required Resend fields', () => {
    const payload = buildEmailPayload({
      user: sampleUser,
      campaignName: 'Test',
      createdByName: 'Juan',
      fromEmail: 'noreply@mdnpublicidad.com',
    })
    expect(payload).toHaveProperty('from')
    expect(payload).toHaveProperty('to')
    expect(payload).toHaveProperty('subject')
    expect(payload).toHaveProperty('html')
  })

  it('"to" is an array', () => {
    const payload = buildEmailPayload({
      user: sampleUser,
      campaignName: 'Test',
      createdByName: null,
      fromEmail: 'noreply@mdnpublicidad.com',
    })
    expect(Array.isArray(payload.to)).toBe(true)
  })
})
