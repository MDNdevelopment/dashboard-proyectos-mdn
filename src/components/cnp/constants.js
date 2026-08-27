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
  const piezas = inMonth.reduce((sum, c) => sum + cnpPieceCount(c), 0)
  const piezasEntregadas = inMonth.reduce((sum, c) => sum + cnpPiecesDelivered(c), 0)

  return { total, closed, pct, blocked, late, printPending, piezas, piezasEntregadas, inMonth }
}

/**
 * Cantidad de piezas de un CNP. `pieces` vacío o ausente significa 1 pieza (un solo
 * requerimiento = una sola pieza, el caso mayoritario) — ver migración
 * 20260905000000_cnp_pieces.sql. Solo cuando la jefa de línea indica una cantidad ≥ 2 se
 * materializa la lista.
 */
export function cnpPieceCount(cnp) {
  return Array.isArray(cnp?.pieces) && cnp.pieces.length ? cnp.pieces.length : 1
}

/**
 * Piezas entregadas de un CNP. Si el CNP ya está cerrado (isClosed), todas sus piezas
 * cuentan como entregadas sin importar el estado de sus checkboxes — el status del CNP es
 * la fuente de verdad de su cierre; los checkboxes son solo avance intermedio mientras
 * sigue abierto. Evita que un CNP cerrado con checkboxes sin tildar reste cumplimiento.
 */
export function cnpPiecesDelivered(cnp) {
  if (isClosed(cnp)) return cnpPieceCount(cnp)
  if (!Array.isArray(cnp?.pieces) || cnp.pieces.length === 0) return 0
  return cnp.pieces.filter((p) => p.done).length
}

/** Texto por defecto de una pieza: título del CNP + número consecutivo (1-based). */
export function autoPieceLabel(title, index) {
  return `${(title ?? '').trim() || 'Pieza'} ${index + 1}`
}

/**
 * Crece/recorta la lista de piezas a `count` elementos, preservando `done`/`label` de las
 * que ya existían (incluidas las editadas a mano) y generando las nuevas con
 * autoPieceLabel. count <= 1 devuelve [] (ver convención de cnpPieceCount).
 */
export function resizePieces(pieces, count, title) {
  const current = Array.isArray(pieces) ? pieces : []
  const n = Number(count) || 1
  if (n <= 1) return []
  if (n <= current.length) return current.slice(0, n)
  const grown = [...current]
  for (let i = current.length; i < n; i++) {
    grown.push({
      id: crypto.randomUUID(),
      label: autoPieceLabel(title, i),
      done: false,
      custom: false,
      content: '',
    })
  }
  return grown
}

/**
 * Regenera el label de las piezas que no fueron editadas a mano (custom !== true) cuando
 * cambia el título del CNP, para que el default siga al título mientras nadie lo toque.
 */
export function relabelAutoPieces(pieces, title) {
  if (!Array.isArray(pieces)) return pieces
  return pieces.map((p, i) => (p.custom ? p : { ...p, label: autoPieceLabel(title, i) }))
}
