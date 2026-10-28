import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'

const mockCreate = vi.fn()
const mockSaveAllocs = vi.fn().mockResolvedValue(undefined)
vi.mock('../lib/subscriptions', () => ({
  createSubscription: (...a) => mockCreate(...a),
  updateSubscription: vi.fn(),
  saveAllocations: (...a) => mockSaveAllocs(...a),
}))

import SubscriptionModal from '../components/empresa/SubscriptionModal'

const LINES = [{ id: 'l-1', name: 'Team Sabrina' }]
const DEPTS = [{ department_id: 7, department_name: 'Tecnología' }]

function setup(props = {}) {
  const onSaved = vi.fn()
  render(
    <SubscriptionModal
      companyId="co-1"
      userId="u-1"
      lines={LINES}
      departments={DEPTS}
      onClose={vi.fn()}
      onSaved={onSaved}
      {...props}
    />,
  )
  return { onSaved }
}

describe('SubscriptionModal — asignación a líneas y departamentos', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCreate.mockResolvedValue({ id: 's-new' })
  })

  it('guarda las asignaciones junto con la suscripción', async () => {
    const user = userEvent.setup()
    const { onSaved } = setup()
    await user.type(screen.getByLabelText('Servicio'), 'CapCut Team')
    await user.type(screen.getByLabelText('Monto'), '10')
    await user.click(screen.getByRole('button', { name: /agregar línea o departamento/i }))
    await user.click(await screen.findByText('Team Sabrina'))
    await user.click(screen.getByRole('button', { name: 'Guardar' }))
    await waitFor(() => expect(onSaved).toHaveBeenCalled())
    expect(mockSaveAllocs).toHaveBeenCalledWith('s-new', 'co-1', [
      { line_id: 'l-1', department_id: null, share_pct: null },
    ])
  })

  it('en otra moneda la sección de asignación se bloquea con un aviso', async () => {
    const user = userEvent.setup()
    setup()
    await user.selectOptions(screen.getByLabelText('Moneda'), 'Bs')
    expect(screen.getByText(/Solo las suscripciones en USD/i)).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /agregar línea o departamento/i }),
    ).not.toBeInTheDocument()
  })

  it('con porcentajes que no suman 100 no guarda', async () => {
    const user = userEvent.setup()
    setup({
      allocations: [
        { line_id: 'l-1', department_id: null, share_pct: 60 },
        { line_id: null, department_id: 7, share_pct: 30 },
      ],
      subscription: {
        id: 's-1',
        name: 'X',
        currency: 'USD',
        amount: 10,
        frequency: 'mensual',
        status: 'activa',
      },
    })
    await user.click(screen.getByRole('button', { name: 'Guardar' }))
    expect((await screen.findAllByText(/deben sumar 100/i)).length).toBeGreaterThan(0)
    expect(mockSaveAllocs).not.toHaveBeenCalled()
  })
})
