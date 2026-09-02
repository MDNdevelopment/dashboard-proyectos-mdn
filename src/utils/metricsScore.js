/**
 * Cálculo de los 6 indicadores ponderados (suma = 100 puntos).
 * Todas las funciones son puras: reciben el objeto `report` (y opcionalmente
 * `prevReport` para el crecimiento) y retornan el puntaje parcial.
 *
 * Indicadores y pesos: Reuniones 20, Productividad 20, Crecimiento 20,
 * Solicitudes 10, Pautas 20, Piezas 10.
 */

/** Reuniones — peso 20 */
export function calcReuniones(report) {
  const meta = report.reuniones?.meta ?? 0
  // meta 0 = no había ninguna marca exigible en el período (todas "No aplica", o línea
  // sin marcas): no penaliza, puntaje completo. Distinto de "meta sin configurar" — la
  // meta ahora es siempre derivada, nunca queda en 0 por descuido.
  if (meta === 0) return 20
  return Math.min((Number(report.reuniones.realizadas ?? 0) / meta) * 20, 20)
}

/** Productividad (tareas fijas) — peso 20 */
export function calcProductividad(report) {
  let real = 0,
    meta = 0
  ;(report.productividad?.tareas ?? []).forEach((t) => {
    real += Number(t.realizado ?? 0)
    meta += Number(t.meta ?? 0)
  })
  return meta === 0 ? 0 : (real / meta) * 20
}

/**
 * Evalúa el crecimiento de seguidores de un cliente individual.
 *
 * Modelo nuevo (campo seguidoresGanados explícito): usa ese valor directamente.
 * Fallback para reportes anteriores sin ese campo: calcula (actuales − base),
 *   donde base = seguidoresActuales del mes previo o seguidoresBase manual.
 *
 * @param {object} item        - Un elemento de crecimiento.items del mes actual.
 * @param {object|null} prevReport - Reporte del mes anterior o null.
 * @returns {{ ganados: number|null, cumple: boolean|null, pct: number|null }}
 *   - ganados: seguidores ganados en el mes, o null si faltan datos.
 *   - cumple: true si ganados >= meta, false si no, null si faltan datos.
 *   - pct: ganados / meta × 100 (% de cumplimiento de la meta), o null si meta es 0 o faltan datos.
 */
export function crecimientoCliente(item, prevReport = null) {
  let ganados = null

  if (item.seguidoresGanados != null) {
    // Modelo nuevo: campo explícito
    ganados = Number(item.seguidoresGanados)
  } else {
    // Fallback para reportes históricos: derivar de actuales − base
    let base = null
    if (prevReport) {
      const prevItem = (prevReport.crecimiento?.items ?? []).find(
        (i) => i.clienteId === item.clienteId,
      )
      if (prevItem?.seguidoresActuales != null) base = prevItem.seguidoresActuales
    }
    if (base == null && item.seguidoresBase != null) base = item.seguidoresBase
    if (item.seguidoresActuales != null && base != null) {
      ganados = Number(item.seguidoresActuales) - Number(base)
    }
  }

  if (ganados === null) {
    return { ganados: null, cumple: null, pct: null }
  }

  const meta = Number(item.meta ?? 0)
  const cumple = ganados >= meta
  const pct = meta > 0 ? (ganados / meta) * 100 : null
  return { ganados, cumple, pct }
}

/**
 * Crecimiento de seguidores — peso 20.
 *
 * @param {object} report      - El reporte actual (tiene crecimiento.items).
 * @param {object|null} prevReport - Reporte del mes anterior (fallback para reportes
 *   históricos sin seguidoresGanados explícito) o null si no existe.
 *
 * Para cada cliente se determina cuántos seguidores ganó:
 *   1. seguidoresGanados explícito del item actual (modelo nuevo, campo editable).
 *   2. Fallback (reportes históricos): actuales − base, donde base es
 *      seguidoresActuales del mes anterior, o seguidoresBase manual.
 *   3. Si no hay datos suficientes, el cliente no cuenta (se omite del total).
 * Un cliente "cumple" si ganados >= meta.
 */
export function calcCrecimiento(report, prevReport = null) {
  const items = report.crecimiento?.items ?? []
  if (items.length === 0) return 0

  let cumplieron = 0
  items.forEach((it) => {
    const { cumple } = crecimientoCliente(it, prevReport)
    if (cumple === true) cumplieron++
  })

  return (cumplieron / items.length) * 20
}

/**
 * Solicitudes vs Entregados — peso 10.
 *
 * Desde SOLICITUDES_MODULE_START el indicador se deriva de dos fuentes con 5 pts cada
 * una: CNP (report.solicitudes.cnp) y Gestión de Tareas (report.solicitudes.tareas).
 * Si una fuente no tuvo solicitudes ese mes, sus 5 pts se redistribuyen a la otra en
 * vez de perderse — una línea sin CNP en el mes no debería perder puntos por algo que
 * no depende de ella. Reportes sin desglose (meses anteriores a la era, capturados a
 * mano) siguen usando la fórmula original sobre los dos campos planos.
 */
