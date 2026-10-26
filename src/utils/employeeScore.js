/**
 * Evaluación automática de desempeño por empleado (ver ARQUITECTURA.md §2.7).
 * Núcleo de scoring: indicadores puros + orquestador. Los indicadores "básicos" (tareas,
 * cnp, grilla, calendario, metricas, artes, pautas, piezas_grabadas, fotos, edicion,
 * campanas, tickets) son los que usan los perfiles por cargo; los viejos (entregas,
 * puntualidad, arrastre, tareas_fijas, piezas_av, reuniones, chequeo) siguen disponibles
 * con peso 0 para leer snapshots ya congelados y para que un admin los vuelva a sumar. Ningún indicador conoce su
 * peso — devuelve qué tan bien lo hizo el empleado (`pct`, 0–1) y si tuvo volumen
 * suficiente para significar algo (`aplica`). El peso lo decide el perfil de cargo
 * (ver `employeeScoreProfiles.js`), que también redistribuye el peso de los
 * indicadores que no aplicaron — mismo mecanismo que `calcSolicitudes` en
 * `metricsScore.js`, generalizado a 9 fuentes.
 *
 * Puro: no toca Supabase ni el DOM. `ctx` trae todos los datos ya cargados por el
 * caller (ver `useEmployeeScores.js` / la RPC `employee_score_inputs`).
 */
import {
  isClosed,
  isLate,
  isBlocked,
  parseD,
  today,
  daysBetween,
  monthIndex,
  taskStartMonth,
  taskInMonth,
} from '../components/tareas/constants'
import { cnpInMonth, cnpPieceCount, cnpPiecesDelivered } from '../components/cnp/constants'
import { buildFixedWeeks, aggregateEmployeeFixedTasksByRole } from './fixedTasks'
import { computeAvailability, isInExcludedRange } from './employeeAvailability'
import { INDICATOR_KEYS, resolveProfile, effectiveWeights } from './employeeScoreProfiles'
import { getSlaThresholdHours } from '../components/tickets/slaUtils'
import {
  piezaUnidades,
  piezaListas,
  grabacionPorFormato,
  piezasPorFormato,
  FORMAT_GROUPS,
  FORMAT_KEYS,
} from './audiovisual'
import { computePlataformasProductividad } from './chequeo'
import { CHEQUEO_PRODUCTIVIDAD_START } from '../components/metricas/constants'

export { INDICATOR_KEYS }

/** Unidades mínimas de datos, por debajo de las cuales un score no es confiable. */
const MIN_UNITS_GLOBAL = 2
const MIN_APLICABLES = 1
const MIN_WEIGHT_BASE = 50

/**
 * Unidades mínimas para que cada indicador "aplique" en un mes. Exportado para que los
 * textos de la ficha ("se necesitan al menos 2 tareas") lean el mismo umbral que el cálculo.
 */
export const MIN_UNITS = {
  tareas: 2,
  cnp: 1,
  grilla: 2,
  calendario: 2,
  metricas: 2,
  artes: 2,
  pautas: 1,
  piezas_grabadas: 1,
  fotos: 1,
  edicion: 1,
  videos: 1,
  edicion_cnp: 1,
  plataformas: 1,
  campanas: 1,
  tickets: 3,
  entregas: 3,
  puntualidad: 3,
  arrastre: 3,
  tareas_fijas: 4,
  piezas_av: 3,
  reuniones: 2,
  chequeo: 2,
}

// ─── Helpers compartidos ────────────────────────────────────────────────────

function dueKey(dateStr) {
  return dateStr ?? null
}

/** true si el ítem debe excluirse del universo (su fecha de referencia cae en un
 * rango de indisponibilidad del empleado — vacaciones confirmadas o pre-ingreso). */
function isExcluded(dateStr, rangosExcluidos) {
  return isInExcludedRange(dueKey(dateStr), rangosExcluidos)
}

/** Índice de mes (año*12+mes0) de una fecha 'YYYY-MM-DD…', o null. */
function monthOf(dateStr) {
  const d = parseD((dateStr ?? '').slice(0, 10))
  return d ? monthIndex(d) : null
}

function result(key, { aplica, pct, unidades, detalle }) {
  return { key, aplica, pct: aplica ? pct : null, unidades, detalle }
}

// ─── 1. Entregas (tareas + CNP) ─────────────────────────────────────────────

/**
 * Cumplimiento de entregas, 50/50 entre tareas y CNP, con redistribución al 100%
 * si una de las dos fuentes no tuvo volumen ese mes (patrón `calcSolicitudes`).
 */
