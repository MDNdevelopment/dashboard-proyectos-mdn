import { getProjectProgress } from '../utils/projectProgress'
import { fmtDate } from '../utils/formatDate'
import { STATUS } from '../constants/projectStatus'

function StatusBadge({ status }) {
  const c = STATUS[status] ?? STATUS['Pendiente']
  return (
    <span
      style={{ color: c.text, background: c.bg }}
      className="text-[12px] font-semibold px-2.5 py-1 rounded-lg whitespace-nowrap flex-shrink-0"
    >
      {c.label}
    </span>
  )
}

export default function ProjectCard({ project, onView, onEdit, onDelete, onDuplicate }) {

  const depts = project.departments ?? (project.department ? [project.department] : [])
  const { completed, total: totalTasks, percent: progress } = getProjectProgress(project)
  const status = project.status ?? 'Pendiente'
  const cfg = STATUS[status] ?? STATUS['Pendiente']
  const deg = Math.round(progress * 3.6)

  return (
    <div
      onClick={onView}
      className="bg-white rounded-[15px] border border-[#f0ede3] shadow-sm hover:shadow-md transition-shadow duration-200 flex flex-col cursor-pointer p-[22px]"
    >
      {/* Title + status row — reserved height keeps cards aligned */}
      <div className="flex items-start justify-between gap-3 min-h-[44px]">
        <h3 className="text-[16px] font-semibold text-[#111] leading-[1.32] tracking-[-0.005em]">
          {project.name}
        </h3>
        <StatusBadge status={status} />
      </div>

      {/* Tags — reserved height so cards without department/team don't collapse */}
      <div className="flex flex-wrap gap-1.5 mt-3.5 min-h-[26px]">
        {depts.map(d => (
          <span key={d} className="text-[12px] font-medium text-[#777] bg-[#f5f3eb] border border-[#e8e5db] px-2.5 py-0.5 rounded-md">
            {d}
          </span>
        ))}
        {project.team && (
          <span className="text-[12px] font-medium text-[#777] bg-[#f5f3eb] border border-[#e8e5db] px-2.5 py-0.5 rounded-md flex items-center gap-1">
            <svg width="11" height="11" viewBox="0 0 16 16" fill="#999">
              <circle cx="8" cy="5.5" r="3"/>
              <path d="M2 14c0-3.3 2.7-5 6-5s6 1.7 6 5" />
            </svg>
            {project.team}
          </span>
        )}
      </div>

      {/* Progress ring */}
      <div className="flex items-center gap-4 mt-5">
        <div
          className="w-[58px] h-[58px] rounded-full flex items-center justify-center flex-shrink-0"
          style={{ background: `conic-gradient(${cfg.line} ${deg}deg, #eee7d8 ${deg}deg)` }}
        >
          <div className="w-[42px] h-[42px] rounded-full bg-white flex items-center justify-center text-[11px] font-mono font-bold text-[#111]">
            {progress}%
          </div>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-semibold text-[#111] mb-0.5">Progreso</p>
          <p className="text-[12px] text-[#999]">
            {totalTasks > 0 ? `${completed} de ${totalTasks} tareas completadas` : 'Sin tareas'}
          </p>
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between gap-3 mt-5 pt-[15px] border-t border-[#f0ede3]">

        <span className="text-[12px] font-mono text-[#999] whitespace-nowrap">
          {(project.createdAt || project.created_at) ? fmtDate(project.createdAt ?? project.created_at) : ''}
        </span>

        <div className="flex items-center gap-3.5">
          <button
            onClick={e => { e.stopPropagation(); onDuplicate() }}
            className="text-[13px] text-[#777] hover:text-[#111] transition-colors"
          >
            Duplicar
          </button>
          <button
            onClick={e => { e.stopPropagation(); onEdit() }}
            className="text-[13px] font-semibold text-[#111] hover:text-[#555] transition-colors"
          >
            Editar
          </button>
          <button
            onClick={e => { e.stopPropagation(); onDelete() }}
            className="text-[17px] leading-none text-[#bbb] hover:text-[#ef4444] transition-colors"
            aria-label="Eliminar"
          >
            ×
          </button>
        </div>
      </div>
    </div>
  )
}
