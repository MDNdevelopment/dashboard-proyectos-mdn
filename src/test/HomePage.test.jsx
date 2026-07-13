import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { vi } from 'vitest'

// ── Mock supabase ────────────────────────────────────────────────────────────
vi.mock('../supabase', () => {
  const makeQuery = (result = []) => ({
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    order: vi.fn().mockResolvedValue({ data: result, error: null }),
    then: (resolve) => resolve({ data: result, error: null }),
  })

  const mockFrom = vi.fn()
  mockFrom.mockImplementation(table => {
    if (table === 'tasks') return makeQuery(globalThis.__MOCK_TASKS_OVERRIDE__ ?? MOCK_TASKS)
    if (table === 'users') return makeQuery(MOCK_EMPLOYEES)
    if (table === 'metric_clients') return makeQuery(globalThis.__MOCK_CLIENTS_OVERRIDE__ ?? MOCK_CLIENTS)
    if (table === 'metric_lines') return makeQuery(globalThis.__MOCK_METRIC_LINES__ ?? [])
    if (table === 'metric_reports') return makeQuery(globalThis.__MOCK_METRIC_REPORTS__ ?? [])
    return makeQuery([])
  })

  return { supabase: { from: mockFrom } }
})

// ── Mock AuthContext ──────────────────────────────────────────────────────────
vi.mock('../context/AuthContext', () => ({
  useAuth: vi.fn(),
}))

// ── Test data ────────────────────────────────────────────────────────────────
const TODAY_PAST = '2000-01-01'   // siempre atrasada
const TODAY_FUTURE = '2099-12-31' // nunca atrasada

const MOCK_TASKS = [
  // Responsable = u1, activa, atrasada
  { id: 't1', company_id: 'co-1', assignee_ids: ['u1'], support_id: null, status: 'En proceso', due_date: TODAY_PAST },
  // Responsable = u1, activa, no atrasada
  { id: 't2', company_id: 'co-1', assignee_ids: ['u1'], support_id: null, status: 'En proceso', due_date: TODAY_FUTURE },
  // Apoyo de dirección = u1, activa, atrasada
  { id: 't3', company_id: 'co-1', assignee_ids: ['u2'], support_id: 'u1', status: 'Pendiente', due_date: TODAY_PAST },
  // De otro usuario, no debe contar para u1
  { id: 't4', company_id: 'co-1', assignee_ids: ['u2'], support_id: null, status: 'En proceso', due_date: TODAY_FUTURE },
  // Terminada — no cuenta como activa ni atrasada aunque due_date esté vencido
  { id: 't5', company_id: 'co-1', assignee_ids: ['u1'], support_id: null, status: 'Terminado', due_date: TODAY_PAST },
]
const MOCK_EMPLOYEES = [{ user_id: 'u1' }, { user_id: 'u2' }]
const MOCK_CLIENTS = [{ id: 'c1' }]

// Reporte con los 6 indicadores al 100% → score 100 (mes cerrado más reciente, junio).
const HEALTH_MONTH = new Date().getMonth() === 0 ? 12 : new Date().getMonth() // mes anterior al actual
const MOCK_METRIC_LINES = [{ id: 'l1' }]
const MOCK_METRIC_REPORTS = [{
  line_id: 'l1',
  month: HEALTH_MONTH,
  data: {
    reuniones: { meta: 1, realizadas: 1 },
    productividad: { tareas: [{ meta: 1, realizado: 1 }] },
    crecimiento: { items: [{ clienteId: 'c1', seguidoresGanados: 10, meta: 5 }] },
    solicitudes: { solicitudes: 1, editadas: 1 },
    pautas: { items: [{ realizadas: 5, meta: 5 }] },
    piezas: { piezas: 1, editadas: 1 },
  },
}]

// Fixtures para las pruebas de "Mi línea" (nivel 3): u1 lidera la línea l1.
const MOCK_LINE_WITH_MEMBER = [
  { id: 'l1', name: 'Línea Redes', company_id: 'co-1', sort_order: 1, members: [{ user_id: 'u1' }] },
]
const MOCK_LINE_TASKS = [
  // De la línea l1, activa, atrasada
  { id: 'lt1', company_id: 'co-1', team_id: 'l1', assignee_ids: ['u9'], support_id: null, status: 'En proceso', due_date: TODAY_PAST },
  // De la línea l1, activa, no atrasada
  { id: 'lt2', company_id: 'co-1', team_id: 'l1', assignee_ids: ['u9'], support_id: null, status: 'En proceso', due_date: TODAY_FUTURE },
  // De otra línea — no debe contar para "Mi línea"
  { id: 'lt3', company_id: 'co-1', team_id: 'l2', assignee_ids: ['u9'], support_id: null, status: 'En proceso', due_date: TODAY_FUTURE },
]
// 2 clientes de l1, 1 de otra línea — no debe contar para "Mi línea"
const MOCK_LINE_CLIENTS = [
  { id: 'lc1', company_id: 'co-1', line_id: 'l1' },
  { id: 'lc2', company_id: 'co-1', line_id: 'l1' },
  { id: 'lc3', company_id: 'co-1', line_id: 'l2' },
]

