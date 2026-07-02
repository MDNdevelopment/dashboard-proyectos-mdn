/**
 * Tests de la ficha de línea en Empresa → Líneas:
 * - LinesView: click en el card abre LineFichaModal; los controles de gestión no
 * - LineFichaModal: drill-down a empleado/cliente en un solo modal con "Volver",
 *   Escape sube un nivel (en la raíz cierra), X cierra desde cualquier nivel,
 *   gating financiero heredado de ClientFichaContent
 */
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { vi } from 'vitest'

// ── Mocks globales ─────────────────────────────────────────────────────────────

vi.mock('../supabase', () => ({
  supabase: {
    from: vi.fn().mockReturnValue({
      select:      vi.fn().mockReturnThis(),
      insert:      vi.fn().mockReturnThis(),
      update:      vi.fn().mockReturnThis(),
      delete:      vi.fn().mockReturnThis(),
      upsert:      vi.fn().mockReturnThis(),
      eq:          vi.fn().mockReturnThis(),
      order:       vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      single:      vi.fn().mockResolvedValue({ data: null, error: null }),
    }),
    channel: vi.fn(() => ({ on: vi.fn().mockReturnThis(), subscribe: vi.fn().mockReturnThis() })),
    removeChannel: vi.fn(),
  },
}))

vi.mock('../context/AuthContext', () => ({
  useAuth: vi.fn(() => ({
    userProfile: { user_id: 'u-1', company_id: 'co-1', access_level: 4, admin: true, first_name: 'Admin', last_name: 'Test' },
    can: () => true,
    signOut: vi.fn(),
  })),
}))

import { useAuth } from '../context/AuthContext'

// Stubs de los modales de gestión de LinesView (no son objeto de estos tests)
vi.mock('../components/empresa/LineModal', () => ({
  default: () => <div data-testid="line-modal" />,
}))
vi.mock('../components/empresa/LineMetasModal', () => ({
  default: () => <div data-testid="line-metas-modal" />,
}))
vi.mock('../components/common/ConfirmDeleteDialog', () => ({
  default: () => <div data-testid="confirm-delete-dialog" />,
}))

// ── Fixtures ───────────────────────────────────────────────────────────────────

const MOCK_LINE = { id: 'l-1', name: 'Georgina', color: '#FAB51A', member_user_ids: ['u-2'], sort_order: 0 }

const MOCK_EMPLOYEE = {
  user_id: 'u-2', first_name: 'María', last_name: 'González',
  avatar_url: null,
  position:   { position_name: 'Diseñadora', position_description: 'Diseña piezas gráficas', position_functions: ['Crear artes'] },
  department: { department_name: 'Diseño' },
  email: 'maria@mdn.com', phone_number: null,
  hire_date: null, birth_date: null, access_level: 2, admin: false,
}

const MOCK_CLIENT = {
  id: 'c-1', name: 'Pepsi', monthly_fee: 1500, payment_day: 5,
  logo_url: null, line_id: 'l-1', website: 'https://pepsi.com',
  contacts: [{ name: 'Juan Pérez', role: 'Gerente', birth_day: 5, birth_month: 3 }],
  social_links: [], mdn_since: null, anniversary_date: null,
}

// Mock de metricsApi centralizado
const mockLoadLines            = vi.fn().mockResolvedValue({ data: [MOCK_LINE], error: null })
const mockLoadCompanyUsers     = vi.fn().mockResolvedValue({
  data: [{ user_id: 'u-2', first_name: 'María', last_name: 'González', avatar_url: null }],
  error: null,
})
const mockLoadCompanyEmployees = vi.fn().mockResolvedValue({ data: [MOCK_EMPLOYEE], error: null })
const mockLoadClients          = vi.fn().mockResolvedValue({ data: [MOCK_CLIENT], error: null })
const mockUpdateLine           = vi.fn().mockResolvedValue({ data: null, error: null })
const mockDeleteLine           = vi.fn().mockResolvedValue({ error: null })

vi.mock('../components/metricas/metricsApi', () => ({
  loadLines:            (...a) => mockLoadLines(...a),
  loadCompanyUsers:     (...a) => mockLoadCompanyUsers(...a),
  loadCompanyEmployees: (...a) => mockLoadCompanyEmployees(...a),
  loadClients:          (...a) => mockLoadClients(...a),
  updateLine:           (...a) => mockUpdateLine(...a),
  deleteLine:           (...a) => mockDeleteLine(...a),
}))

vi.mock('../utils/metricsFinance', () => ({
  fmtUSD: vi.fn(v => `$${v}`),
}))

import LinesView from '../components/empresa/LinesView'
import LineFichaModal from '../components/empresa/LineFichaModal'

function wrap(ui) {
  return render(<MemoryRouter>{ui}</MemoryRouter>)
}

async function renderFicha(onClose = vi.fn()) {
  wrap(<LineFichaModal line={MOCK_LINE} companyId="co-1" onClose={onClose} />)
  await waitFor(() => expect(screen.getByText('Miembros')).toBeInTheDocument())
  return onClose
}

