/**
 * AdsForm — arrastrar las acciones pendientes de la táctica anterior (insumo) al crear una nueva.
 */
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'

const { mockInsert, mockInsertPayload, mockUpdateHandoff } = vi.hoisted(() => ({
  mockInsert: vi.fn(),
  mockInsertPayload: vi.fn(),
  mockUpdateHandoff: vi.fn(),
}))

vi.mock('../supabase', () => ({
  supabase: {
    from: vi.fn((table) => {
      if (table === 'users') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          order: vi.fn().mockResolvedValue({ data: [], error: null }),
        }
      }
      if (table === 'campaigns') {
        return {
          insert: vi.fn((payload) => {
            mockInsertPayload(payload)
            return { select: vi.fn(() => ({ single: mockInsert })) }
          }),
        }
      }
      return {}
    }),
    functions: { invoke: vi.fn().mockResolvedValue({ data: null, error: null }) },
  },
}))

vi.mock('../components/ads/tacticas/tacticasApi', () => ({ updateHandoff: mockUpdateHandoff }))

vi.mock('../components/metricas/metricsApi', () => ({
  loadClients: vi.fn().mockResolvedValue({
    data: [
      { id: 'c-1', name: 'Banco Exterior', logo_url: null, line_id: 'line-1', company_id: 'co-1' },
      { id: 'c-2', name: 'Pepsi', logo_url: null, line_id: 'line-2', company_id: 'co-1' },
    ],
    error: null,
  }),
  loadLines: vi.fn().mockResolvedValue({ data: [], error: null }),
}))

vi.mock('../context/AuthContext', () => ({ useAuth: vi.fn() }))

import { useAuth } from '../context/AuthContext'
import AdsForm from '../components/ads/AdsForm'

const SOURCE = {
  id: 'src-1',
  name: 'Septiembre/octubre',
  checklist: [
    { id: 'a', title: 'Reel semanal', done: true },
    { id: 'b', title: 'Mapa inmobiliario', done: false, month: '2026-09' },
    { id: 'c', title: 'Vlog de asesores', done: false },
  ],
}
const insumo = (over = {}) => ({
  handoff: { id: 'h1', client_id: 'c-1', source_campaign_id: 'src-1', status: 'pendiente' },
  source: SOURCE,
  content: {
    done: [SOURCE.checklist[0]],
    pending: [SOURCE.checklist[1], SOURCE.checklist[2]],
    total: 3,
    pct: 33,
  },
  ...over,
})

function renderForm(props = {}) {
  return render(
    <AdsForm
      campaign={null}
      prefill={{ client_id: 'c-1', client: 'Banco Exterior' }}
      insumos={[insumo()]}
      onInsumosUsed={() => {}}
      onClose={() => {}}
      onCreated={() => {}}
      onUpdated={() => {}}
      {...props}
    />,
  )
}

async function fillRequired(user) {
  await waitFor(() => screen.getByRole('option', { name: 'Banco Exterior' }))
  await user.type(screen.getByPlaceholderText('Nombre de la táctica'), 'Plan Q1')
  const dates = screen.getAllByPlaceholderText('dd/mm/aaaa')
  await user.type(dates[0], '01/01/2027')
  await user.type(dates[1], '31/03/2027')
}

