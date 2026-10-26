/**
 * Texto de cifras reales de cada indicador del score, para la ficha de desempeño
 * (`ScoreBreakdownCard`): "4 de 7 tareas cerradas a tiempo", o el motivo concreto por el que
 * un indicador no aplicó. Se arma solo con lo que ya viaja en `breakdown[].detalle` (en vivo
 * y en `employee_score_snapshots`), así que funciona igual en meses cerrados. Puro.
 *
 * Frases neutras (no en segunda persona) porque la ficha la ve también el jefe sobre otra
 * persona; `employeeScoreNarrative.js` tiene las suyas, escritas para ir dentro de prosa.
 */
import { MIN_UNITS } from './employeeScore'

const isNum = (v) => typeof v === 'number' && Number.isFinite(v)
const pl = (n, one, many) => (n === 1 ? one : many)
const deN = (a, b) => `${a} de ${b}`

/** Frase de cifras, o null si `detalle` no trae los campos esperados (nunca se inventa). */
const FORMATTERS = {
  tareas: (d) =>
    isNum(d.total) && isNum(d.cumplidas) && d.total > 0
      ? `${deN(d.cumplidas, d.total)} ${pl(d.total, 'tarea cerrada', 'tareas cerradas')} a tiempo`
      : null,
  cnp: (d) =>
    isNum(d.total) && isNum(d.cumplidas) && d.total > 0
      ? `${deN(d.cumplidas, d.total)} ${pl(d.total, 'solicitud CNP', 'solicitudes CNP')} a tiempo`
      : null,
  grilla: (d) => semanas(d),
  artes: (d) => semanas(d),
  calendario: (d) =>
    isNum(d.si) && isNum(d.meta) && d.meta > 0
      ? `${deN(d.si, d.meta)} ${pl(d.meta, 'entrega', 'entregas')} del calendario`
      : null,
  metricas: (d) =>
    isNum(d.si) && isNum(d.meta) && d.meta > 0
      ? `${deN(d.si, d.meta)} ${pl(d.meta, 'cuenta', 'cuentas')} con métricas cargadas`
      : null,
  plataformas: (d) =>
    isNum(d.realizado) && isNum(d.meta) && d.meta > 0
      ? `${deN(d.realizado, d.meta)} registros de plataformas`
      : null,
  pautas: (d) =>
    isNum(d.realizadas) && isNum(d.unidades) && d.unidades > 0
      ? `${deN(d.realizadas, d.unidades)} ${pl(d.unidades, 'pauta asistida', 'pautas asistidas')}`
      : null,
  piezas_grabadas: (d) => editadas(d, 'piezas grabadas ya editadas'),
  fotos: (d) => editadas(d, 'fotos capturadas ya editadas'),
  videos: (d) => editadas(d, 'videos capturados ya editados'),
  edicion_cnp: (d) =>
    isNum(d.entregadas) && isNum(d.solicitadas) && d.solicitadas > 0
      ? `${deN(d.entregadas, d.solicitadas)} ${pl(d.solicitadas, 'pieza de CNP entregada', 'piezas de CNP entregadas')}`
      : null,
  edicion: (d) =>
    isNum(d.listas) && isNum(d.unidades) && d.unidades > 0
      ? `${deN(d.listas, d.unidades)} ${pl(d.unidades, 'edición lista', 'ediciones listas')}`
      : null,
  campanas: (d) => {
    const p = d.misPagadas ?? 0
    const o = d.misOrganicas ?? 0
    if (!isNum(p) || !isNum(o) || p + o === 0) return null
    return [
      p > 0 && `${p} ${pl(p, 'pagada', 'pagadas')}`,
      o > 0 && `${o} ${pl(o, 'orgánica', 'orgánicas')}`,
    ]
      .filter(Boolean)
      .join(' · ')
  },
  tickets: (d) =>
    isNum(d.enSla) && isNum(d.unidades) && d.unidades > 0
      ? `${deN(d.enSla, d.unidades)} ${pl(d.unidades, 'ticket', 'tickets')} dentro del tiempo`
      : null,
  // Indicadores anteriores (snapshots ya congelados).
  entregas: (d) => {
    const partes = []
    if (d.tUniverso > 0) partes.push(`${deN(d.tCerradas, d.tUniverso)} tareas cerradas`)
    if (d.cSolicitadas > 0)
      partes.push(`${deN(d.cEntregadas, d.cSolicitadas)} piezas CNP entregadas`)
    return partes.length ? partes.join(' · ') : null
  },
  puntualidad: (d) =>
    isNum(d.aTiempo) && isNum(d.total) && d.total > 0
      ? `${deN(d.aTiempo, d.total)} entregas a tiempo`
      : null,
  arrastre: (d) =>
    isNum(d.problematicas) && isNum(d.unidades) && d.unidades > 0
      ? `${deN(d.problematicas, d.unidades)} tareas abiertas arrastradas, paralizadas o vencidas`
      : null,
  tareas_fijas: (d) =>
    isNum(d.si) && isNum(d.meta) && d.meta > 0
      ? `${deN(d.si, d.meta)} tareas fijas cumplidas`
      : null,
  piezas_av: (d) =>
    isNum(d.listas) && isNum(d.unidades) && d.unidades > 0
      ? `${deN(d.listas, d.unidades)} piezas listas`
      : null,
  reuniones: (d) =>
    isNum(d.realizadas) && isNum(d.unidades) && d.unidades > 0
      ? `${deN(d.realizadas, d.unidades)} reuniones realizadas`
      : null,
  chequeo: (d) =>
    isNum(d.conFecha) && isNum(d.unidades) && d.unidades > 0
      ? `${deN(d.conFecha, d.unidades)} chequeos con publicación registrada`
      : null,
}

