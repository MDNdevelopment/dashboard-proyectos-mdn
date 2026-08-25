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
import AiChatWidget from '../components/ai/AiChatWidget'

beforeEach(() => {
  vi.restoreAllMocks()
  global.fetch = vi.fn()
})

function mockAuth(admin) {
  useAuth.mockReturnValue({ userProfile: admin === null ? null : { user_id: 'u1', admin } })
}

describe('AiChatWidget', () => {
  it('no renderiza nada si el usuario no es admin', () => {
    mockAuth(false)
    const { container } = render(<AiChatWidget />)
    expect(container).toBeEmptyDOMElement()
  })

  it('no renderiza nada si userProfile es null (aún cargando)', () => {
    mockAuth(null)
    const { container } = render(<AiChatWidget />)
    expect(container).toBeEmptyDOMElement()
  })

  it('muestra el botón flotante para un admin', () => {
    mockAuth(true)
    render(<AiChatWidget />)
    expect(screen.getByRole('button', { name: /abrir asistente ia/i })).toBeInTheDocument()
  })

  it('abre y cierra el panel al hacer click en el FAB', async () => {
    mockAuth(true)
    render(<AiChatWidget />)
    fireEvent.click(screen.getByRole('button', { name: /abrir asistente ia/i }))
    expect(screen.getByRole('dialog', { name: /asistente ia/i })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /cerrar asistente ia/i }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('cierra el panel con Escape', () => {
    mockAuth(true)
    render(<AiChatWidget />)
    fireEvent.click(screen.getByRole('button', { name: /abrir asistente ia/i }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()

    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('muestra las preguntas sugeridas en el estado vacío', () => {
    mockAuth(true)
    render(<AiChatWidget />)
    fireEvent.click(screen.getByRole('button', { name: /abrir asistente ia/i }))
    expect(screen.getByText('¿Cómo va la empresa este mes?')).toBeInTheDocument()
  })

  it('envía un mensaje y muestra la respuesta del backend', async () => {
    mockAuth(true)
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ reply: 'La empresa va bien este mes.', toolsUsed: ['ranking_lineas'] }),
    })

    render(<AiChatWidget />)
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

    render(<AiChatWidget />)
    fireEvent.click(screen.getByRole('button', { name: /abrir asistente ia/i }))
    await userEvent.type(screen.getByPlaceholderText('Escribe tu pregunta…'), 'hola')
    fireEvent.click(screen.getByRole('button', { name: /enviar/i }))

    await waitFor(() => expect(screen.getByText('Alfa').tagName).toBe('STRONG'))
  })

  it('muestra un error cuando la respuesta no es ok', async () => {
    mockAuth(true)
    global.fetch.mockResolvedValue({ ok: false, json: async () => ({ error: 'Sin acceso' }) })

    render(<AiChatWidget />)
    fireEvent.click(screen.getByRole('button', { name: /abrir asistente ia/i }))
    await userEvent.type(screen.getByPlaceholderText('Escribe tu pregunta…'), 'hola')
    fireEvent.click(screen.getByRole('button', { name: /enviar/i }))

    await waitFor(() => expect(screen.getByText('Sin acceso')).toBeInTheDocument())
  })

  it('muestra un error de red', async () => {
    mockAuth(true)
    global.fetch.mockRejectedValue(new Error('network down'))

    render(<AiChatWidget />)
    fireEvent.click(screen.getByRole('button', { name: /abrir asistente ia/i }))
    await userEvent.type(screen.getByPlaceholderText('Escribe tu pregunta…'), 'hola')
    fireEvent.click(screen.getByRole('button', { name: /enviar/i }))

    await waitFor(() => expect(screen.getByText(/error de red/i)).toBeInTheDocument())
  })

  it('el historial vive solo en memoria: se pierde al desmontar y remontar', async () => {
    mockAuth(true)
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ reply: 'Respuesta.', toolsUsed: [] }),
    })

    const { unmount } = render(<AiChatWidget />)
    fireEvent.click(screen.getByRole('button', { name: /abrir asistente ia/i }))
    await userEvent.type(screen.getByPlaceholderText('Escribe tu pregunta…'), 'pregunta efímera')
    fireEvent.click(screen.getByRole('button', { name: /enviar/i }))
    await waitFor(() => expect(screen.getByText('Respuesta.')).toBeInTheDocument())
    unmount()

    render(<AiChatWidget />)
    fireEvent.click(screen.getByRole('button', { name: /abrir asistente ia/i }))
    expect(screen.queryByText('pregunta efímera')).not.toBeInTheDocument()
  })

  it('muestra la burbuja de CTAs con el estado inicial cerrado', () => {
    mockAuth(true)
    render(<AiChatWidget />)
    expect(screen.getByText('¿En qué te puedo ayudar?')).toBeInTheDocument()
    expect(screen.getByText('¿Cómo va la empresa este mes?')).toBeInTheDocument()
  })

  it('cierra la burbuja de CTAs con el botón de cerrar', () => {
    mockAuth(true)
    render(<AiChatWidget />)
    fireEvent.click(screen.getByRole('button', { name: /cerrar sugerencias/i }))
    expect(screen.queryByText('¿En qué te puedo ayudar?')).not.toBeInTheDocument()
  })

  it('un CTA abre el panel y envía la pregunta de inmediato', async () => {
    mockAuth(true)
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ reply: 'La empresa va bien.', toolsUsed: [] }),
    })

    render(<AiChatWidget />)
    fireEvent.click(screen.getByText('¿Cómo va la empresa este mes?'))

    expect(screen.getByRole('dialog', { name: /asistente ia/i })).toBeInTheDocument()
    expect(screen.queryByText('¿En qué te puedo ayudar?')).not.toBeInTheDocument()
    await waitFor(() => expect(screen.getByText('La empresa va bien.')).toBeInTheDocument())
  })

  it('abrir el panel con el FAB oculta la burbuja de CTAs', () => {
    mockAuth(true)
    render(<AiChatWidget />)
    fireEvent.click(screen.getByRole('button', { name: /abrir asistente ia/i }))
    expect(screen.queryByText('¿En qué te puedo ayudar?')).not.toBeInTheDocument()
  })

  it('limpiar borra el historial en memoria', async () => {
    mockAuth(true)
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ reply: 'Respuesta.', toolsUsed: [] }),
    })

    render(<AiChatWidget />)
    fireEvent.click(screen.getByRole('button', { name: /abrir asistente ia/i }))
    await userEvent.type(screen.getByPlaceholderText('Escribe tu pregunta…'), 'algo')
    fireEvent.click(screen.getByRole('button', { name: /enviar/i }))
    await waitFor(() => expect(screen.getByText('Respuesta.')).toBeInTheDocument())

    fireEvent.click(screen.getByRole('button', { name: /limpiar/i }))
    expect(screen.queryByText('algo')).not.toBeInTheDocument()
  })
})