describe('AdsForm — arrastrar pendientes del insumo', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useAuth.mockReturnValue({
      userProfile: { user_id: 'creator', company_id: 'co-1', first_name: 'Juan', last_name: 'P' },
    })
    mockInsert.mockResolvedValue({ data: { id: 'new-id', name: 'Plan Q1' }, error: null })
    mockUpdateHandoff.mockResolvedValue({ data: {}, error: null })
  })

  it('ofrece las acciones pendientes de la táctica anterior de la marca elegida', async () => {
    renderForm()
    const panel = (await screen.findByText('Pendientes de la táctica anterior')).parentElement
    expect(within(panel).getByText('De «Septiembre/octubre»')).toBeInTheDocument()
    expect(within(panel).getByLabelText('Mapa inmobiliario')).not.toBeChecked()
    expect(within(panel).getByLabelText('Vlog de asesores')).not.toBeChecked()
    // Lo que ya se cumplió no se ofrece.
    expect(within(panel).queryByLabelText('Reel semanal')).not.toBeInTheDocument()
  })

  it('no aparece si la marca elegida no tiene insumo, ni al editar', async () => {
    const { unmount } = renderForm({ prefill: { client_id: 'c-2', client: 'Pepsi' } })
    await waitFor(() => screen.getByRole('option', { name: 'Pepsi' }))
    expect(screen.queryByText('Pendientes de la táctica anterior')).not.toBeInTheDocument()
    unmount()

    renderForm({
      campaign: {
        id: 'x',
        name: 'Plan',
        client: 'Banco Exterior',
        client_id: 'c-1',
        assignee: '',
        start_date: '2026-06-01',
        end_date: '2026-06-30',
        status: 'Pendiente',
        notes: '',
        checklist: [],
      },
    })
    await waitFor(() => screen.getByRole('option', { name: 'Banco Exterior' }))
    expect(screen.queryByText('Pendientes de la táctica anterior')).not.toBeInTheDocument()
  })

  it('no aparece si el insumo no tiene nada pendiente', async () => {
    renderForm({
      insumos: [insumo({ content: { done: SOURCE.checklist, pending: [], total: 3, pct: 100 } })],
    })
    await waitFor(() => screen.getByRole('option', { name: 'Banco Exterior' }))
    expect(screen.queryByText('Pendientes de la táctica anterior')).not.toBeInTheDocument()
  })

  it('tildar una pendiente la agrega al checklist, sin tildar, sin mes viejo y marcada', async () => {
    const user = userEvent.setup()
    renderForm()
    await user.click(await screen.findByLabelText('Mapa inmobiliario'))

    const checklist = screen.getByRole('checkbox', { name: 'Completar Mapa inmobiliario' })
    expect(checklist).not.toBeChecked()
    expect(screen.getByText('Arrastrada')).toBeInTheDocument()
    // El mes de la táctica anterior ya no aplica a la nueva.
    expect(screen.queryByText('Septiembre 2026')).not.toBeInTheDocument()
  })

  it('destildarla la saca del checklist', async () => {
    const user = userEvent.setup()
    renderForm()
    const box = await screen.findByLabelText('Mapa inmobiliario')
    await user.click(box)
    expect(screen.getByText('Arrastrada')).toBeInTheDocument()

    await user.click(box)
    expect(screen.queryByText('Arrastrada')).not.toBeInTheDocument()
  })

  it('"Arrastrar todas" pasa todas las pendientes, y repetirlo no las duplica', async () => {
    const user = userEvent.setup()
    renderForm()
    const arrastrar = await screen.findByRole('button', { name: 'Arrastrar todas' })
    await user.click(arrastrar)
    await user.click(arrastrar)
    expect(screen.getAllByText('Arrastrada')).toHaveLength(2)
  })

  it('al crear con lo arrastrado, guarda las acciones y marca el insumo como usado', async () => {
    const user = userEvent.setup()
    const onInsumosUsed = vi.fn()
    renderForm({ onInsumosUsed })
    await fillRequired(user)
    await user.click(await screen.findByLabelText('Mapa inmobiliario'))
    await user.click(screen.getByRole('button', { name: 'Crear táctica' }))

    await waitFor(() => expect(mockInsertPayload).toHaveBeenCalled())
    expect(mockInsertPayload.mock.calls[0][0].checklist).toEqual([
      { id: 'b', title: 'Mapa inmobiliario', done: false, carried_from: 'src-1' },
    ])
    await waitFor(() =>
      expect(mockUpdateHandoff).toHaveBeenCalledWith('h1', {
        status: 'usado',
        consumed_by_campaign_id: 'new-id',
      }),
    )
    expect(onInsumosUsed).toHaveBeenCalledWith(['h1'])
  })

  it('si no se arrastró nada, el insumo sigue pendiente', async () => {
    const user = userEvent.setup()
    const onInsumosUsed = vi.fn()
    renderForm({ onInsumosUsed })
    await fillRequired(user)
    await user.click(screen.getByRole('button', { name: 'Crear táctica' }))

    await waitFor(() => expect(mockInsertPayload).toHaveBeenCalled())
    expect(mockUpdateHandoff).not.toHaveBeenCalled()
    expect(onInsumosUsed).not.toHaveBeenCalled()
  })

  it('si falla marcar el insumo como usado, la táctica igual se crea y no se reporta como usado', async () => {
    const user = userEvent.setup()
    const onCreated = vi.fn()
    const onInsumosUsed = vi.fn()
    mockUpdateHandoff.mockResolvedValue({ data: null, error: { message: 'rls' } })
    renderForm({ onCreated, onInsumosUsed })
    await fillRequired(user)
    await user.click(await screen.findByLabelText('Mapa inmobiliario'))
    await user.click(screen.getByRole('button', { name: 'Crear táctica' }))

    await waitFor(() => expect(onCreated).toHaveBeenCalled())
    expect(onInsumosUsed).not.toHaveBeenCalled()
  })

  it('cambiar de marca suelta lo arrastrado de la anterior', async () => {
    const user = userEvent.setup()
    renderForm()
    await user.click(await screen.findByLabelText('Mapa inmobiliario'))
    expect(screen.getByText('Arrastrada')).toBeInTheDocument()

    const select = screen
      .getAllByRole('combobox')
      .find((s) => Array.from(s.options ?? []).some((o) => o.text === '— Seleccionar cliente —'))
    await user.selectOptions(select, 'c-2')

    expect(screen.queryByText('Arrastrada')).not.toBeInTheDocument()
    expect(screen.queryByText('Pendientes de la táctica anterior')).not.toBeInTheDocument()
  })
})
