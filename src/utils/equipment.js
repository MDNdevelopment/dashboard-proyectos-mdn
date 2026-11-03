// Empresa → Equipos (iPhones): lógica pura (sin Supabase ni React) para poder testearla.

// Modelos comunes que sugiere el formulario; el campo sigue siendo texto libre para poder
// agregar cualquier otro.
export const IPHONE_MODELS = [
  'iPhone 11',
  'iPhone 11 Pro Max',
  'iPhone 12',
  'iPhone 12 Pro Max',
  'iPhone 13',
  'iPhone 13 Pro Max',
  'iPhone 14',
  'iPhone 14 Pro Max',
  'iPhone 15',
  'iPhone 15 Pro Max',
  'iPhone 16',
  'iPhone 16 Pro Max',
]

// Clases Tailwind literales (StatusPill no admite clases armadas en runtime).
export const STATUS_META = {
  en_uso: { label: 'En uso', bg: 'bg-[#e8f5e9]', text: 'text-[#2e7d32]', dot: 'bg-[#2e7d32]' },
  disponible: {
    label: 'Disponible',
    bg: 'bg-[#e3f2fd]',
    text: 'text-[#1565c0]',
    dot: 'bg-[#1565c0]',
  },
  en_reparacion: {
    label: 'En reparación',
    bg: 'bg-[#fff3e0]',
    text: 'text-[#e65100]',
    dot: 'bg-[#e65100]',
  },
  baja: { label: 'Dado de baja', bg: 'bg-[#f5f3eb]', text: 'text-[#888]', dot: 'bg-[#999]' },
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** Devuelve el primer error de validación, o null si el formulario es válido. */
export function validateEquipment(fields) {
  if (!String(fields.model ?? '').trim()) return 'El modelo es obligatorio.'
  const email = String(fields.icloud_email ?? '').trim()
  if (email && !EMAIL_RE.test(email)) return 'El correo de iCloud no es válido.'
  return null
}

/**
 * Filtra el inventario. `employeeName` es { [user_id]: 'Nombre Apellido' } para buscar por
 * responsable. `showRetired` false oculta los dados de baja (salvo que se filtre por ese estado).
 */
export function filterEquipment(list, filters = {}, employeeName = {}) {
  const { search = '', line = '', status = '', responsible = '', showRetired = false } = filters
  const q = search.trim().toLowerCase()
  return list.filter((eq) => {
    if (!showRetired && status !== 'baja' && eq.status === 'baja') return false
    if (line && eq.line_id !== line) return false
    if (status && eq.status !== status) return false
    if (responsible && eq.responsible_user_id !== responsible) return false
    if (!q) return true
    const haystack = [eq.model, eq.serial, eq.icloud_email, employeeName[eq.responsible_user_id]]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
    return haystack.includes(q)
  })
}

/** Conteo por estado sobre toda la lista (`total` no cuenta los dados de baja). */
export function countsByStatus(list) {
  const counts = { total: 0, en_uso: 0, disponible: 0, en_reparacion: 0, baja: 0 }
  for (const eq of list) {
    if (eq.status in counts) counts[eq.status] += 1
    if (eq.status !== 'baja') counts.total += 1
  }
  return counts
}

/**
 * Agrupa por línea (team) en el orden de `lines`; los equipos sin línea (o con una línea que
 * ya no existe) van al final en un grupo `line: null`. Cada grupo trae los correos de iCloud
 * distintos de sus equipos, para mostrar la cuenta del team como en la hoja impresa.
 * Solo devuelve grupos con equipos.
 */
export function groupByLine(list, lines = []) {
  const byLine = new Map(lines.map((l) => [l.id, []]))
  const orphans = []
  for (const eq of list) {
    if (byLine.has(eq.line_id)) byLine.get(eq.line_id).push(eq)
    else orphans.push(eq)
  }
  const groups = lines.map((line) => ({ line, items: byLine.get(line.id) }))
  groups.push({ line: null, items: orphans })
  return groups
    .filter((g) => g.items.length > 0)
    .map((g) => ({
      ...g,
      icloudEmails: [...new Set(g.items.map((i) => i.icloud_email).filter(Boolean))],
    }))
}

/** Correos de iCloud ya usados, sin repetir (ignora mayúsculas), para sugerirlos al escribir. */
export function icloudSuggestions(list) {
  const seen = new Map()
  for (const eq of list) {
    const email = (eq.icloud_email ?? '').trim()
    if (email && !seen.has(email.toLowerCase())) seen.set(email.toLowerCase(), email)
  }
  return [...seen.values()].sort((a, b) => a.localeCompare(b))
}

/** Modelos para sugerir: los comunes más los ya registrados, sin repetir (ignora mayúsculas). */
export function modelSuggestions(list) {
  const seen = new Map(IPHONE_MODELS.map((m) => [m.toLowerCase(), m]))
  for (const eq of list) {
    const model = (eq.model ?? '').trim()
    if (model && !seen.has(model.toLowerCase())) seen.set(model.toLowerCase(), model)
  }
  return [...seen.values()]
}
