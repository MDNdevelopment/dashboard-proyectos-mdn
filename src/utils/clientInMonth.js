/**
 * Devuelve true si el cliente estaba activo durante el mes M del año Y.
 * Alta  = mdn_since ?? created_at
 * Baja  = deleted_at (null = aún activo)
 *
 * La bandera `baja_incluye_mes` (default true) decide qué pasa con el mes de baja:
 *   - true  → el cliente cuenta hasta e INCLUYENDO el mes de baja (facturó/trabajó
 *             parte del mes). Comportamiento histórico.
 *   - false → el cliente se excluye del mes de baja y siguientes (no facturó / alta
 *             por error), pero SIGUE apareciendo en los meses anteriores a la baja.
 *
 * Todas las comparaciones son en UTC para evitar problemas de timezone.
 */
export function clientInMonth(client, year, month) {
  const startOfMonth = Date.UTC(year, month - 1, 1)
  const endOfMonth = Date.UTC(year, month, 0, 23, 59, 59, 999) // día 0 del mes siguiente = último día del mes actual

  const altaMs = new Date(client.mdn_since ?? client.created_at).getTime()
  if (altaMs > endOfMonth) return false
  if (!client.deleted_at) return true
  const bajaMs = new Date(client.deleted_at).getTime()
  const incluyeMes = client.baja_incluye_mes !== false // default: conservar (legacy)
  return incluyeMes ? bajaMs >= startOfMonth : bajaMs > endOfMonth
}