export function calcEntregas(ctx) {
  const { userId, monthIdx, tasks, cnp, disponibilidad } = ctx
  const rangos = disponibilidad?.rangosExcluidos ?? []

  const misTareas = (tasks ?? []).filter(
    (t) =>
      (t.assignee_ids ?? []).includes(userId) &&
      taskInMonth(t, monthIdx) &&
      !isExcluded(t.due_date, rangos),
  )
  const misCnp = (cnp ?? []).filter(
    (c) =>
      c.assignee_id === userId &&
      !c.deleted_at &&
      cnpInMonth(c, monthIdx) &&
      !isExcluded(c.due_date, rangos),
  )

  const tUniverso = misTareas.length
  const tCerradas = misTareas.filter(isClosed).length
  const cSolicitadas = misCnp.reduce((sum, c) => sum + cnpPieceCount(c), 0)
  const cEntregadas = misCnp.reduce((sum, c) => sum + cnpPiecesDelivered(c), 0)

  const tHas = tUniverso > 0
  const cHas = cSolicitadas > 0
  const unidades = tUniverso + cSolicitadas

  if (!tHas && !cHas) return result('entregas', { aplica: false, pct: null, unidades, detalle: {} })

  const tWeight = tHas ? 0.5 : 0
  const cWeight = cHas ? 0.5 : 0
  const extra = (tHas ? 0 : 0.5) + (cHas ? 0 : 0.5)
  const tFinal = tHas && !cHas ? tWeight + extra : tWeight
  const cFinal = cHas && !tHas ? cWeight + extra : cWeight

  const tScore = tHas ? (tCerradas / tUniverso) * tFinal : 0
  const cScore = cHas ? (cEntregadas / cSolicitadas) * cFinal : 0

  return result('entregas', {
    aplica: unidades >= MIN_UNITS.entregas,
    pct: tScore + cScore,
    unidades,
    detalle: { tUniverso, tCerradas, cSolicitadas, cEntregadas },
  })
}

// ─── 2. Puntualidad ──────────────────────────────────────────────────────────

/** Entrega a tiempo: due_date vs closed_date, tareas y CNP (si tiene closed_date). */
export function calcPuntualidad(ctx) {
  const { userId, monthIdx, tasks, cnp, disponibilidad } = ctx
  const rangos = disponibilidad?.rangosExcluidos ?? []

  const cerradasConFechas = []
  ;(tasks ?? [])
    .filter((t) => (t.assignee_ids ?? []).includes(userId) && taskInMonth(t, monthIdx))
    .forEach((t) => {
      if (isClosed(t) && t.due_date && t.closed_date && !isExcluded(t.due_date, rangos)) {
        cerradasConFechas.push({ due: t.due_date, closed: t.closed_date })
      }
    })
  ;(cnp ?? [])
    .filter((c) => c.assignee_id === userId && !c.deleted_at && cnpInMonth(c, monthIdx))
    .forEach((c) => {
      if (isClosed(c) && c.due_date && c.closed_date && !isExcluded(c.due_date, rangos)) {
        cerradasConFechas.push({ due: c.due_date, closed: c.closed_date })
      }
    })

  const total = cerradasConFechas.length
  if (total === 0)
    return result('puntualidad', { aplica: false, pct: null, unidades: 0, detalle: {} })

  const aTiempo = cerradasConFechas.filter(
    ({ due, closed }) => daysBetween(parseD(due), parseD(closed)) <= 0,
  ).length

  return result('puntualidad', {
    aplica: total >= MIN_UNITS.puntualidad,
    pct: aTiempo / total,
    unidades: total,
    detalle: { total, aTiempo },
  })
}

// ─── 3. Arrastre / bloqueo ───────────────────────────────────────────────────

/**
 * Tarea abierta que viene de un mes anterior al evaluado Y que ya debería haber cerrado:
 * una tarea larga que aún está en plazo (su due_date cae en un mes posterior) no es
 * arrastre, es trabajo en curso.
 */
function isDraggedAt(task, monthIdx) {
  if (isClosed(task)) return false
  const start = taskStartMonth(task)
  if (start === null || start >= monthIdx) return false
  const due = monthOf(task.due_date)
  return due === null || due <= monthIdx
}

/** Penaliza tareas arrastradas de meses anteriores o paralizadas. 0% → 1.0, ≥50% → 0. */
export function calcArrastre(ctx) {
  const { userId, monthIdx, tasks } = ctx
  const abiertas = (tasks ?? []).filter(
    (t) => (t.assignee_ids ?? []).includes(userId) && !isClosed(t),
  )
  const unidades = abiertas.length
  if (unidades === 0)
    return result('arrastre', { aplica: false, pct: null, unidades: 0, detalle: {} })

  const problematicas = abiertas.filter(
    (t) => isDraggedAt(t, monthIdx) || isBlocked(t) || isLate(t),
  ).length
  const ratio = problematicas / unidades
  const pct = Math.max(0, 1 - ratio / 0.5)

  return result('arrastre', {
    aplica: unidades >= MIN_UNITS.arrastre,
    pct,
    unidades,
    detalle: { unidades, problematicas },
  })
}

