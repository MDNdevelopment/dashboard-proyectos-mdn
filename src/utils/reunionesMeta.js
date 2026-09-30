/**
 * Meta de reuniones del período: 1 por cada marca de la línea, descontando las que
 * se justificaron como "No aplica" en ese mes (reuniones.justificativos). Cada marca
 * aporta como máximo 1 reunión al conteo (ver countMeetingsHeldForLine en meetingsApi.js).
 *
 * @param {Array} clients - Marcas de la línea en el período (roster de reuniones).
 * @param {object} justificativos - { [clienteId]: 'no_aplica' | 'reprogramado_cliente' | 'no_cumplio' }
 * @returns {number}
 */
export function computeReunionesMeta(clients = [], justificativos = {}) {
  return clients.filter((c) => justificativos?.[c.id] !== 'no_aplica').length
}

/**
 * Marcas que aún no tienen reunión realizada en el período y sí eran exigibles: excluye
 * tanto a las que ya tuvieron reunión como a las justificadas "No aplica" (estas últimas
 * ya se descuentan de la Meta vía computeReunionesMeta, así que tampoco deben contar aquí
 * como pendientes).
 *
 * @param {Array} clients - Marcas de la línea en el período (roster de reuniones).
 * @param {Array} heldClientIds - Ids de marcas con reunión realizada en el período.
 * @param {object} justificativos - { [clienteId]: 'no_aplica' | 'reprogramado_cliente' | 'no_cumplio' }
 * @returns {number}
 */
export function countMarcasSinReunion(clients = [], heldClientIds = [], justificativos = {}) {
  const held = new Set(heldClientIds)
  return clients.filter((c) => !held.has(c.id) && justificativos?.[c.id] !== 'no_aplica').length
}
