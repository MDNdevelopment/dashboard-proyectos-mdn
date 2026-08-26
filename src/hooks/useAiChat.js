import { useState, useCallback, useRef } from 'react'
import { supabase } from '../supabase'
import { trimHistory } from '../lib/aiChatHistory'

/**
 * Estado y llamada de red del chat IA (ver netlify/functions/ai-chat.js). Conversación en
 * memoria únicamente (sin localStorage): se reinicia al recargar la página. Mismo patrón de
 * fetch autenticado que src/components/home/CeoAnalysisCard.jsx: token de la sesión activa,
 * manejo separado de error de red / JSON inválido / respuesta con error.
 */
export function useAiChat() {
  const [messages, setMessages] = useState([])
  const [sending, setSending] = useState(false)
  const [error, setError] = useState(null)
  const messagesRef = useRef(messages)
  messagesRef.current = messages

  const send = useCallback(
    async (text) => {
      const trimmedText = text.trim()
      if (!trimmedText || sending) return

      setError(null)
      const userMessage = { role: 'user', text: trimmedText }
      const historyForRequest = trimHistory([...messagesRef.current, userMessage])
      setMessages(historyForRequest)
      setSending(true)

      const {
        data: { session },
      } = await supabase.auth.getSession()

      let res
      try {
        res = await fetch('/api/ai-chat', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session?.access_token}`,
          },
          body: JSON.stringify({ messages: historyForRequest }),
        })
      } catch {
        setError('Error de red. Intenta de nuevo.')
        setSending(false)
        return
      }

      const resForDebug = typeof res.clone === 'function' ? res.clone() : null
      let payload
      try {
        payload = await res.json()
      } catch {
        if (resForDebug) {
          const bodyPreview = await resForDebug.text().catch(() => '(no se pudo leer el body)')
          console.error('[MAPPI] Respuesta no-JSON del servidor', {
            status: res.status,
            statusText: res.statusText,
            bodyPreview: bodyPreview.slice(0, 500),
          })
        }
        const isTimeout = [502, 503, 504, 408].includes(res.status)
        setError(
          isTimeout
            ? 'El servidor tardó demasiado en responder. Intenta de nuevo.'
            : 'Respuesta inválida del servidor. Intenta de nuevo.',
        )
        setSending(false)
        return
      }

      if (!res.ok) {
        setError(payload.error ?? 'Error al generar la respuesta')
        setSending(false)
        return
      }

      setMessages((prev) => trimHistory([...prev, { role: 'assistant', text: payload.reply }]))
      setSending(false)
    },
    [sending],
  )

  const clear = useCallback(() => {
    setMessages([])
    setError(null)
  }, [])

  return { messages, sending, error, send, clear }
}
