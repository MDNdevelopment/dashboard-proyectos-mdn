/**
 * Cálculo de los 6 indicadores ponderados (suma = 100 puntos).
 * Todas las funciones son puras: reciben el objeto `report` (y opcionalmente
 * `prevReport` para el crecimiento) y retornan el puntaje parcial.
 *
 * Indicadores y pesos: Reuniones 20, Productividad 20, Crecimiento 20,
 * Solicitudes 10, Pautas 20, Piezas 10.
 */

/** Reuniones — peso 20 */
export function calcReuniones(report) {
  const meta = report.reuniones?.meta ?? 0;
  if (meta === 0) return 0;
  return (Number(report.reuniones.realizadas ?? 0) / meta) * 20;
}

/** Productividad (tareas fijas) — peso 20 */
export function calcProductividad(report) {
  let real = 0, meta = 0;
  (report.productividad?.tareas ?? []).forEach(t => {
    real += Number(t.realizado ?? 0);
    meta += Number(t.meta ?? 0);
  });
  return meta === 0 ? 0 : (real / meta) * 20;
}

/**
 * Evalúa el crecimiento de seguidores de un cliente individual.
 *
 * @param {object} item        - Un elemento de crecimiento.items del mes actual.
 * @param {object|null} prevReport - Reporte del mes anterior o null.
 * @returns {{ crecimiento: number|null, cumple: boolean|null }}
 *   - crecimiento: delta (actuales − base), o null si faltan datos.
 *   - cumple: true/false si se pudo calcular, null si faltan datos.
 */
export function crecimientoCliente(item, prevReport = null) {
  let base = null;
  if (prevReport) {
    const prevItem = (prevReport.crecimiento?.items ?? [])
      .find(i => i.clienteId === item.clienteId);
    if (prevItem?.seguidoresActuales != null) base = prevItem.seguidoresActuales;
  }
  if (base == null && item.seguidoresBase != null) base = item.seguidoresBase;
  if (item.seguidoresActuales == null || base == null) {
    return { crecimiento: null, cumple: null };
  }
  const crec = Number(item.seguidoresActuales) - Number(base);
  return { crecimiento: crec, cumple: crec >= Number(item.meta ?? 0) };
}

/**
 * Crecimiento de seguidores — peso 15.
 *
 * @param {object} report      - El reporte actual (tiene crecimiento.items).
 * @param {object|null} prevReport - Reporte del mes anterior (para leer seguidoresActuales
 *   como base) o null si no existe.
 *
 * Para cada cliente se determina la base de seguidores:
 *   1. seguidoresActuales del mes anterior (si existe ese reporte y tiene el cliente).
 *   2. seguidoresBase manual del item actual (permite capturarlo cuando no hay mes anterior).
 *   3. Si ninguno está disponible, el cliente no cuenta (se omite).
 * Un cliente "cumple" si (seguidoresActuales − base) >= meta.
 */
export function calcCrecimiento(report, prevReport = null) {
  const items = report.crecimiento?.items ?? [];
  if (items.length === 0) return 0;

  let cumplieron = 0;
  items.forEach(it => {
    const { cumple } = crecimientoCliente(it, prevReport);
    if (cumple === true) cumplieron++;
  });

  return (cumplieron / items.length) * 20;
}

/** Solicitudes vs Entregados — peso 10 */
export function calcSolicitudes(report) {
  const s = Number(report.solicitudes?.solicitudes ?? 0);
  if (s === 0) return 0;
  return (Number(report.solicitudes.editadas ?? 0) / s) * 10;
}

/** Pautas — peso 20 */
export function calcPautas(report) {
  const items = report.pautas?.items ?? [];
  if (items.length === 0) return 0;
  let cumplieron = 0;
  items.forEach(it => {
    if (Number(it.realizadas ?? 0) >= Number(it.meta ?? 0)) cumplieron++;
  });
  return (cumplieron / items.length) * 20;
}

/** Piezas — peso 10 */
export function calcPiezas(report) {
  const p = Number(report.piezas?.piezas ?? 0);
  if (p === 0) return 0;
  return (Number(report.piezas.editadas ?? 0) / p) * 10;
}

/**
 * Retorna un objeto con el puntaje parcial de cada indicador.
 * @param {object} report
 * @param {object|null} prevReport - Reporte del mes anterior para el crecimiento.
 */
export function calcTotal(report, prevReport = null) {
  return {
    reuniones:     calcReuniones(report),
    productividad: calcProductividad(report),
    crecimiento:   calcCrecimiento(report, prevReport),
    solicitudes:   calcSolicitudes(report),
    pautas:        calcPautas(report),
    piezas:        calcPiezas(report),
  };
}

/** Suma todos los puntajes parciales → score total 0–100 (tope en 100). */
export function sumScore(scores) {
  const raw =
    scores.reuniones + scores.productividad + scores.crecimiento +
    scores.solicitudes + scores.pautas + scores.piezas;
  return Math.min(100, raw);
}
