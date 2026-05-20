import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'

const STATUS = {
  'Pendiente':  { text: '#92400e', bg: '#fef9ee', border: '#fde68a', line: '#f59e0b', label: 'Pendiente'  },
  'En proceso': { text: '#1e40af', bg: '#eff6ff', border: '#bfdbfe', line: '#3b82f6', label: 'En proceso' },
  'Bloqueado':  { text: '#991b1b', bg: '#fff1f1', border: '#fecaca', line: '#ef4444', label: 'Bloqueado'  },
  'Completado': { text: '#14532d', bg: '#f0fdf4', border: '#bbf7d0', line: '#22c55e', label: 'Completado' },
}

const TASK_S = {
  pendiente:  { label: 'Pendiente',  text: '#777',    bg: '#f5f3eb', border: '#e8e5db' },
  en_proceso: { label: 'En proceso', text: '#1d4ed8', bg: '#eff6ff', border: '#bfdbfe' },
  pausada:    { label: 'Pausada',    text: '#b45309', bg: '#fffbeb', border: '#fde68a' },
  completada: { label: 'Completada', text: '#15803d', bg: '#f0fdf4', border: '#bbf7d0' },
}

const TASK_ORDER = ['pendiente', 'en_proceso', 'pausada', 'completada']
const STATUS_LIST = ['Pendiente', 'En proceso', 'Completado']

function useDropdown() {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState({ top: 0, left: 0 })
  const btnRef = useRef(null)
  const menuRef = useRef(null)

  const toggle = (e) => {
    e?.stopPropagation()
    if (!open && btnRef.current) {
      const r = btnRef.current.getBoundingClientRect()
      const h = 184, w = 160
      setPos({
        top:  window.innerHeight - r.bottom < h + 8 ? r.top - h - 4 : r.bottom + 4,
        left: Math.max(8, Math.min(r.right - w, window.innerWidth - w - 8)),
      })
    }
    setOpen(o => !o)
  }

  useEffect(() => {
    if (!open) return
    const fn = e => {
      if (!menuRef.current?.contains(e.target) && !btnRef.current?.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', fn)
    return () => document.removeEventListener('mousedown', fn)
  }, [open])

  return { open, pos, toggle, btnRef, menuRef, close: () => setOpen(false) }
}

function DropMenu({ children, open, pos, menuRef }) {
  if (!open) return null
  return createPortal(
    <div
      ref={menuRef}
      style={{ position: 'fixed', top: pos.top, left: pos.left, zIndex: 9999 }}
      className="bg-white border border-[#e8e5db] rounded-xl shadow-lg min-w-[160px] py-1.5 overflow-hidden"
    >
      {children}
    </div>,
    document.body
  )
}

function DropItem({ label, active, dot, onClick }) {
  return (
    <button
      onClick={onClick}
      className="w-full text-left px-3.5 py-2 text-[12px] font-medium flex items-center gap-2.5 hover:bg-[#f5f3eb] transition-colors"
    >
      <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: dot }} />
      <span style={{ color: active ? '#111' : '#666' }}>{label}</span>
    </button>
  )
}

function TaskDropdown({ task, onStatusChange }) {
  const { open, pos, toggle, btnRef, menuRef, close } = useDropdown()
  const c = TASK_S[task.status] ?? TASK_S.pendiente

  return (
    <div>
      <button
        ref={btnRef}
        onClick={toggle}
        style={{ color: c.text, background: c.bg, border: `1px solid ${c.border}` }}
        className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full whitespace-nowrap hover:opacity-70 transition-opacity"
      >
        {c.label}
      </button>
      <DropMenu open={open} pos={pos} menuRef={menuRef}>
        {TASK_ORDER.map(s => (
          <DropItem
            key={s} label={TASK_S[s].label} active={task.status === s} dot={TASK_S[s].text}
            onClick={() => { onStatusChange(task.id, s); close() }}
          />
        ))}
      </DropMenu>
    </div>
  )
}

function StatusBadge({ status, onChange }) {
  const { open, pos, toggle, btnRef, menuRef, close } = useDropdown()
  const c = STATUS[status] ?? STATUS['Pendiente']

  return (
    <div>
      <button
        ref={btnRef}
        onClick={toggle}
        style={{ color: c.text, background: c.bg, border: `1px solid ${c.border}` }}
        className="text-[11px] font-semibold px-2.5 py-1 rounded-full whitespace-nowrap hover:opacity-70 transition-opacity"
      >
        {c.label}
      </button>
      <DropMenu open={open} pos={pos} menuRef={menuRef}>
        {STATUS_LIST.map(s => (
          <DropItem
            key={s} label={s} active={status === s} dot={STATUS[s].line}
            onClick={e => { e.stopPropagation(); onChange(s); close() }}
          />
        ))}
      </DropMenu>
    </div>
  )
}

