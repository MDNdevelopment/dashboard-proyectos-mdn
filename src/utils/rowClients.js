/**
 * Helpers puros para leer el/los cliente(s) de una fila que soporta varias marcas vía un
 * arreglo posicional `client_ids` conservando el escalar `client_id` (marca en la posición
 * 0) por compatibilidad — mismo patrón que `meetings.client_ids`/`client_id` (ver
 * `20260915000000_meetings_multi_client.sql`). Usado por `cnp_requests` y `tasks`.
 */

/** Ids de cliente de una fila: el arreglo si existe y no está vacío, si no el escalar legado. */
export function clientIdsOf(row) {
  if (Array.isArray(row?.client_ids) && row.client_ids.length) return row.client_ids
  return row?.client_id ? [row.client_id] : []
}

/**
 * Nombres resueltos de los clientes de una fila. `fallback` es un texto legado a usar
 * cuando la fila no tiene ningún client_id (ej. `tasks.client`, campo de texto
 * pre-migración) — sin fallback, devuelve un arreglo vacío.
 */
export function clientNamesOf(row, clientsById = new Map(), { fallback } = {}) {
  const ids = clientIdsOf(row)
  if (ids.length === 0) {
    return fallback ? [fallback] : []
  }
  return ids.map((id) => clientsById.get(id)?.name).filter(Boolean)
}

/** True si `clientId` es una de las marcas de la fila (arreglo o escalar legado). */
export function matchesClient(row, clientId) {
  if (!clientId) return true
  return clientIdsOf(row).includes(clientId)
}

/**
 * Texto de display para la celda de "Cliente" de una tabla: primer nombre + "+N" si hay
 * más de una marca, con fallback al texto legado y luego a `emptyLabel`.
 */
export function clientDisplayName(
  row,
  clientsById = new Map(),
  { fallback, emptyLabel = 'Sin cliente' } = {},
) {
  const names = clientNamesOf(row, clientsById, { fallback })
  if (names.length === 0) return emptyLabel
  return names.length > 1 ? `${names[0]} +${names.length - 1}` : names[0]
}
