import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'

const mockMove = vi.fn().mockResolvedValue({ data: { id: 'c1' }, error: null })
const mockSchedule = vi.fn().mockResolvedValue({ data: { id: 'c1' }, error: null })
// Líneas devueltas por loadLines(includeGeneral): las normales tienen jefe; Independientes no.
const ALL_LINES = [
  { id: 'l-old', name: 'Team Vieja', lead_user_id: 'u-old' },
  { id: 'l-new', name: 'Team Nueva', lead_user_id: 'u-new' },
  { id: 'l-indep', name: 'Independientes', is_general: true, lead_user_id: null },
]
const mockLoadLines = vi.fn().mockResolvedValue({ data: ALL_LINES, error: null })

vi.mock('../components/metricas/metricsApi', () => ({
  moveClientToLine: (...a) => mockMove(...a),
  scheduleClientLineMove: (...a) => mockSchedule(...a),
  loadLines: (...a) => mockLoadLines(...a),
}))

vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({ userProfile: { user_id: 'u1' } }),
}))

import MoverClienteModal from '../components/metricas/MoverClienteModal'

const EMPLOYEES = [
  { user_id: 'e1', first_name: 'Ana', last_name: 'García', avatar_url: null },
  { user_id: 'e2', first_name: 'Luis', last_name: 'Pérez', avatar_url: null },
]
const CLIENT = { id: 'c1', name: 'Marca X', line_id: 'l-old', monthly_fee: 1000 }

function renderModal() {
  return render(
    <MoverClienteModal
      client={CLIENT}
      lines={ALL_LINES}
      employees={EMPLOYEES}
      companyId="co-1"
      onClose={() => {}}
      onMoved={() => {}}
    />,
  )
}

// El <select> nativo de "Línea destino" (UserPickerSingle no es un combobox nativo).
const lineSelect = () => document.querySelector('select')

describe('MoverClienteModal — atribución del mes de transición', () => {
  beforeEach(() => vi.clearAllMocks())

  it('por defecto (este mes) muestra el prorrateo y confirma con moveClientToLine', async () => {
    const user = userEvent.setup()
    renderModal()
    await waitFor(() => expect(mockLoadLines).toHaveBeenCalled())
    expect(screen.getByText(/Ingreso del mes/)).toBeInTheDocument()
    await user.selectOptions(lineSelect(), 'l-new')
    await user.click(screen.getByRole('button', { name: 'Mover' }))
    await waitFor(() => {
      expect(mockMove).toHaveBeenCalledWith(
        expect.objectContaining({ companyId: 'co-1', toLineId: 'l-new', taskAssigneeId: null }),
      )
      expect(mockSchedule).not.toHaveBeenCalled()
    })
  })

  it('elegir "el mes que viene" oculta el prorrateo y confirma con scheduleClientLineMove', async () => {
    const user = userEvent.setup()
    renderModal()
    await waitFor(() => expect(mockLoadLines).toHaveBeenCalled())
    await user.selectOptions(lineSelect(), 'l-new')
    await user.click(screen.getByRole('radio', { name: /Se quedan en Team Vieja/i }))
    expect(screen.queryByText(/Ingreso del mes/)).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Programar cambio' }))
    await waitFor(() => {
      expect(mockSchedule).toHaveBeenCalledWith(
        expect.objectContaining({ companyId: 'co-1', client: CLIENT, toLineId: 'l-new' }),
      )
      expect(mockMove).not.toHaveBeenCalled()
    })
  })
})

describe('MoverClienteModal — línea destino sin jefe (Independientes)', () => {
  beforeEach(() => vi.clearAllMocks())

  it('pide elegir responsable y lo pasa como taskAssigneeId', async () => {
    const user = userEvent.setup()
    renderModal()
    await waitFor(() => expect(mockLoadLines).toHaveBeenCalled())
    await user.selectOptions(lineSelect(), 'l-indep')

    // Aparece el selector de responsable y el botón queda deshabilitado hasta elegir
    expect(screen.getByText('Responsable de las tareas')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Mover' })).toBeDisabled()

    // Elegir responsable via UserPickerSingle
    await user.click(screen.getByText('Elegir responsable…'))
    await user.click(screen.getByText(/Ana García/))

    const moverBtn = screen.getByRole('button', { name: 'Mover' })
    expect(moverBtn).toBeEnabled()
    await user.click(moverBtn)
    await waitFor(() => {
      expect(mockMove).toHaveBeenCalledWith(
        expect.objectContaining({ toLineId: 'l-indep', taskAssigneeId: 'e1' }),
      )
    })
  })
})
