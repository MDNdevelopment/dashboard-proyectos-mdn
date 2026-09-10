import { render, screen } from '@testing-library/react'
import { vi } from 'vitest'

// ─── sanitizeFields (vía createPauta/updatePauta): 'extra' se propaga y se coerciona ──

let lastInsertPayload = null
let lastUpdatePayload = null

vi.mock('../supabase', () => {
  const insertQuery = {
    select: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: { id: 'p1' }, error: null }),
  }
  const updateQuery = {
    eq: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: { id: 'p1' }, error: null }),
  }
  return {
    supabase: {
      from: vi.fn((table) => ({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
          }),
        }),
        insert: vi.fn((payload) => {
          if (table === 'av_pautas') lastInsertPayload = payload
          return insertQuery
        }),
        update: vi.fn((payload) => {
          if (table === 'av_pautas') lastUpdatePayload = payload
          return updateQuery
        }),
      })),
    },
  }
})

import { createPauta, updatePauta } from '../components/pautas/avPautasApi'
import ExtraBadge from '../components/pautas/ExtraBadge'

describe('avPautasApi — campo extra', () => {
  beforeEach(() => {
    lastInsertPayload = null
    lastUpdatePayload = null
  })

  it('createPauta propaga extra:true y lo coerciona a boolean', async () => {
    await createPauta('co-1', { tema: 'x', extra: true }, 'user-1')
    expect(lastInsertPayload.extra).toBe(true)
  })

  it('createPauta coerciona valores truthy/falsy no booleanos', async () => {
    await createPauta('co-1', { tema: 'x', extra: 1 }, 'user-1')
    expect(lastInsertPayload.extra).toBe(true)
    await createPauta('co-1', { tema: 'x', extra: 0 }, 'user-1')
    expect(lastInsertPayload.extra).toBe(false)
  })

  it('sin el campo extra en fields, no lo agrega al payload', async () => {
    await createPauta('co-1', { tema: 'x' }, 'user-1')
    expect('extra' in lastInsertPayload).toBe(false)
  })

  it('updatePauta propaga extra:false', async () => {
    await updatePauta('p1', { extra: false })
    expect(lastUpdatePayload.extra).toBe(false)
  })
})

// ─── ExtraBadge ─────────────────────────────────────────────────────────────────

describe('ExtraBadge', () => {
  it('renderiza el chip "Extra" cuando pauta.extra es true', () => {
    render(<ExtraBadge pauta={{ extra: true }} />)
    expect(screen.getByText('Extra')).toBeInTheDocument()
  })

  it('no renderiza nada cuando pauta.extra es false o ausente', () => {
    const { container: c1 } = render(<ExtraBadge pauta={{ extra: false }} />)
    expect(c1).toBeEmptyDOMElement()
    const { container: c2 } = render(<ExtraBadge pauta={{}} />)
    expect(c2).toBeEmptyDOMElement()
    const { container: c3 } = render(<ExtraBadge pauta={null} />)
    expect(c3).toBeEmptyDOMElement()
  })
})
