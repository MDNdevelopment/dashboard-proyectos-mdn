import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '../supabase'
import { fmtDate } from '../utils/formatDate'
import { useAuth } from '../context/AuthContext'
import {
  DndContext,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  closestCenter,
} from '@dnd-kit/core'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

const DEPARTMENTS = ['Redes', 'Diseño', 'Audiovisual', 'Tecnología']
const STATUSES = ['Pendiente', 'En proceso', 'Completado']
const STATUS_DOT = { 'Pendiente': '#f59e0b', 'En proceso': '#3b82f6', 'Completado': '#22c55e' }

const uid = () => Math.random().toString(36).slice(2)
const mkTask = () => ({ id: uid(), name: '', status: 'pendiente' })
const mkPhase = () => ({ id: uid(), name: '', tasks: [mkTask()] })

export default function ProjectModal({ project, onClose, onSave }) {
  const isEdit = !!project
  const nameRef = useRef(null)
  const { userProfile } = useAuth()

  const [form, setForm] = useState(() => project
    ? {
        name: project.name ?? '',
        departments: project.departments ?? (project.department ? [project.department] : []),
        team: project.team ?? '',
        requirements: project.requirements ?? '',
        status: project.status ?? 'Pendiente',
        phases: project.phases?.length ? project.phases : [mkPhase()],
        members: project.members ?? [],
      }
    : { name: '', departments: [], team: '', requirements: '', status: 'Pendiente', phases: [mkPhase()], members: [] }
  )
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [users, setUsers] = useState([])

  useEffect(() => {
    if (!userProfile?.company_id) return
    supabase
      .from('users')
      .select('user_id, first_name, last_name, avatar_url')
      .eq('company_id', userProfile.company_id)
      .order('first_name')
      .then(({ data }) => setUsers(data ?? []))
  }, [userProfile?.company_id])

  useEffect(() => { setTimeout(() => nameRef.current?.focus(), 80) }, [])
  useEffect(() => {
    const h = e => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', h)
    return () => document.removeEventListener('keydown', h)
  }, [onClose])

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const toggleDept = d => set('departments', form.departments.includes(d) ? form.departments.filter(x => x !== d) : [...form.departments, d])
  const toggleMember = id => set('members', form.members.includes(id) ? form.members.filter(x => x !== id) : [...form.members, id])

  const addPhase = () => set('phases', [...form.phases, mkPhase()])
  const delPhase = id => set('phases', form.phases.filter(p => p.id !== id))
  const setPhase = (id, name) => set('phases', form.phases.map(p => p.id === id ? { ...p, name } : p))
  const addTask = pid => set('phases', form.phases.map(p => p.id === pid ? { ...p, tasks: [...p.tasks, mkTask()] } : p))
  const delTask = (pid, tid) => set('phases', form.phases.map(p => p.id === pid ? { ...p, tasks: p.tasks.filter(t => t.id !== tid) } : p))
  const setTask = (pid, tid, name) => set('phases', form.phases.map(p =>
    p.id === pid ? { ...p, tasks: p.tasks.map(t => t.id === tid ? { ...t, name } : t) } : p
  ))
  const moveTask = (pid, fromIdx, toIdx) => set('phases', form.phases.map(p =>
    p.id === pid ? { ...p, tasks: arrayMove(p.tasks, fromIdx, toIdx) } : p
  ))

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const submit = async e => {
    e?.preventDefault()
    if (!form.name.trim()) { setError('El nombre es obligatorio.'); return }
    setLoading(true); setError('')
    try {
      await onSave({
        name: form.name.trim(),
        departments: form.departments,
        team: form.team.trim(),
        requirements: form.requirements.trim(),
        status: form.status,
        phases: form.phases.filter(p => p.name.trim()).map(p => ({ ...p, tasks: p.tasks.filter(t => t.name.trim()) })),
        members: form.members,
      })
    } catch { setError('Error al guardar.'); setLoading(false) }
  }

  const selectedUsers = users.filter(u => form.members.includes(u.user_id))

  return (
    <div
      className="fixed inset-0 bg-black/25 backdrop-blur-[3px] flex items-center justify-center z-50 p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-white rounded-2xl border border-[#e8e5db] w-full max-w-2xl max-h-[92vh] flex flex-col shadow-2xl">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-[#eeebe0] flex-shrink-0">
          <div>
            <h2 className="text-[18px] font-semibold text-[#111] tracking-[-0.01em]">
              {isEdit ? 'Editar proyecto' : 'Nuevo proyecto'}
            </h2>
            <p className="text-[14px] text-[#999] mt-0.5">
              {isEdit ? 'Modifica datos, fases o tareas' : 'Define el proyecto y sus actividades'}
            </p>
            {isEdit && (project.createdAt || project.created_at) && (
              <p className="text-[12px] font-mono text-[#bbb] mt-1">
                Creado el {fmtDate(project.createdAt ?? project.created_at)}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-[#bbb] hover:text-[#555] hover:bg-[#f5f3eb] transition-colors"
          >
            <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-5">

          {/* Name */}
          <Field label="Nombre del proyecto *">
            <input
              ref={nameRef}
              value={form.name}
              onChange={e => set('name', e.target.value)}
              placeholder="Ej: Automatización de grillas de contenido"
              className="input-base"
            />
          </Field>

          {/* Departments */}
          <Field label="Departamentos — selecciona uno o varios">
            <div className="flex flex-wrap gap-2">
              {DEPARTMENTS.map(d => {
                const sel = form.departments.includes(d)
                return (
                  <button key={d} type="button" onClick={() => toggleDept(d)}
                    className={`px-3.5 py-1.5 rounded-lg text-[14px] font-semibold border transition-all ${
                      sel ? 'bg-[#FFB800] text-[#111] border-[#FFB800]'
                          : 'bg-white text-[#666] border-[#e0ddd4] hover:border-[#bbb] hover:text-[#333]'
                    }`}>
                    {d}
                  </button>
                )
              })}
            </div>
          </Field>

          {/* Members */}
          {users.length > 0 && (
            <Field label="Miembros del proyecto">
              <MemberPicker
                users={users}
                selected={form.members}
                selectedUsers={selectedUsers}
                onToggle={toggleMember}
              />
            </Field>
          )}

          {/* Team + Status */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Equipo / Responsable">
              <input
                value={form.team}
                onChange={e => set('team', e.target.value)}
                placeholder="Ej: María García"
                className="input-base"
              />
            </Field>
            <Field label="Estado del proyecto">
              <div className="flex flex-wrap gap-2">
                {STATUSES.map(s => (
                  <button key={s} type="button" onClick={() => set('status', s)}
                    className={`px-3 py-1.5 rounded-lg text-[14px] font-semibold border transition-all flex items-center gap-1.5 ${
                      form.status === s
                        ? 'text-white border-transparent'
                        : 'bg-white text-[#666] border-[#e0ddd4] hover:border-[#bbb]'
                    }`}
                    style={form.status === s ? { background: STATUS_DOT[s], borderColor: STATUS_DOT[s] } : {}}
                  >
                    <span className="w-1.5 h-1.5 rounded-full"
                      style={{ background: form.status === s ? 'rgba(255,255,255,0.7)' : STATUS_DOT[s] }} />
                    {s}
                  </button>
                ))}
              </div>
            </Field>
          </div>

          {/* Requirements */}
          <Field label="Descripción / Contexto (opcional)">
            <textarea
              value={form.requirements}
              onChange={e => set('requirements', e.target.value)}
              placeholder="¿Qué resuelve o automatiza este proyecto?"
              rows={2}
              className="input-base resize-none"
            />
          </Field>

          {/* Phases */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-[12px] font-mono font-semibold tracking-[0.14em] uppercase text-[#777]">
                Fases y tareas
              </span>
              <button type="button" onClick={addPhase}
                className="text-[14px] font-semibold text-[#555] hover:text-[#111] border border-[#e0ddd4] hover:border-[#bbb] px-3 py-1 rounded-lg transition-all flex items-center gap-1.5">
                <svg width="9" height="9" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M6 1v10M1 6h10" strokeLinecap="round"/>
                </svg>
                Añadir fase
              </button>
            </div>

            <div className="space-y-3">
              {form.phases.map((phase, idx) => (
                <div key={phase.id} className="border border-[#e8e5db] rounded-xl p-4 bg-[#faf9f5]">
                  <div className="flex items-center gap-2 mb-3">
                    <input
                      value={phase.name}
                      onChange={e => setPhase(phase.id, e.target.value)}
                      placeholder={`Fase ${idx + 1} — ej: Diseño, Desarrollo, Testing…`}
                      className="flex-1 border border-[#e0ddd4] rounded-lg px-3 py-2 text-[15px] font-semibold text-[#333] placeholder-[#bbb] outline-none focus:border-[#bbb] bg-white font-sans"
                    />
                    {form.phases.length > 1 && (
                      <button type="button" onClick={() => delPhase(phase.id)}
                        className="w-7 h-7 flex items-center justify-center text-[#ccc] hover:text-[#ef4444] hover:bg-[#fff1f1] rounded-lg transition-colors">
                        <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/>
                        </svg>
                      </button>
                    )}
                  </div>

                  <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragEnd={({ active, over }) => {
                      if (!over || active.id === over.id) return
                      const tasks = phase.tasks
                      const from = tasks.findIndex(t => t.id === active.id)
                      const to = tasks.findIndex(t => t.id === over.id)
                      moveTask(phase.id, from, to)
                    }}
                  >
                    <SortableContext items={phase.tasks.map(t => t.id)} strategy={verticalListSortingStrategy}>
                      <div className="space-y-2 mb-2">
                        {phase.tasks.map(task => (
                          <SortableTask
                            key={task.id}
                            task={task}
                            canDelete={phase.tasks.length > 1}
                            onChangeName={name => setTask(phase.id, task.id, name)}
                            onDelete={() => delTask(phase.id, task.id)}
                          />
                        ))}
                      </div>
                    </SortableContext>
                  </DndContext>

                  <button type="button" onClick={() => addTask(phase.id)}
                    className="text-[14px] font-semibold text-[#aaa] hover:text-[#555] transition-colors flex items-center gap-1 mt-1">
                    <svg width="9" height="9" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <path d="M6 1v10M1 6h10" strokeLinecap="round"/>
                    </svg>
                    Añadir tarea
                  </button>
                </div>
              ))}
            </div>
          </div>

          {error && (
            <p className="text-[14px] font-medium text-[#dc2626] bg-[#fef2f2] border border-[#fecaca] px-3.5 py-2.5 rounded-lg">
              {error}
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="flex gap-3 px-6 py-4 border-t border-[#eeebe0] flex-shrink-0">
          <button type="button" onClick={onClose}
            className="flex-1 px-4 py-2.5 border border-[#e0ddd4] text-[#666] rounded-xl text-[15px] font-semibold hover:bg-[#f5f3eb] transition-colors">
            Cancelar
          </button>
          <button type="button" disabled={loading} onClick={submit}
            className="flex-1 px-4 py-2.5 bg-[#0d0d0d] text-white rounded-xl text-[15px] font-bold hover:bg-[#222] transition-colors disabled:opacity-50">
            {loading
              ? <span className="flex items-center justify-center gap-2">
                  <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Guardando…
                </span>
              : isEdit ? 'Guardar cambios' : 'Crear proyecto'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Avatar ────────────────────────────────────────────────────────────────────

const AVATAR_COLORS = [
  '#d97706','#059669','#2563eb','#7c3aed',
  '#db2777','#0891b2','#65a30d','#dc2626',
]

function avatarColor(userId) {
  let hash = 0
  for (let i = 0; i < userId.length; i++) hash = (hash * 31 + userId.charCodeAt(i)) >>> 0
  return AVATAR_COLORS[hash % AVATAR_COLORS.length]
}

function Avatar({ user, size = 28 }) {
  const initials = `${user.first_name?.[0] ?? ''}${user.last_name?.[0] ?? ''}`.toUpperCase()
  const style = { width: size, height: size, fontSize: size * 0.38, flexShrink: 0 }

  if (user.avatar_url) {
    return (
      <img
        src={user.avatar_url}
        alt={initials}
        style={{ ...style, borderRadius: '50%', objectFit: 'cover' }}
      />
    )
  }

  return (
    <span
      style={{ ...style, background: avatarColor(user.user_id), borderRadius: '50%', color: '#fff', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'DM Mono, monospace', letterSpacing: '-0.02em' }}
    >
      {initials}
    </span>
  )
}

// ─── MemberPicker ───────────────────────────────────────────────────────────────

function MemberPicker({ users, selected, selectedUsers, onToggle }) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [pos, setPos] = useState({ top: 0, left: 0, width: 0 })
  const triggerRef = useRef(null)
  const popoverRef = useRef(null)

  const openPicker = () => {
    if (!triggerRef.current) return
    const r = triggerRef.current.getBoundingClientRect()
    const popH = 280
    const top = window.innerHeight - r.bottom < popH + 8 ? r.top - popH - 4 : r.bottom + 4
    setPos({ top, left: r.left, width: Math.max(r.width, 260) })
    setOpen(true)
  }

  useEffect(() => {
    if (!open) return
    const fn = e => {
      if (!popoverRef.current?.contains(e.target) && !triggerRef.current?.contains(e.target)) {
        setOpen(false)
        setSearch('')
      }
    }
    document.addEventListener('mousedown', fn)
    return () => document.removeEventListener('mousedown', fn)
  }, [open])

  const filtered = users.filter(u => {
    const q = search.toLowerCase()
    return !q || `${u.first_name} ${u.last_name}`.toLowerCase().includes(q)
  })

  return (
    <div>
      {/* Selected chips */}
      <div className="flex flex-wrap gap-1.5 mb-2 min-h-[28px]">
        {selectedUsers.length === 0 ? (
          <span className="text-[14px] text-[#bbb] self-center">Sin miembros asignados</span>
        ) : (
          selectedUsers.map(u => (
            <span key={u.user_id} className="inline-flex items-center gap-1.5 pl-1 pr-2 py-0.5 rounded-full bg-[#f5f3eb] border border-[#e0ddd4] text-[14px] font-medium text-[#333]">
              <Avatar user={u} size={20} />
              {u.first_name} {u.last_name}
              <button
                type="button"
                onClick={() => onToggle(u.user_id)}
                aria-label={`Quitar a ${u.first_name} ${u.last_name}`}
                className="text-[#bbb] hover:text-[#555] transition-colors ml-0.5 leading-none"
              >
                <svg width="9" height="9" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/>
                </svg>
              </button>
            </span>
          ))
        )}
      </div>

      {/* Trigger */}
      <button
        ref={triggerRef}
        type="button"
        onClick={openPicker}
        className="text-[14px] font-semibold text-[#555] hover:text-[#111] border border-[#e0ddd4] hover:border-[#bbb] px-3 py-1 rounded-lg transition-all flex items-center gap-1.5"
      >
        <svg width="9" height="9" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2.5">
          <path d="M6 1v10M1 6h10" strokeLinecap="round"/>
        </svg>
        Añadir miembro
      </button>

      {/* Popover */}
      {open && createPortal(
        <div
          ref={popoverRef}
          style={{ position: 'fixed', top: pos.top, left: pos.left, width: pos.width, zIndex: 9999 }}
          className="bg-white border border-[#e8e5db] rounded-xl shadow-lg overflow-hidden"
          onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); setOpen(false); setSearch('') } }}
        >
          {/* Search */}
          <div className="p-2 border-b border-[#f0ede4]">
            <div className="relative">
              <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#999] pointer-events-none" width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="6.5" cy="6.5" r="5"/>
                <path d="M10.5 10.5L14 14" strokeLinecap="round"/>
              </svg>
              <input
                autoFocus
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Buscar miembro..."
                className="w-full bg-[#faf9f5] border border-[#e0ddd4] rounded-lg pl-8 pr-3 py-1.5 text-[14px] text-[#111] placeholder-[#bbb] outline-none focus:border-[#bbb] transition-colors font-sans"
              />
            </div>
          </div>

          {/* User list */}
          <div className="max-h-56 overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <p className="text-[14px] text-[#bbb] text-center py-4">Sin resultados</p>
            ) : (
              filtered.map(u => {
                const isSel = selected.includes(u.user_id)
                return (
                  <button
                    key={u.user_id}
                    type="button"
                    onClick={() => onToggle(u.user_id)}
                    className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-[#f5f3eb] transition-colors text-left"
                  >
                    <Avatar user={u} size={28} />
                    <span className="flex-1 text-[15px] font-medium text-[#222]">
                      {u.first_name} {u.last_name}
                    </span>
                    {isSel && (
                      <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="#22c55e" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/>
                      </svg>
                    )}
                  </button>
                )
              })
            )}
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}

// ─── SortableTask ───────────────────────────────────────────────────────────────

function SortableTask({ task, canDelete, onChangeName, onDelete }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.id })

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`flex items-center gap-2${isDragging ? ' opacity-60 shadow-md rounded-lg' : ''}`}
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        className="text-[#ccc] hover:text-[#888] transition-colors flex-shrink-0 cursor-grab active:cursor-grabbing focus:outline-none"
        tabIndex={0}
        aria-label="Reordenar tarea"
      >
        <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
          <circle cx="4" cy="2.5" r="1"/><circle cx="8" cy="2.5" r="1"/>
          <circle cx="4" cy="6" r="1"/><circle cx="8" cy="6" r="1"/>
          <circle cx="4" cy="9.5" r="1"/><circle cx="8" cy="9.5" r="1"/>
        </svg>
      </button>
      <input
        value={task.name}
        onChange={e => onChangeName(e.target.value)}
        placeholder="Nombre de la tarea"
        className="flex-1 border border-[#e0ddd4] rounded-lg px-3 py-1.5 text-[13px] text-[#444] placeholder-[#bbb] outline-none focus:border-[#bbb] bg-white font-sans"
      />
      {canDelete && (
        <button type="button" onClick={onDelete}
          className="text-[#ccc] hover:text-[#ef4444] transition-colors w-5 h-5 flex items-center justify-center flex-shrink-0">
          <svg width="11" height="11" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/>
          </svg>
        </button>
      )}
    </div>
  )
}

// ─── Field ─────────────────────────────────────────────────────────────────────

function Field({ label, children }) {
  return (
    <div>
      <label className="block text-[12px] font-mono font-semibold tracking-[0.14em] uppercase text-[#777] mb-2">
        {label}
      </label>
      {children}
    </div>
  )
}
