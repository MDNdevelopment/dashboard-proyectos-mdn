import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'

const MOCK_INSIGHT = {
  resumen: 'Ana Pérez tuvo carga alta el 2026-09-02.',
  hallazgos: [
    {
      persona: 'Ana Pérez',
      detalle: 'Fue a 3 pautas el 2 de septiembre para Cliente X.',
      sugerencia: 'Hablar con ella para ver cómo se siente.',
    },
  ],
  generated_at: '2026-09-02T10:00:00.000Z',
  cached: false,
}

const MOCK_EMPTY_INSIGHT = {
  resumen:
    'Ningún recurso de Audiovisual acumuló 3 o más pautas en un mismo día entre el 2026-08-30 y el 2026-09-05.',
  hallazgos: [],
  generated_at: '2026-09-02T10:00:00.000Z',
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

import RecomendacionesCard from '../components/home/RecomendacionesCard'
import { AiChatProvider, useAiChatContext } from '../context/AiChatContext'

function renderCard() {
  return render(
    <AiChatProvider>
      <RecomendacionesCard />
    </AiChatProvider>,
  )
}

describe('RecomendacionesCard', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => MOCK_INSIGHT,
      }),
    )
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.clearAllMocks()
  })

  it('genera la recomendación automáticamente al montar', async () => {
    renderCard()
    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        '/api/av-workload-insight',
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
    renderCard()
    expect(document.querySelector('.animate-spin')).toBeInTheDocument()
    expect(screen.getByText(/analizando la carga del equipo/i)).toBeInTheDocument()
  })

  it('renderiza el resumen y cada hallazgo', async () => {
    renderCard()
    await waitFor(() => {
      expect(screen.getByText(/ana pérez tuvo carga alta/i)).toBeInTheDocument()
    })
    expect(screen.getByText('Ana Pérez')).toBeInTheDocument()
    expect(screen.getByText(/fue a 3 pautas el 2 de septiembre/i)).toBeInTheDocument()
    expect(screen.getByText(/hablar con ella/i)).toBeInTheDocument()
  })

  it('caso "todo tranquilo": solo pinta el resumen, sin botón de MAPPI', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => MOCK_EMPTY_INSIGHT }),
    )
    renderCard()
    await waitFor(() => {
      expect(screen.getByText(/ningún recurso de audiovisual/i)).toBeInTheDocument()
    })
    expect(screen.queryByRole('button', { name: /preguntarle a mappi/i })).not.toBeInTheDocument()
  })

  it('el botón Actualizar fuerza una regeneración (refresh:true)', async () => {
    const user = userEvent.setup()
    renderCard()
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
      vi.fn().mockResolvedValue({ ok: false, json: async () => ({ error: 'Forbidden' }) }),
    )
    renderCard()
    await waitFor(() => {
      expect(screen.getByText('Forbidden')).toBeInTheDocument()
    })
    expect(screen.getByRole('button', { name: /reintentar/i })).toBeInTheDocument()
  })

  it('el botón "Preguntarle a MAPPI sobre esto" llama a openWithContext con el seed', async () => {
    const captured = {}
    function Spy() {
      captured.ctx = useAiChatContext()
      return null
    }

    render(
      <AiChatProvider>
        <Spy />
        <RecomendacionesCard />
      </AiChatProvider>,
    )

    const user = userEvent.setup()
    await waitFor(() => screen.getByRole('button', { name: /preguntarle a mappi sobre esto/i }))
    await user.click(screen.getByRole('button', { name: /preguntarle a mappi sobre esto/i }))

    expect(captured.ctx.open).toBe(true)
    expect(captured.ctx.messages).toEqual([
      { role: 'assistant', text: expect.stringContaining('Ana Pérez') },
    ])
  })
})