function semanas(d) {
  return isNum(d.si) && isNum(d.meta) && d.meta > 0
    ? `${deN(d.si, d.meta)} ${pl(d.meta, 'semana cumplida', 'semanas cumplidas')}`
    : null
}

/** "N de M <frase>" para los ítems de grabadas vs editadas. */
function editadas(d, frase) {
  return isNum(d.editadas) && isNum(d.grabadas) && d.grabadas > 0
    ? `${deN(d.editadas, d.grabadas)} ${frase}`
    : null
}

/** @returns {string|null} frase con las cifras reales del indicador, o null */
export function formatIndicatorDetail(key, detalle) {
  if (!detalle || typeof detalle !== 'object') return null
  return FORMATTERS[key]?.(detalle) ?? null
}

/** [singular, plural] de lo que cuenta cada indicador, para "Hubo N …; se necesitan al menos M". */
const NOUNS = {
  tareas: ['tarea con vencimiento', 'tareas con vencimiento'],
  cnp: ['solicitud CNP con vencimiento', 'solicitudes CNP con vencimiento'],
  grilla: ['semana por cumplir', 'semanas por cumplir'],
  artes: ['semana por cumplir', 'semanas por cumplir'],
  calendario: ['entrega por cumplir', 'entregas por cumplir'],
  metricas: ['cuenta con métricas por cargar', 'cuentas con métricas por cargar'],
  pautas: ['pauta', 'pautas'],
  plataformas: ['registro por cumplir', 'registros por cumplir'],
  piezas_grabadas: ['pieza grabada', 'piezas grabadas'],
  fotos: ['foto capturada', 'fotos capturadas'],
  videos: ['video capturado', 'videos capturados'],
  edicion_cnp: ['pieza de CNP', 'piezas de CNP'],
  edicion: ['pieza por editar', 'piezas por editar'],
  campanas: ['campaña', 'campañas'],
  tickets: ['ticket', 'tickets'],
  entregas: ['entrega', 'entregas'],
  puntualidad: ['entrega cerrada', 'entregas cerradas'],
  arrastre: ['tarea abierta', 'tareas abiertas'],
  tareas_fijas: ['tarea fija', 'tareas fijas'],
  piezas_av: ['pieza', 'piezas'],
  reuniones: ['reunión convocada por otros', 'reuniones convocadas por otros'],
  chequeo: ['celda de chequeo', 'celdas de chequeo'],
}

/**
 * Motivo concreto por el que un indicador no aplicó este mes (en vez de un genérico
 * "sin datos suficientes").
 * @param {string} key
 * @param {{unidades?:number}} info  `unidades` del breakdown
 */
export function explainNoData(key, { unidades = 0 } = {}) {
  const [one, many] = NOUNS[key] ?? ['unidad', 'unidades']
  const min = MIN_UNITS[key]
  if (unidades > 0 && min && unidades < min) {
    return `Hubo ${unidades} ${pl(unidades, one, many)}; se necesitan al menos ${min}`
  }
  return `Sin ${many} este mes`
}
