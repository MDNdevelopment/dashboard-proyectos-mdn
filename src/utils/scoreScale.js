/**
 * Etiqueta cualitativa de un score (0–5) para mostrar al usuario.
 * @param {number|null} n
 * @returns {string}
 */
export function representScore(n) {
  if (n == null) return '—'
  if (n <= 1) return 'Deficiente'
  if (n <= 2) return 'Irregular'
  if (n <= 3) return 'Aceptable'
  if (n < 4.5) return 'Bueno'
  return 'Excelente'
}

/**
 * Etiqueta de frecuencia para el promedio de una pregunta individual (1–5).
 * @param {number|null} n
 * @returns {string}
 */
export function formatScore(n) {
  if (n == null) return '—'
  if (n <= 1) return 'Nunca'
  if (n <= 2) return 'Muy poco'
  if (n <= 3) return 'A veces'
  if (n <= 4) return 'Muchas veces'
  return 'Siempre'
}

/**
 * Clases Tailwind de color de fondo + texto según el score (0–5).
 * @param {number|null} n
 * @returns {{ bg: string, text: string }}
 */
export function scoreColor(n) {
  if (n == null) return { bg: 'bg-[#f0ede3]', text: 'text-[#aaa]' }
  if (n >= 4) return { bg: 'bg-green-100', text: 'text-green-700' }
  if (n >= 3) return { bg: 'bg-amber-100', text: 'text-amber-700' }
  return { bg: 'bg-red-100', text: 'text-red-600' }
}
