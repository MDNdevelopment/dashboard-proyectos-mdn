import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { vi } from 'vitest'

// ── Mock supabase (solo el canal realtime; las queries van por leadsApi/metricsApi) ─
vi.mock('../supabase', () => {
  const channel = { on: vi.fn().mockReturnThis(), subscribe: vi.fn().mockReturnThis() }
  return {
    supabase: {
      channel: vi.fn(() => channel),
      removeChannel: vi.fn(),
    },
  }
})

// ── Mock leadsApi ────────────────────────────────────────────────────────────
const mockUpdateLeadStatus = vi.fn()
vi.mock('../components/leads/leadsApi', () => ({
  loadLeads: vi.fn(),
  updateLeadStatus: (...args) => mockUpdateLeadStatus(...args),
}))

// ── Mock metricsApi (solo loadCompanyEmployees, usada para resolver updated_by) ──
vi.mock('../components/metricas/metricsApi', () => ({
  loadCompanyEmployees: vi.fn(),
}))

// ── Mock AuthContext ──────────────────────────────────────────────────────────
vi.mock('../context/AuthContext', () => ({
  useAuth: vi.fn(),
}))

// ── Test data ────────────────────────────────────────────────────────────────
// El selector de periodo de LeadsPage arranca en el mes/año actual (Date real, no
// mockeada) — las fechas de los fixtures se calculan en relación al mes en curso para
// que las pruebas no dependan de que "hoy" caiga en un mes concreto.
const NOW = new Date()
const CURRENT_MONTH_ISO = (day) =>
  `${NOW.getFullYear()}-${String(NOW.getMonth() + 1).padStart(2, '0')}-${day}T10:00:00Z`