// ─── 4. Tareas fijas (por rol) ───────────────────────────────────────────────

export function calcTareasFijas(ctx) {
  const { userId, year, month, marks, clients } = ctx
  const weeks = buildFixedWeeks(year, month)
  // Filtrado defensivo por período: aggregateEmployeeFixedTasksByRole busca marcas por
  // (client_id, task_key, period_week) sin año/mes — si el caller pasara marcas de otro
  // mes, una semana 1 de agosto podría emparejarse con la semana 1 de septiembre por
  // coincidencia de period_week. La RPC ya filtra por período, pero no hay que confiar
  // en que todo caller lo haga.
  const periodMarks = (marks ?? []).filter(
    (m) => m.period_year === year && m.period_month === month,
  )
  const agg = aggregateEmployeeFixedTasksByRole(periodMarks, clients ?? [], weeks, userId, {
    year,
    month,
  })

  if (agg.meta === 0)
    return result('tareas_fijas', { aplica: false, pct: null, unidades: 0, detalle: agg })

  const cumplimiento = agg.cumplimientoPct ?? 0
  const puntual = agg.puntualPct ?? 0
  const pct = 0.6 * cumplimiento + 0.4 * puntual

  return result('tareas_fijas', {
    aplica: agg.meta >= MIN_UNITS.tareas_fijas,
    pct,
    unidades: agg.meta,
    detalle: agg,
  })
}

// ─── 5. Piezas audiovisuales ─────────────────────────────────────────────────

/** Unidades de piezas asignadas (editor_user_id) y las que están en 'listo', del mes. */
function piezasEditorStats(ctx) {
  const { userId, monthIdx, piezas } = ctx
  const misPiezas = (piezas ?? []).filter((p) => {
    if (p.editor_user_id !== userId) return false
    const d = parseD((p.created_at ?? '').slice(0, 10))
    return d ? d.getFullYear() * 12 + d.getMonth() === monthIdx : false
  })
  // Una fila puede ser un lote de N unidades (es_lote/cantidad/listas): se suman unidades,
  // no filas. Las canceladas no son trabajo pendiente ni hecho.
  const activas = misPiezas.filter((p) => p.status !== 'cancelado')
  return {
    unidades: activas.reduce((sum, p) => sum + piezaUnidades(p), 0),
    listas: activas.reduce((sum, p) => sum + piezaListas(p), 0),
  }
}

/** Piezas asignadas (editor_user_id) vs entregadas ('listo'), del mes. */
function calcPiezasEditor(key, minUnits, ctx) {
  const { unidades, listas } = piezasEditorStats(ctx)
  if (unidades === 0) return result(key, { aplica: false, pct: null, unidades: 0, detalle: {} })
  return result(key, {
    aplica: unidades >= minUnits,
    pct: listas / unidades,
    unidades,
    detalle: { unidades, listas },
  })
}

export const calcPiezasAv = (ctx) => calcPiezasEditor('piezas_av', MIN_UNITS.piezas_av, ctx)

// ─── 6. Reuniones ────────────────────────────────────────────────────────────

/** Asistencia a reuniones convocadas por terceros (anti auto-círculo). */
export function calcReuniones(ctx) {
  const { userId, monthIdx, meetings } = ctx
  const convocadas = (meetings ?? []).filter((m) => {
    if (!(m.attendee_ids ?? []).includes(userId)) return false
    if (m.created_by === userId) return false
    if (m.status === 'cancelada') return false
    const d = parseD((m.starts_at ?? '').slice(0, 10))
    return d ? d.getFullYear() * 12 + d.getMonth() === monthIdx : false
  })
  const unidades = convocadas.length
  if (unidades === 0)
    return result('reuniones', { aplica: false, pct: null, unidades: 0, detalle: {} })

  const realizadas = convocadas.filter((m) => m.status === 'realizada').length
  return result('reuniones', {
    aplica: unidades >= MIN_UNITS.reuniones,
    pct: realizadas / unidades,
    unidades,
    detalle: { unidades, realizadas },
  })
}

// ─── 7. Campañas ─────────────────────────────────────────────────────────────

