/**
 * "Reporte guardado + fuentes derivadas → reporte efectivo": el mismo cálculo que antes
 * vivía solo dentro de OperacionesView.load(), extraído para que el camino de lectura
 * (loadYearReportsEffective, metricsApi.js) pueda producir EXACTAMENTE el mismo `data`
 * que se ve al abrir Operaciones, sin duplicar la regla de negocio en dos sitios.
 *
 * Antes de este módulo, 5 de los 6 indicadores del score (todo menos Crecimiento) se
 * derivaban en vivo solo en Operaciones y nunca se persistían salvo que alguien pulsara
 * Guardar — el resto de las vistas (Resumen, Inicio, Hub de línea, Empresa) leían el
 * jsonb crudo tal cual, así que podían mostrar un score distinto al de Operaciones para
 * el mismo mes. Ver ARQUITECTURA.md §2.5 "Reporte efectivo".
 *
 * PURO: sin supabase, sin `new Date()` implícito (el "hoy" entra por `ctx.now`).
 */
import { syncReportClients } from './syncReportClients'
import { isReportFrozen } from './reportPeriod'
import { buildFixedWeeks, computeProductividad } from './fixedTasks'
import { computePlataformasProductividad } from './chequeo'
import { computeReunionesMeta } from './reunionesMeta'
import {
  REUNIONES_MODULE_START,
  REUNIONES_META_AUTO_START,
  TAREAS_FIJAS_MODULE_START,
  AUDIOVISUAL_MODULE_START,
  CHEQUEO_PRODUCTIVIDAD_START,
  SOLICITUDES_MODULE_START,
} from '../components/metricas/constants'

function isEraOrLater(year, month, era) {
  return year > era.year || (year === era.year && month >= era.month)
}

/**
 * Los 7 "gates" de era/congelamiento que deciden qué se deriva y qué se conserva tal
 * cual estaba guardado. Única definición — antes vivían inline en OperacionesView
 * (L65-66, L175-178, L232-234, L249-251, L266-268, L291-293).
 *
 * @param {number} year
 * @param {number} month     1-12
 * @param {boolean} closed
 * @param {Date} [now]       inyectable para tests — no usar `new Date()` fuera de este default
 * @returns {{
 *   frozen:boolean, shouldAutoSync:boolean, metaAutoSync:boolean,
 *   isFijasEra:boolean, isChequeoEra:boolean, isAvEra:boolean, isSolicitudesEra:boolean,
 * }}
 */
export function effectiveReportGates(year, month, closed, now = new Date()) {
  const frozen = isReportFrozen(year, month, closed, now)

  const isReunionesEra = isEraOrLater(year, month, REUNIONES_MODULE_START)
  const shouldAutoSync = isReunionesEra && !closed

  const isReunionesMetaEra = isEraOrLater(year, month, REUNIONES_META_AUTO_START)
  const metaAutoSync =
    isReunionesMetaEra && !closed && year === now.getFullYear() && month === now.getMonth() + 1

  const isFijasEra = isEraOrLater(year, month, TAREAS_FIJAS_MODULE_START)
  const isChequeoEra = isEraOrLater(year, month, CHEQUEO_PRODUCTIVIDAD_START)
  const isAvEra = isEraOrLater(year, month, AUDIOVISUAL_MODULE_START)
  const isSolicitudesEra = isEraOrLater(year, month, SOLICITUDES_MODULE_START)

  return {
    frozen,
    shouldAutoSync,
    metaAutoSync,
    isFijasEra,
    isChequeoEra,
    isAvEra,
    isSolicitudesEra,
  }
}

/**
 * true si, dado el período y su estado de cierre, hace falta pedir fuentes derivadas
 * para calcular el reporte efectivo. Un reporte cerrado tiene todos los gates de
 * derivación apagados (`shouldAutoSync`/`isFijasEra && !closed`/etc.), así que
 * `buildEffectiveReport(stored, sourcesVacías, ctx) === stored` — no hace falta ni
 * siquiera consultar las tablas fuente. Usado por el cargador por lote para no pedir
 * fuentes de meses cerrados.
 * @param {number} year
 * @param {number} month
 * @param {boolean} closed
 * @param {Date} [now]
 */
export function needsSourcesFor(year, month, closed, now = new Date()) {
  if (closed) return false
  const g = effectiveReportGates(year, month, closed, now)
  return (
    g.shouldAutoSync ||
    g.metaAutoSync ||
    g.isFijasEra ||
    g.isChequeoEra ||
    g.isAvEra ||
    g.isSolicitudesEra
  )
}

/**
 * Reporte guardado + fuentes derivadas → reporte efectivo. Réplica exacta de
 * OperacionesView.load() (antes L180-303): reconcilia el roster (crecimiento/pautas/
 * feedback/nómina) si el mes no está congelado, y pisa cada indicador derivable con su
 * fuente si el gate de su era está activo. `storedData` nunca se muta.
 *
 * @param {object} storedData   `metric_reports.data` tal cual vino de Supabase — NUNCA null.
 *                               Si no hay fila, no hay reporte efectivo: materializarlo con
 *                               initMetricReport/pruneCarryForward es responsabilidad
 *                               exclusiva del caller (solo OperacionesView), nunca de este
 *                               módulo ni del camino de lectura.
 * @param {{
 *   meetingsCount?: number,
 *   heldClientIds?: string[],
 *   fixedTaskMarks?: Array,
 *   checks?: Array,
 *   piezas?: { piezas?: number, editadas?: number, porGrupo?: object|null },
 *   pautasByClient?: Record<string, number>,
 *   cnpSolicitudes?: { solicitudes?: number, entregados?: number },
 *   tareasSolicitudes?: { solicitudes?: number, entregados?: number },
 * }} sources
 * @param {{
 *   year:number, month:number, closed:boolean,
 *   activeLineClients:Array, lineEmployees:Array, now?:Date,
 * }} ctx
 * @returns {object} nueva copia de `storedData` con los indicadores derivados aplicados
 */
