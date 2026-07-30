import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import LeadsTable from '../components/leads/LeadsTable'

const MOCK_LEADS = [
  {
    id: 'lead-1',
    created_at: '2026-07-10T10:00:00Z',
    nombre: 'Beatriz Gómez',
    empresa: 'Beta Corp',
    telefono: '0414-1111111',
    email: 'beatriz@beta.com',
    servicios: ['Web'],
    status: 'pendiente',
    tipo_pagina: null,
  },
  {
    id: 'lead-2',
    created_at: '2026-07-20T10:00:00Z',
    nombre: 'Andrés Ríos',
    empresa: 'Alfa SA',
    telefono: '0414-2222222',
    email: 'andres@alfa.com',
    servicios: ['Redes'],
    status: 'contactado',
    tipo_pagina: 'Landing Ads',
  },
]

describe('LeadsTable', () => {
  it('renders a row per lead with name, empresa, status and date', () => {
    render(<LeadsTable leads={MOCK_LEADS} onSelectLead={() => {}} />)
    expect(screen.getByText('Beatriz Gómez')).toBeInTheDocument()
    expect(screen.getByText('Andrés Ríos')).toBeInTheDocument()
    expect(screen.getByText('Beta Corp')).toBeInTheDocument()
    expect(screen.getByText('Alfa SA')).toBeInTheDocument()
  })

  it('calls onSelectLead with the clicked lead', async () => {
    const onSelectLead = vi.fn()
    const user = userEvent.setup()
    render(<LeadsTable leads={MOCK_LEADS} onSelectLead={onSelectLead} />)

    await user.click(screen.getByText('Beatriz Gómez').closest('tr'))

    expect(onSelectLead).toHaveBeenCalledWith(MOCK_LEADS[0])
  })

  it('sorts by column on header click, toggling direction on a second click', async () => {
    const user = userEvent.setup()
    render(<LeadsTable leads={MOCK_LEADS} onSelectLead={() => {}} />)

    const rows = () => screen.getAllByRole('row').slice(1) // sin el header
    // Default: created_at desc → Andrés (20 jul) antes que Beatriz (10 jul)
    expect(rows()[0]).toHaveTextContent('Andrés Ríos')

    await user.click(screen.getByText('Nombre'))
    // asc por nombre → Andrés antes que Beatriz alfabéticamente
    expect(rows()[0]).toHaveTextContent('Andrés Ríos')

    await user.click(screen.getByText('Nombre'))
    // click de nuevo invierte a desc → Beatriz primero
    expect(rows()[0]).toHaveTextContent('Beatriz Gómez')
  })

  it('filters rows by free-text search', async () => {
    const user = userEvent.setup()
    render(<LeadsTable leads={MOCK_LEADS} onSelectLead={() => {}} />)

    await user.type(screen.getByPlaceholderText(/Buscar/), 'alfa')

    expect(screen.getByText('Andrés Ríos')).toBeInTheDocument()
    expect(screen.queryByText('Beatriz Gómez')).not.toBeInTheDocument()
  })

  it('filters rows by servicio', async () => {
    const user = userEvent.setup()
    render(<LeadsTable leads={MOCK_LEADS} onSelectLead={() => {}} />)

    await user.selectOptions(screen.getByDisplayValue('Todos los servicios'), 'Redes')

    expect(screen.getByText('Andrés Ríos')).toBeInTheDocument()
    expect(screen.queryByText('Beatriz Gómez')).not.toBeInTheDocument()
  })

  it('shows a results counter and a "Limpiar" button that resets active filters', async () => {
    const user = userEvent.setup()
    render(<LeadsTable leads={MOCK_LEADS} onSelectLead={() => {}} />)

    expect(screen.getByText('2 resultados')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Limpiar' })).not.toBeInTheDocument()

    await user.type(screen.getByPlaceholderText(/Buscar/), 'alfa')
    expect(screen.getByText('1 resultado de 2')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Limpiar' }))
    expect(screen.getByText('Beatriz Gómez')).toBeInTheDocument()
    expect(screen.getByText('Andrés Ríos')).toBeInTheDocument()
  })

  it('shows an empty state when there are no leads at all', () => {
    render(<LeadsTable leads={[]} onSelectLead={() => {}} />)
    expect(screen.getByText('No hay leads para mostrar.')).toBeInTheDocument()
  })

  it('shows a distinct empty state when filters match nothing', async () => {
    const user = userEvent.setup()
    render(<LeadsTable leads={MOCK_LEADS} onSelectLead={() => {}} />)

    await user.type(screen.getByPlaceholderText(/Buscar/), 'no existe ningún lead así')

    expect(screen.getByText('Sin resultados para esos filtros.')).toBeInTheDocument()
  })
})