/** Campañas pagadas con resultados cargados + campañas orgánicas por checklist. */
export function calcCampanas(ctx) {
  const { userId, monthIdx, paidCampaigns, campaigns } = ctx

  const misPagadas = (paidCampaigns ?? []).filter((c) => {
    if (c.responsable_id !== userId || c.status !== 'Finalizado') return false
    const d = parseD((c.updated_at ?? c.created_at ?? '').slice(0, 10))
    return d ? d.getFullYear() * 12 + d.getMonth() === monthIdx : false
  })
  const misOrganicas = (campaigns ?? []).filter((c) => {
    if (c.assignee !== userId) return false
    const d = parseD((c.created_at ?? '').slice(0, 10))
    return d ? d.getFullYear() * 12 + d.getMonth() === monthIdx : false
  })

  const pHas = misPagadas.length > 0
  const oHas = misOrganicas.length > 0
  const unidades = misPagadas.length + misOrganicas.length
  if (!pHas && !oHas)
    return result('campanas', { aplica: false, pct: null, unidades: 0, detalle: {} })

  const pWeight = pHas ? 0.5 : 0
  const oWeight = oHas ? 0.5 : 0
  const extra = (pHas ? 0 : 0.5) + (oHas ? 0 : 0.5)
  const pFinal = pHas && !oHas ? pWeight + extra : pWeight
  const oFinal = oHas && !pHas ? oWeight + extra : oWeight

  const pPct = pHas ? misPagadas.filter((c) => !c.results_pending).length / misPagadas.length : 0
  const oPct = oHas
    ? misOrganicas.reduce((sum, c) => {
        const items = Array.isArray(c.checklist) ? c.checklist : []
        if (!items.length) return sum
        return sum + items.filter((i) => i.done).length / items.length
      }, 0) / misOrganicas.length
    : 0

  return result('campanas', {
    aplica: unidades >= MIN_UNITS.campanas,
    pct: pPct * pFinal + oPct * oFinal,
    unidades,
    detalle: { misPagadas: misPagadas.length, misOrganicas: misOrganicas.length },
  })
}

// ─── 8. Chequeo de plataformas ───────────────────────────────────────────────

/** Celdas de chequeo (cuenta × red × tipo) publicadas por el empleado, del mes. */
export function calcChequeo(ctx) {
  const { userId, monthIdx, checks, clients } = ctx
  const misClientes = (clients ?? []).filter((c) => c.social_manager_id === userId)
  if (misClientes.length === 0)
    return result('chequeo', { aplica: false, pct: null, unidades: 0, detalle: {} })

  const clientIds = new Set(misClientes.map((c) => c.id))
  const misChecks = (checks ?? []).filter((ch) => {
    if (!clientIds.has(ch.client_id)) return false
    if (ch.updated_by !== userId) return false
    const d = parseD((ch.updated_at ?? '').slice(0, 10))
    return d ? d.getFullYear() * 12 + d.getMonth() === monthIdx : false
  })

  const unidades = misChecks.length
  if (unidades === 0)
    return result('chequeo', { aplica: false, pct: null, unidades: 0, detalle: {} })

  const conFecha = misChecks.filter((ch) => ch.last_published_at).length
  return result('chequeo', {
    aplica: unidades >= MIN_UNITS.chequeo,
    pct: conFecha / unidades,
    unidades,
    detalle: { unidades, conFecha },
  })
}

// ─── 9. Tickets (solo IT) ────────────────────────────────────────────────────

/** Tickets resueltos dentro de SLA. Solo aplica a `department_id = 0` (IT). */
export function calcTickets(ctx) {
  const { userId, monthIdx, tickets, department_id } = ctx
  if (String(department_id) !== '0') {
    return result('tickets', { aplica: false, pct: null, unidades: 0, detalle: {} })
  }

  const misTickets = (tickets ?? []).filter((t) => {
    if (t.assigned_to !== userId) return false
    const d = parseD((t.created_at ?? '').slice(0, 10))
    return d ? d.getFullYear() * 12 + d.getMonth() === monthIdx : false
  })
  const unidades = misTickets.length
  if (unidades === 0)
    return result('tickets', { aplica: false, pct: null, unidades: 0, detalle: {} })

  const enSla = misTickets.filter((t) => {
    if (!t.resolved_at) return false
    const ageHours = (new Date(t.resolved_at) - new Date(t.created_at)) / (1000 * 60 * 60)
    return ageHours <= getSlaThresholdHours(t.priority)
  }).length

  return result('tickets', {
    aplica: unidades >= MIN_UNITS.tickets,
    pct: enSla / unidades,
    unidades,
    detalle: { unidades, enSla },
  })
}

// ─── Indicadores básicos por cargo ──────────────────────────────────────────

/**
 * Cumplimiento por fecha de vencimiento: solo cuentan los ítems cuyo `due_date` cae en el
 * mes evaluado, así una tarea de varios meses se evalúa una sola vez (el mes en que vence)
 * y no se penaliza en los intermedios. Un ítem abierto que aún no vence es trabajo
 * pendiente, no incumplimiento: queda fuera hasta que pase su fecha.
 * @param {Array<{due:string, closed:boolean, closedDate:string|null}>} items
 */
