/**
 * Capa de acceso a datos del módulo «Chequeo» (Gestión de Tareas → Chequeo). Todas las
 * funciones hacen queries a Supabase y retornan { data, error } (o el resultado del
 * insert/update/delete de supabase-js). Mismo patrón que
 * components/pautas/avPautasApi.js.
 */
import { supabase } from '../../supabase'

/** Rango [primer día del mes, primer día del mes siguiente) para filtrar por `published_at`. */
function monthRange(year, month) {
  const from = `${year}-${String(month).padStart(2, '0')}-01`
  const nextMonth = month === 12 ? 1 : month + 1
  const nextYear = month === 12 ? year + 1 : year
  const to = `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`
  return { from, to }
}

/**
 * Carga todas las celdas de la empresa (sin filtrar por línea: cada fila es una
 * "celda viva", una por cliente × red × tipo de contenido). El filtrado por línea en
 * alcance se hace client-side, igual que fixed_task_marks/av_pautas.
 */
export async function loadChecks(companyId) {
  return supabase.from('publication_checks').select('*').eq('company_id', companyId)
}

/**
 * Crea o actualiza la fecha de última publicación de una celda (cliente × red ×
 * tipo de contenido). Upsert por la unique key de la tabla, mismo patrón que
 * FixedTasksGrid.cycleStatus. `comment` solo lo usa Mailchimp (única red que exige
 * fecha + comentario, ver checkStatus en utils/chequeo.js) — el resto de las redes lo
 * deja en null.
 *
 * Además, si se guarda una fecha (no un borrado), inserta el evento correspondiente en
 * `publication_check_events` — el registro append-only del que sale el número real de
 * actualizaciones del mes para el indicador de Productividad (ver
 * computePlataformasProductividad en utils/chequeo.js). El insert es idempotente
 * (`on conflict do nothing`): re-elegir la misma fecha no debe contar dos veces.
 */
export async function upsertCheck({
  companyId,
  clientId,
  lineId,
  network,
  contentType,
  lastPublishedAt,
  comment,
  userId,
}) {
  const result = await supabase
    .from('publication_checks')
    .upsert(
      {
        company_id: companyId,
        client_id: clientId,
        line_id: lineId,
        network,
        content_type: contentType,
        last_published_at: lastPublishedAt || null,
        comment: comment || null,
        updated_by: userId ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'client_id,network,content_type' },
    )
    .select()
    .single()

  if (!result.error && lastPublishedAt) {
    await supabase.from('publication_check_events').upsert(
      {
        company_id: companyId,
        client_id: clientId,
        line_id: lineId,
        network,
        content_type: contentType,
        published_at: lastPublishedAt,
        created_by: userId ?? null,
      },
      { onConflict: 'client_id,network,content_type,published_at', ignoreDuplicates: true },
    )
  }

  return result
}

export async function deleteCheck(id) {
  return supabase.from('publication_checks').delete().eq('id', id)
}

/**
 * Carga los eventos de publicación del mes de una línea (para el auto-llenado de
 * «Actualización de Plataformas» en Productividad, ver computePlataformasProductividad).
 */
export async function loadCheckEvents(lineId, year, month) {
  const { from, to } = monthRange(year, month)
  return supabase
    .from('publication_check_events')
    .select('*')
    .eq('line_id', lineId)
    .gte('published_at', from)
    .lt('published_at', to)
}
