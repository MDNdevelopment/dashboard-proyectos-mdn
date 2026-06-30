import { useState, useEffect, useRef } from 'react'
import { supabase } from '../../supabase'
import { useAuth } from '../../context/AuthContext'
import { ESTADOS } from './constants'
import { useUnsavedChanges } from '../../hooks/useUnsavedChanges'
import UserPickerSingle from './UserPickerSingle'
import UserPickerMulti from './UserPickerMulti'
import { teamMemberUsers } from '../../utils/lineFilters'

const EMPTY = {
  team_id: '',
  client_id: '',
  client: '',
  description: '',
  source: '',
  assignee_ids: [],
  support_id: null,
  request_date: '',
  due_date: '',
  closed_date: '',
  status: 'En proceso',
}

export default function TaskModal({ task = null, teams = [], clients = [], users = [], defaultTeamId = null, onClose, onCreated, onUpdated }) {
  const { userProfile } = useAuth()
  const isEdit = task != null

  // Level-1 users (not privileged) are always an assignee; they can add others but not remove themselves.
  const privileged = userProfile?.access_level >= 2 || userProfile?.admin === true

  const [form, setForm] = useState(() => {
    if (isEdit) {
      return {
        team_id: task.team_id ?? '',
        client_id: task.client_id ?? '',
        client: task.client ?? '',
        description: task.description ?? '',
        source: task.source ?? '',
        // Compat: tareas viejas tienen assignee_id (texto) pero no assignee_ids
        assignee_ids: task.assignee_ids ?? (task.assignee_id ? [task.assignee_id] : []),
        support_id: task.support_id ?? null,
        request_date: task.request_date ?? '',
        due_date: task.due_date ?? '',
        closed_date: task.closed_date ?? '',
        status: task.status ?? 'En proceso',
      }
    }
    // For new tasks, level-1 users are always an assignee (locked).
    return {
      ...EMPTY,
      team_id: defaultTeamId ?? (teams[0]?.id ?? ''),
      assignee_ids: privileged ? [] : (userProfile?.user_id ? [userProfile.user_id] : []),
    }
  })
  const initialForm = useRef(form)
  const { requestClose } = useUnsavedChanges({ value: form, baseline: initialForm.current, onClose })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    const fn = e => { if (e.key === 'Escape') requestClose() }
    document.addEventListener('keydown', fn)
    return () => document.removeEventListener('keydown', fn)
  }, [requestClose])

  function set(field, value) {
    setForm(f => ({ ...f, [field]: value }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.team_id) { setError('Selecciona un team'); return }
    if (!form.description?.trim()) { setError('La descripción de la tarea es obligatoria'); return }
    setSaving(true)
    setError(null)

    const payload = {
      company_id: userProfile?.company_id ?? '',
      team_id: form.team_id,
      client_id: form.client_id || null,
      client: form.client || null,
      description: form.description.trim(),
      source: form.source || null,
      assignee_ids: form.assignee_ids,
      support_id: form.support_id || null,
      created_by: isEdit ? task.created_by : (userProfile?.user_id ?? null),
      request_date: form.request_date || null,
      due_date: form.due_date || null,
      closed_date: form.closed_date || null,
      status: form.status,
    }

    if (isEdit) {
      const { data, error: err } = await supabase
        .from('tasks')
        .update(payload)
        .eq('id', task.id)
        .select()
        .single()
      if (err) { setError(err.message); setSaving(false); return }
      onUpdated(data)
    } else {
      const { data, error: err } = await supabase
        .from('tasks')
        .insert(payload)
        .select()
        .single()
      if (err) { setError(err.message); setSaving(false); return }
      onCreated(data)
    }
    onClose()
  }

  async function handleDelete() {
    if (!confirm(`¿Eliminar la tarea de "${task.client || 'sin cliente'}"? No se puede deshacer.`)) return
    const { error: err } = await supabase.from('tasks').delete().eq('id', task.id)
    if (err) { setError(err.message); return }
    onUpdated({ ...task, _deleted: true })
    onClose()
  }

  // IDs bloqueados: nivel-1 no puede quitarse a sí mismo
  const lockedAssigneeIds = privileged ? [] : (userProfile?.user_id ? [userProfile.user_id] : [])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/25 backdrop-blur-[3px]"
      onClick={e => { if (e.target === e.currentTarget) requestClose() }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-[#ece9df]">
          <h2 className="text-[18px] font-bold text-[#111]">
            {isEdit ? 'Editar tarea' : 'Nueva tarea'}
          </h2>
          <button
            type="button"
            onClick={requestClose}
            className="w-7 h-7 flex items-center justify-center rounded-lg text-[#999] hover:text-[#111] hover:bg-[#f0ede3] transition-colors"
            aria-label="Cerrar"
          >
            <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-[15px] rounded-lg px-3 py-2">
              {error}
            </div>
          )}

          <div>
            <label className="block text-[13px] font-mono font-bold tracking-[0.12em] uppercase text-[#888] mb-1.5">Team *</label>
            <select
              className="input-base"
              value={form.team_id}
              onChange={e => {
                const teamId = e.target.value
                const newMembers = teams.find(t => t.id === teamId)?.member_user_ids ?? []
                // Al cambiar de línea, resetear cliente y filtrar responsables al nuevo team.
                // Los ids bloqueados (nivel 1) se conservan aunque no estén en el nuevo team.
                setForm(f => ({
                  ...f,
                  team_id: teamId,
                  client_id: '',
                  client: '',
                  assignee_ids: f.assignee_ids.filter(id =>
                    newMembers.includes(id) || lockedAssigneeIds.includes(id)
                  ),
                }))
              }}
              required
            >
              <option value="">Seleccionar team...</option>
              {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-[13px] font-mono font-bold tracking-[0.12em] uppercase text-[#888] mb-1.5">Cliente</label>
            {(() => {
              const lineClients = clients.filter(c => c.line_id === form.team_id)
              // Tarea heredada: tiene nombre de texto pero sin client_id (pre-migración)
              const hasLegacyName = form.client && !form.client_id
              const clientNotInLine = form.client_id && !lineClients.some(c => c.id === form.client_id)
              return (
                <>
                  <select
                    className="input-base"
                    value={form.client_id}
                    onChange={e => {
                      const chosen = lineClients.find(c => c.id === e.target.value)
                      setForm(f => ({ ...f, client_id: e.target.value, client: chosen?.name ?? '' }))
                    }}
                  >
                    <option value="">Sin cliente</option>
                    {lineClients.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                  {!form.team_id && (
                    <p className="text-[12.5px] text-[#bbb] mt-1">Selecciona un team para ver los clientes disponibles.</p>
                  )}
                  {form.team_id && lineClients.length === 0 && (
                    <p className="text-[12.5px] text-[#bbb] mt-1">No hay clientes en esta línea. Agrégalos en <strong>Empresa → Clientes</strong>.</p>
                  )}
                  {(hasLegacyName || clientNotInLine) && (
                    <p className="text-[12.5px] text-[#F0871F] mt-1">
                      Cliente previo: <strong>{form.client}</strong>. Selecciona uno de la lista para actualizar el vínculo.
                    </p>
                  )}
                </>
              )
            })()}
          </div>

          <div>
            <label className="block text-[13px] font-mono font-bold tracking-[0.12em] uppercase text-[#888] mb-1.5">Descripción de la tarea *</label>
            <textarea
              className="input-base"
              rows={3}
              value={form.description}
              onChange={e => set('description', e.target.value)}
              placeholder="Describe qué hay que hacer..."
              required
            />
          </div>

          <div>
            <label className="block text-[13px] font-mono font-bold tracking-[0.12em] uppercase text-[#888] mb-1.5">Origen / Fuente</label>
            <input
              className="input-base"
              value={form.source}
              onChange={e => set('source', e.target.value)}
              placeholder="Ej. WhatsApp, correo, reunión..."
            />
          </div>

          <div>
            <label className="block text-[13px] font-mono font-bold tracking-[0.12em] uppercase text-[#888] mb-1.5">Responsable{form.assignee_ids.length !== 1 ? 's' : ''}</label>
            {(() => {
              const selectedTeam = teams.find(t => t.id === form.team_id)
              const memberIds = selectedTeam?.member_user_ids ?? []
              const teamMembers = teamMemberUsers(users, selectedTeam)
              // Incluir usuarios ya asignados aunque no sean miembros del team actual
              // (compat con tareas heredadas o reasignaciones históricas)
              const alreadySelected = users.filter(u =>
                form.assignee_ids.includes(u.user_id) && !teamMembers.some(m => m.user_id === u.user_id)
              )
              const assigneeOptions = [...teamMembers, ...alreadySelected]
              return (
                <>
                  <UserPickerMulti
                    users={assigneeOptions}
                    selectedIds={form.assignee_ids}
                    onChange={ids => set('assignee_ids', ids)}
                    lockedIds={lockedAssigneeIds}
                    placeholder="Asignar responsable..."
                  />
                  {form.team_id && memberIds.length === 0 && (
                    <p className="text-[12.5px] text-[#bbb] mt-1">
                      No hay miembros en esta línea. Agrégalos en <strong>Empresa → Líneas</strong>.
                    </p>
                  )}
                </>
              )
            })()}
          </div>

          <div>
            <label className="block text-[13px] font-mono font-bold tracking-[0.12em] uppercase text-[#888] mb-1.5">
              Apoyo de dirección
              <span className="ml-1 font-normal normal-case text-[#bbb]">(opcional)</span>
            </label>
            <UserPickerSingle
              users={users}
              selectedId={form.support_id}
              onChange={id => set('support_id', id)}
              placeholder="¿Requiere apoyo de dirección?"
              clearable
              minLevel={3}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[13px] font-mono font-bold tracking-[0.12em] uppercase text-[#888] mb-1.5">Fecha solicitud</label>
              <input type="date" className="input-base" value={form.request_date} onChange={e => set('request_date', e.target.value)} />
            </div>
            <div>
              <label className="block text-[13px] font-mono font-bold tracking-[0.12em] uppercase text-[#888] mb-1.5">Fecha entrega</label>
              <input type="date" className="input-base" value={form.due_date} onChange={e => set('due_date', e.target.value)} />
            </div>
          </div>

          <div>
            <label className="block text-[13px] font-mono font-bold tracking-[0.12em] uppercase text-[#888] mb-1.5">Estatus</label>
            <select
              className="input-base"
              value={form.status}
              onChange={e => {
                const val = e.target.value
                set('status', val)
                if (val === 'Terminado' && !form.closed_date) {
                  set('closed_date', new Date().toISOString().slice(0, 10))
                }
                if (val !== 'Terminado') set('closed_date', '')
              }}
            >
              {ESTADOS.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>

          {form.status === 'Terminado' && (
            <div>
              <label className="block text-[13px] font-mono font-bold tracking-[0.12em] uppercase text-[#888] mb-1.5">Fecha de cierre</label>
              <input type="date" className="input-base" value={form.closed_date} onChange={e => set('closed_date', e.target.value)} />
            </div>
          )}

          <div className="flex items-center justify-between pt-2">
            {isEdit && privileged ? (
              <button type="button" onClick={handleDelete} className="text-[15px] font-semibold text-red-500 hover:text-red-700 transition-colors">
                Eliminar
              </button>
            ) : <span />}
            <div className="flex items-center gap-2">
              <button type="button" onClick={requestClose} className="px-4 py-2 rounded-xl text-[15px] font-semibold text-[#555] border border-[#e0ddd4] hover:bg-[#f5f3eb] transition-colors">
                Cancelar
              </button>
              <button type="submit" disabled={saving} className="px-4 py-2 rounded-xl text-[15px] font-bold bg-[#111] text-white hover:bg-[#222] transition-colors disabled:opacity-50">
                {saving ? 'Guardando…' : (isEdit ? 'Guardar cambios' : 'Crear tarea')}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}