import { useAuth } from '../context/AuthContext'
import HomePage from '../pages/HomePage'

function renderPage(profileOverride = {}) {
  useAuth.mockReturnValue({
    userProfile: {
      user_id: 'u1',
      company_id: 'co-1',
      access_level: 1,
      admin: false,
      first_name: 'Georgina',
      department: { department_name: 'Diseño' },
      position: { position_name: 'Diseñadora' },
      ...profileOverride,
    },
    can: () => true,
  })
  return render(
    <MemoryRouter>
      <HomePage />
    </MemoryRouter>
  )
}

describe('HomePage — encabezado personal', () => {
  it('saluda al usuario por su nombre', () => {
    renderPage()
    expect(screen.getByText(/hola, georgina/i)).toBeInTheDocument()
  })

  it('muestra el cargo/departamento y el nivel', () => {
    renderPage()
    expect(screen.getByText(/diseño · diseñadora · nivel 1/i)).toBeInTheDocument()
  })

  it('muestra las iniciales cuando el usuario no tiene avatar_url', () => {
    const { container } = renderPage()
    expect(screen.getByText('G')).toBeInTheDocument()
    expect(container.querySelector('img')).not.toBeInTheDocument()
  })

  it('muestra la foto del usuario cuando tiene avatar_url', () => {
    const { container } = renderPage({ avatar_url: 'https://example.com/foto.jpg' })
    const img = container.querySelector('img')
    expect(img).toHaveAttribute('src', 'https://example.com/foto.jpg')
    expect(screen.queryByText('G')).not.toBeInTheDocument()
  })
})

describe('HomePage — Mis tareas (nivel 1)', () => {
  it('cuenta solo las tareas activas donde el usuario es responsable', async () => {
    renderPage({ access_level: 1 })
    // t1 y t2 son de u1 y están activas; t5 es de u1 pero está Terminada → no cuenta
    await waitFor(() => {
      expect(screen.getByText('2')).toBeInTheDocument()
    })
  })

  it('cuenta las tareas atrasadas del usuario', async () => {
    renderPage({ access_level: 1 })
    await waitFor(() => {
      // t1 está atrasada; t2 no; t5 está Terminada (excluida por isLate)
      expect(screen.getAllByText('1').length).toBeGreaterThan(0)
    })
  })

  it('NO muestra el widget de Apoyo de dirección', async () => {
    renderPage({ access_level: 1 })
    await waitFor(() => expect(screen.getByText(/asignadas activas/i)).toBeInTheDocument())
    expect(screen.queryByText(/apoyo de dirección/i)).not.toBeInTheDocument()
  })

  it('NO muestra el resumen general', async () => {
    renderPage({ access_level: 1 })
    await waitFor(() => expect(screen.getByText(/asignadas activas/i)).toBeInTheDocument())
    expect(screen.queryByText(/resumen general/i)).not.toBeInTheDocument()
  })

  it('la card "Asignadas activas" es un enlace clickeable a Base filtrado por responsable', async () => {
    renderPage({ access_level: 1 })
    await waitFor(() => {
      expect(screen.getByRole('link', { name: /asignadas activas/i }))
        .toHaveAttribute('href', '/tareas?view=base&assignee=u1')
    })
  })

  it('la card "Atrasadas" es un enlace clickeable a Base filtrado por responsable + atrasadas', async () => {
    renderPage({ access_level: 1 })
    await waitFor(() => {
      expect(screen.getByRole('link', { name: /^atrasadas/i }))
        .toHaveAttribute('href', '/tareas?view=base&assignee=u1&fAlert=late')
    })
  })
})

