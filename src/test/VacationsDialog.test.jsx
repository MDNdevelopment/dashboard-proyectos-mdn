import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import { createSupabaseMock, makeQuery } from './helpers/supabaseMock'

// ── Mock supabase ─────────────────────────────────────────────────────────────
let vacationsData
vi.mock('../supabase', () => ({
  supabase: createSupabaseMock({
    tables: {
      vacations: () => makeQuery(vacationsData),
    },
  }),
}))

const VacationsDialog = (await import('../components/empresa/VacationsDialog')).default

const EMPLOYEE = { user_id: 'u1', first_name: 'Ovidio', last_name: 'Pirela' }

// "Hoy" para el módulo de vacaciones es la fecha real del sistema (no hay inyección de
// reloj en VacationsDialog) — se usan rangos claramente pasados/futuros respecto a 2026-08-27
// (fecha de referencia de este cambio) para no depender de cuándo corre el test.
const PAST_2025 = {
  id: 1,
  user_id: 'u1',
  start_date: '2025-08-08',
  end_date: '2025-08-31',
  status: 'confirmed',
}
const PAST_2026 = {
  id: 2,
  user_id: 'u1',
  start_date: '2026-08-01',
  end_date: '2026-08-05',
  status: 'confirmed',
}
const UPCOMING = {
  id: 3,
  user_id: 'u1',
  start_date: '2027-01-06',
  end_date: '2027-01-26',
  status: 'tentative',
}

function renderDialog(props = {}) {
  return render(<VacationsDialog employee={EMPLOYEE} onClose={vi.fn()} {...props} />)
}

describe('VacationsDialog — próximas vs. historial por año', () => {
  beforeEach(() => {
    vacationsData = [PAST_2025, PAST_2026, UPCOMING]
  })

  it('separa "Próximas y en curso" de "Historial" agrupado por año', async () => {
    renderDialog()
    await waitFor(() => {
      expect(screen.getByText('Próximas y en curso')).toBeInTheDocument()
    })
    expect(screen.getByText('Historial')).toBeInTheDocument()
    // Encabezados de año con conteo y días (2025: 24 días — ago 8 a ago 31 inclusive)
    expect(screen.getByText('2025')).toBeInTheDocument()
    expect(screen.getByText('2026')).toBeInTheDocument()
    expect(screen.getByText(/1 período · 24 días/)).toBeInTheDocument()
  })

  it('el historial arranca colapsado salvo el año en curso', async () => {
    const user = userEvent.setup()
    renderDialog()
    await waitFor(() => expect(screen.getByText('2025')).toBeInTheDocument())

    // 2025 (no es el año en curso) empieza colapsado: su fila no está en el DOM
    expect(screen.queryByText('08/08/2025 – 31/08/2025')).not.toBeInTheDocument()

    await user.click(screen.getByText('2025'))
    await waitFor(() => {
      expect(screen.getByText('08/08/2025 – 31/08/2025')).toBeInTheDocument()
    })
  })

  it('cada fila muestra el rango y la cantidad de días', async () => {
    renderDialog()
    await waitFor(() => {
      expect(screen.getByText(/06\/01\/2027 – 26\/01\/2027/)).toBeInTheDocument()
    })
    expect(screen.getByText(/21 días/)).toBeInTheDocument() // 6 al 26 de enero, inclusive
  })
})

describe('VacationsDialog — onChange avisa al padre tras cada mutación', () => {
  beforeEach(() => {
    vacationsData = [UPCOMING]
  })

  it('confirmar una fecha tentativa llama a onChange (para refrescar calendario/paneles sin recargar)', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    renderDialog({ onChange })
    await waitFor(() => expect(screen.getByText('Próximas y en curso')).toBeInTheDocument())

    await user.click(screen.getByRole('button', { name: 'Confirmar fecha' }))
    await user.click(screen.getByRole('button', { name: 'Confirmar' }))

    await waitFor(() => {
      expect(onChange).toHaveBeenCalled()
    })
  })

  it('crear una vacación nueva llama a onChange', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    renderDialog({ onChange })
    await waitFor(() => expect(screen.getByText('Próximas y en curso')).toBeInTheDocument())

    await user.click(screen.getByRole('button', { name: '+ Nueva' }))
    const [startInput, endInput] = screen.getAllByPlaceholderText('dd/mm/aaaa')
    await user.type(startInput, '01/03/2027')
    await user.type(endInput, '05/03/2027')
    await user.click(screen.getByRole('button', { name: 'Crear vacación' }))

    await waitFor(() => {
      expect(onChange).toHaveBeenCalled()
    })
  })
})

describe('VacationsDialog — bloqueo de solapamiento al crear', () => {
  beforeEach(() => {
    vacationsData = [UPCOMING]
  })

  it('rechaza crear una vacación que se solapa con una existente', async () => {
    const user = userEvent.setup()
    renderDialog()
    await waitFor(() => expect(screen.getByText('Próximas y en curso')).toBeInTheDocument())

    await user.click(screen.getByRole('button', { name: '+ Nueva' }))
    const [startInput, endInput] = screen.getAllByPlaceholderText('dd/mm/aaaa')
    await user.type(startInput, '10/01/2027')
    await user.type(endInput, '15/01/2027')
    await user.click(screen.getByRole('button', { name: 'Crear vacación' }))

    expect(
      screen.getByText(/Ya hay una vacación registrada del 06\/01\/2027 al 26\/01\/2027/),
    ).toBeInTheDocument()
  })
})

describe('VacationsDialog — borrado con fecha legible y aviso de año', () => {
  beforeEach(() => {
    vacationsData = [PAST_2025]
  })

  it('el diálogo de borrado usa dd/mm/aaaa, nombra el año y avisa que ya pasó', async () => {
    const user = userEvent.setup()
    renderDialog()
    await waitFor(() => expect(screen.getByText('Historial')).toBeInTheDocument())
    await user.click(screen.getByText('2025'))
    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: 'Eliminar vacación 2025-08-08' }),
      ).toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: 'Eliminar vacación 2025-08-08' }))

    // Mismo formato dd/mm/aaaa que la lista (no el ISO crudo que mostraba antes)
    expect(screen.getByPlaceholderText('08/08/2025')).toBeInTheDocument()
    expect(screen.getByText(/del año/)).toBeInTheDocument()
    expect(screen.getAllByText('2025').length).toBeGreaterThan(0)
    expect(screen.getByText(/ya pasada/)).toBeInTheDocument()
  })
})
