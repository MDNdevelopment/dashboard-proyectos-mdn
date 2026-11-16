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
  upsertPiece,
  deletePiece,
  loadPieces,
  loadAssignments,
  upsertAssignment,
  deleteAssignment,
} from '../components/chequeo/temporadaApi'

beforeEach(() => {
  calls.length = 0
})

describe('temporadaApi', () => {
  it('upsertPiece usa la unique key (campaña, cliente, slot, tipo) y guarda la línea', async () => {
    await upsertPiece({
      companyId: 'co',
      campaignId: 'camp',
      clientId: 'c1',
      lineId: 'gen',
      slotKey: '2026-12-24',
      pieceType: 'reel',
      status: 'aprobado',
      userId: 'u1',
    })
    const call = calls.find((c) => c.op === 'upsert')
    expect(call.table).toBe('seasonal_pieces')
    expect(call.opts).toEqual({ onConflict: 'campaign_id,client_id,slot_key,piece_type' })
    expect(call.row).toMatchObject({
      company_id: 'co',
      campaign_id: 'camp',
      client_id: 'c1',
      line_id: 'gen',
      slot_key: '2026-12-24',
      piece_type: 'reel',
      status: 'aprobado',
      updated_by: 'u1',
    })
  })

  it('upsertPiece crea la pieza sin estado (celda en blanco) si no se indica', async () => {
    await upsertPiece({
      companyId: 'co',
      campaignId: 'camp',
      clientId: 'c1',
      lineId: null,
      slotKey: 'tarjeta_navidad',
      pieceType: 'diseno',
    })
    expect(calls.find((c) => c.op === 'upsert').row.status).toBeNull()
  })

  it('deletePiece borra de seasonal_pieces', async () => {
    await deletePiece('p1')
    expect(calls.find((c) => c.op === 'delete').table).toBe('seasonal_pieces')
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
