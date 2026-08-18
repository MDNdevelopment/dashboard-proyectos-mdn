import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'

const MOCK_ANALYSIS = {
  estado_general: {
    semaforo: 'verde',
    titulo: 'Buen mes para la empresa',
    resumen: 'Las finanzas y el score operativo van bien este mes.',
  },
  metricas_clave: [{ label: 'Rentabilidad del mes', valor: '+$3.200', tendencia: 'sube' }],
  fortalezas: ['El equipo de Redes superó su meta de crecimiento.'],
  areas_mejora: ['Las solicitudes tardan más de lo esperado en cerrarse.'],
  criticos: [
    {
      area: 'Línea Audiovisual',
      problema: 'Score por debajo de 50.',
      accion: 'Revisar carga de trabajo del equipo.',
    },
  ],
  generated_at: '2026-08-17T10:00:00.000Z',
  cached: false,
}

vi.mock('../supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({
        data: { session: { access_token: 'test-token-123' } },
      }),
    },
  },
}))

import CeoAnalysisCard from '../components/home/CeoAnalysisCard'

describe('CeoAnalysisCard', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => MOCK_ANALYSIS,
      }),
    )
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.clearAllMocks()
  })

  it('genera el análisis automáticamente al montar', async () => {
    render(<CeoAnalysisCard />)
    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        '/api/ceo-analysis',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({ Authorization: 'Bearer test-token-123' }),
        }),
      )
    })
    const body = JSON.parse(fetch.mock.calls[0][1].body)
    expect(body.refresh).toBe(false)
  })

  it('muestra spinner mientras carga', () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise(() => {})),
    )
    render(<CeoAnalysisCard />)
    expect(document.querySelector('.animate-spin')).toBeInTheDocument()
    expect(screen.getByText(/generando análisis/i)).toBeInTheDocument()
  })

  it('renderiza el estado general, métricas clave, fortalezas y críticos', async () => {
    render(<CeoAnalysisCard />)
    await waitFor(() => {
      expect(screen.getByText('Buen mes para la empresa')).toBeInTheDocument()
    })
    expect(screen.getByText(/finanzas y el score operativo/i)).toBeInTheDocument()
    expect(screen.getByText('Rentabilidad del mes')).toBeInTheDocument()
    expect(screen.getByText(/superó su meta de crecimiento/i)).toBeInTheDocument()
    expect(screen.getByText('Línea Audiovisual')).toBeInTheDocument()
    expect(screen.getByText(/revisar carga de trabajo/i)).toBeInTheDocument()
  })

  it('el botón Actualizar fuerza una regeneración (refresh:true)', async () => {
    const user = userEvent.setup()
    render(<CeoAnalysisCard />)
    await waitFor(() => screen.getByRole('button', { name: /actualizar/i }))

    await user.click(screen.getByRole('button', { name: /actualizar/i }))

    await waitFor(() => {
      const lastCall = fetch.mock.calls[fetch.mock.calls.length - 1]
      const body = JSON.parse(lastCall[1].body)
      expect(body.refresh).toBe(true)
    })
  })

  it('muestra el error y el botón Reintentar cuando la respuesta no es ok', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        json: async () => ({ error: 'Forbidden' }),
      }),
    )
    render(<CeoAnalysisCard />)
    await waitFor(() => {
      expect(screen.getByText('Forbidden')).toBeInTheDocument()
    })
    expect(screen.getByRole('button', { name: /reintentar/i })).toBeInTheDocument()
  })

  it('muestra un error si la respuesta no es JSON válido (ej. 404 de la ruta /api)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        json: async () => {
          throw new SyntaxError('Unexpected end of JSON input')
        },
      }),
    )
    render(<CeoAnalysisCard />)
    await waitFor(() => {
      expect(screen.getByText(/respuesta inválida del servidor/i)).toBeInTheDocument()
    })
    expect(screen.getByRole('button', { name: /reintentar/i })).toBeInTheDocument()
  })
})
