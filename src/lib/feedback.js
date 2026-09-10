/**
 * Lógica pura del buzón anónimo de sugerencias y errores (tabla `anonymous_feedback`).
 * Ver ARQUITECTURA.md → módulo "Buzón anónimo".
 */

export const FEEDBACK_TYPES = [
  { key: 'recomendacion', label: 'Recomendación' },
  { key: 'error', label: 'Reporte de error' },
]

// Meta compatible con <StatusPill> (src/components/common/StatusPill.jsx): clases
// Tailwind literales, nunca construidas en runtime (Tailwind JIT no las generaría).
export const FEEDBACK_STATUS_META = {
  nuevo: { label: 'Nuevo', bg: 'bg-[#FFF4CC]', text: 'text-[#6b5900]', dot: 'bg-[#FFB800]' },
  en_revision: {
    label: 'En revisión',
    bg: 'bg-[#E8F0FC]',
    text: 'text-[#2c5aa0]',
    dot: 'bg-[#4A90D9]',
  },
  resuelto: { label: 'Resuelto', bg: 'bg-[#E4F5EA]', text: 'text-[#1e7a45]', dot: 'bg-[#2E9E5B]' },
  descartado: { label: 'Descartado', bg: 'bg-[#f0efe9]', text: 'text-[#888]', dot: 'bg-[#999]' },
}
export const FEEDBACK_STATUSES = Object.keys(FEEDBACK_STATUS_META)

const TYPE_KEYS = FEEDBACK_TYPES.map((t) => t.key)
const MIN_MESSAGE_LENGTH = 10
const MAX_MESSAGE_LENGTH = 2000

export function feedbackTypeLabel(type) {
  return FEEDBACK_TYPES.find((t) => t.key === type)?.label ?? type
}

/**
 * Valida el formulario antes de enviarlo. No valida `area` (opcional, libre).
 * @returns {{ ok: boolean, error?: string }}
 */
export function validateFeedback({ type, message }) {
  if (!TYPE_KEYS.includes(type)) {
    return { ok: false, error: 'Elegí si es una recomendación o un reporte de error.' }
  }
  const trimmed = (message ?? '').trim()
  if (trimmed.length < MIN_MESSAGE_LENGTH) {
    return { ok: false, error: `Escribí al menos ${MIN_MESSAGE_LENGTH} caracteres.` }
  }
  if (trimmed.length > MAX_MESSAGE_LENGTH) {
    return { ok: false, error: `El mensaje no puede superar los ${MAX_MESSAGE_LENGTH} caracteres.` }
  }
  return { ok: true }
}

/**
 * Construye la fila a insertar en `anonymous_feedback`.
 *
 * IMPORTANTE: esta función es la garantía de anonimato del feature — nunca debe incluir
 * user_id, email, nombre ni ningún otro campo que permita identificar al autor. La tabla
 * tampoco tiene columna para eso, pero esta función es el único punto de escritura y debe
 * mantenerse así aunque cambie el resto del formulario.
 */
export function buildFeedbackRow({ type, area, message, companyId }) {
  return {
    company_id: companyId,
    type,
    area: area?.trim() ? area.trim() : null,
    message: message.trim(),
  }
}
