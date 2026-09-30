/**
 * Cargador POR LOTE de las fuentes que alimentan `buildEffectiveReport` (ver
 * ../../utils/buildEffectiveReport.js) para varios pares línea×mes a la vez — una query
 * por tabla fuente en vez de las 8 queries por línea×mes que hace OperacionesView.
 *
 * Usado por `loadYearReportsEffective` (metricsApi.js) para que el camino de lectura
 * (Resumen, Inicio, Hub de línea, Empresa) derive el mismo `data` que se ve en
 * Operaciones. Solo batchea la capa de fetch: la regla de negocio de cada indicador
 * sigue viviendo en las funciones puras que ya existían (`sumPiezasVideoForLine`,
 * `cnpPieceCount`, etc.) — nunca se duplica aquí.
 *
 * Zona horaria: preservada a propósito. `countMeetingsHeldForLine` (meetingsApi.js) y las
 * funciones por-línea de av_pautas/cnp/tasks construyen sus límites de mes con
 * `new Date(year, month-1, 1)` (medianoche LOCAL del navegador) o con
 * `toISOString().slice(0,10)` sobre esa misma fecha. Esta versión por lote replica esos
 * mismos límites y bucketea cada fila contra ellos — nunca parseando el mes de la fila —
 * para no mover ni una reunión/pauta/tarea de mes respecto al comportamiento actual. Un
 * futuro arreglo de zona horaria (los límites locales dejan una ventana de ~4h mal
 * clasificada en Venezuela, UTC-4) debe tocar las 4 fuentes y el cron de autocierre a la
 * vez, con su propio changelog — no es parte de este cambio.
 */
import { supabase } from '../../supabase'
import { clientIdsForLine } from '../reuniones/meetingsApi'
import { sumPiezasVideoForLine, sumPiezasVideoBreakdownForLine } from '../../utils/audiovisual'
import { cnpPieceCount, cnpPiecesDelivered } from '../cnp/constants'
import { selectAllPages } from '../../lib/supabasePaginate'

/** Límites [inicio, fin) de un mes en hora LOCAL — misma expresión que las funciones por línea. */
function localMonthBounds(year, month) {
  return { start: new Date(year, month - 1, 1), end: new Date(year, month, 1) }
}

/** El mismo límite, como string 'YYYY-MM-DD' (columnas `date`, o coerción UTC de PostgREST). */
function dateStr(d) {
  return d.toISOString().slice(0, 10)
}

function emptySources() {
  return {
    meetingsCount: 0,
    heldClientIds: [],
    fixedTaskMarks: [],
    checks: [],
    piezas: { piezas: 0, editadas: 0, porGrupo: sumPiezasVideoBreakdownForLine([]) },
    pautasByClient: {},
    cnpSolicitudes: { solicitudes: 0, entregados: 0 },
    tareasSolicitudes: { solicitudes: 0, entregados: 0 },
  }
}

/**
 * @param {string} companyId
 * @param {{ year:number, months:number[], lineIds:string[] }} params
 * @returns {Promise<{ data: Record<string, ReturnType<typeof emptySources>>, error: any }>}
 *   La clave de `data` es `${lineId}__${month}`. Siempre trae una entrada completa (con
 *   ceros/arrays vacíos) por cada par pedido, aunque no haya filas fuente — así
 *   `buildEffectiveReport` nunca recibe `undefined`. Si `months` o `lineIds` vienen
 *   vacíos, no toca la red.
 */
