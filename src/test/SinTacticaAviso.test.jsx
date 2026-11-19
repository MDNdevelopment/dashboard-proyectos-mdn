import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'

const { mockEq, mockFrom } = vi.hoisted(() => ({ mockEq: vi.fn(), mockFrom: vi.fn() }))

vi.mock('../supabase', () => ({ supabase: { from: mockFrom } }))

import SinTacticaAviso from '../components/ads/tacticas/SinTacticaAviso'

// Fechas lejanas: el componente usa el "hoy" real, así que no dependen de cuándo corra el test.
const FUTURO = '2099-12-31'
const PASADO = '2000-01-01'

function setData(result) {
  mockEq.mockResolvedValue(result)
  mockFrom.mockReturnValue({ select: vi.fn().mockReturnValue({ eq: mockEq }) })
}

describe('SinTacticaAviso', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('avisa cuando todas las tácticas de la marca ya vencieron', async () => {
    setData({ data: [{ status: 'En Curso', end_date: PASADO }], error: null })
    render(<SinTacticaAviso clientId="b1" onOpen={() => {}} />)
    expect(await screen.findByRole('alert')).toHaveTextContent('Sin táctica vigente')
  })

  it('avisa cuando la marca no tiene ninguna táctica', async () => {
    setData({ data: [], error: null })
    render(<SinTacticaAviso clientId="b1" onOpen={() => {}} />)
    expect(await screen.findByRole('alert')).toBeInTheDocument()
  })

  it('una táctica finalizada no cubre a la marca aunque su fecha de fin sea futura', async () => {
    setData({ data: [{ status: 'Finalizado', end_date: FUTURO }], error: null })
    render(<SinTacticaAviso clientId="b1" onOpen={() => {}} />)
    expect(await screen.findByRole('alert')).toBeInTheDocument()
  })

  it('no avisa si hay una táctica en marcha', async () => {
    setData({ data: [{ status: 'En Curso', end_date: FUTURO }], error: null })
    render(<SinTacticaAviso clientId="b1" onOpen={() => {}} />)
    await waitFor(() => expect(mockEq).toHaveBeenCalled())
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('una táctica programada (Pendiente a futuro) también cubre a la marca', async () => {
    setData({ data: [{ status: 'Pendiente', end_date: FUTURO }], error: null })
    render(<SinTacticaAviso clientId="b1" onOpen={() => {}} />)
    await waitFor(() => expect(mockEq).toHaveBeenCalled())
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('si la consulta falla, no muestra nada (no se puede comprobar)', async () => {
    setData({ data: null, error: { message: 'rls' } })
    render(<SinTacticaAviso clientId="b1" onOpen={() => {}} />)
    await waitFor(() => expect(mockEq).toHaveBeenCalled())
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('si la consulta lanza una excepción, tampoco rompe ni muestra nada', async () => {
    mockFrom.mockImplementation(() => {
      throw new Error('sin cliente')
    })
    render(<SinTacticaAviso clientId="b1" onOpen={() => {}} />)
    await new Promise((r) => setTimeout(r, 0))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('sin clientId no consulta', () => {
    setData({ data: [], error: null })
    render(<SinTacticaAviso clientId="" onOpen={() => {}} />)
    expect(mockFrom).not.toHaveBeenCalled()
  })

  it('consulta las tácticas de esa marca', async () => {
    setData({ data: [], error: null })
    render(<SinTacticaAviso clientId="b7" onOpen={() => {}} />)
    await screen.findByRole('alert')
    expect(mockFrom).toHaveBeenCalledWith('campaigns')
    expect(mockEq).toHaveBeenCalledWith('client_id', 'b7')
  })

  it('"Ver tácticas" abre la ficha de la marca', async () => {
    const user = userEvent.setup()
    const onOpen = vi.fn()
    setData({ data: [], error: null })
    render(<SinTacticaAviso clientId="b1" onOpen={onOpen} />)
    await user.click(await screen.findByRole('button', { name: 'Ver tácticas' }))
    expect(onOpen).toHaveBeenCalledWith('b1')
  })
})