function calcPorVencimiento(key, items, { minUnits, rangos, hoy, monthIdx }) {
  const universo = items.filter((it) => {
    if (!it.due || monthOf(it.due) !== monthIdx || isExcluded(it.due, rangos)) return false
    return it.closed || parseD(it.due) < hoy
  })
  const unidades = universo.length
  if (unidades === 0) return result(key, { aplica: false, pct: null, unidades: 0, detalle: {} })

  const aTiempo = universo.filter(
    (it) =>
      it.closed && (!it.closedDate || daysBetween(parseD(it.due), parseD(it.closedDate)) <= 0),
  ).length
  return result(key, {
    aplica: unidades >= minUnits,
    pct: aTiempo / unidades,
    unidades,
    detalle: { total: unidades, cumplidas: aTiempo },
  })
}

/** Tareas que vencen en el mes y se cerraron a tiempo. */
export function calcTareas(ctx) {
  const { userId, monthIdx, tasks, disponibilidad } = ctx
  const items = (tasks ?? [])
    .filter((t) => (t.assignee_ids ?? []).includes(userId))
    .map((t) => ({ due: t.due_date, closed: isClosed(t), closedDate: t.closed_date }))
  return calcPorVencimiento('tareas', items, {
    minUnits: MIN_UNITS.tareas,
    rangos: disponibilidad?.rangosExcluidos ?? [],
    hoy: ctx.today ?? today(),
    monthIdx,
  })
}

/** Solicitudes CNP que vencen en el mes y se cerraron a tiempo. */
export function calcCnp(ctx) {
  const { userId, monthIdx, cnp, disponibilidad } = ctx
  const items = (cnp ?? [])
    .filter((c) => c.assignee_id === userId && !c.deleted_at)
    .map((c) => ({ due: c.due_date, closed: isClosed(c), closedDate: c.closed_date }))
  return calcPorVencimiento('cnp', items, {
    minUnits: MIN_UNITS.cnp,
    rangos: disponibilidad?.rangosExcluidos ?? [],
    hoy: ctx.today ?? today(),
    monthIdx,
  })
}

/** Una tarea fija (grilla, calendario, métricas, artes): semanas cumplidas / meta. */
function calcFija(indicatorKey, taskKey, ctx) {
  const { userId, year, month, marks, clients } = ctx
  const weeks = buildFixedWeeks(year, month)
  // Mismo filtrado defensivo por período que calcTareasFijas.
  const periodMarks = (marks ?? []).filter(
    (m) => m.period_year === year && m.period_month === month,
  )
  const agg = aggregateEmployeeFixedTasksByRole(periodMarks, clients ?? [], weeks, userId, {
    year,
    month,
  })
  const { meta, si } = agg.byTaskKey[taskKey] ?? { meta: 0, si: 0 }
  if (meta === 0)
    return result(indicatorKey, { aplica: false, pct: null, unidades: 0, detalle: {} })
  return result(indicatorKey, {
    aplica: meta >= MIN_UNITS[indicatorKey],
    pct: si / meta,
    unidades: meta,
    detalle: { meta, si },
  })
}

export const calcGrilla = (ctx) => calcFija('grilla', 'grilla', ctx)
export const calcCalendario = (ctx) => calcFija('calendario', 'calendario', ctx)
export const calcMetricas = (ctx) => calcFija('metricas', 'metricas', ctx)
export const calcArtes = (ctx) => calcFija('artes', 'artes', ctx)

/**
 * Asistencia a pautas: de las pautas del mes donde el empleado es recurso, las que se
 * realizaron sobre las que ya pasaron su fecha (realizadas + programadas vencidas).
 * Declinadas y solicitadas (sin agendar) no cuentan.
 */
export function calcPautas(ctx) {
  const { userId, monthIdx, pautas, disponibilidad } = ctx
  const rangos = disponibilidad?.rangosExcluidos ?? []
  const hoy = ctx.today ?? today()
  const universo = (pautas ?? []).filter((p) => {
    if (p.deleted_at || !(p.recurso_ids ?? []).includes(userId)) return false
    if (monthOf(p.pauta_date) !== monthIdx || isExcluded(p.pauta_date, rangos)) return false
    if (p.status === 'realizada') return true
    return p.status === 'programada' && parseD(p.pauta_date) < hoy
  })
  const unidades = universo.length
  if (unidades === 0)
    return result('pautas', { aplica: false, pct: null, unidades: 0, detalle: {} })

  const realizadas = universo.filter((p) => p.status === 'realizada').length
  return result('pautas', {
    aplica: unidades >= MIN_UNITS.pautas,
    pct: realizadas / unidades,
    unidades,
    detalle: { unidades, realizadas },
  })
}

