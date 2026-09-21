/**
 * Capa de acceso a datos del módulo «Chequeo» (Gestión de Tareas → Chequeo). Todas las
 * funciones hacen queries a Supabase y retornan { data, error } (o el resultado del
 * insert/update/delete de supabase-js). Mismo patrón que
 * components/pautas/avPautasApi.js.
 */
import { supabase } from '../../supabase'
import { selectAllPages } from '../../lib/supabasePaginate'

/**
 * Carga las celdas de la empresa del mes dado (periodizado, ver
 * supabase/migrations/20260831000000_publication_checks_weekly_periods.sql). El filtrado
 * por línea y por semana en alcance se hace client-side, igual que fixed_task_marks/av_pautas.
 *
 * Pagina con `selectAllPages` porque el volumen mensual puede superar el tope de 1000
 * filas por respuesta que aplica Supabase por defecto — sin esto, una empresa con mucho
 * volumen del mes recibía un subconjunto arbitrario y algunas plataformas se veían
 * incompletas para unos usuarios y completas para otros (mismo dato, distinta página).
 */
export async function loadChecks(companyId, year, month) {
  return selectAllPages((from, to) =>
    supabase
      .from('publication_checks')
      .select('*', { count: 'exact' })
      .eq('company_id', companyId)
      .eq('period_year', year)
      .eq('period_month', month)
      .order('id', { ascending: true })
      .range(from, to),
  )
}

/**
 * Crea o actualiza la fecha de publicación de una celda (cliente × red × tipo de
 * contenido) EN UNA SEMANA concreta. Upsert por la unique key de la tabla (incluye
 * período), mismo patrón que FixedTasksGrid.cycleStatus. `comment` solo lo usa Mailchimp
 * (única red que exige fecha + comentario, ver MailchimpEditor en ChequeoGrid.jsx) — el
 * resto de las redes lo deja en null.
 */
export async function upsertCheck({
  companyId,
  clientId,
  lineId,
  network,
  contentType,
  lastPublishedAt,
  comment,
  periodYear,
  periodMonth,
  periodWeek,
  userId,
}) {
  return supabase
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
        period_year: periodYear,
        period_month: periodMonth,
        period_week: periodWeek,
        updated_by: userId ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'client_id,network,content_type,period_year,period_month,period_week' },
    )
    .select()
    .single()
}
