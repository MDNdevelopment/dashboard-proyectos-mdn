import { clientInMonth } from './clientInMonth'

/**
 * Serie mensual de actividad de clientes para un año dado.
 * Reusa clientInMonth (misma definición de "activo en el mes" que el resto del
 * sistema: alta = mdn_since ?? created_at, baja = contract_end ?? deleted_at,
 * con baja_incluye_mes cuando la baja viene de un archivado sin fin de contrato).
 *
 * Para cada mes 1-12 devuelve:
 *   activos — cuántos clientes estuvieron activos ese mes
 *   altas   — cuántos clientes iniciaron ese mes (mdn_since ?? created_at)
 *   bajas   — cuántos clientes terminaron ese mes (contract_end ?? deleted_at,
 *             respetando baja_incluye_mes cuando aplica), con el detalle
 *             { id, name, reason } de cada uno
 *   netos   — altas - bajas
 *
 * Todas las comparaciones son en UTC, igual que clientInMonth.
 */
export function clientsPerMonth(clients = [], year) {
  const months = []
  for (let month = 1; month <= 12; month++) {
    const startOfMonth = Date.UTC(year, month - 1, 1)
    const endOfMonth = Date.UTC(year, month, 0, 23, 59, 59, 999)

    let activos = 0
    let altas = 0
    const bajasList = []

    for (const c of clients) {
      if (clientInMonth(c, year, month)) activos++

      const altaMs = new Date(c.mdn_since ?? c.created_at).getTime()
      if (altaMs >= startOfMonth && altaMs <= endOfMonth) altas++

      const baja = c.contract_end ?? c.deleted_at
      if (!baja) continue
      const bajaDate = new Date(baja)
      // Igual criterio que clientInMonth: contract_end siempre cuenta su mes;
      // para deleted_at se respeta baja_incluye_mes (default true). Si no cuenta
      // el mes de la fecha registrada, la baja "efectiva" es el mes siguiente
      // (Date.UTC normaliza el rollover de año automáticamente).
      const cuentaEsteMes = c.contract_end != null ? true : c.baja_incluye_mes !== false
      const efectiva = cuentaEsteMes
        ? bajaDate
        : new Date(Date.UTC(bajaDate.getUTCFullYear(), bajaDate.getUTCMonth() + 1, 1))
      const esMesDeBaja = efectiva.getUTCFullYear() === year && efectiva.getUTCMonth() + 1 === month
      if (esMesDeBaja) {
        bajasList.push({ id: c.id, name: c.name, reason: c.contract_end_reason ?? null })
      }
    }

    months.push({
      month,
      activos,
      altas,
      bajas: bajasList.length,
      bajasDetalle: bajasList,
      netos: altas - bajasList.length,
    })
  }
  return months
}