/**
 * Grabadas vs editadas de la persona: de las pautas `realizada` del mes donde es recurso,
 * cuántas piezas grabó ella (su cantidad en `grabacion_por_formato`) y cuántas de esas
 * quedaron editadas. La edición solo se registra por pauta y formato
 * (`piezas_por_formato.editadas / salieron`), así que a cada persona se le atribuye la
 * misma proporción sobre lo que ella grabó — repartir "todas las editadas de la pauta" a
 * cada recurso inflaría a quien grabó poco cuando varios van a la misma pauta. Una pauta
 * sin reparto o sin `salieron` cargado no se puede proporcionar y se omite.
 * @param {string[]} codes  formatos que cuenta el indicador (V, R, F)
 */
function calcGrabadasVsEditadas(key, codes, ctx) {
  const { userId, monthIdx, pautas, disponibilidad } = ctx
  const rangos = disponibilidad?.rangosExcluidos ?? []
  let grabadas = 0
  let editadas = 0
  let nPautas = 0
  for (const p of pautas ?? []) {
    if (p.deleted_at || p.status !== 'realizada') continue
    if (!(p.recurso_ids ?? []).includes(userId)) continue
    if (monthOf(p.pauta_date) !== monthIdx || isExcluded(p.pauta_date, rangos)) continue
    const reparto = grabacionPorFormato(p)
    const porFormato = piezasPorFormato(p)
    let cuenta = false
    for (const code of codes) {
      const mias = reparto[code]?.[userId] ?? 0
      const { salieron = 0, editadas: ed = 0 } = porFormato[code] ?? {}
      if (mias <= 0 || salieron <= 0) continue
      grabadas += mias
      editadas += mias * Math.min(1, ed / salieron)
      cuenta = true
    }
    if (cuenta) nPautas += 1
  }
  if (grabadas === 0) return result(key, { aplica: false, pct: null, unidades: 0, detalle: {} })
  return result(key, {
    aplica: grabadas >= MIN_UNITS[key],
    pct: editadas / grabadas,
    unidades: grabadas,
    detalle: { grabadas, editadas: Math.round(editadas), pautas: nPautas },
  })
}

export const calcPiezasGrabadas = (ctx) =>
  calcGrabadasVsEditadas('piezas_grabadas', FORMAT_KEYS, ctx)
export const calcFotos = (ctx) => calcGrabadasVsEditadas('fotos', FORMAT_GROUPS.foto, ctx)
export const calcVideos = (ctx) => calcGrabadasVsEditadas('videos', FORMAT_GROUPS.av, ctx)

/** Piezas pedidas por CNP audiovisual al empleado en el mes, y las ya entregadas. */
function cnpAudiovisualStats(ctx) {
  const { userId, monthIdx, cnp, disponibilidad } = ctx
  const rangos = disponibilidad?.rangosExcluidos ?? []
  const mios = (cnp ?? []).filter(
    (c) =>
      c.assignee_id === userId &&
      !c.deleted_at &&
      c.is_audiovisual &&
      cnpInMonth(c, monthIdx) &&
      !isExcluded(c.due_date, rangos),
  )
  return {
    solicitadas: mios.reduce((sum, c) => sum + cnpPieceCount(c), 0),
    entregadas: mios.reduce((sum, c) => sum + cnpPiecesDelivered(c), 0),
  }
}

/** Piezas de CNP audiovisual: entregadas / solicitadas (Creador de Contenido). */
export function calcEdicionCnp(ctx) {
  const { solicitadas, entregadas } = cnpAudiovisualStats(ctx)
  if (solicitadas === 0)
    return result('edicion_cnp', { aplica: false, pct: null, unidades: 0, detalle: {} })
  return result('edicion_cnp', {
    aplica: solicitadas >= MIN_UNITS.edicion_cnp,
    pct: entregadas / solicitadas,
    unidades: solicitadas,
    detalle: { solicitadas, entregadas },
  })
}

/**
 * Ediciones solicitadas vs editadas (quien edita, sin importar el cargo): piezas asignadas
 * como editor en pautas + piezas de CNP audiovisual asignadas, en el mismo cociente. Sin
 * medir puntualidad.
 */
export function calcEdicion(ctx) {
  const piezas = piezasEditorStats(ctx)
  const cnp = cnpAudiovisualStats(ctx)
  const unidades = piezas.unidades + cnp.solicitadas
  if (unidades === 0)
    return result('edicion', { aplica: false, pct: null, unidades: 0, detalle: {} })
  const listas = piezas.listas + cnp.entregadas
  return result('edicion', {
    aplica: unidades >= MIN_UNITS.edicion,
    pct: listas / unidades,
    unidades,
    detalle: { unidades, listas, piezas: piezas.unidades, cnp: cnp.solicitadas },
  })
}

