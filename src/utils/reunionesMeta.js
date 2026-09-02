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
