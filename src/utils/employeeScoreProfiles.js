/**
 * Resolución de perfiles de peso por cargo (tabla `employee_score_profiles`) para la
 * Evaluación automática de desempeño — ver ARQUITECTURA.md §2.7. Puro: no toca Supabase.
 *
 * Un perfil describe QUÉ PRODUCE UN CARGO (qué indicadores le aplican y cuánto pesa cada
 * uno), no qué tan bien lo hizo una persona — por eso el matcheo es por cargo/departamento/
 * nivel, nunca por usuario individual (deliberadamente fuera de la UI, ver plan).
 */

/** Los indicadores del score, en el orden en que se muestran (primero los básicos
 * que usan los perfiles por cargo, al final los anteriores con peso 0). */
export const INDICATOR_KEYS = [
  'tareas',
  'cnp',
  'grilla',
  'calendario',
  'metricas',
  'plataformas',
  'artes',
  'pautas',
  'piezas_grabadas',
  'fotos',
  'videos',
  'edicion_cnp',
  'edicion',
  'campanas',
  'tickets',
  'entregas',
  'puntualidad',
  'arrastre',
  'tareas_fijas',
  'piezas_av',
  'reuniones',
  'chequeo',
]

/** Qué evalúa cada indicador, en lenguaje llano — lo muestra el botón "i" de la ficha. */
export const INDICATOR_DESCRIPTIONS = {
  tareas:
    'Tareas asignadas a ti que vencían este mes y que cerraste en o antes de su fecha de entrega. Una tarea que dura varios meses solo cuenta el mes en que vence.',
  cnp: 'Solicitudes CNP asignadas a ti que vencían este mes y que entregaste a tiempo.',
  grilla:
    'Semanas en las que entregaste la grilla de tus cuentas (cada miércoles), sobre las semanas que tocaban.',
  calendario:
    'Veces que entregaste el calendario del mes de tus cuentas, a más tardar el último día hábil.',
  metricas:
    'Métricas de tus cuentas cargadas a más tardar el quinto día hábil del mes, sobre las cuentas que tenías.',
  plataformas:
    'De todas las casillas del Chequeo de tus cuentas (cuenta, red y tipo de contenido) que debían tener fecha este mes, cuántas la tienen. La meta son 4 registros al mes por casilla (1 en YouTube y Mailchimp); una casilla sin registrar cuenta como pendiente.',
  artes:
    'Semanas en las que entregaste los artes fijos de tus cuentas (cada lunes), sobre las semanas que tocaban.',
  pautas:
    'De las pautas del mes en las que fuiste asignado como recurso y que ya pasaron su fecha, a cuántas asististe (las realizadas). Las declinadas no cuentan.',
  piezas_grabadas:
    'De las piezas que grabaste este mes (video, reel y foto), cuántas ya quedaron editadas. Se calcula con lo que registraste en cada pauta realizada.',
  fotos: 'De las fotos que capturaste este mes, cuántas ya quedaron editadas.',
  videos: 'De los videos y reels que capturaste este mes, cuántos ya quedaron editados.',
  edicion_cnp: 'Piezas de CNP audiovisual que te pidieron este mes y que ya están entregadas.',
  edicion:
    'Piezas que te pidieron editar este mes (las asignadas en pautas y las de CNP audiovisual) y que ya están listas.',
  campanas:
    'Campañas pagadas finalizadas con sus resultados cargados, más el avance del checklist de las campañas orgánicas.',
  tickets:
    'Tickets de soporte que resolviste dentro del tiempo de respuesta que corresponde a su prioridad.',
  entregas: 'Tareas cerradas y piezas de CNP entregadas, sobre las que tenías asignadas en el mes.',
  puntualidad:
    'Entregas (tareas y CNP) cerradas en o antes de la fecha pactada, sobre las cerradas.',
  arrastre:
    'Tareas abiertas que vienen de meses anteriores y ya debían estar cerradas, paralizadas o vencidas. Mientras menos, mejor.',
  tareas_fijas:
    'Cumplimiento del checklist semanal de tareas fijas (60% cumplirlo, 40% hacerlo a tiempo).',
  piezas_av:
    'Piezas audiovisuales asignadas a ti como editor, sobre las que ya están en estado Listo.',
  reuniones:
    'Asistencia a las reuniones a las que te convocaron otras personas (las que convocas tú no cuentan).',
  chequeo:
    'Celdas de chequeo de plataformas de tus cuentas que tienen fecha de publicación registrada.',
}

/**
 * Especificidad de un perfil, mayor gana: position_ids > department_ids > min_level >
 * is_default. `priority` (columna de la tabla) desempata perfiles con el mismo nivel de
 * especificidad.
 */
function specificity(match) {
  if (match?.position_ids?.length) return 3
  if (match?.department_ids?.length) return 2
  if (match?.min_level != null) return 1
  return 0
}

/** true si `user` matchea el `match` de un perfil (no default). */
function matches(user, match) {
  if (!match) return false
  if (match.position_ids?.length) {
    return match.position_ids.map(String).includes(String(user.position_id))
  }
  if (match.department_ids?.length) {
    return match.department_ids.map(String).includes(String(user.department_id))
  }
  if (match.min_level != null) {
    return Number(user.access_level ?? 0) >= Number(match.min_level)
  }
  return false
}

/**
 * Resuelve el perfil aplicable a un empleado entre una lista de perfiles de su empresa.
 * Orden: mayor especificidad primero; empate → mayor `priority`; sin match → el perfil
 * `is_default` (siempre debe existir uno, sembrado en la migración de F1).
 *
 * @param {object} user     {position_id, department_id, access_level}
 * @param {Array} profiles  filas de employee_score_profiles de la empresa
 * @returns {object|null} el perfil elegido, o null si no hay ni siquiera un default
 */
export function resolveProfile(user, profiles) {
  if (!profiles?.length) return null
  const candidates = profiles
    .filter((p) => !p.is_default && matches(user, p.match))
    .sort(
      (a, b) =>
        specificity(b.match) - specificity(a.match) || (b.priority ?? 0) - (a.priority ?? 0),
    )
  if (candidates.length) return candidates[0]
  return profiles.find((p) => p.is_default) ?? null
}

/**
 * Normaliza los pesos declarados de un perfil a los indicadores que de verdad aplicaron
 * este mes (según `aplica` de cada resultado), redistribuyendo el peso de los que no
 * aplicaron proporcionalmente entre los que sí — mismo mecanismo que `calcSolicitudes` en
 * metricsScore.js, generalizado a N indicadores.
 *
 * Peso 0 en el perfil = el indicador nunca aplica a ese cargo (no participa ni recibe
 * redistribución). Un indicador con peso > 0 pero `aplica: false` (p. ej. sin volumen
 * mínimo ese mes) cede su peso a los demás aplicables.
 *
 * @param {Record<string, number>} weights     pesos base del perfil, ej. {entregas: 25, ...}
 * @param {Array<{key:string, aplica:boolean}>} results  salida de los calcX()
 * @returns {Record<string, number>} pesos efectivos, suman 100 si hay al menos un aplicable
 */
export function effectiveWeights(weights, results) {
  const aplicables = results.filter((r) => r.aplica && Number(weights?.[r.key] ?? 0) > 0)
  const totalBase = aplicables.reduce((sum, r) => sum + Number(weights[r.key]), 0)
  const effective = {}
  if (totalBase === 0) return effective
  const scale = 100 / totalBase
  aplicables.forEach((r) => {
    effective[r.key] = Number(weights[r.key]) * scale
  })
  return effective
}