/**
 * Actualización de plataformas (Social Media): cobertura de las celdas de Chequeo del mes
 * (cuenta × red × tipo) de las cuentas que lleva, sobre la meta mensual — misma fórmula que
 * la fila "Actualización de Plataformas" del reporte (`computePlataformasProductividad`),
 * aplicada solo a sus cuentas. Una celda nunca registrada cuenta en la meta pero no en lo
 * realizado. Desde 2026-09, cuando el reporte adoptó este modelo.
 */
export function calcPlataformas(ctx) {
  const { userId, year, month, checks, clients } = ctx
  const noAplica = result('plataformas', { aplica: false, pct: null, unidades: 0, detalle: {} })
  const { year: y0, month: m0 } = CHEQUEO_PRODUCTIVIDAD_START
  if (year < y0 || (year === y0 && month < m0)) return noAplica

  const mias = (clients ?? []).filter((c) => c.social_manager_id === userId && !c.deleted_at)
  const ids = new Set(mias.map((c) => c.id))
  const delMes = (checks ?? []).filter(
    (ch) => ids.has(ch.client_id) && ch.period_year === year && ch.period_month === month,
  )
  const { realizado, meta } = computePlataformasProductividad(
    delMes,
    mias,
    buildFixedWeeks(year, month),
  )
  if (meta === 0) return noAplica
  return result('plataformas', {
    aplica: meta >= MIN_UNITS.plataformas,
    pct: realizado / meta,
    unidades: meta,
    detalle: { realizado, meta },
  })
}

// ─── Orquestador ─────────────────────────────────────────────────────────────

export const INDICATORS = [
  { key: 'tareas', label: 'Tareas', calc: calcTareas },
  { key: 'cnp', label: 'CNP', calc: calcCnp },
  { key: 'grilla', label: 'Grilla', calc: calcGrilla },
  { key: 'calendario', label: 'Calendario', calc: calcCalendario },
  { key: 'metricas', label: 'Métricas', calc: calcMetricas },
  { key: 'plataformas', label: 'Actualización de plataformas', calc: calcPlataformas },
  { key: 'artes', label: 'Artes fijos', calc: calcArtes },
  { key: 'pautas', label: 'Pautas asistidas', calc: calcPautas },
  { key: 'piezas_grabadas', label: 'Piezas grabadas vs editadas', calc: calcPiezasGrabadas },
  { key: 'fotos', label: 'Fotos capturadas vs editadas', calc: calcFotos },
  { key: 'videos', label: 'Videos capturados vs editados', calc: calcVideos },
  { key: 'edicion_cnp', label: 'Piezas solicitadas vs editadas (CNP)', calc: calcEdicionCnp },
  { key: 'edicion', label: 'Ediciones solicitadas vs editadas', calc: calcEdicion },
  { key: 'campanas', label: 'Campañas con resultados', calc: calcCampanas },
  { key: 'tickets', label: 'Tickets IT en SLA', calc: calcTickets },
  // Indicadores anteriores: peso 0 en los perfiles actuales, siguen para snapshots viejos.
  { key: 'entregas', label: 'Cumplimiento de entregas', calc: calcEntregas },
  { key: 'puntualidad', label: 'Entrega a tiempo', calc: calcPuntualidad },
  { key: 'arrastre', label: 'No arrastre / no bloqueo', calc: calcArrastre },
  { key: 'tareas_fijas', label: 'Tareas fijas', calc: calcTareasFijas },
  { key: 'piezas_av', label: 'Piezas audiovisuales', calc: calcPiezasAv },
  { key: 'reuniones', label: 'Asistencia a reuniones', calc: calcReuniones },
  { key: 'chequeo', label: 'Chequeo de plataformas', calc: calcChequeo },
]

/**
 * % de tareas/CNP del empleado que él mismo creó (posible auto-círculo: asignarse
 * trabajo a sí mismo para inflar el indicador de entregas).
 */
function computeAutoCirculoPct(ctx) {
  const { userId, monthIdx, tasks, cnp } = ctx
  const misTareas = (tasks ?? []).filter(
    (t) => (t.assignee_ids ?? []).includes(userId) && taskInMonth(t, monthIdx),
  )
  const misCnp = (cnp ?? []).filter(
    (c) => c.assignee_id === userId && !c.deleted_at && cnpInMonth(c, monthIdx),
  )
  const total = misTareas.length + misCnp.length
  if (total === 0) return null
  const propias =
    misTareas.filter((t) => t.created_by === userId).length +
    misCnp.filter((c) => c.created_by === userId).length
  return propias / total
}

