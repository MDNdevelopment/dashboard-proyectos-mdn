import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { vi } from 'vitest'
import { createSupabaseMock, makeQuery } from './helpers/supabaseMock'

// ── Mock supabase ─────────────────────────────────────────────────────────────
vi.mock('../supabase', () => ({
  supabase: createSupabaseMock({
    tables: {
      users: () => makeQuery(MOCK_USERS),
      departments: () => makeQuery(MOCK_DEPARTMENTS),
      positions: () => makeQuery(MOCK_POSITIONS),
      vacations: () => makeQuery(MOCK_VACATIONS),
    },
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: { access_token: 'test-token' } } }),
    },
  }),
}))

// ── Mock AuthContext ──────────────────────────────────────────────────────────
vi.mock('../context/AuthContext', () => ({
  useAuth: vi.fn(),
}))

// ── Datos de prueba ───────────────────────────────────────────────────────────
const MOCK_DEPARTMENTS = [
  { department_id: 'd1', department_name: 'Diseño', company_id: 'co-1', dashboard_visible: true },
  { department_id: 'd2', department_name: 'Redes', company_id: 'co-1', dashboard_visible: true },
]
const MOCK_POSITIONS = [
  {
    position_id: 'p1',
    position_name: 'Diseñador Gráfico',
    department_id: 'd1',
    company_id: 'co-1',
  },
  { position_id: 'p2', position_name: 'Social Media', department_id: 'd2', company_id: 'co-1' },
]
const MOCK_USERS = [
  {
    user_id: 'u9',
    first_name: 'Luisa',
    last_name: 'Ramírez',
    email: 'luisa@test.com',
    department_id: 'd1',
    position_id: 'p1',
    company_id: 'co-1',
    access_level: 1,
    admin: false,
    on_probation: true,
    avatar_url: null,
    phone_number: null,
    birth_date: null,
    hire_date: null,
    department: { department_name: 'Diseño' },
    position: { position_name: 'Diseñador Gráfico' },
  },
  {
    user_id: 'u10',
    first_name: 'Ana',
    last_name: 'Pérez',
    email: 'ana@test.com',
    department_id: 'd1',
    position_id: 'p1',
    company_id: 'co-1',
    access_level: 2,
    admin: false,
    avatar_url: null,
    phone_number: null,
    birth_date: null,
    hire_date: null,
    department: { department_name: 'Diseño' },
    position: {
      position_name: 'Diseñador Gráfico',
      position_description: 'Responsable de identidad visual de las marcas.',
      position_functions: ['Crear piezas gráficas', 'Revisar calendarios'],
    },
  },
  {
    user_id: 'u11',
    first_name: 'Carlos',
    last_name: 'López',
    email: 'carlos@test.com',
    department_id: 'd2',
    position_id: 'p2',
    company_id: 'co-1',
    access_level: 3,
    admin: true,
    avatar_url: null,
    phone_number: null,
    birth_date: null,
    hire_date: null,
    department: { department_name: 'Redes' },
    position: { position_name: 'Social Media' },
  },
  {
    user_id: 'u12',
    first_name: 'María',
    last_name: 'Fernández',
    email: 'maria@test.com',
    department_id: 'd1',
    position_id: 'p1',
    company_id: 'co-1',
    access_level: 4,
    admin: false,
    avatar_url: null,
    phone_number: null,
    birth_date: null,
    hire_date: null,
    department: { department_name: 'Diseño' },
    position: { position_name: 'Diseñador Gráfico' },
  },
]
const MOCK_VACATIONS = [
  {
    id: 'v1',
    user_id: 'u10',
    start_date: '2026-07-01',
    end_date: '2026-07-15',
    status: 'pending',
  },
]

import { useAuth } from '../context/AuthContext'
import EmpresaPage from '../pages/EmpresaPage'

