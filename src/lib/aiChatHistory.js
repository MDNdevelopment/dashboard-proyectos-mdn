// Recorte del historial del chat IA. La conversación vive solo en memoria (estado de React):
// se pierde al recargar la página o navegar a otra pestaña, a propósito — sin backend ni
// localStorage de por medio.

export const MAX_MESSAGES = 20

/** Recorta el historial a los últimos `max` mensajes, garantizando que arranque en 'user'. */
export function trimHistory(messages, max = MAX_MESSAGES) {
  let trimmed = messages.slice(-max)
  const firstUserIdx = trimmed.findIndex((m) => m.role === 'user')
  if (firstUserIdx > 0) trimmed = trimmed.slice(firstUserIdx)
  return trimmed
}
