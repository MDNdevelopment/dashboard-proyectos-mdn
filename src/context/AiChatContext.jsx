import { createContext, useCallback, useContext, useState } from 'react'
import { useAiChat } from '../hooks/useAiChat'

const AiChatContext = createContext(null)

/**
 * Eleva el estado del chat de MAPPI (antes local a AiChatWidget) para que otros
 * componentes del Home (ej. RecomendacionesCard) puedan abrir el panel con contexto
 * precargado. Se monta una sola vez en AppLayout, por encima de AiChatWidget y del
 * <Outlet /> de las páginas.
 */
export function AiChatProvider({ children }) {
  const [open, setOpen] = useState(false)
  const chat = useAiChat()

  // Siembra el historial con un mensaje de MAPPI (sin enviarlo al backend, ver
  // useAiChat.seed) y abre el panel — el usuario escribe su propia pregunta encima.
  const openWithContext = useCallback(
    (text) => {
      chat.seed(text)
      setOpen(true)
    },
    [chat],
  )

  return (
    <AiChatContext.Provider value={{ ...chat, open, setOpen, openWithContext }}>
      {children}
    </AiChatContext.Provider>
  )
}

export function useAiChatContext() {
  return useContext(AiChatContext)
}
