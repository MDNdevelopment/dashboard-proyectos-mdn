function sameUtcMonth(a, b) {
  const da = new Date(a)
  const db = new Date(b)
  return da.getUTCFullYear() === db.getUTCFullYear() && da.getUTCMonth() === db.getUTCMonth()
}

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
 * La bandera `baja_incluye_mes` (default true) aplica a clientes ARCHIVADOS (`deleted_at`)
 * y decide qué pasa con el mes de baja:
 *   - true  → el cliente cuenta hasta e INCLUYENDO el mes de baja (facturó/trabajó
 *             parte del mes). Comportamiento histórico.
 *   - false → el cliente se excluye del mes de baja y siguientes (no facturó / alta
 *             por error), pero SIGUE apareciendo en los meses anteriores a la baja.
 * Si además hay `contract_end` (archivar siempre lo fija), `baja_incluye_mes:false` solo
 * cuenta cuando ese fin cae en el mismo mes del archivado; en otro caso el fin de contrato
 * incluye su mes (último mes completo). Un `false` que quedó de una baja anterior en un cliente
 * activo (sin `deleted_at`) no afecta.
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
  const sacaMesBaja =
    client.baja_incluye_mes === false &&
    client.deleted_at != null &&
    (client.contract_end == null || sameUtcMonth(client.contract_end, client.deleted_at))
  const incluyeMes = sacaMesBaja
    ? false
    : client.contract_end != null
      ? true
      : client.baja_incluye_mes !== false
  return incluyeMes ? bajaMs >= startOfMonth : bajaMs > endOfMonth
}
