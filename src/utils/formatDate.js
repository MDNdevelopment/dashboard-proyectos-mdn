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

/**
 * Formatea un ISO string / Date a hora 12h "2:30 P.M." (mismo estilo de salida que
 * formatTime12() de audiovisual.js, pero a partir de un timestamp/Date en vez de un
 * valor `time` de Postgres). Devuelve '' si el valor es vacío o inválido.
 */
export function fmtTime12(value) {
  const d = value instanceof Date ? value : value ? new Date(value) : null
  if (!d || isNaN(d)) return ''
  let h = d.getHours()
  const m = d.getMinutes()
  const ap = h < 12 ? 'A.M.' : 'P.M.'
  h = h % 12
  if (h === 0) h = 12
  return `${h}:${String(m).padStart(2, '0')} ${ap}`
}

/**
 * Convierte una fecha ISO "solo fecha" (YYYY-MM-DD) a texto DD/MM/YYYY para
 * mostrarla en un campo editable. A diferencia de fmtDate(), no normaliza a
 * mediodía UTC porque aquí interesa el valor tal cual, sin ambigüedad de zona
 * horaria (es una fecha pura, no un timestamp).
 */
export function isoToDdmmyyyy(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? '')
  if (!m) return ''
  const [, y, mo, d] = m
  return `${d}/${mo}/${y}`
}

/**
 * Parsea un texto DD/MM/YYYY (venezolano) a ISO YYYY-MM-DD.
 * Devuelve null si el texto no representa una fecha calendario válida
 * (incluye rechazo de fechas como 31/02/2026).
 */
export function parseDdmmyyyy(text) {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec((text ?? '').trim())
  if (!m) return null
  const day = Number(m[1]),
    month = Number(m[2]),
    year = Number(m[3])
  if (month < 1 || month > 12 || day < 1 || day > 31) return null
  const daysInMonth = new Date(year, month, 0).getDate()
  if (day > daysInMonth) return null
  const pad = (n) => String(n).padStart(2, '0')
  return `${year}-${pad(month)}-${pad(day)}`
}
