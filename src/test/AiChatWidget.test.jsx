import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('../supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: { access_token: 'tok-123' } } }),
    },
  },
}))

vi.mock('../context/AuthContext', () => ({ useAuth: vi.fn() }))

import { useAuth } from '../context/AuthContext'
import { AiChatProvider, useAiChatContext } from '../context/AiChatContext'
import AiChatWidget from '../components/ai/AiChatWidget'

beforeEach(() => {
  vi.restoreAllMocks()
  global.fetch = vi.fn()
})

function mockAuth(admin) {
  useAuth.mockReturnValue({ userProfile: admin === null ? null : { user_id: 'u1', admin } })
}

// El estado del chat (open, mensajes) vive en AiChatProvider desde que se elevó fuera del
// widget (ver src/context/AiChatContext.jsx), para que RecomendacionesCard también pueda
// abrir el panel con contexto precargado.
function renderWidget() {
  return render(
    <AiChatProvider>
      <AiChatWidget />
    </AiChatProvider>,
  )
}

describe('AiChatWidget', () => {
  it('no renderiza nada si el usuario no es admin', () => {
    mockAuth(false)
    const { container } = renderWidget()
    expect(container).toBeEmptyDOMElement()
  })

  it('no renderiza nada si userProfile es null (aún cargando)', () => {
    mockAuth(null)
    const { container } = renderWidget()
    expect(container).toBeEmptyDOMElement()
  })

  it('muestra el botón flotante para un admin', () => {
    mockAuth(true)
    renderWidget()
    expect(screen.getByRole('button', { name: /abrir asistente ia/i })).toBeInTheDocument()
  })

  it('abre y cierra el panel al hacer click en el FAB', async () => {
    mockAuth(true)
    renderWidget()
    fireEvent.click(screen.getByRole('button', { name: /abrir asistente ia/i }))
    expect(screen.getByRole('dialog', { name: /asistente ia/i })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /cerrar asistente ia/i }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('cierra el panel con Escape', () => {
    mockAuth(true)
    renderWidget()
    fireEvent.click(screen.getByRole('button', { name: /abrir asistente ia/i }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()

    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('muestra las preguntas sugeridas en el estado vacío', () => {
    mockAuth(true)
    renderWidget()
    fireEvent.click(screen.getByRole('button', { name: /abrir asistente ia/i }))
    expect(screen.getByText('¿Cómo va la empresa este mes?')).toBeInTheDocument()
  })

  it('envía un mensaje y muestra la respuesta del backend', async () => {
    mockAuth(true)
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ reply: 'La empresa va bien este mes.', toolsUsed: ['ranking_lineas'] }),
    })

    renderWidget()
    fireEvent.click(screen.getByRole('button', { name: /abrir asistente ia/i }))

    const textarea = screen.getByPlaceholderText('Escribe tu pregunta…')
    await userEvent.type(textarea, '¿Cómo va la empresa?')
    fireEvent.click(screen.getByRole('button', { name: /enviar/i }))

    expect(screen.getByText('¿Cómo va la empresa?')).toBeInTheDocument()
    await waitFor(() =>
      expect(screen.getByText('La empresa va bien este mes.')).toBeInTheDocument(),
    )

    expect(global.fetch).toHaveBeenCalledWith(
      '/api/ai-chat',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer tok-123' }),
      }),
    )
  })

  it('renderiza **negrita** del texto de la IA como <strong>', async () => {
    mockAuth(true)
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ reply: 'La línea **Alfa** va mejor.', toolsUsed: [] }),
    })

    renderWidget()
    fireEvent.click(screen.getByRole('button', { name: /abrir asistente ia/i }))
    await userEvent.type(screen.getByPlaceholderText('Escribe tu pregunta…'), 'hola')
    fireEvent.click(screen.getByRole('button', { name: /enviar/i }))

    await waitFor(() => expect(screen.getByText('Alfa').tagName).toBe('STRONG'))
  })

  it('muestra un error cuando la respuesta no es ok', async () => {
    mockAuth(true)
    global.fetch.mockResolvedValue({ ok: false, json: async () => ({ error: 'Sin acceso' }) })

    renderWidget()
    fireEvent.click(screen.getByRole('button', { name: /abrir asistente ia/i }))
    await userEvent.type(screen.getByPlaceholderText('Escribe tu pregunta…'), 'hola')
    fireEvent.click(screen.getByRole('button', { name: /enviar/i }))

    await waitFor(() => expect(screen.getByText('Sin acceso')).toBeInTheDocument())
  })

  it('muestra un error de red', async () => {
    mockAuth(true)
    global.fetch.mockRejectedValue(new Error('network down'))

    renderWidget()
    fireEvent.click(screen.getByRole('button', { name: /abrir asistente ia/i }))
    await userEvent.type(screen.getByPlaceholderText('Escribe tu pregunta…'), 'hola')
    fireEvent.click(screen.getByRole('button', { name: /enviar/i }))

    await waitFor(() => expect(screen.getByText(/no pudimos conectar/i)).toBeInTheDocument())
  })

  it('el botón reintentar reenvía el último mensaje y limpia el error si funciona', async () => {
    mockAuth(true)
    global.fetch.mockRejectedValueOnce(new Error('network down')).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ reply: 'Ahora sí.', toolsUsed: [] }),
    })

    renderWidget()
    fireEvent.click(screen.getByRole('button', { name: /abrir asistente ia/i }))
    await userEvent.type(screen.getByPlaceholderText('Escribe tu pregunta…'), 'hola')
    fireEvent.click(screen.getByRole('button', { name: /enviar/i }))
    await waitFor(() => expect(screen.getByText(/no pudimos conectar/i)).toBeInTheDocument())

    fireEvent.click(screen.getByRole('button', { name: /reintentar/i }))

    await waitFor(() => expect(screen.getByText('Ahora sí.')).toBeInTheDocument())
    expect(screen.queryByText(/no pudimos conectar/i)).not.toBeInTheDocument()
    expect(global.fetch).toHaveBeenCalledTimes(2)
  })

  it('el historial vive solo en memoria: se pierde al desmontar y remontar', async () => {
    mockAuth(true)
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ reply: 'Respuesta.', toolsUsed: [] }),
    })

    const { unmount } = renderWidget()
    fireEvent.click(screen.getByRole('button', { name: /abrir asistente ia/i }))
    await userEvent.type(screen.getByPlaceholderText('Escribe tu pregunta…'), 'pregunta efímera')
    fireEvent.click(screen.getByRole('button', { name: /enviar/i }))
    await waitFor(() => expect(screen.getByText('Respuesta.')).toBeInTheDocument())
    unmount()

    renderWidget()
    fireEvent.click(screen.getByRole('button', { name: /abrir asistente ia/i }))
    expect(screen.queryByText('pregunta efímera')).not.toBeInTheDocument()
  })

  it('muestra la burbuja de CTAs con el estado inicial cerrado', () => {
    mockAuth(true)
    renderWidget()
    expect(screen.getByText('¿En qué te puedo ayudar?')).toBeInTheDocument()
  })

  it('cierra la burbuja de CTAs con el botón de cerrar', () => {
    mockAuth(true)
    renderWidget()
    fireEvent.click(screen.getByRole('button', { name: /cerrar sugerencias/i }))
    expect(screen.queryByText('¿En qué te puedo ayudar?')).not.toBeInTheDocument()
  })

  it('el CTA abre el panel sin enviar ninguna pregunta', () => {
    mockAuth(true)
    renderWidget()
    fireEvent.click(screen.getByText('¿En qué te puedo ayudar?'))

    expect(screen.getByRole('dialog', { name: /asistente ia/i })).toBeInTheDocument()
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('abrir el panel con el FAB oculta la burbuja de CTAs', () => {
    mockAuth(true)
    renderWidget()
    fireEvent.click(screen.getByRole('button', { name: /abrir asistente ia/i }))
    expect(screen.queryByText('¿En qué te puedo ayudar?')).not.toBeInTheDocument()
  })

  it('limpiar borra el historial en memoria', async () => {
    mockAuth(true)
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ reply: 'Respuesta.', toolsUsed: [] }),
    })

    renderWidget()
    fireEvent.click(screen.getByRole('button', { name: /abrir asistente ia/i }))
    await userEvent.type(screen.getByPlaceholderText('Escribe tu pregunta…'), 'algo')
    fireEvent.click(screen.getByRole('button', { name: /enviar/i }))
    await waitFor(() => expect(screen.getByText('Respuesta.')).toBeInTheDocument())

    fireEvent.click(screen.getByRole('button', { name: /limpiar/i }))
    expect(screen.queryByText('algo')).not.toBeInTheDocument()
  })

  it('openWithContext (ej. desde RecomendacionesCard) abre el panel con el mensaje de contexto, sin llamar al backend', () => {
    mockAuth(true)

    function TriggerFromOutside() {
      const { openWithContext } = useAiChatContext()
      return (
        <button type="button" onClick={() => openWithContext('Contexto de MAPPI sobre pautas.')}>
          Preguntarle a MAPPI
        </button>
      )
    }

    render(
      <AiChatProvider>
        <TriggerFromOutside />
        <AiChatWidget />
      </AiChatProvider>,
    )

    fireEvent.click(screen.getByRole('button', { name: /preguntarle a mappi/i }))

    expect(screen.getByRole('dialog', { name: /asistente ia/i })).toBeInTheDocument()
    expect(screen.getByText('Contexto de MAPPI sobre pautas.')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Escribe tu pregunta…')).toHaveValue('')
    expect(global.fetch).not.toHaveBeenCalled()
  })
})