// ── Helpers ───────────────────────────────────────────────────────────────────
function renderAsAdmin(path = '/empresa/empleados') {
  useAuth.mockReturnValue({
    userProfile: {
      user_id: 'u-admin',
      company_id: 'co-1',
      access_level: 3,
      admin: true,
      first_name: 'Admin',
      last_name: 'User',
    },
  })
  return render(
    <MemoryRouter initialEntries={[path]}>
      <EmpresaPage />
    </MemoryRouter>,
  )
}

// Capabilities restringidas para nivel 1 según los defaults sembrados
const LEVEL1_RESTRICTED = [
  'empresa.departamentos',
  'empresa.empleados',
  'empresa.preguntas',
  'empresa.permisos',
  'empresa.clientes',
  'empresa.lineas',
  'empresa.clientes.manage',
  'empresa.lineas.manage',
]

function renderAsNonAdmin() {
  useAuth.mockReturnValue({
    userProfile: {
      user_id: 'u-regular',
      company_id: 'co-1',
      access_level: 1,
      admin: false,
      first_name: 'Regular',
      last_name: 'User',
    },
    can: (key) => !LEVEL1_RESTRICTED.includes(key),
  })
  return render(
    <MemoryRouter initialEntries={['/empresa']}>
      <EmpresaPage />
    </MemoryRouter>,
  )
}

