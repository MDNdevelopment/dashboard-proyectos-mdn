/**
 * Prorrateo del ingreso mensual (monthly_fee) de una cuenta el mes en que se mueve
 * de una línea a otra.
 *
 * Regla: la cuenta pertenece a la línea VIEJA los días 1..(effectiveDay-1) y a la
 * línea NUEVA desde effectiveDay hasta fin de mes. El ingreso del mes se reparte
 * proporcional a los días en cada línea.
 *
 *   díasVieja = effectiveDay - 1
 *   díasNueva = totalDays - díasVieja
 *
 * El monto nuevo se calcula como (fee - montoViejo) para que la suma sea SIEMPRE
 * exactamente el fee, sin desviación por redondeo.
 */

/** Días del mes (1-12) en un año dado, en UTC. */
export function daysInMonth(year, month) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

/**
 * Primer día del mes SIGUIENTE al de `today`, como ISO 'YYYY-MM-01'.
 * Se usa para programar un cambio de línea diferido (efectivo el próximo mes).
 * @param {Date} [today] - default: hoy (inyectable para tests).
 */
export function firstOfNextMonthISO(today = new Date()) {
  let y = today.getFullYear()
  let m = today.getMonth() + 1 // 1-12
  m += 1
  if (m > 12) {
    m = 1
    y += 1
  }
  return `${y}-${String(m).padStart(2, '0')}-01`
}

function round2(n) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100
}

/**
 * @param {number} monthlyFee  - Mensualidad de la cuenta (USD).
 * @param {number} effectiveDay - Día (1..totalDays) en que la cuenta empieza en la línea nueva.
 * @param {number} totalDays   - Días totales del mes (usar daysInMonth()).
 * @returns {{ totalDays:number, oldDays:number, newDays:number, oldAmount:number, newAmount:number }}
 */
export function prorateMonthlyFee(monthlyFee, effectiveDay, totalDays) {
  const fee = Number(monthlyFee) || 0
  const total = Number(totalDays) || 0
  // Clamp del día efectivo a [1, totalDays+1]: día 1 = todo a la nueva;
  // día totalDays+1 (mudanza tras fin de mes) = todo a la vieja.
  const day = Math.max(1, Math.min(Number(effectiveDay) || 1, total + 1))
  const oldDays = day - 1
  const newDays = total - oldDays
  const oldAmount = total > 0 ? round2((fee * oldDays) / total) : 0
  const newAmount = round2(fee - oldAmount)
  return { totalDays: total, oldDays, newDays, oldAmount, newAmount }
}