describe('HomePage — nivel 4 (dirección)', () => {
  it('muestra el widget de Apoyo de dirección con el conteo correcto', async () => {
    renderPage({ access_level: 4 })
    await waitFor(() => expect(screen.getByText(/apoyo de dirección/i)).toBeInTheDocument())
    // t3 tiene support_id = u1 y está activa
    expect(screen.getByText('1 atrasada(s)')).toBeInTheDocument()
  })

  it('NO muestra "Asignadas activas" ni "Atrasadas" (nivel 4 no recibe tareas asignadas, solo apoyo)', async () => {
    renderPage({ access_level: 4 })
    await waitFor(() => expect(screen.getByText(/apoyo de dirección/i)).toBeInTheDocument())
    expect(screen.queryByText(/asignadas activas/i)).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /^atrasadas/i })).not.toBeInTheDocument()
  })

  it('SÍ muestra "Asignadas activas" para un admin que no es nivel 4', async () => {
    renderPage({ access_level: 1, admin: true })
    await waitFor(() => expect(screen.getByText(/apoyo de dirección/i)).toBeInTheDocument())
    expect(screen.getByText(/asignadas activas/i)).toBeInTheDocument()
  })

  it('muestra el resumen general con reportes, tareas de empresa, clientes, empleados y líneas', async () => {
    renderPage({ access_level: 4 })
    await waitFor(() => expect(screen.getByText(/resumen general/i)).toBeInTheDocument())
    expect(screen.getByText(/tareas de la empresa/i)).toBeInTheDocument()
    expect(screen.getAllByText(/^reportes$/i).length).toBeGreaterThan(0)
    expect(screen.getByText(/clientes activos/i)).toBeInTheDocument()
    expect(screen.getByText(/^empleados$/i)).toBeInTheDocument()
    expect(screen.getByText(/^líneas$/i)).toBeInTheDocument()
  })

  it('también es visible para admin sin importar el access_level', async () => {
    renderPage({ access_level: 1, admin: true })
    await waitFor(() => expect(screen.getByText(/apoyo de dirección/i)).toBeInTheDocument())
    expect(screen.getByText(/resumen general/i)).toBeInTheDocument()
  })

  it('la card "Apoyo de dirección" es un enlace clickeable a Base filtrado por apoyo', async () => {
    renderPage({ access_level: 4 })
    await waitFor(() => {
      expect(screen.getByRole('link', { name: /apoyo de dirección/i }))
        .toHaveAttribute('href', '/tareas?view=base&support=u1')
    })
  })

  it('la card "Tareas de la empresa" es un enlace clickeable a Base y dice "Ver tareas"', async () => {
    renderPage({ access_level: 4 })
    await waitFor(() => {
      const link = screen.getByRole('link', { name: /tareas de la empresa/i })
      expect(link).toHaveAttribute('href', '/tareas?view=base')
      expect(link).toHaveTextContent(/ver tareas/i)
    })
  })

  it('la card de Reportes es un enlace clickeable completo y muestra la salud del mes cerrado', async () => {
    renderPage({ access_level: 4 })
    await waitFor(() => {
      // Distinguible del enlace de "accesos rápidos" (mismo href) por su contenido propio de la card.
      expect(screen.getByRole('link', { name: /salud de/i })).toHaveAttribute('href', '/reportes')
    })
    // Sin reportes cargados en el mock, la card muestra "—" en vez de romper.
    expect(screen.getByRole('link', { name: /salud de/i })).toHaveTextContent('—')
  })

  it('muestra el score de salud del mes cerrado cuando hay reportes cargados', async () => {
    globalThis.__MOCK_METRIC_LINES__ = MOCK_METRIC_LINES
    globalThis.__MOCK_METRIC_REPORTS__ = MOCK_METRIC_REPORTS
    renderPage({ access_level: 4 })
    await waitFor(() => {
      // Los 6 indicadores al 100% → score 100.0, mostrado con un decimal.
      expect(screen.getByRole('link', { name: /salud de/i })).toHaveTextContent('100.0')
    })
    globalThis.__MOCK_METRIC_LINES__ = undefined
    globalThis.__MOCK_METRIC_REPORTS__ = undefined
  })

  it('Clientes, Empleados y Líneas son cards separadas, cada una con su propio enlace', async () => {
    renderPage({ access_level: 4 })
    await waitFor(() => {
      expect(screen.getByRole('link', { name: /clientes activos/i })).toHaveAttribute('href', '/empresa/clientes')
    })
    expect(screen.getByRole('link', { name: /^empleados/i })).toHaveAttribute('href', '/empresa/empleados')
    expect(screen.getByRole('link', { name: /^líneas/i })).toHaveAttribute('href', '/empresa/lineas')
  })
})