afterEach(() => {
  vi.mocked(useAuth).mockReturnValue({
    userProfile: { user_id: 'u-1', company_id: 'co-1', access_level: 4, admin: true, first_name: 'Admin', last_name: 'Test' },
    can: () => true,
    signOut: vi.fn(),
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// 1. Apertura desde LinesView
// ══════════════════════════════════════════════════════════════════════════════

describe('LinesView — apertura de la ficha de línea', () => {
  async function renderLines() {
    wrap(<LinesView companyId="co-1" canManage={true} />)
    await waitFor(() => expect(screen.getByText('Georgina')).toBeInTheDocument())
  }

  it('el título del card abre la ficha con contadores y listas', async () => {
    await renderLines()
    await userEvent.click(screen.getByRole('button', { name: 'Ver ficha de Georgina' }))
    await waitFor(() => expect(screen.getByText('Miembros')).toBeInTheDocument())
    expect(screen.getByText('1 miembro · 1 cliente')).toBeInTheDocument()
    expect(screen.getByText('Clientes')).toBeInTheDocument()
    expect(screen.getByTitle('Ver información de María González')).toBeInTheDocument()
    expect(screen.getByTitle('Ver ficha de Pepsi')).toBeInTheDocument()
  })

  it('el click en el cuerpo del card (fuera de controles) abre la ficha', async () => {
    await renderLines()
    // El nombre en el chip de miembro no es un botón — el click burbujea al card
    fireEvent.click(screen.getByText('María González'))
    await waitFor(() => expect(screen.getByText('Miembros')).toBeInTheDocument())
    expect(screen.getByText('1 miembro · 1 cliente')).toBeInTheDocument()
  })

  it('"Configurar metas" abre su modal y NO la ficha', async () => {
    await renderLines()
    await userEvent.click(screen.getByRole('button', { name: 'Configurar metas' }))
    expect(screen.getByTestId('line-metas-modal')).toBeInTheDocument()
    expect(screen.queryByText('Miembros')).not.toBeInTheDocument()
  })

  it('"Editar línea" abre su modal y NO la ficha', async () => {
    await renderLines()
    await userEvent.click(screen.getByRole('button', { name: 'Editar línea' }))
    expect(screen.getByTestId('line-modal')).toBeInTheDocument()
    expect(screen.queryByText('Miembros')).not.toBeInTheDocument()
  })

  it('"Eliminar línea" abre el diálogo de confirmación y NO la ficha', async () => {
    await renderLines()
    await userEvent.click(screen.getByRole('button', { name: 'Eliminar línea' }))
    expect(screen.getByTestId('confirm-delete-dialog')).toBeInTheDocument()
    expect(screen.queryByText('Miembros')).not.toBeInTheDocument()
  })

  it('quitar un miembro NO abre la ficha', async () => {
    await renderLines()
    await userEvent.click(screen.getByRole('button', { name: 'Quitar María González' }))
    expect(screen.queryByText('Miembros')).not.toBeInTheDocument()
    expect(mockUpdateLine).toHaveBeenCalled()
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// 2. LineFichaModal — drill-down
// ══════════════════════════════════════════════════════════════════════════════

describe('LineFichaModal — drill-down en un solo modal', () => {
  it('muestra la vista raíz con miembros y clientes', async () => {
    await renderFicha()
    expect(screen.getByText('Georgina')).toBeInTheDocument()
    expect(screen.getByText('1 miembro · 1 cliente')).toBeInTheDocument()
    expect(screen.getByText('María González')).toBeInTheDocument()
    expect(screen.getByText('Diseñadora')).toBeInTheDocument()
    expect(screen.getByText('Pepsi')).toBeInTheDocument()
  })

  it('drill-down a empleado y volver', async () => {
    await renderFicha()
    await userEvent.click(screen.getByTitle('Ver información de María González'))
    expect(screen.getByText('maria@mdn.com')).toBeInTheDocument()
    expect(screen.getByText('Diseña piezas gráficas')).toBeInTheDocument()
    expect(screen.queryByText('Miembros')).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /Volver a Georgina/ }))
    expect(screen.getByText('Miembros')).toBeInTheDocument()
    expect(screen.queryByText('maria@mdn.com')).not.toBeInTheDocument()
  })

  it('drill-down a cliente y volver', async () => {
    await renderFicha()
    await userEvent.click(screen.getByTitle('Ver ficha de Pepsi'))
    expect(screen.getByText('Juan Pérez')).toBeInTheDocument()
    expect(screen.getByText('pepsi.com')).toBeInTheDocument()
    expect(screen.queryByText('Miembros')).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /Volver a Georgina/ }))
    expect(screen.getByText('Miembros')).toBeInTheDocument()
    expect(screen.queryByText('Juan Pérez')).not.toBeInTheDocument()
  })

  it('Escape sube un nivel; en la raíz cierra', async () => {
    const onClose = await renderFicha()
    await userEvent.click(screen.getByTitle('Ver información de María González'))

    fireEvent.keyDown(document, { key: 'Escape' })
    await waitFor(() => expect(screen.getByText('Miembros')).toBeInTheDocument())
    expect(onClose).not.toHaveBeenCalled()

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('el botón X cierra todo desde un drill-down', async () => {
    const onClose = await renderFicha()
    await userEvent.click(screen.getByTitle('Ver ficha de Pepsi'))
    await userEvent.click(screen.getByRole('button', { name: 'Cerrar' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('usuario privilegiado ve los datos financieros del cliente en drill-down', async () => {
    await renderFicha()
    await userEvent.click(screen.getByTitle('Ver ficha de Pepsi'))
    expect(screen.getByText('$1500')).toBeInTheDocument()
    expect(screen.getByText('día 5')).toBeInTheDocument()
  })

  it('usuario no privilegiado NO ve los datos financieros del cliente', async () => {
    vi.mocked(useAuth).mockReturnValue({
      userProfile: { user_id: 'u-3', company_id: 'co-1', access_level: 2, admin: false },
      can: () => true,
      signOut: vi.fn(),
    })
    await renderFicha()
    await userEvent.click(screen.getByTitle('Ver ficha de Pepsi'))
    expect(screen.getByText('Juan Pérez')).toBeInTheDocument()
    expect(screen.queryByText('$1500')).not.toBeInTheDocument()
    expect(screen.queryByText('día 5')).not.toBeInTheDocument()
  })
})