export function calcSolicitudes(report) {
  const sol = report.solicitudes ?? {}
  if (!sol.cnp && !sol.tareas) {
    const s = Number(sol.solicitudes ?? 0)
    if (s === 0) return 0
    return (Number(sol.editadas ?? 0) / s) * 10
  }

  const cnpS = Number(sol.cnp?.solicitudes ?? 0)
  const cnpE = Number(sol.cnp?.entregados ?? 0)
  const tarS = Number(sol.tareas?.solicitudes ?? 0)
  const tarE = Number(sol.tareas?.entregados ?? 0)

  const cnpHas = cnpS > 0
  const tarHas = tarS > 0
  if (!cnpHas && !tarHas) return 0

  const cnpWeight = cnpHas ? 5 : 0
  const tarWeight = tarHas ? 5 : 0
  // Redistribuir el peso de la fuente vacía a la otra.
  const extra = (cnpHas ? 0 : 5) + (tarHas ? 0 : 5)
  const cnpFinalWeight = cnpHas && !tarHas ? cnpWeight + extra : cnpWeight
  const tarFinalWeight = tarHas && !cnpHas ? tarWeight + extra : tarWeight

  const cnpScore = cnpHas ? (cnpE / cnpS) * cnpFinalWeight : 0
  const tarScore = tarHas ? (tarE / tarS) * tarFinalWeight : 0
  return cnpScore + tarScore
}

/** Pautas — peso 20 */
export function calcPautas(report) {
  const items = report.pautas?.items ?? []
  if (items.length === 0) return 0
  let cumplieron = 0
  items.forEach((it) => {
    if (Number(it.realizadas ?? 0) >= Number(it.meta ?? 0)) cumplieron++
  })
  return (cumplieron / items.length) * 20
}

/** Piezas — peso 10 */
export function calcPiezas(report) {
  const p = Number(report.piezas?.piezas ?? 0)
  if (p === 0) return 0
  return (Number(report.piezas.editadas ?? 0) / p) * 10
}

/**
 * Retorna un objeto con el puntaje parcial de cada indicador.
 * @param {object} report
 * @param {object|null} prevReport - Reporte del mes anterior para el crecimiento.
 */
export function calcTotal(report, prevReport = null) {
  return {
    reuniones: calcReuniones(report),
    productividad: calcProductividad(report),
    crecimiento: calcCrecimiento(report, prevReport),
    solicitudes: calcSolicitudes(report),
    pautas: calcPautas(report),
    piezas: calcPiezas(report),
  }
}

/** Suma todos los puntajes parciales → score total 0–100 (tope en 100). */
export function sumScore(scores) {
  const raw =
    scores.reuniones +
    scores.productividad +
    scores.crecimiento +
    scores.solicitudes +
    scores.pautas +
    scores.piezas
  return Math.min(100, raw)
}

/**
 * Score (0–100) del mes cerrado más reciente de una línea + su nº de mes.
 * `reports` debe venir ya filtrado por line_id (filas crudas de metric_reports).
 * Descarta meses futuros y meses marcados como incompletos.
 * @param {Array} reports - Filas de metric_reports filtradas por line_id.
 * @returns {{ score: number|null, month: number|null }}
 */
export function lastLineScore(reports) {
  const monthScores = Array.from({ length: 12 }, (_, i) => {
    const r = reports.find((x) => x.month === i + 1)
    if (!r || r.data?.incompleto) return null
    const prev = i > 0 ? reports.find((x) => x.month === i) : null
    return { month: i + 1, ...calcTotal(r.data, prev?.data ?? null) }
  })
  const last = [...monthScores].reverse().find((m) => m != null)
  return last ? { score: sumScore(last), month: last.month } : { score: null, month: null }
}

/**
 * Score (0–100) de un mes concreto de una línea + su nº de mes.
 * Estricta: si el mes no existe o está marcado incompleto, devuelve nulls
 * (no cae a otro mes). `reports` debe venir filtrado por line_id.
 * @param {Array} reports - Filas de metric_reports filtradas por line_id.
 * @param {number} month - Número de mes objetivo (1–12).
 * @returns {{ score: number|null, month: number|null }}
 */
export function monthLineScore(reports, month) {
  const r = reports.find((x) => x.month === month)
  if (!r || r.data?.incompleto) return { score: null, month: null }
  const prev = reports.find((x) => x.month === month - 1)
  return { score: sumScore(calcTotal(r.data, prev?.data ?? null)), month }
}
