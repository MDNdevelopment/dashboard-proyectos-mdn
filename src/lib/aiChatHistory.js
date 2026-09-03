// Recorte del historial del chat IA. La conversación vive solo en memoria (estado de React):
// se pierde al recargar la página o navegar a otra pestaña, a propósito — sin backend ni
// localStorage de por medio.

export const MAX_MESSAGES = 20

// Debe coincidir con MAX_MESSAGE_LENGTH de netlify/functions/ai-chat.js: el backend
// rechaza con 400 cualquier mensaje de más de 2000 caracteres.
export const MAX_MESSAGE_LENGTH = 2000

/**
 * Recorta el historial a los últimos `max` mensajes. Si el corte deja un mensaje de
 * 'assistant' huérfano al inicio (su 'user' correspondiente quedó fuera del recorte), lo
 * descarta también.
 *
 * Cuando NO hubo corte (el array ya cabía completo), un 'assistant' inicial se conserva tal
 * cual: es el caso de un mensaje de contexto "sembrado" por MAPPI (ver
 * AiChatContext.openWithContext) antes de que el usuario escriba nada — no es un huérfano,
 * es intencional.
 */
export function trimHistory(messages, max = MAX_MESSAGES) {
  const trimmed = messages.slice(-max)
  if (trimmed.length === messages.length) return trimmed
  const firstUserIdx = trimmed.findIndex((m) => m.role === 'user')
  return firstUserIdx > 0 ? trimmed.slice(firstUserIdx) : trimmed
}
