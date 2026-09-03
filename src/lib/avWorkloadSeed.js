import { MAX_MESSAGE_LENGTH } from './aiChatHistory'

/**
 * Arma el mensaje de contexto que se siembra en el chat de MAPPI cuando César pulsa
 * "Preguntarle a MAPPI sobre esto" en RecomendacionesCard. Se manda como un mensaje
 * 'assistant' (ver useAiChat.seed / AiChatContext.openWithContext), en primera persona de
 * MAPPI, para que César pueda escribir su propia repregunta a continuación con el contexto
 * ya en el historial.
 *
 * @param {{ resumen?: string, hallazgos?: Array<{ persona?: string, detalle?: string, sugerencia?: string }> }} insight
 */
export function buildChatSeed(insight) {
  const resumen = insight?.resumen?.trim()
  const hallazgos = Array.isArray(insight?.hallazgos) ? insight.hallazgos : []

  const lines = ['Revisé la carga de Audiovisual de los últimos y próximos 3 días.']
  if (resumen) lines.push(resumen)
  for (const h of hallazgos) {
    if (!h?.persona) continue
    const detalle = h.detalle ? `: ${h.detalle}` : ''
    const sugerencia = h.sugerencia ? ` (${h.sugerencia})` : ''
    lines.push(`- ${h.persona}${detalle}${sugerencia}`)
  }
  lines.push('¿Qué quieres saber sobre esto?')

  return lines.join('\n').slice(0, MAX_MESSAGE_LENGTH)
}
