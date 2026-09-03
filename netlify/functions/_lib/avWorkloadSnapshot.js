// Detección determinística de sobrecarga de recursos de Audiovisual (recuadro
// "Recomendaciones" del Home, ver netlify/functions/av-workload-insight.js). Toda la lógica
// de conteo vive acá, en JS puro y testeable: al modelo (OpenRouter) solo se le pasa el
// resultado ya calculado para que lo redacte, nunca se le pide que cuente — con
// `openrouter/free` eso alucina nombres y cifras.

const EXTERNAL_PREFIX = 'ext:'

/** "YYYY-MM-DD" en hora local, evitando el corrimiento de día de toISOString() (UTC). */
function dateKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function addDays(d, n) {
  const copy = new Date(d)
  copy.setDate(copy.getDate() + n)
  return copy
}

function fullName(user) {
  return `${user.first_name ?? ''} ${user.last_name ?? ''}`.trim() || 'Sin nombre'
}

/**
 * @param {object} params
 * @param {Array} params.pautas - filas de av_pautas (id, client_name, tema, pauta_date,
 *   salida, llegada, status, recurso_ids), ya filtradas por company_id y deleted_at is null.
 * @param {Array} params.employees - filas de users (user_id, first_name, last_name,
 *   department_id, deleted_at) de la empresa.
 * @param {Date} params.today - fecha de referencia (medianoche local).
 * @param {number} [params.dias] - días hacia atrás/adelante de la ventana (default 3).
 * @param {number} [params.umbral] - mínimo de pautas en un día para contar como sobrecarga
 *   (default 3).
 */
export function buildAvWorkloadSnapshot({ pautas, employees, today, dias = 3, umbral = 3 }) {
  const hoyKey = dateKey(today)
  const desde = addDays(today, -dias)
  const hasta = addDays(today, dias)
  const desdeKey = dateKey(desde)
  const hastaKey = dateKey(hasta)

  // Solo empleados de Audiovisual (department_id === 2) activos — mismo criterio que
  // AudiovisualView.jsx. Los recursos externos (ext:<uuid>) nunca son "el equipo" de César.
  const audiovisualById = new Map(
    (employees ?? [])
      .filter((u) => u.department_id === 2 && !u.deleted_at)
      .map((u) => [u.user_id, fullName(u)]),
  )

  const inWindow = (pautas ?? []).filter((p) => {
    if (!p.pauta_date || p.pauta_date < desdeKey || p.pauta_date > hastaKey) return false
    const isPast = p.pauta_date < hoyKey
    if (isPast) return p.status === 'realizada'
    return p.status === 'realizada' || p.status === 'programada'
  })

  // (fecha) -> { fecha, pautas: [{ cliente, tema, hora, estado, recursos }] }
  const byDate = new Map()
  // (persona, fecha) -> { persona, fecha, items: [{ cliente, tema, estado }] }
  const byPersonDate = new Map()

  for (const p of inWindow) {
    const recursos = (p.recurso_ids ?? [])
      .filter((id) => !id.startsWith(EXTERNAL_PREFIX))
      .map((id) => audiovisualById.get(id))
      .filter(Boolean)

    if (!byDate.has(p.pauta_date)) byDate.set(p.pauta_date, { fecha: p.pauta_date, pautas: [] })
    byDate.get(p.pauta_date).pautas.push({
      cliente: p.client_name ?? '(sin cliente)',
      tema: p.tema ?? null,
      hora: p.salida ? `${p.salida}${p.llegada ? ` - ${p.llegada}` : ''}` : null,
      estado: p.status,
      recursos,
    })

    for (const persona of recursos) {
      const key = `${persona}__${p.pauta_date}`
      if (!byPersonDate.has(key)) byPersonDate.set(key, { persona, fecha: p.pauta_date, items: [] })
      // `estado` viaja con cada pauta hasta el modelo a propósito: 'realizada' (ya pasó) y
      // 'programada' (todavía no) requieren un tiempo verbal distinto en la redacción —
      // sin esto el modelo no puede distinguir "fue a" de "tiene programada".
      byPersonDate.get(key).items.push({
        cliente: p.client_name ?? '(sin cliente)',
        tema: p.tema ?? null,
        estado: p.status,
      })
    }
  }

  const sobrecargas = [...byPersonDate.values()]
    .filter((g) => g.items.length >= umbral)
    .map((g) => ({ persona: g.persona, fecha: g.fecha, cantidad: g.items.length, pautas: g.items }))
    .sort((a, b) => a.fecha.localeCompare(b.fecha) || a.persona.localeCompare(b.persona))

  const dias_ = [...byDate.values()].sort((a, b) => a.fecha.localeCompare(b.fecha))

  return {
    hoy: hoyKey,
    ventana: { desde: desdeKey, hasta: hastaKey },
    dias: dias_,
    sobrecargas,
  }
}
