import { useState, useEffect, useRef } from 'react'
import { supabase } from '../../supabase'
import { useAuth } from '../../context/AuthContext'
import { STATUSES, PRIORITIES } from './constants'
import UserPickerSingle from '../tareas/UserPickerSingle'
import { loadClients } from '../metricas/metricsApi'
import { useUnsavedChanges } from '../../hooks/useUnsavedChanges'

export default function AdsForm({ campaign, onClose, onCreated, onUpdated }) {
  const { userProfile } = useAuth()
  const isEdit = campaign != null

  const [fields, setFields] = useState({
    start_date: campaign?.start_date ?? '',
    end_date:   campaign?.end_date   ?? '',
    name:       campaign?.name       ?? '',
    client:     campaign?.client     ?? '',
    client_id:  campaign?.client_id  ?? '',
    assignee:   campaign?.assignee   ?? '',
    priority:   campaign?.priority   ?? 'Media',
    status:     campaign?.status     ?? 'Pendiente',
    notes:      campaign?.notes      ?? '',
  })
  const initialFields = useRef(fields)
  const { requestClose } = useUnsavedChanges({ value: fields, baseline: initialFields.current, onClose })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  const [users, setUsers] = useState([])
  const [loadingUsers, setLoadingUsers] = useState(true)

  const [clients, setClients] = useState([])
  const [loadingClients, setLoadingClients] = useState(true)

  // Cargar usuarios con avatar/nivel (necesario para UserPickerSingle)
  useEffect(() => {
    if (!userProfile?.company_id) { setLoadingUsers(false); return }
    supabase
      .from('users')
      .select('user_id, first_name, last_name, avatar_url, access_level, position:positions(position_name)')
      .eq('company_id', userProfile.company_id)
      .order('first_name')
      .then(({ data }) => { setUsers(data ?? []); setLoadingUsers(false) })
  }, [userProfile?.company_id])

  // Cargar todos los clientes de la empresa (sin filtro de línea)
  useEffect(() => {
    if (!userProfile?.company_id) { setLoadingClients(false); return }
    loadClients(userProfile.company_id).then(({ data }) => {
      setClients(data ?? [])
      setLoadingClients(false)
    })
  }, [userProfile?.company_id])

  function set(key, val) {
    setFields(prev => ({ ...prev, [key]: val }))
  }

  function handleClientChange(e) {
    const id = e.target.value
    const c = clients.find(x => x.id === id)
    setFields(prev => ({ ...prev, client_id: id, client: c?.name ?? '' }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!fields.name.trim() || !fields.client_id || !fields.start_date || !fields.end_date) return
    setSubmitting(true)
    setError(null)

    if (isEdit) {
      const { data, error: err } = await supabase
        .from('campaigns')
        .update({ ...fields, updated_at: new Date().toISOString() })
        .eq('id', campaign.id)
        .select()
        .single()
      setSubmitting(false)
      if (err) { setError('Error al actualizar la campaña.'); return }
      onUpdated(data)
      onClose()
    } else {
      const { data, error: err } = await supabase
        .from('campaigns')
        .insert({ ...fields, created_by: userProfile.user_id })
        .select()
        .single()
      setSubmitting(false)
      if (err) { setError('Error al crear la campaña.'); return }
      onCreated(data)
      onClose()
      supabase.functions.invoke('notify-campaign-assignee', {
        body: {
          assignee_id: fields.assignee,
          campaign_name: fields.name,
          created_by_name: `${userProfile.first_name} ${userProfile.last_name}`,
        },
      }).catch(console.error)
    }
  }

  const labelClass = 'block text-[13px] font-mono font-bold tracking-widest uppercase text-[#888] mb-1.5'

  // ¿La campaña heredada tenía un cliente escrito a mano sin client_id?
  const legacyClientName = isEdit && !campaign.client_id && campaign.client ? campaign.client : null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-sm bg-black/30">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="flex-shrink-0 px-6 pt-6 pb-5 border-b border-[#ece9df] flex items-center justify-between">
          <h2 className="text-[19px] font-bold text-[#111]">
            {isEdit ? 'Editar campaña' : 'Nueva campaña'}
          </h2>
          <button onClick={requestClose} className="text-[#999] hover:text-[#111] transition-colors p-1">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M2 2l12 12M14 2L2 14" strokeLinecap="round"/>
            </svg>
          </button>
        </div>

        <form id="ads-campaign-form" onSubmit={handleSubmit} className="px-6 py-5 overflow-y-auto flex-1">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Fecha inicio */}
            <div>
              <label className={labelClass}>Fecha inicio</label>
              <input
                type="date"
                className="input-base w-full"
                value={fields.start_date}
                onChange={e => set('start_date', e.target.value)}
                required
              />
            </div>

            {/* Fecha fin */}
            <div>
              <label className={labelClass}>Fecha fin</label>
              <input
                type="date"
                className="input-base w-full"
                value={fields.end_date}
                onChange={e => set('end_date', e.target.value)}
                required
              />
            </div>

            {/* Táctica — full width */}
            <div className="col-span-1 sm:col-span-2">
              <label className={labelClass}>Táctica / Campaña</label>
              <input
                type="text"
                className="input-base w-full"
                placeholder="Nombre de la táctica o campaña"
                value={fields.name}
                onChange={e => set('name', e.target.value)}
                required
              />
            </div>

            {/* Cliente — desplegable desde metric_clients */}
            <div>
              <label className={labelClass}>Cliente / Marca</label>
              {loadingClients ? (
                <div className="input-base w-full text-[#bbb] text-[14.5px]">Cargando clientes…</div>
              ) : clients.length === 0 ? (
                <div className="input-base w-full text-[#bbb] text-[14.5px]">
                  No hay clientes.{' '}
                  <span className="text-[#888]">Créalos en Empresa → Clientes</span>
                </div>
              ) : (
                <>
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
                  {/* Hint: campaña heredada con nombre pero sin client_id */}
                  {legacyClientName && !fields.client_id && (
                    <p className="mt-1 text-[12.5px] text-[#F0871F]">
                      Cliente previo: <span className="font-semibold">{legacyClientName}</span> — elige uno de la lista para actualizar el vínculo.
                    </p>
                  )}
                </>
              )}
            </div>

            {/* Responsable — UserPickerSingle */}
            <div>
              <label className={labelClass}>Responsable</label>
              {loadingUsers ? (
                <div className="input-base w-full text-[#bbb] text-[14.5px]">Cargando…</div>
              ) : (
                <UserPickerSingle
                  users={users}
                  selectedId={fields.assignee || null}
                  onChange={id => set('assignee', id ?? '')}
                  placeholder="Asignar responsable..."
                />
              )}
            </div>

            {/* Prioridad */}
            <div>
              <label className={labelClass}>Prioridad</label>
              <select
                className="input-base w-full"
                value={fields.priority}
                onChange={e => set('priority', e.target.value)}
              >
                {PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>

            {/* Status */}
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

            {/* Notas — full width */}
            <div className="col-span-1 sm:col-span-2">
              <label className={labelClass}>Notas</label>
              <textarea
                className="input-base w-full resize-none"
                rows={3}
                placeholder="Observaciones adicionales"
                value={fields.notes}
                onChange={e => set('notes', e.target.value)}
              />
            </div>
          </div>

          {error && <p className="text-[14px] text-red-600 mt-3">{error}</p>}
        </form>

        <div className="flex-shrink-0 flex gap-3 px-6 py-4 border-t border-[#ece9df]">
          <button
            type="button"
            onClick={requestClose}
            className="flex-1 py-2.5 rounded-xl border border-[#e0ddd4] text-[15px] font-semibold text-[#555] hover:bg-[#f5f3eb] transition-colors"
          >
            Cancelar
          </button>
          <button
            type="submit"
            form="ads-campaign-form"
            disabled={submitting || !fields.name.trim() || !fields.client_id || !fields.start_date || !fields.end_date}
            className="flex-1 py-2.5 rounded-xl bg-[#111] text-white text-[15px] font-bold hover:bg-[#222] transition-colors disabled:opacity-50"
          >
            {submitting ? (isEdit ? 'Guardando...' : 'Creando...') : (isEdit ? 'Guardar cambios' : 'Crear campaña')}
          </button>
        </div>
      </div>
    </div>
  )
}
