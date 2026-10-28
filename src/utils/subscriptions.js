/**
 * Lógica pura de Empresa → Suscripciones: próximo cobro, equivalente mensual y totales.
 * No toca Supabase ni el DOM.
 *
 * Regla dura del repo: aritmética de strings sobre 'yyyy-MM-dd', nunca `new Date(string)`
 * (en UTC−4 corre el día). Los días del mes se calculan con `Date.UTC`, que no depende de
 * la zona horaria.
 */

export const FREQUENCIES = {
  mensual: { label: 'Mensual', months: 1 },
  trimestral: { label: 'Trimestral', months: 3 },
  anual: { label: 'Anual', months: 12 },
}

// Tipo de herramienta (filtro y etiqueta de la lista). Mismas keys que el CHECK
// `company_subscriptions_service_type_check`.
export const SERVICE_TYPES = [
  { key: 'ia', label: 'IA', description: 'Asistentes y modelos: Claude, ChatGPT, Gemini' },
  { key: 'imagen', label: 'Imagen', description: 'Generación, mejora y edición de imágenes' },
  { key: 'video', label: 'Video', description: 'Edición y generación de video: CapCut, TikTok' },
  { key: 'diseno', label: 'Diseño', description: 'Herramientas de diseño gráfico y creativo' },
  { key: 'almacenamiento', label: 'Almacenamiento', description: 'Nube y espacio de archivos' },
  { key: 'otro', label: 'Otro', description: 'Cualquier otro software' },
]

export const CURRENCIES = ['USD', 'Bs', 'EUR']

export const STATUS_META = {
  activa: { label: 'Activa', bg: 'bg-[#e8f5e9]', text: 'text-[#2e7d32]', dot: 'bg-[#2e7d32]' },
  pausada: { label: 'Pausada', bg: 'bg-[#fff3e0]', text: 'text-[#e65100]', dot: 'bg-[#e65100]' },
  cancelada: { label: 'Cancelada', bg: 'bg-[#f5f3eb]', text: 'text-[#888]', dot: 'bg-[#bbb]' },
}

const pad = (n) => String(n).padStart(2, '0')

function daysInMonth(year, month) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

function dateKey(year, month, day) {
  return `${year}-${pad(month)}-${pad(Math.min(day, daysInMonth(year, month)))}`
}

function parseKey(key) {
  const [y, m, d] = key.split('-').map(Number)
  return { y, m, d }
}

/**
 * Próximo cobro (yyyy-MM-dd) en o después de `todayKey`, o `null` si la suscripción no
 * está activa o si aún no se conoce el día de cobro (`billing_day` null: fecha por
 * confirmar). Un día que no existe en el mes (31 en febrero) cae en el último día de ese
 * mes. Trimestral/anual cobran en `billing_month` y cada 3/12 meses a partir de él.
 */
export function nextBillingDate(sub, todayKey) {
  if (!sub || sub.status !== 'activa' || sub.billing_day == null) return null
  const step = FREQUENCIES[sub.frequency]?.months ?? 1
  const { y, m } = parseKey(todayKey)
  const anchor = sub.frequency === 'mensual' ? m : (sub.billing_month ?? m)

  // Meses desde el mes ancla hasta el mes de hoy, para alinear a la rejilla del ciclo.
  for (let offset = 0; offset <= 12 + step; offset++) {
    const total = y * 12 + (m - 1) + offset
    const year = Math.floor(total / 12)
    const month = (total % 12) + 1
    const onGrid = (((month - anchor) % step) + step) % step === 0
    if (!onGrid) continue
    const key = dateKey(year, month, sub.billing_day)
    if (key >= todayKey) return key
  }
  return null
}

/** ¿Cobra dentro de los próximos `days` días (incluye hoy)? Pausadas/canceladas o sin día → false. */
export function dueWithin(sub, todayKey, days = 7) {
  const next = nextBillingDate(sub, todayKey)
  return !!next && daysUntil(next, todayKey) <= days
}

/** Datos que faltan por completar de una suscripción no cancelada (para resaltarla). */
export function missingInfo(sub) {
  if (!sub || sub.status === 'cancelada') return []
  const missing = []
  if (!sub.card_last4) missing.push('tarjeta')
  if (sub.billing_day == null) missing.push('fecha de cobro')
  return missing
}

