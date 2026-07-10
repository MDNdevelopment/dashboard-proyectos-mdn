import { useState, useEffect } from 'react'
import { supabase } from '../supabase'
import { useAuth } from '../context/AuthContext'
import { getProjectProgress, deriveProjectStatus } from '../utils/projectProgress'
import { fmtDate } from '../utils/formatDate'
import { STATUS, STATUS_LIST, TASK_S, TASK_ORDER } from '../constants/projectStatus'
import Avatar from './Avatar'

// Modal de solo lectura: muestra la info del proyecto sin edición, salvo el estado
// del proyecto y el estado de cada actividad (ambos vía <select> nativo). Para
// agregar/renombrar/eliminar actividades hay que entrar por "Editar".
export default function ProjectDetailModal({ project, onClose, onUpdate, onEdit }) {
  const { userProfile } = useAuth()
  const [users, setUsers] = useState([])
  const depts = project.departments ?? (project.department ? [project.department] : [])
  const { completed, total: totalTasks, percent: progress } = getProjectProgress(project)
  const status = project.status ?? 'Pendiente'
  const cfg = STATUS[status] ?? STATUS['Pendiente']
  // Si el estado actual no está en la lista de 3 opciones (p. ej. "Paralizado"), se
  // incluye como opción extra para que el <select> controlado no pierda el valor.
  const statusOptions = STATUS_LIST.includes(status) ? STATUS_LIST : [status, ...STATUS_LIST]
  const members = project.members ?? []
  const encargados = users.filter(u => members.includes(u.user_id))

  useEffect(() => {
    if (!userProfile?.company_id) return
    supabase
      .from('users')
      .select('user_id, first_name, last_name, avatar_url')
      .eq('company_id', userProfile.company_id)
      .then(({ data }) => setUsers(data ?? []))
  }, [userProfile?.company_id])

  useEffect(() => {
    const h = e => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', h)
    return () => document.removeEventListener('keydown', h)
  }, [onClose])

  const handleTaskStatus = (phaseId, taskId, s) => {
    const updatedPhases = project.phases.map(ph =>
      ph.id !== phaseId ? ph : {
        ...ph, tasks: ph.tasks.map(t => t.id === taskId ? { ...t, status: s } : t)
      }
    )
    onUpdate({ phases: updatedPhases, status: deriveProjectStatus(updatedPhases, project.status) })
  }

  return (
    <div
      className="fixed inset-0 bg-black/25 backdrop-blur-[3px] flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        onClick={e => e.stopPropagation()}
        className="bg-white rounded-2xl border border-[#e8e5db] w-full max-w-2xl max-h-[92vh] flex flex-col shadow-2xl"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-[#eeebe0] flex-shrink-0">
          <div>
            <h2 className="text-[18px] font-semibold text-[#111] tracking-[-0.01em]">
              {project.name}
            </h2>
            {(project.createdAt || project.created_at) && (
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

          {/* Estado del proyecto */}
          <div>
            <label className="block text-[12px] font-mono font-semibold tracking-[0.14em] uppercase text-[#777] mb-2">
              Estado del proyecto
            </label>
            <select
              value={status}
              onChange={e => onUpdate({ status: e.target.value })}
              style={{ color: cfg.text, background: cfg.bg, border: `1px solid ${cfg.border}` }}
              className="text-[14px] font-semibold px-3 py-2 rounded-lg outline-none cursor-pointer"
            >
              {statusOptions.map(s => (
                <option key={s} value={s}>{STATUS[s]?.label ?? s}</option>
              ))}
            </select>
          </div>

          {/* Departamentos / equipo */}
          {(depts.length > 0 || project.team) && (
            <div className="flex flex-wrap gap-1.5">
              {depts.map(d => (
                <span key={d} className="text-[13px] font-medium text-[#555] bg-[#f5f3eb] border border-[#e8e5db] px-2.5 py-0.5 rounded-md">
                  {d}
                </span>
              ))}
              {project.team && (
                <span className="text-[13px] font-semibold text-[#111] bg-[#fff8e6] border border-[#fde68a] px-2.5 py-0.5 rounded-md flex items-center gap-1.5">
                  <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8">
                    <circle cx="8" cy="5.5" r="3"/>
                    <path d="M2 14c0-3.3 2.7-5 6-5s6 1.7 6 5" strokeLinecap="round"/>
                  </svg>
                  {project.team}
                </span>
              )}
            </div>
          )}

          {/* Encargados */}
          {encargados.length > 0 && (
            <div>
              <label className="block text-[12px] font-mono font-semibold tracking-[0.14em] uppercase text-[#777] mb-2">
                Encargados
              </label>
              <div className="flex flex-wrap gap-1.5">
                {encargados.map(u => (
                  <span key={u.user_id} className="inline-flex items-center gap-1.5 pl-1 pr-2.5 py-0.5 rounded-full bg-[#f5f3eb] border border-[#e0ddd4] text-[14px] font-medium text-[#333]">
                    <Avatar user={u} size={20} />
                    {u.first_name} {u.last_name}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Requirements */}
          {project.requirements && (
            <p className="text-[14px] font-medium text-[#666] border-l-2 pl-3 leading-relaxed italic" style={{ borderColor: cfg.line }}>
              {project.requirements}
            </p>
          )}

          {/* Progress */}
          {totalTasks > 0 && (
            <div>
              <div className="flex justify-between items-center mb-1.5">
                <span className="text-[14px] font-medium text-[#888]">Progreso</span>
                <span className="text-[14px] font-mono font-bold" style={{ color: cfg.line }}>{progress}%</span>
              </div>
              <div className="h-1.5 bg-[#f0ede3] rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{ width: `${progress}%`, background: cfg.line }}
                />
              </div>
              <p className="text-[13px] font-medium text-[#777] mt-1.5">{completed} de {totalTasks} tareas completadas</p>
            </div>
          )}

          {/* Fases y actividades */}
          <div className="space-y-4">
            {project.phases?.length > 0 ? project.phases.map(phase => (
              <div key={phase.id}>
                <p className="text-[12px] font-mono font-bold tracking-[0.14em] uppercase text-[#777] mb-2">
                  {phase.name}
                </p>
                <div className="space-y-3">
                  {phase.tasks?.length > 0 ? phase.tasks.map(task => {
                    const tc = TASK_S[task.status] ?? TASK_S.pendiente
                    return (
                      <div key={task.id} className="flex items-center gap-2.5">
                        <span className="w-1 h-1 rounded-full bg-[#d4d0c8] flex-shrink-0" />
                        <span className="text-[15px] font-medium text-[#444] flex-1 leading-snug">{task.name}</span>
                        <select
                          value={task.status}
                          onChange={e => handleTaskStatus(phase.id, task.id, e.target.value)}
                          style={{ color: tc.text, background: tc.bg, border: `1px solid ${tc.border}` }}
                          className="text-[13px] font-semibold px-2.5 py-0.5 rounded-full outline-none cursor-pointer"
                        >
                          {TASK_ORDER.map(s => (
                            <option key={s} value={s}>{TASK_S[s].label}</option>
                          ))}
                        </select>
                      </div>
                    )
                  }) : (
                    <p className="text-[14px] text-[#888] italic">Sin tareas en esta fase</p>
                  )}
                </div>
              </div>
            )) : (
              <p className="text-[15px] text-[#888] text-center py-2">
                Sin fases — usa <span className="font-semibold text-[#666]">Editar</span> para añadir
              </p>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex gap-3 px-6 py-4 border-t border-[#eeebe0] flex-shrink-0">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2.5 border border-[#e0ddd4] text-[#666] rounded-xl text-[15px] font-semibold hover:bg-[#f5f3eb] transition-colors"
          >
            Cerrar
          </button>
          <button
            onClick={onEdit}
            className="flex-1 px-4 py-2.5 bg-[#0d0d0d] text-white rounded-xl text-[15px] font-bold hover:bg-[#222] transition-colors"
          >
            Editar
          </button>
        </div>
      </div>
    </div>
  )
}
