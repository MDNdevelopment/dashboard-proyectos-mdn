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
