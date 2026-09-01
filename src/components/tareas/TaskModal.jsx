import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from '../../supabase'
import { useAuth } from '../../context/AuthContext'
import { ESTADOS, COL_META } from './constants'
import { newChecklistItem, clampItemDueDate, checklistProgress } from './taskChecklist'
import { useUnsavedChanges } from '../../hooks/useUnsavedChanges'
import UserPickerSingle from './UserPickerSingle'
import UserPickerMulti from './UserPickerMulti'
import { assignableUsers, flattenAssignable } from '../../utils/lineFilters'
import DateInput from '../common/DateInput'

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
  blocked_reason: '',
  checklist: [],
}

export default function TaskModal({
  task = null,
  teams = [],
  allLines = teams,
  clients = [],
  users = [],
  defaultTeamId = null,
  onClose,
  onCreated,
  onUpdated,
}) {
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
        blocked_reason: task.blocked_reason ?? '',
        checklist: task.checklist ?? [],
      }
    }
    // For new tasks, level-1 users are always an assignee (locked).
    return {
      ...EMPTY,
      team_id: defaultTeamId ?? teams[0]?.id ?? '',
      assignee_ids: privileged ? [] : userProfile?.user_id ? [userProfile.user_id] : [],
    }
  })
  const initialForm = useRef(form)
  const { requestClose } = useUnsavedChanges({
    value: form,
    baseline: initialForm.current,
    onClose,
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [comments, setComments] = useState([])
  const [commentsLoading, setCommentsLoading] = useState(false)
  const [newComment, setNewComment] = useState('')
  const [sendingComment, setSendingComment] = useState(false)

  useEffect(() => {
    const fn = (e) => {
      if (e.key === 'Escape') requestClose()
    }
    document.addEventListener('keydown', fn)
    return () => document.removeEventListener('keydown', fn)
  }, [requestClose])

  useEffect(() => {
    if (!isEdit) return
    let cancelled = false
    setCommentsLoading(true)
    ;(async () => {
      const { data } = await supabase.from('task_comments').select('*').eq('task_id', task.id)
      if (cancelled) return
      const sorted = (data ?? []).slice().sort((a, b) => (a.created_at < b.created_at ? -1 : 1))
      setComments(sorted)
      setCommentsLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [task?.id, isEdit])

  function set(field, value) {
    setForm((f) => ({ ...f, [field]: value }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.team_id) {
      setError('Selecciona un team')
      return
    }
    if (!form.description?.trim()) {
      setError('La descripción de la tarea es obligatoria')
      return
    }
    if (!form.request_date) {
      setError('La fecha de solicitud es obligatoria')
      return
    }
    if (form.status === 'Terminado' && !form.closed_date) {
      setError('La fecha de cierre es obligatoria para tareas terminadas')
      return
    }
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
      blocked_reason: form.status === 'Paralizado' ? form.blocked_reason || null : null,
      checklist: form.checklist,
    }

    if (isEdit) {
      const { data, error: err } = await supabase
        .from('tasks')
        .update(payload)
        .eq('id', task.id)
        .select()
        .single()
      if (err) {
        setError(err.message)
        setSaving(false)
        return
      }
      onUpdated(data)
    } else {
      const { data, error: err } = await supabase.from('tasks').insert(payload).select().single()
      if (err) {
        setError(err.message)
        setSaving(false)
        return
      }
      onCreated(data)
    }
    onClose()
  }

  async function handleAddComment() {
    const content = newComment.trim()
    if (!content) return
    setSendingComment(true)
    const { data } = await supabase
      .from('task_comments')
      .insert({
        task_id: task.id,
        company_id: userProfile?.company_id ?? '',
        author_id: userProfile?.user_id ?? '',
        content,
      })
      .select()
      .single()
    if (data) setComments((prev) => [...prev, data])
    setNewComment('')
    setSendingComment(false)
  }

  async function handleDelete() {
    if (!confirm(`¿Eliminar la tarea de "${task.client || 'sin cliente'}"? No se puede deshacer.`))
      return
    const { error: err } = await supabase.from('tasks').delete().eq('id', task.id)
    if (err) {
      setError(err.message)
      return
    }
    onUpdated({ ...task, _deleted: true })
    onClose()
  }

  // IDs bloqueados: nivel-1 no puede quitarse a sí mismo
  const lockedAssigneeIds = privileged ? [] : userProfile?.user_id ? [userProfile.user_id] : []

  const { done: checkDone, total: checkTotal } = checklistProgress(form.checklist)

  // Actualiza un ítem del checklist de forma inmutable
  function setChecklistItem(id, patch) {
    setForm((f) => ({
      ...f,
      checklist: f.checklist.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    }))
  }
  function addChecklistItem() {
    setForm((f) => ({ ...f, checklist: [...f.checklist, newChecklistItem()] }))
  }
  function removeChecklistItem(id) {
    setForm((f) => ({ ...f, checklist: f.checklist.filter((item) => item.id !== id) }))
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/25 backdrop-blur-[3px]">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">
        <div className="flex-shrink-0 flex items-center justify-between px-6 pt-5 pb-4 border-b border-[#ece9df]">
          <h2 className="text-[18px] font-bold text-[#111]">
            {isEdit ? 'Editar tarea' : 'Nueva tarea'}
          </h2>
          <button
            type="button"
            onClick={requestClose}
            className="w-7 h-7 flex items-center justify-center rounded-lg text-[#999] hover:text-[#111] hover:bg-[#f0ede3] transition-colors"
            aria-label="Cerrar"
          >
            <svg
              width="14"
              height="14"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2.5}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          <form id="task-form" onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-[15px] rounded-lg px-3 py-2">
                {error}
              </div>
            )}

            <div>
              <label className="block text-[13px] font-mono font-bold tracking-[0.12em] uppercase text-[#888] mb-1.5">
                Team *
              </label>
              <select
                className="input-base"
                value={form.team_id}
                onChange={(e) => {
                  const teamId = e.target.value
                  const newTeam = teams.find((t) => t.id === teamId)
                  const { members, crossLine } = assignableUsers(users, newTeam, allLines)
                  const stillAssignable = new Set([...members, ...crossLine].map((u) => u.user_id))
                  // Al cambiar de línea, resetear cliente y filtrar responsables al nuevo team
                  // (miembros + pool "Independientes"). Los ids bloqueados (nivel 1) se
                  // conservan aunque no estén en el nuevo team.
                  setForm((f) => ({
                    ...f,
                    team_id: teamId,
                    client_id: '',
                    client: '',
                    assignee_ids: f.assignee_ids.filter(
                      (id) => stillAssignable.has(id) || lockedAssigneeIds.includes(id),
                    ),
                  }))
                }}
                required
              >
                <option value="">Seleccionar team...</option>
                {teams.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[13px] font-mono font-bold tracking-[0.12em] uppercase text-[#888] mb-1.5">
                Cliente
              </label>
              {(() => {
                const selectedTeam = teams.find((t) => t.id === form.team_id)
                // El grupo "Independientes" no tiene clientes propios: al elegirlo se
                // muestran todos los clientes de la empresa (no hay línea que los acote).
                const lineClients = selectedTeam?.is_general
                  ? clients
                  : clients.filter((c) => c.line_id === form.team_id)
                // Tarea heredada: tiene nombre de texto pero sin client_id (pre-migración)
                const hasLegacyName = form.client && !form.client_id
                const clientNotInLine =
                  form.client_id && !lineClients.some((c) => c.id === form.client_id)
                return (
                  <>
                    <select
                      className="input-base"
                      value={form.client_id}
                      onChange={(e) => {
                        const chosen = lineClients.find((c) => c.id === e.target.value)
                        setForm((f) => ({
                          ...f,
                          client_id: e.target.value,
                          client: chosen?.name ?? '',
                        }))
                      }}
                    >
                      <option value="">Sin cliente</option>
                      {lineClients.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                    {!form.team_id && (
                      <p className="text-[12.5px] text-[#bbb] mt-1">
                        Selecciona un team para ver los clientes disponibles.
                      </p>
                    )}
                    {form.team_id && lineClients.length === 0 && (
                      <p className="text-[12.5px] text-[#bbb] mt-1">
                        {selectedTeam?.is_general ? (
                          <>
                            No hay clientes creados. Agrégalos en{' '}
                            <strong>Empresa → Clientes</strong>.
                          </>
                        ) : (
                          <>
                            No hay clientes en esta línea. Agrégalos en{' '}
                            <strong>Empresa → Clientes</strong>.
                          </>
                        )}
                      </p>
                    )}
                    {(hasLegacyName || clientNotInLine) && (
                      <p className="text-[12.5px] text-[#F0871F] mt-1">
                        Cliente previo: <strong>{form.client}</strong>. Selecciona uno de la lista
                        para actualizar el vínculo.
                      </p>
                    )}
                  </>
                )
              })()}
            </div>

            <div>
              <label className="block text-[13px] font-mono font-bold tracking-[0.12em] uppercase text-[#888] mb-1.5">
                Descripción de la tarea *
              </label>
              <textarea
                className="input-base"
                rows={3}
                value={form.description}
                onChange={(e) => set('description', e.target.value)}
                placeholder="Describe qué hay que hacer..."
                required
              />
            </div>

            <div>
              <label className="block text-[13px] font-mono font-bold tracking-[0.12em] uppercase text-[#888] mb-1.5">
                Origen / Fuente
              </label>
              <input
                className="input-base"
                value={form.source}
                onChange={(e) => set('source', e.target.value)}
                placeholder="Ej. WhatsApp, correo, reunión..."
              />
            </div>

            <div>
              <label className="block text-[13px] font-mono font-bold tracking-[0.12em] uppercase text-[#888] mb-1.5">
                Responsable{form.assignee_ids.length !== 1 ? 's' : ''}
              </label>
              {(() => {
                const selectedTeam = teams.find((t) => t.id === form.team_id)
                const memberIds = selectedTeam?.member_user_ids ?? []
                const teamMembers = flattenAssignable(
                  assignableUsers(users, selectedTeam, allLines),
                )
                // Incluir usuarios ya asignados aunque no sean miembros del team actual
                // (compat con tareas heredadas o reasignaciones históricas)
                const alreadySelected = users.filter(
                  (u) =>
                    form.assignee_ids.includes(u.user_id) &&
                    !teamMembers.some((m) => m.user_id === u.user_id),
                )
                const assigneeOptions = [...teamMembers, ...alreadySelected]
                return (
                  <>
                    <UserPickerMulti
                      users={assigneeOptions}
                      selectedIds={form.assignee_ids}
                      onChange={(ids) => set('assignee_ids', ids)}
                      lockedIds={lockedAssigneeIds}
                      placeholder="Asignar responsable..."
                    />
                    {form.team_id && memberIds.length === 0 && (
                      <p className="text-[12.5px] text-[#bbb] mt-1">
                        {selectedTeam?.is_general ? (
                          'No hay empleados sin línea asignada por ahora.'
                        ) : (
                          <>
                            No hay miembros en esta línea. Agrégalos en{' '}
                            <strong>Empresa → Líneas</strong>.
                          </>
                        )}
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
                onChange={(id) => set('support_id', id)}
                placeholder="¿Requiere apoyo de dirección?"
                clearable
                minLevel={3}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[13px] font-mono font-bold tracking-[0.12em] uppercase text-[#888] mb-1.5">
                  Fecha solicitud *
                </label>
                <DateInput
                  value={form.request_date}
                  onChange={(v) => set('request_date', v)}
                  required
                />
              </div>
              <div>
                <label className="block text-[13px] font-mono font-bold tracking-[0.12em] uppercase text-[#888] mb-1.5">
                  Fecha entrega
                </label>
                <DateInput value={form.due_date} onChange={(v) => set('due_date', v)} />
              </div>
            </div>

            <div>
              <label className="block text-[13px] font-mono font-bold tracking-[0.12em] uppercase text-[#888] mb-1.5">
                Estatus
              </label>
              <select
                className="input-base"
                value={form.status}
                onChange={(e) => {
                  const val = e.target.value
                  set('status', val)
                  if (val === 'Terminado' && !form.closed_date) {
                    set('closed_date', new Date().toISOString().slice(0, 10))
                  }
                  if (val !== 'Terminado') set('closed_date', '')
                  if (val !== 'Paralizado') set('blocked_reason', '')
                }}
              >
                {ESTADOS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>

            {form.status === 'Paralizado' && (
              <div>
                <label className="block text-[13px] font-mono font-bold tracking-[0.12em] uppercase text-[#888] mb-1.5">
                  Razón de la paralización
                  <span className="ml-1 font-normal normal-case text-[#bbb]">(opcional)</span>
                </label>
                <textarea
                  className="input-base"
                  rows={2}
                  placeholder="¿Por qué está paralizada esta tarea?"
                  value={form.blocked_reason}
                  onChange={(e) => set('blocked_reason', e.target.value)}
                />
              </div>
            )}

            {form.status === 'Terminado' && (
              <div>
                <label className="block text-[13px] font-mono font-bold tracking-[0.12em] uppercase text-[#888] mb-1.5">
                  Fecha de cierre *
                </label>
                <DateInput
                  value={form.closed_date}
                  onChange={(v) => set('closed_date', v)}
                  required
                />
              </div>
            )}
          </form>

          {/* Sección de checklist — disponible en creación y edición */}
          <div className="px-6 pb-4 border-t border-[#ece9df] mt-1">
            <div className="flex items-center justify-between pt-4 mb-3">
              <p className="text-[13px] font-mono font-bold tracking-[0.12em] uppercase text-[#888]">
                Actividades{form.checklist.length > 0 ? ` (${checkDone}/${checkTotal})` : ''}
              </p>
              <button
                type="button"
                onClick={addChecklistItem}
                className="flex items-center gap-1 text-[13px] font-semibold text-[#555] hover:text-[#111] transition-colors"
              >
                <svg
                  width="10"
                  height="10"
                  viewBox="0 0 12 12"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.8"
                >
                  <path d="M6 1v10M1 6h10" strokeLinecap="round" />
                </svg>
                Agregar ítem
              </button>
            </div>

            {form.checklist.length === 0 ? (
              <p className="text-[13px] text-[#bbb]">
                Sin ítems. Agrega pasos con el botón de arriba.
              </p>
            ) : (
              <div className="space-y-2">
                {form.checklist.map((item) => {
                  const selectedTeam = teams.find((t) => t.id === form.team_id)
                  const teamMembers = flattenAssignable(
                    assignableUsers(users, selectedTeam, allLines),
                  )
                  // Incluir usuarios de dirección (nivel ≥ 3) que no sean ya miembros del team
                  const directionExtras = users.filter(
                    (u) =>
                      (u.access_level ?? 0) >= 3 &&
                      !teamMembers.some((m) => m.user_id === u.user_id),
                  )
                  const checklistAssigneeOptions = [...teamMembers, ...directionExtras]
                  const clamped =
                    item.due_date && clampItemDueDate(item.due_date, form) !== item.due_date
                  return (
                    <div
                      key={item.id}
                      className="rounded-xl border border-[#ece9df] bg-[#fafaf8] p-3 space-y-2"
                    >
                      {/* Fila superior: checkbox + título + quitar */}
                      <div className="flex items-start gap-2">
                        <input
                          type="checkbox"
                          checked={item.done}
                          onChange={(e) => setChecklistItem(item.id, { done: e.target.checked })}
                          className="mt-1 w-4 h-4 rounded accent-[#111] flex-shrink-0 cursor-pointer"
                        />
                        <input
                          type="text"
                          value={item.title}
                          onChange={(e) => setChecklistItem(item.id, { title: e.target.value })}
                          placeholder="Descripción del ítem..."
                          className={`flex-1 text-[15px] bg-transparent border-none outline-none placeholder-[#ccc] ${item.done ? 'line-through text-[#aaa]' : 'text-[#333]'}`}
                        />
                        <button
                          type="button"
                          onClick={() => removeChecklistItem(item.id)}
                          className="text-[#ccc] hover:text-red-400 transition-colors flex-shrink-0 mt-0.5"
                          aria-label="Quitar ítem"
                        >
                          <svg
                            width="12"
                            height="12"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2.5"
                          >
                            <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" />
                          </svg>
                        </button>
                      </div>
                      {/* Fila inferior: encargado + fecha */}
                      <div className="flex items-center gap-2 pl-6">
                        <div className="w-[190px] flex-shrink-0">
                          <label className="block text-[11px] font-mono font-bold tracking-[0.1em] uppercase text-[#aaa] mb-0.5">
                            Encargado
                          </label>
                          <UserPickerSingle
                            users={checklistAssigneeOptions}
                            selectedId={item.assignee_id}
                            onChange={(id) => setChecklistItem(item.id, { assignee_id: id })}
                            placeholder="Encargado..."
                            clearable
                          />
                        </div>
                        <div className="flex-shrink-0">
                          <label className="block text-[11px] font-mono font-bold tracking-[0.1em] uppercase text-[#aaa] mb-0.5">
                            Fecha de entrega
                          </label>
                          <DateInput
                            value={item.due_date}
                            min={form.request_date || undefined}
                            max={form.due_date || undefined}
                            onChange={(v) => {
                              const clamped = clampItemDueDate(v, form)
                              setChecklistItem(item.id, { due_date: clamped })
                            }}
                            className="text-[13px] py-1 px-2 w-[140px]"
                          />
                          {clamped && (
                            <p className="text-[11px] text-[#F0871F] mt-0.5">
                              Fecha ajustada al rango de la tarea
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Sección de comentarios — solo en modo edición */}
          {isEdit && (
            <div className="px-6 pb-6 border-t border-[#ece9df] mt-1">
              <p className="text-[13px] font-mono font-bold tracking-[0.12em] uppercase text-[#888] pt-4 mb-3">
                Comentarios
              </p>

              {commentsLoading ? (
                <div className="flex justify-center py-4">
                  <div className="w-4 h-4 border-2 border-[#FFB800] border-t-transparent rounded-full animate-spin" />
                </div>
              ) : comments.length === 0 ? (
                <p className="text-[13px] text-[#bbb] mb-3">Sin comentarios aún.</p>
              ) : (
                <div className="space-y-3 mb-4 max-h-[220px] overflow-y-auto pr-1">
                  {comments.map((c) => {
                    const author = users.find((u) => u.user_id === c.author_id)
                    const authorName = author
                      ? [author.first_name, author.last_name].filter(Boolean).join(' ')
                      : 'Usuario'
                    const ts = new Date(c.created_at).toLocaleString('es-VE', {
                      dateStyle: 'short',
                      timeStyle: 'short',
                    })
                    return (
                      <div key={c.id} className="flex gap-2.5">
                        <div className="w-7 h-7 rounded-full bg-[#f0ede3] flex items-center justify-center flex-shrink-0 text-[11px] font-bold text-[#aaa] uppercase">
                          {authorName[0] ?? '?'}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-baseline gap-2 mb-0.5">
                            <span className="text-[13px] font-semibold text-[#111]">
                              {authorName}
                            </span>
                            <span className="text-[11px] font-mono text-[#bbb]">{ts}</span>
                          </div>
                          <p className="text-[14px] text-[#444] leading-snug whitespace-pre-wrap break-words">
                            {c.content}
                          </p>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}

              <div className="flex gap-2 items-end">
                <textarea
                  className="input-base flex-1 text-[14px] resize-none"
                  rows={2}
                  placeholder="Escribe un comentario..."
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleAddComment()
                  }}
                />
                <button
                  type="button"
                  onClick={handleAddComment}
                  disabled={sendingComment || !newComment.trim()}
                  className="px-3 py-2 rounded-xl text-[14px] font-semibold bg-[#111] text-white hover:bg-[#222] transition-colors disabled:opacity-40 flex-shrink-0"
                >
                  {sendingComment ? (
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    'Enviar'
                  )}
                </button>
              </div>
              <p className="text-[11px] text-[#bbb] mt-1">Ctrl+Enter para enviar</p>
            </div>
          )}
        </div>

        <div className="flex-shrink-0 flex items-center justify-between px-6 py-4 border-t border-[#ece9df]">
          {isEdit && privileged ? (
            <button
              type="button"
              onClick={handleDelete}
              className="text-[15px] font-semibold text-red-500 hover:text-red-700 transition-colors"
            >
              Eliminar
            </button>
          ) : (
            <span />
          )}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={requestClose}
              className="px-4 py-2 rounded-xl text-[15px] font-semibold text-[#555] border border-[#e0ddd4] hover:bg-[#f5f3eb] transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              form="task-form"
              disabled={saving}
              className="px-4 py-2 rounded-xl text-[15px] font-bold bg-[#111] text-white hover:bg-[#222] transition-colors disabled:opacity-50"
            >
              {saving ? 'Guardando…' : isEdit ? 'Guardar cambios' : 'Crear tarea'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