const OTHER_MONTH_ISO = (() => {
  const d = new Date(NOW.getFullYear(), NOW.getMonth() - 2, 15)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-15T10:00:00Z`
})()

const MOCK_EMPLOYEES = [
  { user_id: 'u1', first_name: 'Georgina', last_name: 'Pérez' },
]

const MOCK_LEADS = [
  {
    id: 'lead-1',
    created_at: CURRENT_MONTH_ISO('28'),
    nombre: 'Juan Test',
    empresa: 'Acme',
    telefono: '0414-1234567',
    email: 'juan@acme.com',
    servicios: ['Gestión de redes'],
    objetivo: 'crecer',
    mensaje: 'Quiero más info',
    status: 'pendiente',
    updated_at: null,
    updated_by: null,
    tipo_pagina: 'Landing Ads',
  },
  {
    id: 'lead-2',
    created_at: CURRENT_MONTH_ISO('27'),
    nombre: 'Ana Cliente',
    empresa: 'Beta',
    telefono: '0414-7654321',
    email: 'ana@beta.com',
    servicios: [],
    objetivo: null,
    mensaje: 'Interesada en web',
    status: 'contactado',
    updated_at: CURRENT_MONTH_ISO('29'),
    updated_by: 'u1',
    tipo_pagina: null,
  },
  // Lead de un mes anterior — usado para probar que el selector de periodo lo excluye
  // por defecto y que "Ver todos" solo resetea el filtro de estado, no el periodo.
  {
    id: 'lead-3',
    created_at: OTHER_MONTH_ISO,
    nombre: 'Carlos Antiguo',
    empresa: 'Gamma',
    telefono: '0414-1112233',
    email: 'carlos@gamma.com',
    servicios: [],
    objetivo: null,
    mensaje: 'Lead de otro mes',
    status: 'pendiente',
    updated_at: null,
    updated_by: null,
    tipo_pagina: null,
  },
]

import { useAuth } from '../context/AuthContext'
import { loadLeads } from '../components/leads/leadsApi'
import { loadCompanyEmployees } from '../components/metricas/metricsApi'
import LeadsPage from '../pages/LeadsPage'

/** Abre el modal de detalle haciendo click en la fila de la tabla que contiene `nombre`. */
async function openLeadDetail(user, nombre) {
  await user.click(screen.getByText(nombre).closest('tr'))
}

function renderPage(profileOverride = {}, canOverride = null) {
  useAuth.mockReturnValue({
    userProfile: {
      user_id: 'u1',
      company_id: 'co-1',
      access_level: 3,
      admin: false,
      first_name: 'Georgina',
      last_name: 'Pérez',
      ...profileOverride,
    },
    can: canOverride ?? (() => true),
  })
  return render(
    <MemoryRouter initialEntries={['/leads']}>
      <LeadsPage />
    </MemoryRouter>
  )
}

describe('LeadsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    loadLeads.mockResolvedValue({ data: MOCK_LEADS, error: null })
    loadCompanyEmployees.mockResolvedValue({ data: MOCK_EMPLOYEES, error: null })
  })

  it('renders the page title', async () => {
    renderPage()
    expect(screen.getByRole('heading', { name: 'Leads' })).toBeInTheDocument()
  })

  it('renders the "Leads" and "Estadísticas" tab buttons, defaulting to Leads', async () => {
    renderPage()
    await waitFor(() => {
      expect(screen.getByText('Juan Test')).toBeInTheDocument()
    })
    expect(screen.getByRole('button', { name: 'Leads' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Estadísticas' })).toBeInTheDocument()
  })

  it('switches to the Estadísticas tab and hides the lead list', async () => {
    const user = userEvent.setup()
    renderPage()
    await waitFor(() => {
      expect(screen.getByText('Juan Test')).toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: 'Estadísticas' }))

    expect(screen.queryByText('Juan Test')).not.toBeInTheDocument()
    expect(screen.getByText('Total leads')).toBeInTheDocument()
  })

  it('renders loaded leads as table rows with their status badge, excluding leads outside the selected period', async () => {
    renderPage()
    await waitFor(() => {
      expect(screen.getByText('Juan Test')).toBeInTheDocument()
    })
    expect(screen.getByText('Ana Cliente')).toBeInTheDocument()
    const juanRow = screen.getByText('Juan Test').closest('tr')
    const anaRow = screen.getByText('Ana Cliente').closest('tr')
    expect(juanRow).toHaveTextContent('Pendiente')
    expect(anaRow).toHaveTextContent('Contactado')
    // Carlos es de un mes anterior — el periodo por defecto (mes actual) lo excluye
    expect(screen.queryByText('Carlos Antiguo')).not.toBeInTheDocument()
  })

  it('opens the detail modal on row click and shows the status select there', async () => {
    const user = userEvent.setup()
    renderPage()
    await waitFor(() => {
      expect(screen.getByText('Juan Test')).toBeInTheDocument()
    })

    expect(screen.queryByLabelText('Estado del lead de Juan Test')).not.toBeInTheDocument()

    await openLeadDetail(user, 'Juan Test')

    expect(screen.getByLabelText('Estado del lead de Juan Test')).toHaveValue('pendiente')

    await user.click(screen.getByRole('button', { name: 'Cerrar' }))
    expect(screen.queryByLabelText('Estado del lead de Juan Test')).not.toBeInTheDocument()
  })

  it('shows summary counts derived from lead statuses within the selected period', async () => {
    renderPage()
    await waitFor(() => {
      expect(screen.getByText('Juan Test')).toBeInTheDocument()
    })
    expect(screen.getByText('Ver todos').closest('button')).toHaveTextContent('2')
    expect(screen.getByText('Pendientes').closest('button')).toHaveTextContent('1')
    expect(screen.getByText('Contactados').closest('button')).toHaveTextContent('1')
    expect(screen.getByText('Cancelados').closest('button')).toHaveTextContent('0')
  })

  it('"Ver todos" resets the status filter without changing the period', async () => {
    const user = userEvent.setup()
    renderPage()
    await waitFor(() => {
      expect(screen.getByText('Juan Test')).toBeInTheDocument()
    })

    await user.click(screen.getByText('Pendientes'))
    expect(screen.queryByText('Ana Cliente')).not.toBeInTheDocument()

    await user.click(screen.getByText('Ver todos'))
    expect(screen.getByText('Juan Test')).toBeInTheDocument()
    expect(screen.getByText('Ana Cliente')).toBeInTheDocument()
    // El periodo no cambió — Carlos (otro mes) sigue sin aparecer
    expect(screen.queryByText('Carlos Antiguo')).not.toBeInTheDocument()
  })

  it('the period selector filters the list and cards by month/year of created_at', async () => {
    const user = userEvent.setup()
    renderPage()
    await waitFor(() => {
      expect(screen.getByText('Juan Test')).toBeInTheDocument()
    })

    const otherMonthDate = new Date(NOW.getFullYear(), NOW.getMonth() - 2, 15)
    await user.selectOptions(screen.getByLabelText('Mes'), String(otherMonthDate.getMonth() + 1))
    await user.selectOptions(screen.getByLabelText('Año'), String(otherMonthDate.getFullYear()))

    expect(screen.getByText('Carlos Antiguo')).toBeInTheDocument()
    expect(screen.queryByText('Juan Test')).not.toBeInTheDocument()
    expect(screen.queryByText('Ana Cliente')).not.toBeInTheDocument()
    expect(screen.getByText('Ver todos').closest('button')).toHaveTextContent('1')
  })

  it('shows tipo_pagina as a chip in the detail modal only for leads that have one', async () => {
    const user = userEvent.setup()
    renderPage()
    await waitFor(() => {
      expect(screen.getByText('Juan Test')).toBeInTheDocument()
    })

    await openLeadDetail(user, 'Juan Test')
    expect(within(screen.getByRole('dialog')).getByText('Landing Ads')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Cerrar' }))

    await openLeadDetail(user, 'Ana Cliente')
    expect(within(screen.getByRole('dialog')).queryByText('Landing Ads')).not.toBeInTheDocument()
  })

  it('labels mensaje and objetivo with their name followed by ":" in the detail modal', async () => {
    const user = userEvent.setup()
    renderPage()
    await waitFor(() => {
      expect(screen.getByText('Juan Test')).toBeInTheDocument()
    })

    await openLeadDetail(user, 'Juan Test')
    let dialog = within(screen.getByRole('dialog'))
    expect(dialog.getByText('Mensaje: Quiero más info')).toBeInTheDocument()
    expect(dialog.getByText('Objetivo: crecer')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Cerrar' }))

    // Ana no tiene objetivo — no debe aparecer la etiqueta
    await openLeadDetail(user, 'Ana Cliente')
    dialog = within(screen.getByRole('dialog'))
    expect(dialog.getByText('Mensaje: Interesada en web')).toBeInTheDocument()
    expect(dialog.queryByText(/^Objetivo:/)).not.toBeInTheDocument()
  })

  it('shows the time the form was submitted in the detail modal, not just the date', async () => {
    const user = userEvent.setup()
    renderPage()
    await waitFor(() => {
      expect(screen.getByText('Juan Test')).toBeInTheDocument()
    })

    await openLeadDetail(user, 'Juan Test')
    expect(within(screen.getByRole('dialog')).getByText(/a las .+/)).toBeInTheDocument()
  })

  it('shows who changed the status and when, for leads already updated', async () => {
    const user = userEvent.setup()
    renderPage()
    await waitFor(() => {
      expect(screen.getByText('Ana Cliente')).toBeInTheDocument()
    })

    await openLeadDetail(user, 'Ana Cliente')
    expect(within(screen.getByRole('dialog')).getByText(/Contactado por Georgina Pérez el/)).toBeInTheDocument()
  })

  it('calls updateLeadStatus with the new status and current user id on change from the modal', async () => {
    mockUpdateLeadStatus.mockResolvedValue({
      data: { ...MOCK_LEADS[0], status: 'contactado', updated_by: 'u1', updated_at: CURRENT_MONTH_ISO('30') },
      error: null,
    })
    const user = userEvent.setup()
    renderPage()
    await waitFor(() => {
      expect(screen.getByText('Juan Test')).toBeInTheDocument()
    })

    await openLeadDetail(user, 'Juan Test')
    const select = screen.getByLabelText('Estado del lead de Juan Test')
    await user.selectOptions(select, 'contactado')

    expect(mockUpdateLeadStatus).toHaveBeenCalledWith('lead-1', 'contactado', 'u1')
  })

  it('disables the status control in the modal when the user cannot manage leads', async () => {
    const user = userEvent.setup()
    renderPage({}, (key) => key !== 'leads.manage')
    await waitFor(() => {
      expect(screen.getByText('Juan Test')).toBeInTheDocument()
    })

    await openLeadDetail(user, 'Juan Test')
    expect(screen.getByLabelText('Estado del lead de Juan Test')).toBeDisabled()
  })
})
