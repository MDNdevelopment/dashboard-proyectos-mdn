import { useState, useEffect, useRef, useMemo } from 'react'
import { useAuth } from '../../context/AuthContext'
import { STATUSES } from './constants'
import { loadClients } from '../metricas/metricsApi'
import { createAd, updateAd, durationDays, spentByClientInPeriod, loadAdsResponsables } from './campaignSpendApi'
import { fmtUSD } from '../../utils/metricsFinance'
import { useUnsavedChanges } from '../../hooks/useUnsavedChanges'

/**
 * Modal crear/editar de un Ad (pauta pagada).
 * Convención: ad=null → crear, ad=objeto → editar.
 * `ads` — lista completa ya cargada por el padre (AdsSpendView), usada para calcular
 * el aviso de sobrepaso de presupuesto sin volver a pedir datos al servidor.
 */
export default function AdsSpendForm({ ad, ads = [], companyId, onClose, onCreated, onUpdated }) {
  const { userProfile } = useAuth()
  const isEdit = ad != null

  const [fields, setFields] = useState({
    client_id:  ad?.client_id  ?? '',
    client:     ad?.client     ?? '',
    name:       ad?.name       ?? '',
    objective:  ad?.objective  ?? '',
    piece_url:  ad?.piece_url  ?? '',
    amount:     ad?.amount     ?? '',
    start_date: ad?.start_date ?? '',
    end_date:   ad?.end_date   ?? '',
    status:     ad?.status     ?? 'Pendiente',
    responsable_id: ad?.responsable_id ?? '',
  })
  const initialFields = useRef(fields)
  const { requestClose } = useUnsavedChanges({ value: fields, baseline: initialFields.current, onClose })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  const [clients, setClients] = useState([])
  const [loadingClients, setLoadingClients] = useState(true)

  const [responsables, setResponsables] = useState([])

  useEffect(() => {
    if (!companyId) { setLoadingClients(false); return }
    loadClients(companyId).then(({ data }) => {
      setClients(data ?? [])
      setLoadingClients(false)
    })
  }, [companyId])

  useEffect(() => {
    if (!companyId) return
    loadAdsResponsables(companyId).then(({ data }) => setResponsables(data ?? []))
  }, [companyId])

  function set(key, val) {
    setFields(prev => ({ ...prev, [key]: val }))
  }

  // Al mover el inicio más allá del fin ya elegido, se limpia el fin para
  // forzar a re-elegirlo (evita dejar un rango inválido en silencio).
  function handleStartDateChange(val) {
    setFields(prev => ({
      ...prev,
      start_date: val,
      end_date: prev.end_date && prev.end_date < val ? '' : prev.end_date,
    }))
  }

  const dateRangeInvalid = !!(fields.start_date && fields.end_date && fields.end_date < fields.start_date)

  function handleClientChange(e) {
    const id = e.target.value
    const c = clients.find(x => x.id === id)
    setFields(prev => ({ ...prev, client_id: id, client: c?.name ?? '' }))
  }

  const selectedClient = useMemo(
    () => clients.find(c => c.id === fields.client_id) ?? null,
    [clients, fields.client_id]
  )

  const duration = durationDays(fields.start_date, fields.end_date)

  // Disponible del cliente para el mes del plazo de ESTE ad (o el mes actual si aún
  // no se eligió fecha de inicio), antes de sumar el monto que se está tecleando.
  const available = useMemo(() => {
    if (!selectedClient || selectedClient.campaign_budget == null) return null
    const now = new Date()
    const [year, month] = fields.start_date
      ? fields.start_date.split('-').map(Number)
      : [now.getFullYear(), now.getMonth() + 1]
    const spent = spentByClientInPeriod(ads, fields.client_id, { month, year }, ad?.id ?? null)
    return Number(selectedClient.campaign_budget) - spent
  }, [ads, selectedClient, fields.client_id, fields.start_date, ad?.id])

  // Aviso de sobrepaso: mes del inicio del plazo de ESTE ad.
  const overspend = useMemo(() => {
    if (!selectedClient?.campaign_budget || !fields.start_date || !fields.client_id) return null
    const amount = Number(fields.amount) || 0
    if (amount <= 0) return null
    const [year, month] = fields.start_date.split('-').map(Number)
    const spent = spentByClientInPeriod(ads, fields.client_id, { month, year }, ad?.id ?? null)
    const total = spent + amount
    const budget = Number(selectedClient.campaign_budget)
    if (total <= budget) return null
    return { total, budget }
  }, [ads, selectedClient, fields.client_id, fields.start_date, fields.amount, ad?.id])

  async function handleSubmit(e) {
    e.preventDefault()
    if (!fields.name.trim() || !fields.client_id || !fields.start_date || !fields.end_date || dateRangeInvalid) return
    setSubmitting(true)
    setError(null)

    const payload = {
      client_id:  fields.client_id,
      client:     fields.client,
      name:       fields.name.trim(),
      objective:  fields.objective.trim() || null,
      piece_url:  fields.piece_url.trim() || null,
      amount:     Number(fields.amount) || 0,
      start_date: fields.start_date,
      end_date:   fields.end_date,
      status:     fields.status,
      responsable_id: fields.responsable_id || null,
    }

    if (isEdit) {
      const { data, error: err } = await updateAd(ad.id, payload)
      setSubmitting(false)
      if (err) { setError('Error al actualizar el ad.'); return }
      onUpdated(data)
      onClose()
    } else {
      const { data, error: err } = await createAd(companyId, { ...payload, created_by: userProfile?.user_id ?? null })
      setSubmitting(false)
      if (err) { setError('Error al crear el ad.'); return }
      onCreated(data)
      onClose()
    }
  }

  const labelClass = 'block text-[13px] font-mono font-bold tracking-widest uppercase text-[#888] mb-1.5'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-sm bg-black/30">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="px-6 pt-6 pb-5 border-b border-[#ece9df] flex items-center justify-between">
          <h2 className="text-[19px] font-bold text-[#111]">
            {isEdit ? 'Editar ad' : 'Nuevo ad'}
          </h2>
          <button onClick={requestClose} className="text-[#999] hover:text-[#111] transition-colors p-1">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M2 2l12 12M14 2L2 14" strokeLinecap="round"/>
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 overflow-y-auto flex-1">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Cliente */}
            <div className="col-span-1 sm:col-span-2">
              <label className={labelClass}>Cliente / Marca</label>
              {loadingClients ? (
                <div className="input-base w-full text-[#bbb] text-[14.5px]">Cargando clientes…</div>
              ) : clients.length === 0 ? (
                <div className="input-base w-full text-[#bbb] text-[14.5px]">
                  No hay clientes.{' '}
                  <span className="text-[#888]">Créalos en Empresa → Clientes</span>
                </div>
              ) : (
                <select
                  className="input-base w-full"
                  value={fields.client_id}
                  onChange={handleClientChange}
                  required
                >
                  <option value="">— Seleccionar cliente —</option>
                  {clients.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              )}
            </div>

            {/* Nombre de campaña */}
            <div className="col-span-1 sm:col-span-2">
              <label className={labelClass}>Nombre de campaña</label>
              <input
                type="text"
                className="input-base w-full"
                placeholder="Nombre de la campaña"
                value={fields.name}
                onChange={e => set('name', e.target.value)}
                required
              />
            </div>

            {/* Objetivo — texto libre */}
            <div className="col-span-1 sm:col-span-2">
              <label className={labelClass}>Objetivo</label>
              <input
                type="text"
                className="input-base w-full"
                placeholder="Ej. Alcance, conversiones, tráfico..."
                value={fields.objective}
                onChange={e => set('objective', e.target.value)}
              />
            </div>

            {/* Pieza — link */}
            <div className="col-span-1 sm:col-span-2">
              <label className={labelClass}>Pieza (link de la publicación)</label>
              <input
                type="url"
                className="input-base w-full"
                placeholder="https://..."
                value={fields.piece_url}
                onChange={e => set('piece_url', e.target.value)}
              />
            </div>

            {/* Monto */}
            <div>
              <div className="flex items-baseline justify-between gap-2">
                <label className={labelClass}>Monto (USD)</label>
                {available != null && (
                  <span className={`text-[12.5px] font-medium mb-1.5 ${available < 0 ? 'text-red-600' : 'text-[#888]'}`}>
                    Disponible: {fmtUSD(available)}
                  </span>
                )}
              </div>
              <input
                type="number"
                min={0}
                step="0.01"
                className="input-base w-full"
                placeholder="0.00"
                value={fields.amount}
                onChange={e => set('amount', e.target.value)}
                required
              />
            </div>

            {/* Estado */}
            <div>
              <label className={labelClass}>Estado</label>
              <select
                className="input-base w-full"
                value={fields.status}
                onChange={e => set('status', e.target.value)}
              >
                {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>

            {/* Responsable — lista acotada (Katherine, Paola y jefas de línea) */}
            <div className="col-span-1 sm:col-span-2">
              <label className={labelClass}>Responsable</label>
              <select
                className="input-base w-full"
                value={fields.responsable_id}
                onChange={e => set('responsable_id', e.target.value)}
              >
                <option value="">— Sin responsable —</option>
                {responsables.map(r => (
                  <option key={r.user_id} value={r.user_id}>{r.first_name} {r.last_name}</option>
                ))}
              </select>
            </div>

            {/* Fecha inicio */}
            <div>
              <label className={labelClass}>Plazo — inicio</label>
              <input
                type="date"
                className="input-base w-full"
                value={fields.start_date}
                onChange={e => handleStartDateChange(e.target.value)}
                required
              />
            </div>

            {/* Fecha fin */}
            <div>
              <label className={labelClass}>Plazo — fin</label>
              <input
                type="date"
                className="input-base w-full"
                value={fields.end_date}
                min={fields.start_date || undefined}
                onChange={e => set('end_date', e.target.value)}
                required
              />
              {dateRangeInvalid && (
                <p className="mt-1 text-[12.5px] text-red-600">
                  La fecha de fin no puede ser anterior a la fecha de inicio.
                </p>
              )}
            </div>

            {/* Duración — derivada, solo lectura */}
            <div className="col-span-1 sm:col-span-2">
              <label className={labelClass}>Duración</label>
              <p className="text-[15px] text-[#555]">
                {duration != null ? `${duration} día${duration !== 1 ? 's' : ''}` : '—'}
              </p>
            </div>
          </div>

          {/* Aviso de sobrepaso de presupuesto — no bloquea el envío */}
          {overspend && (
            <div className="mt-4 bg-[#fff3e0] border border-[#f0871f]/40 text-[#8a4a0a] text-[14px] rounded-xl px-4 py-3">
              Te estás pasando del presupuesto aprobado para este cliente
              ({fmtUSD(overspend.total)} de {fmtUSD(overspend.budget)} este mes).
            </div>
          )}

          {error && <p className="text-[14px] text-red-600 mt-3">{error}</p>}

          <div className="flex gap-3 pt-4 mt-2 border-t border-[#ece9df]">
            <button
              type="button"
              onClick={requestClose}
              className="flex-1 py-2.5 rounded-xl border border-[#e0ddd4] text-[15px] font-semibold text-[#555] hover:bg-[#f5f3eb] transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={submitting || !fields.name.trim() || !fields.client_id || !fields.start_date || !fields.end_date || dateRangeInvalid}
              className="flex-1 py-2.5 rounded-xl bg-[#111] text-white text-[15px] font-bold hover:bg-[#222] transition-colors disabled:opacity-50"
            >
              {submitting ? (isEdit ? 'Guardando...' : 'Creando...') : (isEdit ? 'Guardar cambios' : 'Crear ad')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