describe('HomePage — Mi línea (nivel 3)', () => {
  afterEach(() => {
    globalThis.__MOCK_METRIC_LINES__ = undefined
    globalThis.__MOCK_METRIC_REPORTS__ = undefined
    globalThis.__MOCK_TASKS_OVERRIDE__ = undefined
    globalThis.__MOCK_CLIENTS_OVERRIDE__ = undefined
  })

  it('muestra las tareas y la salud de la línea que lidera, y conserva sus cards personales', async () => {
    globalThis.__MOCK_METRIC_LINES__ = MOCK_LINE_WITH_MEMBER
    globalThis.__MOCK_METRIC_REPORTS__ = MOCK_METRIC_REPORTS
    globalThis.__MOCK_TASKS_OVERRIDE__ = MOCK_LINE_TASKS
    globalThis.__MOCK_CLIENTS_OVERRIDE__ = MOCK_LINE_CLIENTS
    renderPage({ access_level: 3 })

    await waitFor(() => expect(screen.getByRole('heading', { name: /^mi línea$/i })).toBeInTheDocument())
    // lt1 y lt2 son de l1 y están activas; lt3 es de otra línea → no cuenta
    expect(screen.getByRole('link', { name: /tareas de mi línea/i })).toHaveTextContent('2')
    expect(screen.getByText('1 atrasada(s)')).toBeInTheDocument()
    // Los 6 indicadores al 100% → score 100.0
    expect(screen.getByText(/salud de mi línea/i)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /salud de mi línea/i })).toHaveTextContent('100.0')

    // lc1 y lc2 son de l1; lc3 es de otra línea → no cuenta
    expect(screen.getByRole('link', { name: /clientes de mi línea/i })).toHaveTextContent('2')
    // Solo u1 es miembro de l1
    expect(screen.getByRole('link', { name: /empleados de mi línea/i })).toHaveTextContent('1')

    // Conserva sus cards personales de "Mis tareas"
    expect(screen.getByText(/asignadas activas/i)).toBeInTheDocument()
    expect(screen.getByText(/^atrasadas/i)).toBeInTheDocument()

    // NO ve el resumen general (eso es solo para dirección)
    expect(screen.queryByText(/resumen general/i)).not.toBeInTheDocument()
  })

  it('la card de salud de la línea enlaza a /reportes/linea/:id cuando el usuario tiene acceso a reportes', async () => {
    globalThis.__MOCK_METRIC_LINES__ = MOCK_LINE_WITH_MEMBER
    globalThis.__MOCK_METRIC_REPORTS__ = MOCK_METRIC_REPORTS
    globalThis.__MOCK_TASKS_OVERRIDE__ = MOCK_LINE_TASKS
    renderPage({ access_level: 3 })
    await waitFor(() => {
      expect(screen.getByRole('link', { name: /salud de mi línea/i })).toHaveAttribute('href', '/reportes/linea/l1')
    })
  })

  it('las cards de Clientes y Empleados de la línea enlazan a Empresa con la línea preseleccionada', async () => {
    globalThis.__MOCK_METRIC_LINES__ = MOCK_LINE_WITH_MEMBER
    globalThis.__MOCK_METRIC_REPORTS__ = MOCK_METRIC_REPORTS
    globalThis.__MOCK_TASKS_OVERRIDE__ = MOCK_LINE_TASKS
    globalThis.__MOCK_CLIENTS_OVERRIDE__ = MOCK_LINE_CLIENTS
    renderPage({ access_level: 3 })
    await waitFor(() => {
      expect(screen.getByRole('link', { name: /clientes de mi línea/i })).toHaveAttribute('href', '/empresa/clientes?line=l1')
    })
    expect(screen.getByRole('link', { name: /empleados de mi línea/i })).toHaveAttribute('href', '/empresa/lineas?line=l1')
  })

  it('NO muestra "Mi línea" para un usuario de nivel 2', async () => {
    globalThis.__MOCK_METRIC_LINES__ = MOCK_LINE_WITH_MEMBER
    globalThis.__MOCK_METRIC_REPORTS__ = MOCK_METRIC_REPORTS
    globalThis.__MOCK_TASKS_OVERRIDE__ = MOCK_LINE_TASKS
    renderPage({ access_level: 2 })
    await waitFor(() => expect(screen.getByText(/asignadas activas/i)).toBeInTheDocument())
    expect(screen.queryByRole('heading', { name: /^mi línea$/i })).not.toBeInTheDocument()
  })
})

describe('HomePage — accesos rápidos', () => {
  it('lista los módulos permitidos por can()', () => {
    renderPage()
    expect(screen.getByText(/accesos rápidos/i)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /proyectos/i })).toHaveAttribute('href', '/proyectos')
  })

  it('muestra el módulo de tareas como "Gestión de Tareas", no "Tareas QC / Cierre"', () => {
    renderPage()
    expect(screen.getByRole('link', { name: /gestión de tareas/i })).toBeInTheDocument()
    expect(screen.queryByText(/tareas qc \/ cierre/i)).not.toBeInTheDocument()
  })

  it('oculta los módulos no permitidos por can()', () => {
    useAuth.mockReturnValue({
      userProfile: { user_id: 'u1', company_id: 'co-1', access_level: 1, admin: false, first_name: 'Georgina' },
      can: (key) => key === 'proyectos',
    })
    render(<MemoryRouter><HomePage /></MemoryRouter>)
    expect(screen.getByRole('link', { name: /proyectos/i })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /^empresa$/i })).not.toBeInTheDocument()
  })
})
