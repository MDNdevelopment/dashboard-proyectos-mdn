import { useState } from 'react'
import ProjectCard from './ProjectCard'
import { getGlobalProgress } from '../utils/projectProgress'

const FILTER_LABELS = {
  all: 'Todos los proyectos',
  'En proceso': 'En proceso',
  'Pendiente': 'Pendientes',
  'Completado': 'Completados',
}

function Dashboard({ projects, loading, activeFilter, onNewProject, onEditProject, onUpdateProject, onDeleteProject, onMenuToggle, onExport }) {
  const [search, setSearch] = useState('')
  const [expandedMap, setExpandedMap] = useState({})
  const toggleExpanded = id => setExpandedMap(prev => ({ ...prev, [id]: !prev[id] }))

  const filtered = projects.filter(p => {
    const depts = p.departments ?? (p.department ? [p.department] : [])
    if (activeFilter.startsWith('dept:')) {
      if (!depts.includes(activeFilter.replace('dept:', ''))) return false
    } else if (activeFilter !== 'all') {
      if (p.status !== activeFilter) return false
    }
    if (search) {
      const q = search.toLowerCase()
      return p.name?.toLowerCase().includes(q) ||
        p.team?.toLowerCase().includes(q) ||
        depts.some(d => d.toLowerCase().includes(q))
    }
    return true
  })

  const { percent: avgProgress, doneTasks, totalTasks } = getGlobalProgress(projects)

  const title = activeFilter.startsWith('dept:')
    ? activeFilter.replace('dept:', '')
    : (FILTER_LABELS[activeFilter] ?? 'Proyectos')

  const metrics = [
    { label: 'Total proyectos',  value: projects.length,                                           color: '#111',    mono: false },
    { label: 'En proceso',       value: projects.filter(p => p.status === 'En proceso').length,    color: '#2563eb', mono: false },
    { label: 'Pendientes',       value: projects.filter(p => p.status === 'Pendiente').length,     color: '#d97706', mono: false },
    { label: 'Completados',      value: projects.filter(p => p.status === 'Completado').length,    color: '#16a34a', mono: false },
    { label: 'Avance global',    value: `${avgProgress}%`,  sub: `${doneTasks} / ${totalTasks} tareas`, color: '#111', mono: true },
  ]

  return (
    <div className="main-bg min-h-screen">

<div className="px-6 lg:px-10 pt-8 pb-16 max-w-[1400px]">

        {/* Header */}
        <div className="flex items-end justify-between mb-7 gap-4">
          <div>
            <p className="text-[11px] font-mono font-semibold text-[#888] tracking-[0.14em] uppercase mb-1.5">
              MDN Publicidad
            </p>
            <h1 className="text-[24px] font-semibold text-[#111] tracking-[-0.025em] leading-none">
              {title}
            </h1>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {!activeFilter.startsWith('dept:') && (
              <button
                onClick={onExport}
                className="flex items-center gap-2 bg-white border border-[#e0ddd4] text-[#111] text-[13px] font-semibold px-4 py-2.5 rounded-xl hover:bg-[#f5f3eb] transition-colors shadow-sm"
              >
                <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M7 1v8M4 6l3 3 3-3" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M1 10v1a2 2 0 002 2h8a2 2 0 002-2v-1" strokeLinecap="round"/>
                </svg>
                Exportar
              </button>
            )}
            <button
              onClick={onNewProject}
              className="hidden lg:flex items-center gap-2 bg-[#0d0d0d] text-white text-[13px] font-semibold px-4 py-2.5 rounded-xl hover:bg-[#222] transition-colors shadow-sm"
            >
              <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2.8">
                <path d="M6 1v10M1 6h10" strokeLinecap="round"/>
              </svg>
              Nuevo proyecto
            </button>
          </div>
        </div>

        {/* Metrics */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-7">
          {metrics.map(m => (
            <div key={m.label} className="bg-white rounded-2xl border border-[#e8e5db] p-4 shadow-sm">
              <p
                className={`leading-none mb-2 ${m.mono ? 'font-mono text-[26px] font-semibold' : 'font-mono text-[28px] font-semibold'}`}
                style={{ color: m.color }}
              >
                {m.value}
              </p>
              <p className="text-[12px] font-medium text-[#666]">{m.label}</p>
              {m.sub && <p className="text-[11px] font-mono text-[#777] mt-1">{m.sub}</p>}
            </div>
          ))}
        </div>

        {/* Search */}
        <div className="relative mb-6 max-w-xs">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-[#999] pointer-events-none" width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="6.5" cy="6.5" r="5"/>
            <path d="M10.5 10.5L14 14" strokeLinecap="round"/>
          </svg>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar proyecto, equipo..."
            className="w-full bg-white border border-[#e0ddd4] rounded-xl pl-9 pr-4 py-2.5 text-[13px] text-[#111] placeholder-[#bbb] outline-none focus:border-[#bbb] transition-colors shadow-sm font-sans"
          />
        </div>

        {/* Grid */}
        {loading ? (
          <div className="flex items-center justify-center py-32">
            <div className="w-5 h-5 border-2 border-[#ddd] border-t-[#FFB800] rounded-full animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-32">
            <div className="w-12 h-12 bg-white rounded-2xl border border-[#e8e5db] flex items-center justify-center mx-auto mb-3 shadow-sm">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#bbb" strokeWidth="1.5">
                <rect x="3" y="3" width="18" height="18" rx="3"/>
                <path d="M9 12h6M9 8h4" strokeLinecap="round"/>
              </svg>
            </div>
            <p className="text-[14px] font-medium text-[#999] mb-4">
              {search ? 'Sin resultados para esa búsqueda.' : 'No hay proyectos aquí aún.'}
            </p>
            {!search && (
              <button onClick={onNewProject} className="bg-[#0d0d0d] text-white text-[13px] font-semibold px-5 py-2.5 rounded-xl hover:bg-[#222] transition-colors">
                Crear primer proyecto
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 items-start">
            {filtered.map(project => (
              <ProjectCard
                key={project.id}
                project={project}
                expanded={!!expandedMap[project.id]}
                onToggleExpand={() => toggleExpanded(project.id)}
                onEdit={() => onEditProject(project)}
                onUpdate={u => onUpdateProject(project.id, u)}
                onDelete={() => onDeleteProject(project.id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default Dashboard
