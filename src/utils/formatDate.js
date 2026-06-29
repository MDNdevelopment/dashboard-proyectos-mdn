/**
 * Formatea una cadena ISO (timestamp o fecha) al formato local DD/MM/YYYY.
 * Devuelve '' si el valor es vacío, nulo o inválido.
 *
 * Nota: las cadenas de solo fecha (YYYY-MM-DD) se parsean como medianoche UTC,
 * lo que puede dar el día anterior en zonas UTC-. Se normaliza a mediodía UTC
 * para evitar el desfase.
 */
export function fmtDate(iso) {
  if (!iso) return ''
  const normalized = /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso + 'T12:00:00Z' : iso
  const d = new Date(normalized)
  if (isNaN(d)) return ''
  return d.toLocaleDateString('es-VE', { day: '2-digit', month: '2-digit', year: 'numeric' })
}