export default function ProjectCard({ project, expanded, onToggleExpand, onEdit, onUpdate, onDelete }) {

  const depts = project.departments ?? (project.department ? [project.department] : [])
  const allTasks = project.phases?.flatMap(ph => ph.tasks ?? []) ?? []
  const completed = allTasks.filter(t => t.status === 'completada').length
  const progress = allTasks.length ? Math.round(completed / allTasks.length * 100) : 0
  const status = project.status ?? 'Pendiente'
  const cfg = STATUS[status] ?? STATUS['Pendiente']

  const handleTaskStatus = (phaseId, taskId, s) => {
    const updatedPhases = project.phases.map(ph =>
      ph.id !== phaseId ? ph : {
        ...ph, tasks: ph.tasks.map(t => t.id === taskId ? { ...t, status: s } : t)
      }
    )
    const tasks = updatedPhases.flatMap(ph => ph.tasks ?? [])
    let derivedStatus = project.status
    if (tasks.length) {
      const doneCount = tasks.filter(t => t.status === 'completada').length
      if (doneCount === tasks.length) derivedStatus = 'Completado'
      else if (tasks.some(t => t.status === 'en_proceso' || t.status === 'pausada')) derivedStatus = 'En proceso'
      else derivedStatus = 'Pendiente'
    }
    onUpdate({ phases: updatedPhases, status: derivedStatus })
  }

  return (
    <div
      className="bg-white rounded-2xl border border-[#e8e5db] shadow-sm hover:shadow-md transition-all duration-200 flex flex-col"
      style={{ borderLeft: `3px solid ${cfg.line}` }}
    >
      {/* Card body */}
      <div className="px-5 pt-5 pb-4 cursor-pointer" onClick={onToggleExpand}>

        {/* Title row */}
        <div className="flex items-start gap-3 mb-3">
          <h3 className="flex-1 text-[14px] font-semibold text-[#111] leading-snug tracking-[-0.01em]">
            {project.name}
          </h3>
          <div onClick={e => e.stopPropagation()}>
            <StatusBadge status={status} onChange={s => onUpdate({ status: s })} />
          </div>
        </div>

        {/* Tags */}
        {(depts.length > 0 || project.team) && (
          <div className="flex flex-wrap gap-1.5 mb-4">
            {depts.map(d => (
              <span key={d} className="text-[11px] font-medium text-[#555] bg-[#f5f3eb] border border-[#e8e5db] px-2.5 py-0.5 rounded-md">
                {d}
              </span>
            ))}
            {project.team && (
              <span className="text-[11px] font-semibold text-[#111] bg-[#fff8e6] border border-[#fde68a] px-2.5 py-0.5 rounded-md flex items-center gap-1.5">
                <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <circle cx="8" cy="5.5" r="3"/>
                  <path d="M2 14c0-3.3 2.7-5 6-5s6 1.7 6 5" strokeLinecap="round"/>
                </svg>
                {project.team}
              </span>
            )}
          </div>
        )}

        {/* Progress */}
        {allTasks.length > 0 && (
          <div>
            <div className="flex justify-between items-center mb-1.5">
              <span className="text-[12px] font-medium text-[#888]">Progreso</span>
              <span className="text-[12px] font-mono font-bold" style={{ color: cfg.line }}>{progress}%</span>
            </div>
            <div className="h-1.5 bg-[#f0ede3] rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{ width: `${progress}%`, background: cfg.line }}
              />
            </div>
            <p className="text-[11px] font-medium text-[#777] mt-1.5">{completed} de {allTasks.length} tareas completadas</p>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-5 py-3 border-t border-[#f0ede3] flex items-center justify-between">
        <button
          onClick={onToggleExpand}
          className="flex items-center gap-1.5 text-[12px] font-medium text-[#888] hover:text-[#333] transition-colors"
        >
          <svg className={`w-3.5 h-3.5 transition-transform ${expanded ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7"/>
          </svg>
          {expanded ? 'Ocultar' : `Ver ${project.phases?.length ?? 0} fase${project.phases?.length !== 1 ? 's' : ''}`}
        </button>

        <div className="flex items-center gap-1">
          <button
            onClick={onEdit}
            className="text-[12px] font-semibold text-[#777] hover:text-[#111] transition-colors px-2.5 py-1 rounded-lg hover:bg-[#f5f3eb]"
          >
            Editar
          </button>
          <button
            onClick={onDelete}
            className="w-7 h-7 flex items-center justify-center text-[#999] hover:text-[#ef4444] hover:bg-[#fff1f1] rounded-lg transition-colors"
          >
            <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        </div>
      </div>

      {/* Expanded */}
      {expanded && (
        <div className="border-t border-[#f0ede3] bg-[#faf9f5] rounded-b-2xl px-5 py-4 space-y-4">
          {project.requirements && (
            <p className="text-[12px] font-medium text-[#666] border-l-2 pl-3 leading-relaxed italic" style={{ borderColor: cfg.line }}>
              {project.requirements}
            </p>
          )}
          {project.phases?.length > 0 ? project.phases.map(phase => (
            <div key={phase.id}>
              <p className="text-[10px] font-mono font-bold tracking-[0.14em] uppercase text-[#777] mb-2">
                {phase.name}
              </p>
              <div className="space-y-1.5">
                {phase.tasks?.length > 0 ? phase.tasks.map(task => (
                  <div key={task.id} className="flex items-center gap-2.5">
                    <span className="w-1 h-1 rounded-full bg-[#d4d0c8] flex-shrink-0" />
                    <span className="text-[13px] font-medium text-[#444] flex-1 leading-snug">{task.name}</span>
                    <TaskDropdown
                      task={task}
                      onStatusChange={(id, s) => handleTaskStatus(phase.id, id, s)}
                    />
                  </div>
                )) : (
                  <p className="text-[12px] text-[#888] italic">Sin tareas en esta fase</p>
                )}
              </div>
            </div>
          )) : (
            <p className="text-[13px] text-[#888] text-center py-2">
              Sin fases — usa <span className="font-semibold text-[#666]">Editar</span> para añadir
            </p>
          )}
        </div>
      )}
    </div>
  )
}