export async function loadReportSources(companyId, { year, months, lineIds }) {
  const result = {}
  if (!months?.length || !lineIds?.length) return { data: result, error: null }

  lineIds.forEach((lineId) => {
    months.forEach((month) => {
      result[`${lineId}__${month}`] = emptySources()
    })
  })

  const bounds = {}
  months.forEach((m) => {
    bounds[m] = localMonthBounds(year, m)
  })
  const sortedMonths = [...months].sort((a, b) => a - b)
  const rangeStart = bounds[sortedMonths[0]].start
  const rangeEnd = bounds[sortedMonths[sortedMonths.length - 1]].end

  /** Mes (de `months`) cuyo rango local [start,end) contiene el instante `t`, o null. */
  function monthForLocalInstant(t) {
    for (const m of months) {
      if (t >= bounds[m].start.getTime() && t < bounds[m].end.getTime()) return m
    }
    return null
  }

  /** Igual, pero comparando contra los límites UTC-medianoche que usa PostgREST al
   * coercer un string 'YYYY-MM-DD' contra una columna timestamptz (ver cabecera). */
  function monthForUtcInstant(t) {
    for (const m of months) {
      const start = Date.parse(`${dateStr(bounds[m].start)}T00:00:00Z`)
      const end = Date.parse(`${dateStr(bounds[m].end)}T00:00:00Z`)
      if (t >= start && t < end) return m
    }
    return null
  }

  /** Igual, pero comparando el string 'YYYY-MM-DD' de una columna `date` (sin huso). */
  function monthForDateString(ds) {
    for (const m of months) {
      if (ds >= dateStr(bounds[m].start) && ds < dateStr(bounds[m].end)) return m
    }
    return null
  }

  const [meetingsRes, marksRes, checksRes, avRes, cnpRes, tasksRes] = await Promise.all([
    // Reuniones: fusiona countMeetingsHeldForLine + loadHeldClientIdsForLine (mismos
    // filtros, solo difieren en el post-proceso — ver meetingsApi.js).
    supabase
      .from('meetings')
      .select('client_ids, line_ids, starts_at')
      .eq('company_id', companyId)
      .overlaps('line_ids', lineIds)
      .eq('status', 'realizada')
      .gte('starts_at', rangeStart.toISOString())
      .lt('starts_at', rangeEnd.toISOString()),
    supabase
      .from('fixed_task_marks')
      .select('line_id, period_month, client_id, task_key, period_week, status')
      .in('line_id', lineIds)
      .eq('period_year', year)
      .in('period_month', months),
    selectAllPages((from, to) =>
      supabase
        .from('publication_checks')
        .select('*', { count: 'exact' })
        .eq('company_id', companyId)
        .eq('period_year', year)
        .in('period_month', months)
        .order('id', { ascending: true })
        .range(from, to),
    ),
    supabase
      .from('av_pautas')
      .select(
        'line_id, client_id, pauta_date, piezas_totales, piezas_editadas, status, formats, piezas_por_formato',
      )
      .eq('company_id', companyId)
      .in('line_id', lineIds)
      .eq('status', 'realizada')
      .gte('pauta_date', dateStr(rangeStart))
      .lt('pauta_date', dateStr(rangeEnd)),
    supabase
      .from('cnp_requests')
      .select('line_id, status, pieces, created_at')
      .eq('company_id', companyId)
      .in('line_id', lineIds)
      .is('deleted_at', null)
      .gte('created_at', dateStr(rangeStart))
      .lt('created_at', dateStr(rangeEnd)),
    supabase
      .from('tasks')
      .select('team_id, status, request_date')
      .eq('company_id', companyId)
      .in('team_id', lineIds)
      .gte('request_date', dateStr(rangeStart))
      .lt('request_date', dateStr(rangeEnd)),
  ])

  const firstError =
    meetingsRes.error ||
    marksRes.error ||
    checksRes.error ||
    avRes.error ||
    cnpRes.error ||
    tasksRes.error
  if (firstError) return { data: result, error: firstError }

  // ── Reuniones ─────────────────────────────────────────────────────────────
  // Bucket por mes ANTES de filtrar por línea (una reunión puede caer en el mes según
  // starts_at, y luego se pre-filtra por línea para clientIdsForLine — ver cabecera del
  // módulo meetingsApi.js sobre por qué el pre-filtro es obligatorio con `.overlaps`).
  const meetingsByMonth = {}
  months.forEach((m) => {
    meetingsByMonth[m] = []
  })
  ;(meetingsRes.data ?? []).forEach((row) => {
    const m = monthForLocalInstant(new Date(row.starts_at).getTime())
    if (m != null) meetingsByMonth[m].push(row)
  })
  lineIds.forEach((lineId) => {
    months.forEach((month) => {
      const rowsForLine = meetingsByMonth[month].filter((r) => (r.line_ids ?? []).includes(lineId))
      const ids = clientIdsForLine(rowsForLine, lineId)
      const distinctClients = new Set(ids.filter((id) => id != null))
      const nullClientCount = ids.filter((id) => id == null).length
      const entry = result[`${lineId}__${month}`]
      entry.meetingsCount = distinctClients.size + nullClientCount
      entry.heldClientIds = [...distinctClients]
    })
  })

  // ── Tareas fijas ──────────────────────────────────────────────────────────
  ;(marksRes.data ?? []).forEach((row) => {
    const key = `${row.line_id}__${row.period_month}`
    if (result[key]) result[key].fixedTaskMarks.push(row)
  })

  // ── Chequeo (company-wide, se reparte igual a todas las líneas del mismo mes) ───
  const checksByMonth = {}
  months.forEach((m) => {
    checksByMonth[m] = []
  })
  ;(checksRes.data ?? []).forEach((row) => {
    if (checksByMonth[row.period_month]) checksByMonth[row.period_month].push(row)
  })
  lineIds.forEach((lineId) => {
    months.forEach((month) => {
      result[`${lineId}__${month}`].checks = checksByMonth[month]
    })
  })

  // ── Piezas + Pautas (av_pautas) ───────────────────────────────────────────
  const avByLineMonth = {}
  ;(avRes.data ?? []).forEach((row) => {
    const m = monthForDateString(row.pauta_date ?? '')
    if (m == null) return
    const key = `${row.line_id}__${m}`
    if (!avByLineMonth[key]) avByLineMonth[key] = []
    avByLineMonth[key].push(row)
  })
  lineIds.forEach((lineId) => {
    months.forEach((month) => {
      const rows = avByLineMonth[`${lineId}__${month}`] ?? []
      const entry = result[`${lineId}__${month}`]
      entry.piezas = {
        ...sumPiezasVideoForLine(rows),
        porGrupo: sumPiezasVideoBreakdownForLine(rows),
      }
      const byClient = {}
      rows.forEach((row) => {
        if (!row.client_id) return
        byClient[row.client_id] = (byClient[row.client_id] ?? 0) + 1
      })
      entry.pautasByClient = byClient
    })
  })

  // ── CNP ───────────────────────────────────────────────────────────────────
  ;(cnpRes.data ?? []).forEach((row) => {
    const m = monthForUtcInstant(Date.parse(row.created_at))
    if (m == null) return
    const key = `${row.line_id}__${m}`
    if (!result[key]) return
    const entry = result[key]
    entry.cnpSolicitudes = {
      solicitudes: entry.cnpSolicitudes.solicitudes + cnpPieceCount(row),
      entregados: entry.cnpSolicitudes.entregados + cnpPiecesDelivered(row),
    }
  })

  // ── Tareas (Gestión de Tareas) ────────────────────────────────────────────
  ;(tasksRes.data ?? []).forEach((row) => {
    const m = monthForDateString(row.request_date ?? '')
    if (m == null) return
    const key = `${row.team_id}__${m}`
    if (!result[key]) return
    const entry = result[key]
    entry.tareasSolicitudes = {
      solicitudes: entry.tareasSolicitudes.solicitudes + 1,
      entregados: entry.tareasSolicitudes.entregados + (row.status === 'Terminado' ? 1 : 0),
    }
  })

  return { data: result, error: null }
}
