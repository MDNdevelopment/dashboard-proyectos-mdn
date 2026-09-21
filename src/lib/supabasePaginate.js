/**
 * Helper genérico para traer TODAS las filas de una tabla cuando el conjunto puede
 * superar el tope de filas por respuesta que Supabase/PostgREST aplica por defecto
 * (1000, configurable en Settings → API → Max rows). Ese tope corta la respuesta EN
 * SILENCIO — sin `.order()` ni paginación, dos llamadas concurrentes pueden recibir
 * subconjuntos distintos de la tabla, indistinguibles de "no hay más datos".
 *
 * Motivado por el bug de Chequeo: `publication_checks` superó las 1000 filas en el mes
 * y usuarios distintos veían plataformas "completas" o "incompletas" según qué
 * subconjunto arbitrario les devolvía el servidor (ver chequeoApi.js).
 */

export const DEFAULT_PAGE_SIZE = 1000

/**
 * @param {(from: number, to: number) => PromiseLike<{data, error, count}>} buildPage -
 *   debe devolver la query ya armada con `.select('*', { count: 'exact' })`, un
 *   `.order(<columna estable, idealmente única>)` y `.range(from, to)` aplicados.
 * @param {{pageSize?: number, maxPages?: number}} opts
 * @returns {Promise<{data: any[]|null, error: any}>} mismo shape que supabase-js.
 */
export async function selectAllPages(
  buildPage,
  { pageSize = DEFAULT_PAGE_SIZE, maxPages = 25 } = {},
) {
  const rows = []
  const seenIds = new Set()
  let total = null

  for (let page = 0; page < maxPages; page += 1) {
    const from = rows.length
    const to = from + pageSize - 1
    const { data, error, count } = await buildPage(from, to)

    if (error) return { data: null, error }

    const batch = data ?? []
    if (total == null && typeof count === 'number') total = count

    for (const row of batch) {
      const key = row?.id
      if (key != null) {
        if (seenIds.has(key)) continue
        seenIds.add(key)
      }
      rows.push(row)
    }

    // Corte de respaldo si el servidor no devolvió `count`: una página vacía significa
    // que no hay más filas.
    if (batch.length === 0) return { data: rows, error: null }
    // Avanzamos por lo realmente recibido (no por `pageSize`): si el tope real del
    // servidor fuera menor que `pageSize`, avanzar por `pageSize` saltaría filas.
    if (total != null && rows.length >= total) return { data: rows, error: null }
  }

  return {
    data: null,
    error: new Error(
      `selectAllPages: se alcanzó maxPages (${maxPages}) sin terminar de paginar — ` +
        'se devuelven null en vez de datos parciales para no ocultar el truncado.',
    ),
  }
}
