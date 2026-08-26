// Los CNP reutilizan el mismo ciclo de estados y colores que Gestión de Tareas
// (src/components/tareas/constants.js), para no duplicar la paleta ni confundir al
// equipo con dos sistemas de estados distintos en módulos hermanos.
import { ESTADOS, COL_META, isClosed, isBlocked, isLate } from '../tareas/constants'

export { ESTADOS, COL_META }

/**
 * Un CNP pertenece al mes en que fue solicitado (created_at). A diferencia de
 * taskInMonth (tareas), los CNP no tienen request_date/closed_date ni concepto de
 * "arrastre" entre meses — created_at es la única fecha de referencia.
 */
export function cnpInMonth(cnp, monthIdx) {
  if (!cnp?.created_at) return false
  const d = new Date(cnp.created_at)
  return d.getFullYear() * 12 + d.getMonth() === monthIdx
}

/**
 * Estadísticas de un conjunto de CNP para el dashboard, con el mismo criterio que
 * teamMonthStats (Gestión de Tareas): total/cerrados/pct se acotan al mes activo,
 * pero paralizados/retrasados/impresión-pendiente cuentan sobre todo el scope (no
 * solo el mes), porque son alertas operativas vigentes, no un corte contable.
 */
export function cnpMonthStats(cnps, monthIdx) {
  const all = cnps ?? []
  const inMonth = all.filter((c) => cnpInMonth(c, monthIdx))
  const total = inMonth.length
  const closed = inMonth.filter(isClosed).length
  const pct = total ? Math.round((closed / total) * 100) : 0
  const blocked = all.filter(isBlocked).length
  const late = all.filter(isLate).length
  // Impresión pendiente: cualquier CNP marcado como impreso que aún no tiene la
  // aprobación de impresión, sin importar si ya pasó el check del equipo — antes se
  // exigía team_checked_at, lo que ocultaba los que ni siquiera llegaron a ese paso.
  const printPending = all.filter((c) => c.is_print && !c.print_approved_at).length

  return { total, closed, pct, blocked, late, printPending, inMonth }
}
