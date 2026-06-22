/**
 * Retorna el primer y último día del mes anterior en formato ISO YYYY-MM-DD.
 * `firstDay` es el valor que se guarda en `evaluation_sessions.period`.
 */
export default function getPastMonthRange() {
  const now = new Date()
  const firstDay = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const lastDay = new Date(now.getFullYear(), now.getMonth(), 0)
  return {
    firstDay: firstDay.toISOString().split('T')[0],
    lastDay: lastDay.toISOString().split('T')[0],
  }
}