/** Días calendario entre dos yyyy-MM-dd (b - a). */
export function daysUntil(targetKey, todayKey) {
  const a = parseKey(todayKey)
  const b = parseKey(targetKey)
  return Math.round((Date.UTC(b.y, b.m - 1, b.d) - Date.UTC(a.y, a.m - 1, a.d)) / 86400000)
}

/** Lo que cuesta por mes: anual / 12, trimestral / 3. */
export function monthlyEquivalent(sub) {
  const step = FREQUENCIES[sub.frequency]?.months ?? 1
  return Number(sub.amount || 0) / step
}

/** Total mensual estimado por moneda (solo activas); no convierte entre monedas. */
export function totalsByCurrency(subs = []) {
  const totals = {}
  for (const s of subs) {
    if (s.status !== 'activa') continue
    totals[s.currency] = (totals[s.currency] ?? 0) + monthlyEquivalent(s)
  }
  return totals
}

export function formatAmount(amount, currency) {
  const n = Number(amount || 0).toLocaleString('es-VE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
  return currency === 'USD' ? `$${n}` : currency === 'EUR' ? `€${n}` : `Bs ${n}`
}

// ── Asignación a líneas / departamentos ─────────────────────────────────────────

const cents = (n) => Math.round(n * 100)

/** Clave estable del destino de una asignación: `line:<id>` o `dept:<id>`. */
export function allocationKey(a) {
  return a.line_id ? `line:${a.line_id}` : `dept:${a.department_id}`
}

/**
 * Fracción (0-1) que le toca a cada asignación. Sin ningún `share_pct` → partes iguales;
 * con %, se usa el % de cada una. Mantiene el orden recibido.
 */
export function allocationShares(allocations = []) {
  if (allocations.length === 0) return []
  const manual = allocations.some((a) => a.share_pct != null)
  return allocations.map((a) => ({
    ...a,
    pct: manual ? Number(a.share_pct || 0) / 100 : 1 / allocations.length,
  }))
}

/**
 * Errores de una lista de asignaciones (vacía = válida): sin duplicados; si alguna trae %,
 * todas deben traerlo y sumar 100 (±0.01).
 */
export function validateAllocations(allocations = []) {
  const errors = []
  const keys = allocations.map(allocationKey)
  if (new Set(keys).size !== keys.length) errors.push('Hay destinos repetidos.')
  const withPct = allocations.filter((a) => a.share_pct != null && a.share_pct !== '')
  if (withPct.length > 0) {
    if (withPct.length !== allocations.length) {
      errors.push('Si pones porcentaje, todas las asignaciones deben tenerlo.')
    } else {
      const sum = withPct.reduce((acc, a) => acc + Number(a.share_pct), 0)
      if (Math.abs(sum - 100) > 0.01) errors.push('Los porcentajes deben sumar 100%.')
    }
  }
  return errors
}

/**
 * Costo mensual (en centavos exactos) que le toca a cada asignación: equivalente mensual ×
 * fracción. La última absorbe el residuo para que la suma cuadre con el total.
 * Devuelve `[{...alloc, pct, monthly}]`.
 */
export function allocatedMonthly(sub, allocations = []) {
  const shares = allocationShares(allocations)
  if (shares.length === 0) return []
  const total = cents(monthlyEquivalent(sub))
  let assigned = 0
  return shares.map((a, i) => {
    const isLast = i === shares.length - 1
    const c = isLast ? total - assigned : Math.round(total * a.pct)
    assigned += c
    return { ...a, monthly: c / 100 }
  })
}

/**
 * Suma mensual por destino (solo activas y USD) para el resumen de Suscripciones.
 * @returns {{ lines: Record<string, number>, departments: Record<string, number>, unassigned: number }}
 */
export function costsByTarget(subs = [], allocations = []) {
  const bySub = {}
  allocations.forEach((a) => (bySub[a.subscription_id] ??= []).push(a))
  const out = { lines: {}, departments: {}, unassigned: 0 }
  for (const s of subs) {
    if (s.status !== 'activa' || s.currency !== 'USD') continue
    const rows = allocatedMonthly(s, bySub[s.id] ?? [])
    if (rows.length === 0) {
      out.unassigned += monthlyEquivalent(s)
      continue
    }
    rows.forEach((r) => {
      if (r.line_id) out.lines[r.line_id] = (out.lines[r.line_id] ?? 0) + r.monthly
      else out.departments[r.department_id] = (out.departments[r.department_id] ?? 0) + r.monthly
    })
  }
  return out
}
