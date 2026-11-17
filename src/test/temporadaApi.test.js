import { vi } from 'vitest'

const { calls } = vi.hoisted(() => ({ calls: [] }))

vi.mock('../supabase', () => {
  function builder(table) {
    const q = {
      select: vi.fn(() => q),
      eq: vi.fn(() => q),
      order: vi.fn(() => q),
      range: vi.fn(() => q),
      upsert: vi.fn((row, opts) => {
        calls.push({ table, op: 'upsert', row, opts })
        return q
      }),
      delete: vi.fn(() => {
        calls.push({ table, op: 'delete' })
        return q
      }),
      single: vi.fn().mockResolvedValue({ data: { id: 'p1' }, error: null }),
      then: (resolve) => resolve({ data: [], error: null, count: 0 }),
    }
    return q
  }
  return { supabase: { from: vi.fn((table) => builder(table)) } }
})

import {
  upsertCell,
  loadPieces,
  loadAssignments,
  upsertAssignment,
  deleteAssignment,
} from '../components/chequeo/temporadaApi'

beforeEach(() => {
  calls.length = 0
})

describe('temporadaApi', () => {
  it('upsertCell usa la unique key (campaña, cliente, slot) y guarda solo la columna indicada', async () => {
    await upsertCell({
      companyId: 'co',
      campaignId: 'camp',
      clientId: 'c1',
      lineId: 'gen',
      slotKey: '2026-12-24',
      field: 'audiovisual_status',
      value: 'aprobado',
      userId: 'u1',
    })
    const call = calls.find((c) => c.op === 'upsert')
    expect(call.table).toBe('seasonal_pieces')
    expect(call.opts).toEqual({ onConflict: 'campaign_id,client_id,slot_key' })
    expect(call.row).toMatchObject({
      company_id: 'co',
      campaign_id: 'camp',
      client_id: 'c1',
      line_id: 'gen',
      slot_key: '2026-12-24',
      audiovisual_status: 'aprobado',
      updated_by: 'u1',
    })
    // No pisa las otras columnas de la celda.
    expect(call.row).not.toHaveProperty('formato')
    expect(call.row).not.toHaveProperty('diseno_status')
  })

  it('upsertCell deja la columna en blanco (null) si no se indica valor', async () => {
    await upsertCell({
      companyId: 'co',
      campaignId: 'camp',
      clientId: 'c1',
      lineId: null,
      slotKey: 'tarjeta_navidad',
      field: 'diseno_status',
    })
    expect(calls.find((c) => c.op === 'upsert').row.diseno_status).toBeNull()
  })

  it('loadPieces pagina sobre seasonal_pieces', async () => {
    const res = await loadPieces('camp')
    expect(res.error).toBeNull()
    expect(res.data).toEqual([])
  })

  it('upsertAssignment guarda por (campaña, cliente, rol) y admite «sin asignar» (null)', async () => {
    await upsertAssignment({
      companyId: 'co',
      campaignId: 'camp',
      clientId: 'c1',
      lineId: 'gen',
      role: 'jefe',
      userId: null,
      updatedBy: 'u1',
    })
    const call = calls.find((c) => c.table === 'seasonal_assignments' && c.op === 'upsert')
    expect(call.opts).toEqual({ onConflict: 'campaign_id,client_id,role' })
    expect(call.row).toMatchObject({
      company_id: 'co',
      campaign_id: 'camp',
      client_id: 'c1',
      line_id: 'gen',
      role: 'jefe',
      user_id: null,
      updated_by: 'u1',
    })
  })

  it('deleteAssignment borra de seasonal_assignments (vuelve al valor de MAPPI)', async () => {
    await deleteAssignment('a1')
    const call = calls.find((c) => c.table === 'seasonal_assignments' && c.op === 'delete')
    expect(call).toBeTruthy()
  })

  it('loadAssignments pagina sobre seasonal_assignments', async () => {
    const res = await loadAssignments('camp')
    expect(res.error).toBeNull()
    expect(res.data).toEqual([])
  })
})
