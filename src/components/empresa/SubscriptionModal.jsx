import { useState } from 'react'
import { createSubscription, updateSubscription } from '../../lib/subscriptions'
import { CATEGORIAS_GASTO } from '../finanzas/constants'
import DescribedSelect from '../common/DescribedSelect'
import { CURRENCIES, FREQUENCIES, STATUS_META } from '../../utils/subscriptions'

const MONTHS = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
]

const LABEL = 'block text-[11.5px] font-mono uppercase tracking-wide text-[#999] mb-1'

function todayKey() {
  const d = new Date()
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

/**
 * Crear/editar una suscripción (`subscription` null = crear). Guarda solo los últimos 4
 * dígitos de la tarjeta y nunca contraseñas.
 */
export default function SubscriptionModal({
  companyId,
  userId,
  employees = [],
  subscription,
  onClose,
  onSaved,
}) {
  const isEdit = subscription != null
  const [form, setForm] = useState({
    name: subscription?.name ?? '',
    category: subscription?.category ?? 'conectividad',
    amount: subscription?.amount ?? '',
    currency: subscription?.currency ?? 'USD',
    frequency: subscription?.frequency ?? 'mensual',
    billing_day: subscription?.billing_day ?? '',
    billing_month: subscription?.billing_month ?? '',
    card_last4: subscription?.card_last4 ?? '',
    owner_user_id: subscription?.owner_user_id ?? '',
    account_email: subscription?.account_email ?? '',
    url: subscription?.url ?? '',
    status: subscription?.status ?? 'activa',
    start_date: subscription?.start_date ?? '',
    comment: subscription?.comment ?? '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))

  async function handleSave() {
    // El día de cobro puede quedar vacío (fecha por confirmar); si se llena, debe ser válido.
    const hasDay = form.billing_day !== '' && form.billing_day != null
    const day = hasDay ? Number(form.billing_day) : null
    if (!form.name.trim()) return setError('El nombre del servicio es obligatorio.')
    if (hasDay && (!Number.isInteger(day) || day < 1 || day > 31))
      return setError('El día de cobro debe estar entre 1 y 31.')
    if (hasDay && form.frequency !== 'mensual' && !form.billing_month)
      return setError('Elige el mes de cobro.')
    if (form.card_last4 && !/^\d{4}$/.test(form.card_last4))
      return setError('Los últimos dígitos de la tarjeta deben ser exactamente 4 números.')
    if (form.amount !== '' && Number(form.amount) < 0)
      return setError('El monto no puede ser negativo.')

    const wasCancelled = subscription?.status === 'cancelada'
    const fields = {
      name: form.name.trim(),
      category: form.category,
      amount: Number(form.amount || 0),
      currency: form.currency,
      frequency: form.frequency,
      billing_day: day,
      billing_month:
        form.frequency === 'mensual' || !form.billing_month ? null : Number(form.billing_month),
      card_last4: form.card_last4 || null,
      owner_user_id: form.owner_user_id || null,
      account_email: form.account_email.trim() || null,
      url: form.url.trim() || null,
      status: form.status,
      start_date: form.start_date || null,
      comment: form.comment.trim() || null,
      cancelled_at:
        form.status === 'cancelada'
          ? wasCancelled
            ? subscription.cancelled_at
            : todayKey()
          : null,
    }

    setSaving(true)
    setError(null)
    try {
      const saved = isEdit
        ? await updateSubscription(subscription.id, fields)
        : await createSubscription(companyId, fields, userId)
      onSaved(saved)
      onClose()
    } catch (err) {
      setError(err.message)
      setSaving(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-sm bg-black/30"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="bg-white rounded-2xl border border-[#e8e5db] w-full max-w-xl shadow-2xl max-h-[92vh] flex flex-col">
        <div className="px-6 py-5 border-b border-[#eeebe0]">
          <h2 className="text-[18px] font-semibold text-[#111]">
            {isEdit ? 'Editar suscripción' : 'Nueva suscripción'}
          </h2>
        </div>

        <div className="px-6 py-5 space-y-4 overflow-y-auto">
          {error && (
            <div className="px-3 py-2 rounded-lg bg-red-50 text-red-700 text-[12.5px]">{error}</div>
          )}

          <div>
            <label htmlFor="sub-name" className={LABEL}>
              Servicio
            </label>
            <input
              id="sub-name"
              className="input-base w-full"
              value={form.name}
              onChange={set('name')}
              placeholder="Ej. Adobe Creative Cloud"
              autoFocus
            />
          </div>

          <div>
            <span className={LABEL}>Rubro</span>
            <DescribedSelect
              ariaLabel="Rubro"
              value={form.category}
              options={CATEGORIAS_GASTO}
              onChange={(key) => setForm((f) => ({ ...f, category: key }))}
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <label htmlFor="sub-amount" className={LABEL}>
                Monto
              </label>
              <input
                id="sub-amount"
                type="number"
                min="0"
                step="0.01"
                className="input-base w-full"
                value={form.amount}
                onChange={set('amount')}
              />
            </div>
            <div>
              <label htmlFor="sub-currency" className={LABEL}>
                Moneda
              </label>
              <select
                id="sub-currency"
                className="input-base w-full"
                value={form.currency}
                onChange={set('currency')}
              >
                {CURRENCIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label htmlFor="sub-frequency" className={LABEL}>
                Frecuencia
              </label>
              <select
                id="sub-frequency"
                className="input-base w-full"
                value={form.frequency}
                onChange={set('frequency')}
              >
                {Object.entries(FREQUENCIES).map(([key, f]) => (
                  <option key={key} value={key}>
                    {f.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="sub-day" className={LABEL}>
                Día de cobro
              </label>
              <input
                id="sub-day"
                type="number"
                min="1"
                max="31"
                className="input-base w-full"
                value={form.billing_day}
                onChange={set('billing_day')}
                placeholder="Por confirmar"
              />
            </div>
            {form.frequency !== 'mensual' && (
              <div>
                <label htmlFor="sub-month" className={LABEL}>
                  Mes de cobro
                </label>
                <select
                  id="sub-month"
                  className="input-base w-full"
                  value={form.billing_month}
                  onChange={set('billing_month')}
                >
                  <option value="">—</option>
                  {MONTHS.map((m, i) => (
                    <option key={m} value={i + 1}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="sub-card" className={LABEL}>
                Tarjeta (últimos 4)
              </label>
              <input
                id="sub-card"
                inputMode="numeric"
                maxLength={4}
                className="input-base w-full font-mono"
                value={form.card_last4}
                onChange={(e) =>
                  setForm((f) => ({ ...f, card_last4: e.target.value.replace(/\D/g, '') }))
                }
                placeholder="1234"
              />
            </div>
            <div>
              <label htmlFor="sub-owner" className={LABEL}>
                Responsable
              </label>
              <select
                id="sub-owner"
                className="input-base w-full"
                value={form.owner_user_id}
                onChange={set('owner_user_id')}
              >
                <option value="">Sin asignar</option>
                {employees.map((e) => (
                  <option key={e.user_id} value={e.user_id}>
                    {[e.first_name, e.last_name].filter(Boolean).join(' ')}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="sub-status" className={LABEL}>
                Estado
              </label>
              <select
                id="sub-status"
                className="input-base w-full"
                value={form.status}
                onChange={set('status')}
              >
                {Object.entries(STATUS_META).map(([key, s]) => (
                  <option key={key} value={key}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="sub-start" className={LABEL}>
                Inicio
              </label>
              <input
                id="sub-start"
                type="date"
                className="input-base w-full"
                value={form.start_date}
                onChange={set('start_date')}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="sub-email" className={LABEL}>
                Correo de la cuenta
              </label>
              <input
                id="sub-email"
                type="email"
                className="input-base w-full"
                value={form.account_email}
                onChange={set('account_email')}
              />
            </div>
            <div>
              <label htmlFor="sub-url" className={LABEL}>
                URL del servicio
              </label>
              <input
                id="sub-url"
                className="input-base w-full"
                value={form.url}
                onChange={set('url')}
                placeholder="https://"
              />
            </div>
          </div>
          <p className="text-[12px] text-[#999] -mt-2">
            Puedes dejar vacíos el día de cobro y la tarjeta si aún no los sabes y completarlos
            después. Nunca guardes contraseñas ni el número completo de la tarjeta aquí.
          </p>

          <div>
            <label htmlFor="sub-comment" className={LABEL}>
              Comentario
            </label>
            <textarea
              id="sub-comment"
              rows={3}
              className="input-base w-full"
              value={form.comment}
              onChange={set('comment')}
              placeholder="Para qué se usa, quién la necesita…"
            />
          </div>
        </div>

        <div className="flex gap-3 px-6 py-4 border-t border-[#eeebe0]">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 px-4 py-2.5 border border-[#e0ddd4] text-[#666] rounded-xl text-[15px] font-semibold hover:bg-[#f5f3eb] transition-colors"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="flex-1 px-4 py-2.5 bg-[#FFB800] text-[#111] rounded-xl text-[15px] font-bold hover:bg-[#e6a600] transition-colors disabled:opacity-50"
          >
            {saving ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  )
}
