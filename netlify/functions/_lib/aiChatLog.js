// Registro de cada pregunta que le hacen a MAPPI, en la tabla mappi_chat_logs (ver migración
// supabase/migrations/20260920000000_create_mappi_chat_logs.sql). Convierte "la gente avisa por
// WhatsApp cuando MAPPI no sabe responder" en un backlog consultable (panel Empresa → MAPPI).
//
// Nunca debe romper la respuesta al usuario: ai-chat.js llama esto después de tener la
// respuesta final y solo loguea el error si falla, en vez de propagarlo.
import { supabase } from './supabase.js'

/**
 * @param {{ companyId: string, userId: string, question: string, reply: string|null,
 *   toolsUsed: string[], outcome: 'respondida'|'sin_cobertura'|'error'|'timeout' }} entry
 */
export async function logChatInteraction({
  companyId,
  userId,
  question,
  reply,
  toolsUsed,
  outcome,
}) {
  try {
    const { error } = await supabase.from('mappi_chat_logs').insert({
      company_id: companyId,
      user_id: userId,
      question,
      reply: reply ?? null,
      tools_used: toolsUsed ?? [],
      outcome,
    })
    if (error) console.error('Error guardando log de MAPPI:', error.message)
  } catch (err) {
    console.error('Error guardando log de MAPPI:', err.message)
  }
}
