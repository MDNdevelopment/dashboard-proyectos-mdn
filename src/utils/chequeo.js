/**
 * Lógica pura del módulo «Chequeo» (Gestión de Tareas → Chequeo): estado de alerta de
 * la última publicación por cliente × red social × tipo de contenido. Todas las
 * funciones son puras y testeables: no tocan Supabase ni el DOM.
 *
 * Cada celda guarda una única fecha ("última vez que se publicó X") que se sobrescribe
 * en cada publicación nueva y se compara contra hoy en cada render: si no se
 * actualiza, el semáforo empeora solo con el paso de los días, incluso cruzando de un
 * mes a otro (no hay navegación por mes ni historial — siempre es el estado actual).
 *
 * Aparte de la celda viva, cada guardado también inserta un evento append-only en
 * `publication_check_events` (ver chequeoApi.js → upsertCheck). `computePlataformasProductividad`
 * deriva de esos eventos el indicador «Actualización de Plataformas» del reporte mensual
 * de Productividad — reemplaza a la columna que antes vivía en Tareas Fijas.
 */

/** Los 3 tipos de contenido que se registran por cada red social del cliente. */
export const CONTENT_TYPES = ['publicaciones', 'reels', 'highlights']

export const CONTENT_LABELS = {
  publicaciones: 'Publicaciones',
  reels: 'Reels',
  highlights: 'Highlights',
}

/**
 * Solo Instagram registra Reels e Highlights (el resto de las redes solo publica
 * "Publicaciones" en el flujo real de las community managers) — las demás columnas
 * quedan como "no aplica" (celda estática, sin selector de fecha).
 */
export function contentTypeApplies(network, contentType) {
  return contentType === 'publicaciones' || network === 'Instagram'
}

/** Días desde `dateISO` (string 'YYYY-MM-DD' o Date) hasta `today` (Date), en días de calendario. */
export function daysSince(dateISO, today = new Date()) {
  if (!dateISO) return null
  const date = typeof dateISO === 'string' ? new Date(`${dateISO}T00:00:00`) : dateISO
  if (Number.isNaN(date.getTime())) return null
  const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate())
  const msPerDay = 24 * 60 * 60 * 1000
  return Math.round((startOfDay(today) - startOfDay(date)) / msPerDay)
}

/** Umbral de "un mes sin publicar" para YouTube (horizontal) — ver `checkStatus`. */
const YOUTUBE_STALE_DAYS = 30

/**
 * Estado de alerta de una celda según los días transcurridos desde la última
 * publicación: 0-5 días 'normal', 6-11 'naranja', 12+ 'rojo'. Sin fecha → 'vacio'.
 * Reglas por red que se apartan de ese default:
 *
 * - Mailchimp: la fecha es un dato decorativo (no hay forma de saber "cuándo caduca"
 *   un envío de correo como sí con un post), así que nunca entra en naranja/rojo — con
 *   fecha registrada siempre es 'normal', sin importar cuál sea.
 * - YouTube (horizontal): cadencia mucho más baja que el resto de las redes, así que
 *   solo se marca 'rojo' al mes sin publicar (~30 días) y nunca pasa por 'naranja' —
 *   0-29 días es 'normal' directo. YouTube Shorts NO entra en esta excepción: usa el
 *   default de 6/12 días, igual que Instagram.
 * @param {string|Date|null} dateISO
 * @param {Date} [today]
 * @param {string} [network]
 * @returns {'vacio'|'normal'|'naranja'|'rojo'}
 */
export function checkStatus(dateISO, today = new Date(), network) {
  if (!dateISO) return 'vacio'
  if (network === 'Mailchimp') return 'normal'
  const days = daysSince(dateISO, today)
  if (days == null) return 'vacio'
  if (network === 'YouTube') return days >= YOUTUBE_STALE_DAYS ? 'rojo' : 'normal'
  if (days >= 12) return 'rojo'
  if (days >= 6) return 'naranja'
  return 'normal'
}

/** Formatea una fecha 'YYYY-MM-DD' como "18 jul" (es-VE). */
export function formatCheckDate(dateISO) {
  if (!dateISO) return null
  const date = new Date(`${dateISO}T00:00:00`)
  if (Number.isNaN(date.getTime())) return null
  return date.toLocaleDateString('es-VE', { day: 'numeric', month: 'short' }).replace('.', '')
}

// ─── Agregación → indicador «2. Productividad» del reporte (fila "Actualización de
// Plataformas", derivada de Chequeo) ────────────────────────────────────────────────

/** Cadencia esperada: 1 actualización por semana ≈ 4 al mes, por celda (cuenta × red × tipo). */
const CADENCIA_MENSUAL = 4

/**
 * Calcula la fila «Actualización de Plataformas» del indicador «2. Productividad –
 * Tareas Fijas» del reporte mensual, a partir de los eventos de Chequeo del mes
 * (`publication_check_events`, ver chequeoApi.js → loadCheckEvents). Reemplaza a la
 * columna que antes vivía en Tareas Fijas (utils/fixedTasks.js → computeProductividad).
 *
 * Meta de cada celda aplicable (cuenta × red × tipo, según `contentTypeApplies`) =
 * {@link CADENCIA_MENSUAL} (cadencia semanal). Real = nº de eventos del mes para esa
 * celda, topado en la meta — así una celda hiperactiva no tapa a una muerta. Respeta el
 * opt-out por cliente (`client.fixed_tasks.plataformas === false`), mismo criterio que
 * usaba la columna vieja.
 *
 * @param {Array} events   publication_check_events del mes (line_id ya filtrado)
 * @param {Array} clients  cuentas de la línea (con social_links, fixed_tasks)
 * @returns {{nombre:string, realizado:number, meta:number}}
 */
export function computePlataformasProductividad(events, clients) {
  let meta = 0
  let realizado = 0
  clients.forEach((client) => {
    if (client?.fixed_tasks?.plataformas === false) return
    const networks = Array.isArray(client?.social_links)
      ? client.social_links.map((s) => s?.red).filter((red) => typeof red === 'string' && red)
      : []
    networks.forEach((network) => {
      CONTENT_TYPES.forEach((contentType) => {
        if (!contentTypeApplies(network, contentType)) return
        meta += CADENCIA_MENSUAL
        const count = events.filter(
          (e) =>
            e.client_id === client.id && e.network === network && e.content_type === contentType,
        ).length
        realizado += Math.min(CADENCIA_MENSUAL, count)
      })
    })
  })
  return { nombre: 'Actualización de Plataformas', realizado, meta }
}