// ── Tests ─────────────────────────────────────────────────────────────────────
describe('EmployeesView', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('renderiza la lista de empleados tras cargar', async () => {
    renderAsAdmin()
    await waitFor(() => {
      expect(screen.getByText('Ana Pérez')).toBeInTheDocument()
    })
    expect(screen.getByText('Carlos López')).toBeInTheDocument()
  })

  it('muestra el badge Admin para empleados con admin=true', async () => {
    renderAsAdmin()
    await waitFor(() => {
      expect(screen.getByText('Admin')).toBeInTheDocument()
    })
  })

  it('muestra el cargo de cada empleado (vista columnas, por defecto)', async () => {
    renderAsAdmin()
    await waitFor(() => {
      expect(screen.getAllByText('Diseñador Gráfico').length).toBeGreaterThan(0)
    })
  })

  it('por defecto agrupa a los empleados en columnas por nivel', async () => {
    renderAsAdmin()
    await waitFor(() => {
      expect(screen.getByText('Ana Pérez')).toBeInTheDocument()
    })

    expect(screen.getByText('Nivel 1')).toBeInTheDocument()
    expect(screen.getByText('Nivel 2')).toBeInTheDocument()
    expect(screen.getByText('Nivel 3')).toBeInTheDocument()
    expect(screen.getByText('Nivel 4')).toBeInTheDocument()
    // La vista compacta no muestra el email
    expect(screen.queryByText('ana@test.com')).not.toBeInTheDocument()
  })

  it('cambia a vista lista al hacer click en el icono de lista y persiste la elección', async () => {
    const user = userEvent.setup()
    renderAsAdmin()
    await waitFor(() => {
      expect(screen.getByText('Ana Pérez')).toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: 'Vista lista' }))

    // En vista lista aparece el email (la vista columnas no lo muestra)
    await waitFor(() => {
      expect(screen.getByText('ana@test.com')).toBeInTheDocument()
    })
    expect(screen.getByRole('button', { name: 'Vista lista' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(localStorage.getItem('empresa.empleados.view')).toBe('lista')
  })

  it('recuerda la vista lista guardada en localStorage al montar', async () => {
    localStorage.setItem('empresa.empleados.view', 'lista')
    renderAsAdmin()
    await waitFor(() => {
      expect(screen.getByText('Ana Pérez')).toBeInTheDocument()
    })

    expect(screen.getByText('ana@test.com')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Vista lista' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  })

  it('la búsqueda filtra por nombre', async () => {
    const user = userEvent.setup()
    renderAsAdmin()
    await waitFor(() => {
      expect(screen.getByText('Ana Pérez')).toBeInTheDocument()
    })

    const input = screen.getByPlaceholderText(/buscar/i)
    await user.type(input, 'Ana')

    expect(screen.getByText('Ana Pérez')).toBeInTheDocument()
    expect(screen.queryByText('Carlos López')).not.toBeInTheDocument()
  })

  it('la búsqueda filtra por email', async () => {
    const user = userEvent.setup()
    renderAsAdmin()
    await waitFor(() => {
      expect(screen.getByText('Carlos López')).toBeInTheDocument()
    })

    const input = screen.getByPlaceholderText(/buscar/i)
    await user.type(input, 'carlos@')

    expect(screen.getByText('Carlos López')).toBeInTheDocument()
    expect(screen.queryByText('Ana Pérez')).not.toBeInTheDocument()
  })

  it('la búsqueda filtra por cargo', async () => {
    const user = userEvent.setup()
    renderAsAdmin()
    await waitFor(() => {
      expect(screen.getByText('Carlos López')).toBeInTheDocument()
    })

    const input = screen.getByPlaceholderText(/buscar/i)
    await user.type(input, 'Social Media')

    expect(screen.getByText('Carlos López')).toBeInTheDocument()
    expect(screen.queryByText('Ana Pérez')).not.toBeInTheDocument()
  })

  it('la búsqueda filtra por departamento', async () => {
    const user = userEvent.setup()
    renderAsAdmin()
    await waitFor(() => {
      expect(screen.getByText('Carlos López')).toBeInTheDocument()
    })

    const input = screen.getByPlaceholderText(/buscar/i)
    await user.type(input, 'Redes')

    expect(screen.getByText('Carlos López')).toBeInTheDocument()
    expect(screen.queryByText('Ana Pérez')).not.toBeInTheDocument()
  })

  it('al hacer click en un empleado (vista columnas) se abre su ficha de detalle', async () => {
    const user = userEvent.setup()
    renderAsAdmin()
    await waitFor(() => {
      expect(screen.getByText('Ana Pérez')).toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: 'Ver ficha de Ana Pérez' }))

    expect(screen.getByText('Nivel de acceso')).toBeInTheDocument()
    expect(screen.getByText('ana@test.com')).toBeInTheDocument()
  })

  it('la ficha de detalle muestra la descripción del cargo y sus funciones', async () => {
    const user = userEvent.setup()
    renderAsAdmin()
    await waitFor(() => {
      expect(screen.getByText('Ana Pérez')).toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: 'Ver ficha de Ana Pérez' }))

    expect(screen.getByText('Responsable de identidad visual de las marcas.')).toBeInTheDocument()
    expect(screen.getByText('Crear piezas gráficas')).toBeInTheDocument()
    expect(screen.getByText('Revisar calendarios')).toBeInTheDocument()
  })

  it('cada columna de nivel muestra el total con la etiqueta "Total:"', async () => {
    renderAsAdmin()
    await waitFor(() => {
      expect(screen.getByText('Ana Pérez')).toBeInTheDocument()
    })

    // Cada nivel mockeado tiene exactamente 1 empleado
    expect(screen.getAllByText('Total: 1').length).toBe(4)
  })

  it('al hacer click en un empleado (vista lista) se abre su ficha de detalle', async () => {
    const user = userEvent.setup()
    renderAsAdmin()
    await waitFor(() => {
      expect(screen.getByText('Ana Pérez')).toBeInTheDocument()
    })
    await user.click(screen.getByRole('button', { name: 'Vista lista' }))

    await user.click(screen.getByRole('button', { name: 'Ver ficha de Ana Pérez' }))

    expect(screen.getByText('Nivel de acceso')).toBeInTheDocument()
  })

  it('en vista columnas, click en los iconos Editar/Vacaciones no abre la ficha', async () => {
    const user = userEvent.setup()
    renderAsAdmin()
    await waitFor(() => {
      expect(screen.getByText('Ana Pérez')).toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: 'Editar Ana Pérez' }))

    expect(screen.getByRole('heading', { name: 'Editar empleado' })).toBeInTheDocument()
    // La ficha (EmployeeFichaContent) muestra el nombre como heading h2; el modal de edición no
    expect(screen.queryByRole('heading', { name: 'Ana Pérez' })).not.toBeInTheDocument()
  })

  it('no-admin no ve el tab Empleados', () => {
    renderAsNonAdmin()
    expect(screen.queryByRole('button', { name: 'Empleados' })).not.toBeInTheDocument()
  })

  it('no-admin que navega a /empresa/empleados no ve la gestión de empleados', () => {
    useAuth.mockReturnValue({
      userProfile: {
        user_id: 'u-regular',
        company_id: 'co-1',
        access_level: 1,
        admin: false,
        first_name: 'Regular',
        last_name: 'User',
      },
      can: (key) => !LEVEL1_RESTRICTED.includes(key),
    })
    render(
      <MemoryRouter initialEntries={['/empresa/empleados']}>
        <EmpresaPage />
      </MemoryRouter>,
    )
    expect(screen.getByRole('button', { name: 'Inicio' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Empleados' })).not.toBeInTheDocument()
  })

  it('abre el modal de edición al hacer click en Editar (vista lista)', async () => {
    const user = userEvent.setup()
    renderAsAdmin()
    await waitFor(() => {
      expect(screen.getByText('Ana Pérez')).toBeInTheDocument()
    })
    await user.click(screen.getByRole('button', { name: 'Vista lista' }))

    const editButtons = screen.getAllByRole('button', { name: 'Editar' })
    await user.click(editButtons[0])

    expect(screen.getByText('Editar empleado')).toBeInTheDocument()
  })

  it('el modal de edición muestra los campos del empleado pre-rellenados', async () => {
    const user = userEvent.setup()
    renderAsAdmin()
    await waitFor(() => {
      expect(screen.getByText('Ana Pérez')).toBeInTheDocument()
    })
    await user.click(screen.getByRole('button', { name: 'Vista lista' }))

    const anaRow = screen.getByText('Ana Pérez').closest('div.flex.items-center.gap-3')
    await user.click(within(anaRow).getByRole('button', { name: 'Editar' }))

    expect(screen.getByDisplayValue('Ana')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Pérez')).toBeInTheDocument()
  })

  it('abre el diálogo de vacaciones al hacer click en Vacaciones (vista lista)', async () => {
    const user = userEvent.setup()
    renderAsAdmin()
    await waitFor(() => {
      expect(screen.getByText('Ana Pérez')).toBeInTheDocument()
    })
    await user.click(screen.getByRole('button', { name: 'Vista lista' }))

    const vacButtons = screen.getAllByRole('button', { name: 'Vacaciones' })
    await user.click(vacButtons[0])

    // El dialog muestra el título como heading h2
    expect(screen.getByRole('heading', { name: 'Vacaciones' })).toBeInTheDocument()
  })

  it('el diálogo de vacaciones lista las vacaciones del empleado', async () => {
    const user = userEvent.setup()
    renderAsAdmin()
    await waitFor(() => {
      expect(screen.getByText('Ana Pérez')).toBeInTheDocument()
    })
    await user.click(screen.getByRole('button', { name: 'Vista lista' }))

    const anaRow = screen.getByText('Ana Pérez').closest('div.flex.items-center.gap-3')
    await user.click(within(anaRow).getByRole('button', { name: 'Vacaciones' }))

    await waitFor(() => {
      expect(screen.getByText('Pendiente')).toBeInTheDocument()
    })
    // Fecha formateada como dd/MM/yyyy
    expect(screen.getByText('01/07/2026 – 15/07/2026')).toBeInTheDocument()
  })

  it('en vista columnas (por defecto), editar y vacaciones abren los modales correctos', async () => {
    const user = userEvent.setup()
    renderAsAdmin()
    await waitFor(() => {
      expect(screen.getByText('Ana Pérez')).toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: 'Editar Ana Pérez' }))
    expect(screen.getByText('Editar empleado')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Ana')).toBeInTheDocument()

    await user.click(screen.getByLabelText('Cerrar'))

    await user.click(screen.getByRole('button', { name: 'Vacaciones de Ana Pérez' }))
    expect(screen.getByRole('heading', { name: 'Vacaciones' })).toBeInTheDocument()
  })

  // ── Soft delete (eliminar / restaurar) ─────────────────────────────────────
  describe('eliminar y restaurar empleados (soft delete)', () => {
    beforeEach(() => {
      global.fetch = vi.fn()
    })

    it('el botón de eliminar es un icono (sin texto "Eliminar" visible en la card)', async () => {
      renderAsAdmin()
      await waitFor(() => {
        expect(screen.getByText('Ana Pérez')).toBeInTheDocument()
      })

      // Accesible por aria-label, pero sin texto "Eliminar" plano en el DOM
      expect(screen.getByRole('button', { name: 'Eliminar Ana Pérez' })).toBeInTheDocument()
      expect(screen.queryByText('Eliminar', { selector: 'button' })).not.toBeInTheDocument()
    })

    it('abre el diálogo de confirmación al hacer click en el icono de eliminar', async () => {
      const user = userEvent.setup()
      renderAsAdmin()
      await waitFor(() => {
        expect(screen.getByText('Ana Pérez')).toBeInTheDocument()
      })

      await user.click(screen.getByRole('button', { name: 'Eliminar Ana Pérez' }))

      expect(screen.getByRole('heading', { name: 'Eliminar empleado' })).toBeInTheDocument()
    })

    it('archiva al empleado tras confirmar con su nombre completo', async () => {
      const user = userEvent.setup()
      const ana = MOCK_USERS.find((u) => u.user_id === 'u10')
      global.fetch.mockResolvedValue({
        ok: true,
        json: async () => ({ ...ana, deleted_at: '2026-07-15T00:00:00.000Z' }),
      })
      renderAsAdmin()
      await waitFor(() => {
        expect(screen.getByText('Ana Pérez')).toBeInTheDocument()
      })

      await user.click(screen.getByRole('button', { name: 'Eliminar Ana Pérez' }))

      const input = screen.getByPlaceholderText('Ana Pérez')
      await user.type(input, 'Ana Pérez')
      // Dentro del diálogo, el botón de confirmación es el único con nombre accesible "Eliminar"
      await user.click(screen.getByRole('button', { name: 'Eliminar' }))

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          '/api/employees/manage',
          expect.objectContaining({
            method: 'POST',
            body: JSON.stringify({ user_id: 'u10', action: 'archive' }),
          }),
        )
      })
      // Ana desaparece de la lista activa (búsqueda por defecto)
      await waitFor(() => {
        expect(screen.queryByText('Ana Pérez')).not.toBeInTheDocument()
      })
      expect(screen.getByText('Carlos López')).toBeInTheDocument()
    })

    it('el toggle "Ver eliminados" muestra solo a los empleados eliminados', async () => {
      const user = userEvent.setup()
      const ana = MOCK_USERS.find((u) => u.user_id === 'u10')
      global.fetch.mockResolvedValue({
        ok: true,
        json: async () => ({ ...ana, deleted_at: '2026-07-15T00:00:00.000Z' }),
      })
      renderAsAdmin()
      await waitFor(() => {
        expect(screen.getByText('Ana Pérez')).toBeInTheDocument()
      })

      await user.click(screen.getByRole('button', { name: 'Eliminar Ana Pérez' }))
      await user.type(screen.getByPlaceholderText('Ana Pérez'), 'Ana Pérez')
      await user.click(screen.getByRole('button', { name: 'Eliminar' }))
      await waitFor(() => {
        expect(screen.queryByText('Ana Pérez')).not.toBeInTheDocument()
      })

      await user.click(screen.getByRole('button', { name: /ver eliminados/i }))

      expect(screen.getByText('Ana Pérez')).toBeInTheDocument()
      expect(screen.queryByText('Carlos López')).not.toBeInTheDocument()
      expect(screen.getByText('Eliminado')).toBeInTheDocument()
    })

    it('restaura a un empleado archivado', async () => {
      const user = userEvent.setup()
      const ana = MOCK_USERS.find((u) => u.user_id === 'u10')
      global.fetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ ...ana, deleted_at: '2026-07-15T00:00:00.000Z' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ ...ana, deleted_at: null }),
        })
      renderAsAdmin()
      await waitFor(() => {
        expect(screen.getByText('Ana Pérez')).toBeInTheDocument()
      })

      await user.click(screen.getByRole('button', { name: 'Eliminar Ana Pérez' }))
      await user.type(screen.getByPlaceholderText('Ana Pérez'), 'Ana Pérez')
      await user.click(screen.getByRole('button', { name: 'Eliminar' }))
      await waitFor(() => {
        expect(screen.queryByText('Ana Pérez')).not.toBeInTheDocument()
      })

      await user.click(screen.getByRole('button', { name: /ver eliminados/i }))
      await user.click(screen.getByRole('button', { name: 'Restaurar' }))

      await waitFor(() => {
        expect(global.fetch).toHaveBeenLastCalledWith(
          '/api/employees/manage',
          expect.objectContaining({
            method: 'POST',
            body: JSON.stringify({ user_id: 'u10', action: 'restore' }),
          }),
        )
      })

      // De vuelta en la vista de activos, Ana reaparece
      await user.click(screen.getByRole('button', { name: /ocultando activos/i }))
      expect(screen.getByText('Ana Pérez')).toBeInTheDocument()
    })

    it('no muestra el icono de eliminar para el propio usuario', async () => {
      useAuth.mockReturnValue({
        userProfile: {
          user_id: 'u10', // mismo id que Ana Pérez en MOCK_USERS
          company_id: 'co-1',
          access_level: 3,
          admin: true,
          first_name: 'Ana',
          last_name: 'Pérez',
        },
      })
      render(
        <MemoryRouter initialEntries={['/empresa/empleados']}>
          <EmpresaPage />
        </MemoryRouter>,
      )
      await waitFor(() => {
        expect(screen.getByText('Ana Pérez')).toBeInTheDocument()
      })

      expect(screen.queryByRole('button', { name: 'Eliminar Ana Pérez' })).not.toBeInTheDocument()
      // Los otros 3 empleados sí tienen su icono de eliminar
      expect(screen.getAllByRole('button', { name: /^Eliminar / })).toHaveLength(3)
    })
  })
})

describe('EmployeesView — período de prueba', () => {
  it('muestra el chip "Prueba", el contador y el botón de filtro', async () => {
    renderAsAdmin()
    await waitFor(() => {
      expect(screen.getByText('Luisa Ramírez')).toBeInTheDocument()
    })
    // Chip en la tarjeta del empleado en prueba (u9 Luisa)
    expect(screen.getByText('Prueba')).toBeInTheDocument()
    // Contador junto al total
    expect(screen.getByText(/1 en prueba/)).toBeInTheDocument()
    // Botón de filtro
    expect(screen.getByRole('button', { name: /Solo en prueba \(1\)/ })).toBeInTheDocument()
  })

  it('el filtro "Solo en prueba" deja solo a los empleados en prueba', async () => {
    const user = userEvent.setup()
    renderAsAdmin()
    await waitFor(() => {
      expect(screen.getByText('Luisa Ramírez')).toBeInTheDocument()
    })
    expect(screen.getByText('Ana Pérez')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /Solo en prueba/ }))

    expect(screen.getByText('Luisa Ramírez')).toBeInTheDocument()
    expect(screen.queryByText('Ana Pérez')).not.toBeInTheDocument()
  })
})
