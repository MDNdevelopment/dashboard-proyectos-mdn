// Agrega los datos crudos de la empresa (reportes, tareas, clientes, ads, leads) en un
// snapshot compacto para el análisis ejecutivo de ceo-analysis.js. Función pura —
// reutiliza las mismas utilidades de cálculo que el módulo Métricas (src/utils/) para
// que la IA razone sobre los mismos números que ve la UI, en vez de reinventar fórmulas.
import { calcTotal, sumScore } from '../../../src/utils/metricsScore.js'
import { calcFinanzas } from '../../../src/utils/metricsFinance.js'
import { aggregateMetricsDashboard } from '../../../src/utils/aggregateMetricsDashboard.js'
import {
  isClosed,
  isLate,
  isBlocked,
  parseD,
  daysBetween,
} from '../../../src/components/tareas/constants.js'

function prevMonthYear(year, month) {
  return month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 }
}

function round(n, decimals = 0) {
  if (n == null || Number.isNaN(n)) return null
  const f = 10 ** decimals
  return Math.round(n * f) / f
}

function dashboardFor(lines, reports, year, month) {
  const yearReports = reports.filter((r) => r.year === year)
  return aggregateMetricsDashboard(
    lines,
    yearReports,
    year,
    calcTotal,
    sumScore,
    calcFinanzas,
    month,
  )
}

/** Suma ingresos/egresos/diferencia de todas las líneas para el mes ya calculado en `dashboard`. */
function companyFinance(dashboard, lines) {
  return lines.reduce(
    (acc, line) => {
      const f = dashboard.finTotalesPorLinea[line.id] ?? { ingresos: 0, egresos: 0, diferencia: 0 }
      return {
        ingresos: acc.ingresos + f.ingresos,
        egresos: acc.egresos + f.egresos,
        diferencia: acc.diferencia + f.diferencia,
      }
    },
    { ingresos: 0, egresos: 0, diferencia: 0 },
  )
}

/**
 * @param {object} p
 * @param {Array} p.lines       - metric_lines de la empresa (excluye "Independientes").
 * @param {Array} p.reports     - TODAS las filas de metric_reports de la empresa (cualquier año).
 * @param {Array} p.tasks       - TODAS las tareas de la empresa (tabla tasks).
 * @param {Array} p.clients     - metric_clients de la empresa.
 * @param {Array} p.leads       - leads pendientes/contactados/cancelados.
 * @param {Array} p.campaigns   - paid_campaigns de la empresa.
 * @param {number} p.referenceYear  - año del mes cerrado más reciente a analizar.
 * @param {number} p.referenceMonth - mes (1-12) cerrado más reciente a analizar.
 * @returns {object} snapshot compacto listo para pasar a Gemini.
 */
export function buildCeoSnapshot({
  lines = [],
  reports = [],
  tasks = [],
  clients = [],
  leads = [],
  campaigns = [],
  referenceYear,
  referenceMonth,
}) {
  const prev = prevMonthYear(referenceYear, referenceMonth)

  const dashboard = dashboardFor(lines, reports, referenceYear, referenceMonth)
  const prevDashboard = dashboardFor(lines, reports, prev.year, prev.month)

  const finance = companyFinance(dashboard, lines)
  const prevFinance = companyFinance(prevDashboard, lines)

  const ranking = dashboard.ranking.map((r) => ({ linea: r.line.name, score: round(r.score, 1) }))

  // Tareas: estado operativo actual (no acotado al mes analizado).
  const activeTasks = tasks.filter((t) => !isClosed(t))
  const lateTasks = activeTasks.filter(isLate)
  const blockedTasks = activeTasks.filter(isBlocked)
  const closedWithDates = tasks.filter((t) => isClosed(t) && t.due_date && t.closed_date)
  const onTime = closedWithDates.filter(
    (t) => daysBetween(parseD(t.due_date), parseD(t.closed_date)) <= 0,
  )
  const porcentajeATiempo = closedWithDates.length
    ? round((onTime.length / closedWithDates.length) * 100)
    : null

  // Crecimiento de seguidores del mes analizado (ganados vs meta) + inversión en Ads.
  const currentReports = reports.filter(
    (r) => r.year === referenceYear && r.month === referenceMonth,
  )
  let seguidoresGanados = 0
  let seguidoresMeta = 0
  currentReports.forEach((r) => {
    ;(r.data?.crecimiento?.items ?? []).forEach((it) => {
      if (it.seguidoresGanados != null) seguidoresGanados += Number(it.seguidoresGanados) || 0
      seguidoresMeta += Number(it.meta ?? 0) || 0
    })
  })
  const mesStr = `${referenceYear}-${String(referenceMonth).padStart(2, '0')}`
  const inversionAds = campaigns
    .filter((c) => c.start_date && c.start_date.slice(0, 7) === mesStr)
    .reduce((a, c) => a + (Number(c.amount) || 0), 0)

  // Reuniones realizadas vs meta (siembra desde `meetings`, ya consolidada en el reporte).
  const reunionesRealizadas = currentReports.reduce(
    (a, r) => a + (Number(r.data?.reuniones?.realizadas) || 0),
    0,
  )
  const reunionesMeta = currentReports.reduce(
    (a, r) => a + (Number(r.data?.reuniones?.meta) || 0),
    0,
  )

  const activeClients = clients.filter((c) => !c.deleted_at)
  const pendingLeads = leads.filter((l) => l.status === 'pendiente')

  return {
    mes: { anio: referenceYear, mes: referenceMonth },
    cobertura_reportes_pct: round(dashboard.cobertura),
    score: {
      actual: dashboard.promMesActual != null ? round(dashboard.promMesActual, 1) : null,
      anterior: prevDashboard.promMesActual != null ? round(prevDashboard.promMesActual, 1) : null,
    },
    linea_lider: dashboard.lider ? dashboard.lider.line.name : null,
    ranking_lineas: ranking,
    finanzas: {
      ingresos: round(finance.ingresos),
      egresos: round(finance.egresos),
      diferencia: round(finance.diferencia),
      diferencia_mes_anterior: round(prevFinance.diferencia),
    },
    tareas: {
      activas: activeTasks.length,
      atrasadas: lateTasks.length,
      bloqueadas: blockedTasks.length,
      porcentaje_a_tiempo: porcentajeATiempo,
    },
    crecimiento: {
      seguidores_ganados: seguidoresGanados,
      seguidores_meta: seguidoresMeta,
      inversion_ads: round(inversionAds),
    },
    reuniones: {
      realizadas: reunionesRealizadas,
      meta: reunionesMeta,
    },
    clientes_activos: activeClients.length,
    leads_pendientes: pendingLeads.length,
  }
}
