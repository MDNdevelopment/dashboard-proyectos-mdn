import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import { makeQuery } from './helpers/supabaseMock'

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
import { supabase } from '../supabase'
import CnpModal from '../components/cnp/CnpModal'

function renderModal({ canApprovePrint = false } = {}) {
  useAuth.mockReturnValue({
    userProfile: { user_id: 'reviewer-1', company_id: 'co-1' },
    can: (key) => (key === 'cnp.print.approve' ? canApprovePrint : true),
  })
  return render(
    <CnpModal
      cnp={CNP}
      teams={[{ id: 'line-1', name: 'Georgina', member_user_ids: ['u1'] }]}
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

describe('CnpModal — cantidad de piezas (crear)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useAuth.mockReturnValue({
      userProfile: { user_id: 'reviewer-1', company_id: 'co-1' },
      can: () => true,
    })
  })

  function renderNewModal() {
    return render(
      <CnpModal
        cnp={null}
        teams={[{ id: 'line-1', name: 'Georgina', member_user_ids: ['u1'] }]}
        defaultTeamId="line-1"
        clients={[{ id: 'client-1', name: 'Punto Fit', line_id: 'line-1' }]}
        users={[{ user_id: 'u1', first_name: 'Jesús', last_name: 'García' }]}
        onClose={vi.fn()}
        onCreated={vi.fn()}
        onUpdated={vi.fn()}
      />,
    )
  }

  it('generar cantidad 3 crea 3 filas con el título + número como default', async () => {
    const user = userEvent.setup()
    renderNewModal()

    await user.type(
      screen.getByPlaceholderText('Ej. Creatina con sello de calidad'),
      'Historias parada Energon',
    )
    const qty = screen.getByText('Cantidad de piezas').parentElement.querySelector('input')
    fireEvent.change(qty, { target: { value: '3' } })

    expect(screen.getByDisplayValue('Historias parada Energon 1')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Historias parada Energon 2')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Historias parada Energon 3')).toBeInTheDocument()
  })

  it('el payload de creación incluye las 3 piezas generadas', async () => {
    const insertPayloadHolder = { current: null }
    supabase.from.mockImplementation((table) => {
      if (table === 'cnp_requests') {
        const q = makeQuery([{ id: 'new-cnp' }])
        const originalInsert = q.insert
        q.insert = vi.fn((payload) => {
          insertPayloadHolder.current = payload
          return originalInsert(payload)
        })
        return q
      }
      return makeQuery([])
    })

    const user = userEvent.setup()
    renderNewModal()

    await user.type(
      screen.getByPlaceholderText('Ej. Creatina con sello de calidad'),
      'Historias parada Energon',
    )
    const qty = screen.getByText('Cantidad de piezas').parentElement.querySelector('input')
    fireEvent.change(qty, { target: { value: '3' } })

    await user.selectOptions(screen.getByLabelText('Cliente *'), 'client-1')
    await user.click(screen.getByText('Asignar diseñador...'))
    await user.click(await screen.findByText('Jesús García'))

    await user.click(screen.getByRole('button', { name: 'Crear CNP' }))

    await waitFor(() => expect(insertPayloadHolder.current).not.toBeNull())
    expect(insertPayloadHolder.current.pieces).toHaveLength(3)
    expect(insertPayloadHolder.current.pieces.map((p) => p.label)).toEqual([
      'Historias parada Energon 1',
      'Historias parada Energon 2',
      'Historias parada Energon 3',
    ])
  })

  it('con 1 pieza se ve el contenido general; con 2+ se oculta y aparece uno por pieza', async () => {
    renderNewModal()

    // Con cantidad 1 (default) el campo general está visible.
    expect(
      screen.getByPlaceholderText('Pega aquí el copy tal cual llega por WhatsApp...'),
    ).toBeInTheDocument()

    const qty = screen.getByText('Cantidad de piezas').parentElement.querySelector('input')
    fireEvent.change(qty, { target: { value: '2' } })

    // El campo general desaparece...
    expect(
      screen.queryByPlaceholderText('Pega aquí el copy tal cual llega por WhatsApp...'),
    ).not.toBeInTheDocument()
    // ...y cada pieza tiene el suyo.
    expect(screen.getAllByPlaceholderText('Contenido...')).toHaveLength(2)
  })

  it('el payload incluye el contenido escrito en cada pieza', async () => {
    const insertPayloadHolder = { current: null }
    supabase.from.mockImplementation((table) => {
      if (table === 'cnp_requests') {
        const q = makeQuery([{ id: 'new-cnp' }])
        const originalInsert = q.insert
        q.insert = vi.fn((payload) => {
          insertPayloadHolder.current = payload
          return originalInsert(payload)
        })
        return q
      }
      return makeQuery([])
    })

    const user = userEvent.setup()
    renderNewModal()

    await user.type(
      screen.getByPlaceholderText('Ej. Creatina con sello de calidad'),
      'Historias parada Energon',
    )
    const qty = screen.getByText('Cantidad de piezas').parentElement.querySelector('input')
    fireEvent.change(qty, { target: { value: '2' } })

    const [content1, content2] = screen.getAllByPlaceholderText('Contenido...')
    await user.type(content1, 'Copy de la primera historia')
    await user.type(content2, 'Copy de la segunda historia')

    await user.selectOptions(screen.getByLabelText('Cliente *'), 'client-1')
    await user.click(screen.getByText('Asignar diseñador...'))
    await user.click(await screen.findByText('Jesús García'))

    await user.click(screen.getByRole('button', { name: 'Crear CNP' }))

    await waitFor(() => expect(insertPayloadHolder.current).not.toBeNull())
    expect(insertPayloadHolder.current.pieces.map((p) => p.content)).toEqual([
      'Copy de la primera historia',
      'Copy de la segunda historia',
    ])
  })
})