/**
 * Calcula el score 0-100 de un empleado en un mes, dado el contexto de datos y los
 * pesos de su perfil de cargo.
 *
 * @param {object} ctx      ver los calcX de arriba para las claves esperadas, más
 *                          {userId, year, month, monthIdx, department_id, disponibilidad}
 * @param {Record<string,number>} weights  pesos base del perfil (`employee_score_profiles.weights`)
 * @returns {{
 *   score: number|null, estado: 'ok'|'parcial'|'sin_datos',
 *   breakdown: Array<{key,label,aplica,pct,pesoBase,pesoEfectivo,puntos,unidades,detalle}>,
 *   disponibilidad: number, cobertura: number, enRanking: boolean, autoCirculoPct: number|null,
 * }}
 */
export function computeEmployeeScore(ctx, weights) {
  const results = INDICATORS.map(({ key, calc }) => calc(ctx))
  const effective = effectiveWeights(weights, results)

  const pesoBaseAplicables = results
    .filter((r) => r.aplica && Number(weights?.[r.key] ?? 0) > 0)
    .reduce((sum, r) => sum + Number(weights[r.key]), 0)
  const nAplicables = results.filter((r) => r.aplica && Number(weights?.[r.key] ?? 0) > 0).length

  const breakdown = INDICATORS.map(({ key, label }, i) => {
    const r = results[i]
    const pesoBase = Number(weights?.[key] ?? 0)
    const pesoEfectivo = effective[key] ?? 0
    const puntos = r.aplica ? (r.pct ?? 0) * pesoEfectivo : 0
    return {
      key,
      label,
      aplica: r.aplica,
      pct: r.pct,
      pesoBase,
      pesoEfectivo,
      puntos,
      unidades: r.unidades,
      detalle: r.detalle,
    }
  })

  const unidadesTotales = results.reduce((sum, r) => sum + (r.unidades ?? 0), 0)
  const sinDatos =
    pesoBaseAplicables < MIN_WEIGHT_BASE ||
    unidadesTotales < MIN_UNITS_GLOBAL ||
    nAplicables < MIN_APLICABLES

  const disponibilidad = ctx.disponibilidad?.factor ?? 1
  const autoCirculoPct = computeAutoCirculoPct(ctx)

  let estado = 'ok'
  if (sinDatos) estado = 'sin_datos'
  else if (disponibilidad < 0.5 || ctx.onProbation) estado = 'parcial'

  const score = sinDatos
    ? null
    : Math.min(100, Math.round(breakdown.reduce((sum, b) => sum + b.puntos, 0) * 10) / 10)

  const enRanking =
    !sinDatos && estado !== 'parcial' && !(autoCirculoPct != null && autoCirculoPct > 0.6)

  return {
    score,
    estado,
    breakdown,
    disponibilidad,
    cobertura: pesoBaseAplicables,
    enRanking,
    autoCirculoPct,
  }
}

/**
 * Calcula el score de todos los empleados dados, indexando cada colección de datos
 * por userId una sola vez (O(N+M), sin N+1 por empleado).
 *
 * @param {Array} users   empleados activos a evaluar, con {user_id, position_id,
 *                        department_id, access_level, hire_date, on_probation}
 * @param {object} inputs colecciones crudas: {tasks, cnp, marks, clients, piezas,
 *                        pautas, meetings, campaigns, paidCampaigns, checks, tickets, vacations}
 * @param {Array} profiles  employee_score_profiles de la empresa
 * @param {{year:number, month:number, monthIdx:number}} period
 * @returns {Map<string, ReturnType<typeof computeEmployeeScore>>}
 */
export function computeAllEmployeeScores(users, inputs, profiles, period) {
  const vacationsByUser = new Map()
  ;(inputs.vacations ?? []).forEach((v) => {
    const list = vacationsByUser.get(v.user_id) ?? []
    list.push(v)
    vacationsByUser.set(v.user_id, list)
  })

  const scores = new Map()
  for (const user of users) {
    const disponibilidad = computeAvailability(
      user,
      vacationsByUser.get(user.user_id) ?? [],
      period.year,
      period.month,
    )
    const profile = resolveProfile(user, profiles)
    const ctx = {
      ...inputs,
      userId: user.user_id,
      year: period.year,
      month: period.month,
      monthIdx: period.monthIdx,
      department_id: user.department_id,
      disponibilidad,
      onProbation: !!user.on_probation,
    }
    scores.set(user.user_id, computeEmployeeScore(ctx, profile?.weights ?? {}))
  }
  return scores
}
