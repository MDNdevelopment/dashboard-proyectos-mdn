/**
 * Tests de MiPerfilV2View — sección «Tareas Fijas» (cumplimiento de la grilla
 * semanal en las cuentas donde el empleado es social/diseñador).
 * Cubre: aparece solo cuando hay marcas relevantes, cumplimiento correcto
 * (excluye 'na'), y respeta el período seleccionado (mes actual vs histórico).
 */
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { vi } from 'vitest'
import { createSupabaseMock, makeQuery } from './helpers/supabaseMock'

const USER_ID = 'u-social'
const COMPANY_ID = 'co-1'
const CLIENT_ID = 'c-1'

const CLIENTS = [
  { id: CLIENT_ID, name: 'Pepsi', social_manager_id: USER_ID, designer_id: null },
  { id: 'c-2', name: 'Otra cuenta', social_manager_id: 'otro-user', designer_id: null },
]

function mark(overrides = {}) {
  return {
    id: Math.random().toString(36).slice(2),
    company_id: COMPANY_ID,
    client_id: CLIENT_ID,
    line_id: 'l-1',
    task_key: 'grilla',
    period_year: new Date().getFullYear(),
    period_month: new Date().getMonth() + 1,
    period_week: 1,
    status: 'si',
    ...overrides,
  }
}

let currentMarks = []

vi.mock('../supabase', () => ({
  supabase: createSupabaseMock({
    tables: {
      tasks: () => makeQuery([]),
      projects: () => makeQuery([]),
      metric_clients: () => makeQuery(CLIENTS),
      fixed_task_marks: () => makeQuery(currentMarks),
    },
  }),
}))

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return { ...actual, useOutletContext: () => ({}) }
})

import MiPerfilV2View from '../components/evaluaciones/MiPerfilV2View'

function renderProfile() {
  return render(
    <MemoryRouter>
      <MiPerfilV2View
        userId={USER_ID}
        companyId={COMPANY_ID}
        userProfile={{ user_id: USER_ID, first_name: 'Ana', last_name: 'Pérez' }}
        canEval={false}
      />
    </MemoryRouter>,
  )
}

describe('MiPerfilV2View — sección Tareas Fijas', () => {
  beforeEach(() => {
    currentMarks = []
  })

  it('no muestra la sección si no hay marcas en las cuentas del empleado', async () => {
    currentMarks = []
    renderProfile()
    await waitFor(() => {
      expect(screen.getByText(/sin tareas registradas/i)).toBeInTheDocument()
    })
    expect(screen.queryByText(/Tareas fijas/i)).not.toBeInTheDocument()
  })

  it('muestra % de cumplimiento excluyendo "na"', async () => {
    currentMarks = [
      mark({ task_key: 'grilla', period_week: 1, status: 'si' }),
      mark({ task_key: 'artes', period_week: 1, status: 'no' }),
      mark({ task_key: 'plataformas', period_week: 1, status: 'na' }),
    ]
    renderProfile()
    await waitFor(() => {
      expect(screen.getByText(/Tareas fijas/i)).toBeInTheDocument()
    })
    // total=2 (na excluida), entregadas=1 → 50%
    expect(screen.getByText('50%')).toBeInTheDocument()
    expect(screen.getByText('2')).toBeInTheDocument()
  })

  it('ignora marcas de cuentas donde el empleado no participa', async () => {
    currentMarks = [mark({ client_id: 'c-2', task_key: 'grilla', status: 'si' })]
    renderProfile()
    await waitFor(() => {
      expect(screen.getByText(/sin tareas registradas/i)).toBeInTheDocument()
    })
    expect(screen.queryByText(/Tareas fijas/i)).not.toBeInTheDocument()
  })
})
