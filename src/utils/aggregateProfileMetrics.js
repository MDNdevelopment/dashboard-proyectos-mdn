import { format, parseISO } from 'date-fns'
import { representScore } from './scoreScale'

/**
 * Agrega las sesiones recibidas (rol empleado) de un usuario en métricas de perfil.
 *
 * @param {Array} sessions - Filas de evaluation_sessions ordenadas desc por period, con embeds:
 *   {
 *     id, total_score, period,
 *     evaluation_responses: [{ id, question_id, response, question: { text } }],
 *     evaluation_comments:  [{ id, comment }],
 *     manager: { first_name, last_name, avatar_url } | null,
 *   }
 * @returns {{
 *   evaluationCount: number,
 *   avgAllTime: number|null,
 *   avgCurrentPeriod: number|null,
 *   trend: { delta: number|null, direction: 'up'|'down'|'same'|null },
 *   chartData: Array<{ period: string, score: number }>,
 *   perQuestion: Array<{ questionId, text, avg: number, count: number }>,
 *   strengths: Array<{ questionId, text, avg: number }>,
 *   weaknesses: Array<{ questionId, text, avg: number }>,
 *   distribution: { '0-1': number, '1-2': number, '2-3': number, '3-4': number, '4-5': number },
 *   comments: Array<{ period: string, comment: string, manager: string }>,
 *   summaryText: string,
 * }}
 */
export function aggregateProfileMetrics(sessions) {
  const empty = {
    evaluationCount: 0,
    avgAllTime: null,
    avgCurrentPeriod: null,
    trend: { delta: null, direction: null },
    chartData: [],
    perQuestion: [],
    strengths: [],
    weaknesses: [],
    distribution: { '0-1': 0, '1-2': 0, '2-3': 0, '3-4': 0, '4-5': 0 },
    comments: [],
    summaryText: 'Aún no tienes evaluaciones registradas.',
  }

  if (!sessions || sessions.length === 0) return empty

  // --- Contadores por pregunta: Map<questionId, { text, total, count }> ---
  const qMap = new Map()
  // --- Distribución por banda ---
  const dist = { '0-1': 0, '1-2': 0, '2-3': 0, '3-4': 0, '4-5': 0 }
  // --- Comentarios ---
  const comments = []
  // --- Scores por sesión para chart (sessions llega desc, invertimos para chart) ---
  const scores = []

  for (const s of sessions) {
    const score = s.total_score ?? 0
    scores.push({ period: s.period, score })

    // Distribución
    if (score <= 1) dist['0-1'] += 1
    else if (score <= 2) dist['1-2'] += 1
    else if (score <= 3) dist['2-3'] += 1
    else if (score <= 4) dist['3-4'] += 1
    else dist['4-5'] += 1

    // Respuestas por pregunta
    for (const r of s.evaluation_responses ?? []) {
      const text = r.question?.text ?? `Pregunta ${r.question_id}`
      if (!qMap.has(r.question_id)) {
        qMap.set(r.question_id, { text, total: 0, count: 0 })
      }
      const entry = qMap.get(r.question_id)
      entry.total += r.response ?? 0
      entry.count += 1
    }

    // Comentarios
    for (const c of s.evaluation_comments ?? []) {
      if (!c.comment) continue
      const mgr = s.manager
        ? `${s.manager.first_name} ${s.manager.last_name}`.trim()
        : 'Evaluador desconocido'
      let periodLabel = s.period
      try { periodLabel = format(parseISO(s.period), 'MM/yyyy') } catch {}
      comments.push({ period: periodLabel, comment: c.comment, manager: mgr })
    }
  }

  // --- Promedios globales ---
  const validScores = scores.map(s => s.score)
  const avgAllTime =
    validScores.length > 0
      ? validScores.reduce((a, b) => a + b, 0) / validScores.length
      : null

  // Scores ordenados asc para chart y trend
  const sortedAsc = [...scores].sort((a, b) => a.period.localeCompare(b.period))
  const avgCurrentPeriod = sortedAsc.length > 0 ? sortedAsc[sortedAsc.length - 1].score : null
  const prevPeriodScore = sortedAsc.length > 1 ? sortedAsc[sortedAsc.length - 2].score : null

  let trend = { delta: null, direction: null }
  if (avgCurrentPeriod != null && prevPeriodScore != null) {
    const delta = parseFloat((avgCurrentPeriod - prevPeriodScore).toFixed(2))
    trend = {
      delta,
      direction: delta > 0 ? 'up' : delta < 0 ? 'down' : 'same',
    }
  }

  // --- Chart data ---
  const chartData = sortedAsc.map(s => {
    let period = s.period
    try { period = format(parseISO(s.period), 'MM/yyyy') } catch {}
    return { period, score: parseFloat(s.score.toFixed(2)) }
  })

  // --- Per-question promedio ---
  const perQuestion = [...qMap.entries()]
    .map(([questionId, { text, total, count }]) => ({
      questionId,
      text,
      avg: count > 0 ? parseFloat((total / count).toFixed(2)) : null,
      count,
    }))
    .sort((a, b) => (b.avg ?? -Infinity) - (a.avg ?? -Infinity))

  const strengths = perQuestion.slice(0, 3)
  const weaknesses = [...perQuestion].reverse().slice(0, 3)

  // --- Summary text (reemplaza al análisis de Gemini) ---
  const label = representScore(avgAllTime)
  const trendText =
    trend.direction === 'up'
      ? 'con una tendencia de mejora en el último período'
      : trend.direction === 'down'
        ? 'con una tendencia a la baja en el último período'
        : ''
  const summaryText = [
    `Tienes ${scores.length} evaluación${scores.length !== 1 ? 'es' : ''} registrada${scores.length !== 1 ? 's' : ''}.`,
    avgAllTime != null
      ? `Tu promedio histórico es ${avgAllTime.toFixed(2)}/5 (${label})${trendText ? ', ' + trendText : ''}.`
      : '',
    strengths.length > 0
      ? `Tu punto más fuerte es "${strengths[0].text}" con un promedio de ${strengths[0].avg}/5.`
      : '',
  ]
    .filter(Boolean)
    .join(' ')

  return {
    evaluationCount: scores.length,
    avgAllTime,
    avgCurrentPeriod,
    trend,
    chartData,
    perQuestion,
    strengths,
    weaknesses,
    distribution: dist,
    comments,
    summaryText,
  }
}
