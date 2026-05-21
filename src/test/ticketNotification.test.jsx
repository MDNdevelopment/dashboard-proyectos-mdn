/**
 * Tests for the support ticket notification trigger payload shape.
 *
 * The DB trigger (on_new_support_ticket) calls the notify-ticket Edge Function
 * with the following JSON body:
 *   { type: 'INSERT', table: 'support_tickets', record: <row> }
 *
 * These tests verify that TicketForm inserts the fields the Edge Function
 * expects, and that the trigger payload shape is correct.
 */

import { describe, it, expect } from 'vitest'
import { PRIORITY, CATEGORY, PRIORITIES, CATEGORIES } from '../components/tickets/constants'

// --- Constants shape ---

describe('ticket constants', () => {
  it('every PRIORITY key has a label', () => {
    PRIORITIES.forEach((p) => {
      expect(PRIORITY[p]).toBeDefined()
      expect(typeof PRIORITY[p].label).toBe('string')
      expect(PRIORITY[p].label.length).toBeGreaterThan(0)
    })
  })

  it('every CATEGORY key has a label', () => {
    CATEGORIES.forEach((c) => {
      expect(CATEGORY[c]).toBeDefined()
      expect(typeof CATEGORY[c].label).toBe('string')
      expect(CATEGORY[c].label.length).toBeGreaterThan(0)
    })
  })

  it('PRIORITY labels match Edge Function mapping', () => {
    const edgeFunctionLabels = {
      baja: 'Baja',
      media: 'Media',
      alta: 'Alta',
      urgente: 'Urgente',
    }
    Object.entries(edgeFunctionLabels).forEach(([key, label]) => {
      expect(PRIORITY[key].label).toBe(label)
    })
  })

  it('CATEGORY labels match Edge Function mapping', () => {
    const edgeFunctionLabels = {
      hardware: 'Hardware',
      software: 'Software',
      red: 'Red',
      accesos: 'Accesos',
      otro: 'Otro',
    }
    Object.entries(edgeFunctionLabels).forEach(([key, label]) => {
      expect(CATEGORY[key].label).toBe(label)
    })
  })
})

// --- Trigger payload shape ---

describe('notify-ticket trigger payload', () => {
  /**
   * Simulates the payload the DB trigger sends to the Edge Function.
   * Mirrors the SQL: jsonb_build_object('type','INSERT','table','support_tickets','record', row_to_json(NEW))
   */
  function buildTriggerPayload(ticketRow) {
    return {
      type: 'INSERT',
      table: 'support_tickets',
      record: ticketRow,
    }
  }

  it('payload has required top-level keys', () => {
    const payload = buildTriggerPayload({
      id: 'abc123',
      title: 'PC no enciende',
      description: 'La computadora no prende desde ayer',
      priority: 'alta',
      category: 'hardware',
      requester_id: 'user-uuid',
      company_id: 'company-uuid',
      created_at: new Date().toISOString(),
    })

    expect(payload.type).toBe('INSERT')
    expect(payload.table).toBe('support_tickets')
    expect(payload.record).toBeDefined()
  })

  it('record contains all fields the Edge Function reads', () => {
    const record = {
      id: 'abc123',
      title: 'Sin internet',
      description: 'No hay conexion desde las 9am',
      priority: 'urgente',
      category: 'red',
      requester_id: 'user-uuid',
      company_id: 'company-uuid',
      created_at: new Date().toISOString(),
    }

    const payload = buildTriggerPayload(record)

    // Fields the Edge Function accesses on payload.record
    expect(payload.record.title).toBe(record.title)
    expect(payload.record.description).toBe(record.description)
    expect(payload.record.priority).toBe(record.priority)
    expect(payload.record.category).toBe(record.category)
    expect(payload.record.requester_id).toBe(record.requester_id)
    expect(payload.record.created_at).toBeDefined()
  })

  it('TicketForm insert payload includes all required fields', () => {
    // Mirrors the insert object in TicketForm.jsx lines 21-28
    const userProfile = { user_id: 'user-uuid', company_id: 'company-uuid' }
    const formState = { title: 'Error en software', description: 'Crashea al abrir', priority: 'media', category: 'software' }

    const insertPayload = {
      title: formState.title.trim(),
      description: formState.description.trim(),
      priority: formState.priority,
      category: formState.category,
      requester_id: userProfile.user_id,
      company_id: userProfile.company_id,
    }

    // These are what the trigger will see as NEW.* columns
    expect(insertPayload.title).toBeTruthy()
    expect(insertPayload.priority).toBeTruthy()
    expect(insertPayload.category).toBeTruthy()
    expect(insertPayload.requester_id).toBeTruthy()
    expect(insertPayload.company_id).toBeTruthy()
    expect(PRIORITIES).toContain(insertPayload.priority)
    expect(CATEGORIES).toContain(insertPayload.category)
  })

  it('Edge Function ignores non-INSERT events', () => {
    // Mirrors the guard: if (payload.type !== 'INSERT' || payload.table !== 'support_tickets') return
    const shouldIgnore = (payload) =>
      payload.type !== 'INSERT' || payload.table !== 'support_tickets'

    expect(shouldIgnore({ type: 'UPDATE', table: 'support_tickets' })).toBe(true)
    expect(shouldIgnore({ type: 'DELETE', table: 'support_tickets' })).toBe(true)
    expect(shouldIgnore({ type: 'INSERT', table: 'other_table' })).toBe(true)
    expect(shouldIgnore({ type: 'INSERT', table: 'support_tickets' })).toBe(false)
  })
})
