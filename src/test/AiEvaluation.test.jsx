import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'

// Datos de respuesta de la Netlify function
const MOCK_ANALYSIS = {
  summary: 'El empleado demuestra un buen desempeño general.',
  strengths: ['Trabaja bien en equipo.', 'Alta puntualidad.'],
  weaknesses: ['Puede mejorar la comunicación escrita.'],
  recommendations: ['Tomar un curso de redacción profesional.'],
}

// Mock de supabase — solo necesitamos auth.getSession para el Bearer token
vi.mock('../supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({
        data: { session: { access_token: 'test-token-123' } },
      }),
    },
  },
}))

// Importar DESPUÉS de los mocks
import AiEvaluation from '../components/evaluaciones/AiEvaluation'

describe('AiEvaluation', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => MOCK_ANALYSIS,
    }))
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.clearAllMocks()
  })

  it('muestra el botón "Generar análisis IA" y el texto descriptivo inicialmente', () => {
    render(<AiEvaluation employeeId="emp-123" />)
    expect(screen.getByRole('button', { name: /generar análisis ia/i })).toBeInTheDocument()
    expect(screen.getByText(/historial de evaluaciones/i)).toBeInTheDocument()
  })

  it('al hacer clic llama a fetch con la URL y cabeceras correctas', async () => {
    const user = userEvent.setup()
    render(<AiEvaluation employeeId="emp-123" />)

    await user.click(screen.getByRole('button', { name: /generar análisis ia/i }))

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        '/api/evaluation-analysis',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            Authorization: 'Bearer test-token-123',
            'Content-Type': 'application/json',
          }),
        })
      )
    })

    // Verificar que el body incluye el employeeId correcto
    const callArgs = fetch.mock.calls[0][1]
    const body = JSON.parse(callArgs.body)
    expect(body.employeeId).toBe('emp-123')
  })

  it('muestra spinner mientras carga', async () => {
    // Hacer que fetch no resuelva inmediatamente
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})))

    const user = userEvent.setup()
    render(<AiEvaluation employeeId="emp-123" />)

    await user.click(screen.getByRole('button', { name: /generar análisis ia/i }))

    expect(document.querySelector('.animate-spin')).toBeInTheDocument()
    expect(screen.getByText(/generando análisis/i)).toBeInTheDocument()
  })

  it('renderiza el resumen tras una respuesta exitosa', async () => {
    const user = userEvent.setup()
    render(<AiEvaluation employeeId="emp-123" />)

    await user.click(screen.getByRole('button', { name: /generar análisis ia/i }))

    await waitFor(() => {
      expect(screen.getByText(MOCK_ANALYSIS.summary)).toBeInTheDocument()
    })
  })

  it('renderiza las secciones Fortalezas, Debilidades y Recomendaciones', async () => {
    const user = userEvent.setup()
    render(<AiEvaluation employeeId="emp-123" />)

    await user.click(screen.getByRole('button', { name: /generar análisis ia/i }))

    await waitFor(() => {
      expect(screen.getByText('Fortalezas')).toBeInTheDocument()
      expect(screen.getByText('Debilidades')).toBeInTheDocument()
      expect(screen.getByText('Recomendaciones')).toBeInTheDocument()
    })

    expect(screen.getByText('Trabaja bien en equipo.')).toBeInTheDocument()
    expect(screen.getByText('Puede mejorar la comunicación escrita.')).toBeInTheDocument()
    expect(screen.getByText('Tomar un curso de redacción profesional.')).toBeInTheDocument()
  })

  it('muestra el botón "Regenerar" tras el análisis exitoso', async () => {
    const user = userEvent.setup()
    render(<AiEvaluation employeeId="emp-123" />)

    await user.click(screen.getByRole('button', { name: /generar análisis ia/i }))

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /regenerar/i })).toBeInTheDocument()
    })
  })

  it('al hacer clic en Regenerar vuelve al estado inicial', async () => {
    const user = userEvent.setup()
    render(<AiEvaluation employeeId="emp-123" />)

    await user.click(screen.getByRole('button', { name: /generar análisis ia/i }))
    await waitFor(() => screen.getByRole('button', { name: /regenerar/i }))

    await user.click(screen.getByRole('button', { name: /regenerar/i }))

    expect(screen.getByRole('button', { name: /generar análisis ia/i })).toBeInTheDocument()
    expect(screen.queryByText(MOCK_ANALYSIS.summary)).not.toBeInTheDocument()
  })

  it('muestra el error y el botón Reintentar cuando la respuesta no es ok', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error: 'El empleado no tiene evaluaciones' }),
    }))

    const user = userEvent.setup()
    render(<AiEvaluation employeeId="emp-123" />)

    await user.click(screen.getByRole('button', { name: /generar análisis ia/i }))

    await waitFor(() => {
      expect(screen.getByText('El empleado no tiene evaluaciones')).toBeInTheDocument()
    })
    expect(screen.getByRole('button', { name: /reintentar/i })).toBeInTheDocument()
  })

  it('muestra error de red si fetch lanza excepción', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')))

    const user = userEvent.setup()
    render(<AiEvaluation employeeId="emp-123" />)

    await user.click(screen.getByRole('button', { name: /generar análisis ia/i }))

    await waitFor(() => {
      expect(screen.getByText(/error de red/i)).toBeInTheDocument()
    })
  })

  it('el botón Reintentar vuelve a llamar a fetch', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error: 'Error al generar el análisis' }),
    }))

    const user = userEvent.setup()
    render(<AiEvaluation employeeId="emp-123" />)

    await user.click(screen.getByRole('button', { name: /generar análisis ia/i }))
    await waitFor(() => screen.getByRole('button', { name: /reintentar/i }))

    // Ahora la segunda llamada tendrá éxito
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => MOCK_ANALYSIS,
    }))

    await user.click(screen.getByRole('button', { name: /reintentar/i }))

    await waitFor(() => {
      expect(screen.getByText(MOCK_ANALYSIS.summary)).toBeInTheDocument()
    })
  })
})
