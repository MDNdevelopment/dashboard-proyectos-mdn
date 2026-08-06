/**
 * Devuelve true si el cliente estaba activo durante el mes M del año Y.
 * Alta  = mdn_since ?? created_at
 * Baja  = contract_end ?? deleted_at (null = aún activo)
 *
 * `contract_end` (fin de contrato) tiene prioridad sobre `deleted_at`: define hasta qué
 * mes cuenta la cuenta en reportes. El mes que contiene la baja cuenta completo
 * (`bajaMs >= startOfMonth`); desde el mes siguiente la cuenta ya no aparece.
 * Clientes con solo `deleted_at` (sin fin de contrato) conservan el comportamiento previo.
 *
 * La bandera `baja_incluye_mes` (default true) aplica SOLO cuando la baja viene de
 * `deleted_at` (archivar), y decide qué pasa con el mes de baja:
 *   - true  → el cliente cuenta hasta e INCLUYENDO el mes de baja (facturó/trabajó
 *             parte del mes). Comportamiento histórico.
 *   - false → el cliente se excluye del mes de baja y siguientes (no facturó / alta
 *             por error), pero SIGUE apareciendo en los meses anteriores a la baja.
 * El fin de contrato (`contract_end`) SIEMPRE incluye su mes (último mes completo).
 *
 * Todas las comparaciones son en UTC para evitar problemas de timezone.
 */
export function clientInMonth(client, year, month) {
  const startOfMonth = Date.UTC(year, month - 1, 1)
  const endOfMonth = Date.UTC(year, month, 0, 23, 59, 59, 999) // día 0 del mes siguiente = último día del mes actual

  const altaMs = new Date(client.mdn_since ?? client.created_at).getTime()
  if (altaMs > endOfMonth) return false

  const baja = client.contract_end ?? client.deleted_at
  if (!baja) return true
  const bajaMs = new Date(baja).getTime()
  // contract_end siempre incluye su mes; para deleted_at se respeta baja_incluye_mes.
  const incluyeMes = client.contract_end != null ? true : client.baja_incluye_mes !== false
  return incluyeMes ? bajaMs >= startOfMonth : bajaMs > endOfMonth
}
