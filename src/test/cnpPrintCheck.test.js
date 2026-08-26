import { vi } from 'vitest'

vi.mock('../supabase', () => ({
  supabase: {
    from: vi.fn(),
  },
}))

import { supabase } from '../supabase'
import { canCloseCnp, closeBlockedReason, setTeamCheck } from '../components/cnp/cnpApi'

// ─── canCloseCnp / closeBlockedReason (regla de negocio pura) ────────────────
describe('canCloseCnp', () => {
  it('un CNP no impreso siempre puede cerrarse', () => {
    expect(canCloseCnp({ is_print: false, team_checked_at: null, print_approved_at: null })).toBe(
      true,
    )
  })

  it('un CNP impreso sin ningún check no puede cerrarse', () => {
    expect(canCloseCnp({ is_print: true, team_checked_at: null, print_approved_at: null })).toBe(
      false,
    )
  })

  it('un CNP impreso con solo el check del equipo no puede cerrarse', () => {
    expect(
      canCloseCnp({
        is_print: true,
        team_checked_at: '2026-08-26T00:00:00Z',
        print_approved_at: null,
      }),
    ).toBe(false)
  })

  it('un CNP impreso con ambos checks puede cerrarse', () => {
    expect(
      canCloseCnp({
        is_print: true,
        team_checked_at: '2026-08-26T00:00:00Z',
        print_approved_at: '2026-08-26T01:00:00Z',
      }),
    ).toBe(true)
  })
})

describe('closeBlockedReason', () => {
  it('devuelve null cuando ya puede cerrarse', () => {
    expect(closeBlockedReason({ is_print: false })).toBeNull()
  })

  it('indica que falta la revisión del equipo primero', () => {
    expect(
      closeBlockedReason({ is_print: true, team_checked_at: null, print_approved_at: null }),
    ).toBe('Falta la revisión del equipo')
  })

  it('indica que falta la aprobación de impresión cuando el equipo ya revisó', () => {
    expect(
      closeBlockedReason({
        is_print: true,
        team_checked_at: '2026-08-26T00:00:00Z',
        print_approved_at: null,
      }),
    ).toBe('Falta la aprobación de impresión')
  })
})

// ─── setTeamCheck: desmarcar el check 1 limpia también el check 2 ────────────
describe('setTeamCheck', () => {
  it('al marcar, escribe team_checked_at/by', async () => {
    const updateSpy = vi.fn(() => query)
    const query = {
      update: updateSpy,
      eq: vi.fn(() => query),
      select: vi.fn(() => query),
      single: vi.fn().mockResolvedValue({ data: { id: '1' }, error: null }),
    }
    supabase.from.mockReturnValue(query)

    await setTeamCheck('1', true, 'user-1')

    expect(updateSpy).toHaveBeenCalledWith(expect.objectContaining({ team_checked_by: 'user-1' }))
    const patch = updateSpy.mock.calls[0][0]
    expect(patch.team_checked_at).toEqual(expect.any(String))
  })

  it('al desmarcar, limpia también print_approved_at/by (evita aprobaciones huérfanas)', async () => {
    const updateSpy = vi.fn(() => query)
    const query = {
      update: updateSpy,
      eq: vi.fn(() => query),
      select: vi.fn(() => query),
      single: vi.fn().mockResolvedValue({ data: { id: '1' }, error: null }),
    }
    supabase.from.mockReturnValue(query)

    await setTeamCheck('1', false, 'user-1')

    expect(updateSpy).toHaveBeenCalledWith({
      team_checked_at: null,
      team_checked_by: null,
      print_approved_at: null,
      print_approved_by: null,
    })
  })
})