export function buildEffectiveReport(storedData, sources, ctx) {
  const { year, month, closed, activeLineClients, lineEmployees, now = new Date() } = ctx
  const gates = effectiveReportGates(year, month, closed, now)
  const {
    frozen,
    shouldAutoSync,
    metaAutoSync,
    isFijasEra,
    isChequeoEra,
    isAvEra,
    isSolicitudesEra,
  } = gates

  const meetingsCount = sources.meetingsCount ?? 0
  const heldClientIds = sources.heldClientIds ?? []

  let synced = frozen
    ? structuredClone(storedData)
    : syncReportClients(storedData, activeLineClients, lineEmployees)

  // Poda las marcas que ya quedaron cubiertas (tienen reunión realizada) del mapa de
  // justificativos, para no arrastrar justificativos obsoletos en el jsonb del reporte.
  // Gateado por !closed: un reporte cerrado no debe generar un diff permanente contra
  // una fila que el trigger de Postgres ya no deja escribir.
  if (!closed) {
    const justificativos = { ...(synced.reuniones?.justificativos ?? {}) }
    heldClientIds.forEach((id) => {
      delete justificativos[id]
    })
    synced.reuniones = { ...synced.reuniones, justificativos }
  }

  // "Realizadas" ya no es editable — siempre refleja el conteo automático (clientes
  // distintos con reunión realizada en el mes), excepto en meses previos al módulo
  // Reuniones o en reportes cerrados, donde se conserva el valor histórico guardado.
  if (shouldAutoSync) {
    synced.reuniones = { ...synced.reuniones, realizadas: meetingsCount }
  }

  // Meta de reuniones: 1 por marca de la línea, menos las "No aplica" — recalculada
  // solo en el mes en curso (metaAutoSync implica mes no congelado, así que el roster
  // vigente es siempre activeLineClients).
  if (metaAutoSync) {
    synced.reuniones = {
      ...synced.reuniones,
      meta: computeReunionesMeta(activeLineClients, synced.reuniones.justificativos),
    }
  }

  const weeks = buildFixedWeeks(year, month)

  // "Productividad – Tareas Fijas" ya no se captura a mano — se deriva de lo tildado en
  // Gestión de Tareas → Tareas Fijas (fixed_task_marks).
  if (isFijasEra && !closed) {
    synced.productividad = {
      ...synced.productividad,
      tareas: computeProductividad(sources.fixedTaskMarks ?? [], activeLineClients, weeks),
    }
  }

  // Fila «Actualización de Plataformas» del mismo indicador — derivada de la grilla
  // semanal de publication_checks.
  if (isChequeoEra && !closed) {
    synced.productividad = {
      ...synced.productividad,
      tareas: [
        ...(synced.productividad?.tareas ?? []).filter(
          (t) => t.nombre !== 'Actualización de Plataformas',
        ),
        computePlataformasProductividad(sources.checks ?? [], activeLineClients, weeks),
      ],
    }
  }

  // "Nº Piezas vs Piezas editadas" — derivado de las pautas 'realizada' de Tareas Fijas
  // → Audiovisual (av_pautas). Solo cuenta piezas de VIDEO (Video/Reel).
  if (isAvEra && !closed) {
    const piezas = sources.piezas ?? {}
    synced.piezas = {
      ...synced.piezas,
      piezas: piezas.piezas ?? 0,
      editadas: piezas.editadas ?? 0,
      porGrupo: piezas.porGrupo ?? null,
    }
  }

  // "Nº Pautas" (Realizadas) — derivado del conteo de pautas 'realizada' de Audiovisual
  // por cliente. La Meta de cada marca sigue siendo manual.
  if (isAvEra && !closed) {
    const byClient = sources.pautasByClient ?? {}
    synced.pautas = {
      ...synced.pautas,
      items: (synced.pautas?.items ?? []).map((item) => ({
        ...item,
        realizadas: byClient[item.clienteId] ?? 0,
      })),
    }
  }

  // "Solicitudes vs Entregados" — derivado de CNP + Gestión de Tareas, 5 pts cada uno
  // (ver calcSolicitudes en utils/metricsScore.js). Los dos campos planos se mantienen
  // como la suma de ambas fuentes para que reportes/queries antiguas sigan funcionando.
  if (isSolicitudesEra && !closed) {
    const cnpSrc = sources.cnpSolicitudes ?? {}
    const tareasSrc = sources.tareasSolicitudes ?? {}
    const cnp = { solicitudes: cnpSrc.solicitudes ?? 0, entregados: cnpSrc.entregados ?? 0 }
    const tareas = {
      solicitudes: tareasSrc.solicitudes ?? 0,
      entregados: tareasSrc.entregados ?? 0,
    }
    synced.solicitudes = {
      solicitudes: cnp.solicitudes + tareas.solicitudes,
      editadas: cnp.entregados + tareas.entregados,
      cnp,
      tareas,
    }
  }

  return synced
}
