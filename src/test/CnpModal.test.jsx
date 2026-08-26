import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'

const { CNP, updateSpy } = vi.hoisted(() => ({
  CNP: {
    id: 'cnp-1',
    company_id: 'co-1',
    line_id: 'line-1',
    client_id: 'client-1',
    title: 'Creatina con sello de calidad',
    content: null,
    assignee_id: 'u1',
    refs: [],
    notes: null,
    due_date: null,
    is_print: true,
    status: 'Pendiente',
    team_checked_at: null,
    team_checked_by: null,
    print_approved_at: null,
    print_approved_by: null,
    created_by: 'creator-1',
  },
  updateSpy: vi.fn(),
}))

vi.mock('../supabase', () => ({
  supabase: { from: vi.fn() },
}))

vi.mock('../context/AuthContext', () => ({
  useAuth: vi.fn(),
}))

// Espiar setTeamCheck/setPrintApproval directamente (evita simular toda la cadena
// supabase.from().update().eq().select().single()); el resto de cnpApi se usa real.
vi.mock('../components/cnp/cnpApi', async () => {
  const actual = await vi.importActual('../components/cnp/cnpApi')
  return {
    ...actual,
    setTeamCheck: (...args) => updateSpy('team', ...args),
    setPrintApproval: (...args) => updateSpy('print', ...args),
  }
})

import { useAuth } from '../context/AuthContext'
import CnpModal from '../components/cnp/CnpModal'

function renderModal({ canApprovePrint = false } = {}) {
  useAuth.mockReturnValue({
    userProfile: { user_id: 'reviewer-1', company_id: 'co-1' },
    can: (key) => (key === 'cnp.print.approve' ? canApprovePrint : true),
  })
  return render(
    <CnpModal
      cnp={CNP}
      team={{ id: 'line-1', name: 'Georgina', member_user_ids: ['u1'] }}
      clients={[{ id: 'client-1', name: 'Punto Fit', line_id: 'line-1' }]}
      users={[{ user_id: 'u1', first_name: 'Jesús', last_name: 'García' }]}
      onClose={vi.fn()}
      onCreated={vi.fn()}
      onUpdated={vi.fn()}
    />,
  )
}

describe('CnpModal — doble check de impresión', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('el checkbox de revisión del equipo refleja el cambio sin cerrar el modal (liveCnp)', async () => {
    updateSpy.mockResolvedValue({
      data: { ...CNP, team_checked_at: '2026-08-26T12:00:00Z', team_checked_by: 'reviewer-1' },
      error: null,
    })
    const user = userEvent.setup()
    renderModal()

    const teamCheckbox = screen.getByRole('checkbox', { name: /revisión del equipo/i })
    expect(teamCheckbox).not.toBeChecked()

    await user.click(teamCheckbox)

    await waitFor(() => expect(teamCheckbox).toBeChecked())
    expect(updateSpy).toHaveBeenCalledWith('team', 'cnp-1', true, 'reviewer-1')
  })

  it('el check de impresión está deshabilitado sin el check del equipo, y sin la capability', async () => {
    renderModal({ canApprovePrint: false })
    const printCheckbox = screen.getByRole('checkbox', { name: /aprobación de impresión/i })
    expect(printCheckbox).toBeDisabled()
  })

  it('el check de impresión se habilita solo con team_checked_at Y la capability cnp.print.approve', async () => {
    renderModal({ canApprovePrint: true })
    // Sin team_checked_at (CNP fresco) sigue deshabilitado aunque tenga la capability.
    expect(screen.getByRole('checkbox', { name: /aprobación de impresión/i })).toBeDisabled()
  })
})
