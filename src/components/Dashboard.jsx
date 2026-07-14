import { useState, useRef, useEffect } from 'react'
import ProjectCard from './ProjectCard'
import { getGlobalProgress } from '../utils/projectProgress'
import { filterProjects } from '../utils/filterProjects'

const PAGE_SIZE = 30

const DEPARTMENTS = ['Redes', 'Diseño', 'Audiovisual', 'Tecnología']

// ── Date-range picker (compact dropdown) ──────────────────────────────────────

function fmt(iso) {
  if (!iso) return ''
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

function DateRangePicker({ dateFrom, dateTo, onChange }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    function handleOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handleOutside)
    return () => document.removeEventListener('mousedown', handleOutside)
  }, [open])

  const hasRange = dateFrom || dateTo
  const label = hasRange
    ? [fmt(dateFrom), fmt(dateTo)].filter(Boolean).join(' → ')
    : 'Fecha'

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className={`flex items-center gap-2 px-3.5 py-2.5 rounded-xl border text-[15px] font-medium transition-colors shadow-sm whitespace-nowrap ${
          hasRange
            ? 'bg-[#111] text-white border-[#111]'
            : 'bg-white border-[#e0ddd4] text-[#555] hover:border-[#bbb]'
        }`}
      >
        <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8">
          <rect x="1.5" y="2.5" width="13" height="12" rx="1.5"/>
          <path d="M5 1v3M11 1v3M1.5 7h13" strokeLinecap="round"/>
        </svg>
        <span>{label}</span>
        {hasRange && (
          <span
            role="button"
            onClick={e => { e.stopPropagation(); onChange('', '') }}
            className="ml-1 text-white/70 hover:text-white leading-none text-[16px]"
            aria-label="Limpiar fechas"
          >×</span>
        )}
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1.5 z-50 bg-white border border-[#e0ddd4] rounded-2xl shadow-xl p-4 min-w-[240px]">
          <p className="text-[12px] font-mono font-bold tracking-[0.12em] uppercase text-[#888] mb-3">Rango de creación</p>
          <div className="space-y-2.5">
            <div>
              <label className="block text-[12px] text-[#aaa] mb-1">Desde</label>
              <input
                type="date"
                value={dateFrom}
                max={dateTo || undefined}
                onChange={e => onChange(e.target.value, dateTo)}
                className="input-base text-[14px] py-2"
              />
            </div>
            <div>
              <label className="block text-[12px] text-[#aaa] mb-1">Hasta</label>
              <input
                type="date"
                value={dateTo}
                min={dateFrom || undefined}
                onChange={e => onChange(dateFrom, e.target.value)}
                className="input-base text-[14px] py-2"
              />
            </div>
          </div>
          {hasRange && (
            <button
              type="button"
              onClick={() => { onChange('', ''); setOpen(false) }}
              className="mt-3 w-full text-[13.5px] font-semibold text-[#888] hover:text-[#111] transition-colors"
            >
              Limpiar rango
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// ── Dashboard ─────────────────────────────────────────────────────────────────

function Dashboard({ projects, loading, onNewProject, onEditProject, onViewProject, onDeleteProject, onDuplicateProject, onMenuToggle, onExport }) {
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [deptFilter, setDeptFilter] = useState('all')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)
  const sentinelRef = useRef(null)

  const filtered = filterProjects(projects, { search, statusFilter, deptFilter, dateFrom, dateTo })

  // Reset visible window when filters change
  useEffect(() => {
    setVisibleCount(PAGE_SIZE)
  }, [search, statusFilter, deptFilter, dateFrom, dateTo])

  // IntersectionObserver sentinel — loads the next batch when scrolled to bottom.
  // Guard against environments that don't support IntersectionObserver (e.g. test runners).
  useEffect(() => {
    if (!sentinelRef.current || typeof IntersectionObserver === 'undefined') return
    const observer = new IntersectionObserver(
      entries => {
        if (entries[0].isIntersecting) {
          setVisibleCount(c => Math.min(c + PAGE_SIZE, filtered.length))
        }
      },
      { rootMargin: '200px' },
    )
    observer.observe(sentinelRef.current)
    return () => observer.disconnect()
  }, [filtered.length])

  const visible = filtered.slice(0, visibleCount)

  const { percent: avgProgress, doneTasks, totalTasks } = getGlobalProgress(projects)

  const title = 'Todos los proyectos'

  const metrics = [
    { label: 'Total proyectos',  value: projects.length,                                           color: '#111',    mono: false, filter: 'all' },
    { label: 'En proceso',       value: projects.filter(p => p.status === 'En proceso').length,    color: '#2563eb', mono: false, filter: 'En proceso' },
    { label: 'Pendientes',       value: projects.filter(p => p.status === 'Pendiente').length,     color: '#d97706', mono: false, filter: 'Pendiente' },
    { label: 'Completados',      value: projects.filter(p => p.status === 'Completado').length,    color: '#16a34a', mono: false, filter: 'Completado' },
  ]

  const hasFilters = search || dateFrom || dateTo || statusFilter !== 'all' || deptFilter !== 'all'

  return (
    <div className="main-bg min-h-screen">

<div className="px-4 sm:px-6 lg:px-10 pt-8 pb-16 max-w-[1400px]">

        {/* Header */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between mb-7 sm:gap-4">
          <div>
            <p className="text-[13px] font-mono font-semibold text-[#888] tracking-[0.14em] uppercase mb-1.5">
              MDN Publicidad
            </p>
            <h1 className="text-[26px] font-semibold text-[#111] tracking-[-0.025em] leading-none">
              {title}
            </h1>
          </div>
          <div className="flex items-center gap-2 sm:flex-shrink-0">
            <button
              onClick={onExport}
              className="flex items-center gap-2 bg-white border border-[#e0ddd4] text-[#111] text-[15px] font-semibold px-4 py-2.5 rounded-xl hover:bg-[#f5f3eb] transition-colors shadow-sm"
            >
              <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M7 1v8M4 6l3 3 3-3" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M1 10v1a2 2 0 002 2h8a2 2 0 002-2v-1" strokeLinecap="round"/>
              </svg>
              Exportar
            </button>
            <button
              onClick={onNewProject}
              className="flex-1 sm:flex-none flex items-center justify-center gap-2 bg-[#0d0d0d] text-white font-semibold rounded-xl hover:bg-[#222] transition-colors shadow-sm px-3 py-2.5 lg:px-4 lg:text-[15px]"
            >
              <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2.8">
                <path d="M6 1v10M1 6h10" strokeLinecap="round"/>
              </svg>
              <span className="sm:hidden lg:inline">Nuevo proyecto</span>
            </button>
          </div>
        </div>

        {/* Metrics */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-[repeat(4,1fr)_1.5fr] gap-3 mb-7">
          {metrics.map(m => {
            const isActive = m.filter && statusFilter === m.filter
            return (
              <button
                key={m.label}
                type="button"
                onClick={() => setStatusFilter(m.filter)}
                className={`bg-white rounded-2xl border p-4 shadow-sm text-left w-full cursor-pointer hover:shadow-md transition-all duration-200 ${isActive ? 'border-[#FFB800] ring-1 ring-[#FFB800]' : 'border-[#e8e5db]'}`}
              >
                <p className="font-mono text-[30px] font-semibold leading-none mb-2" style={{ color: m.color }}>
                  {m.value}
                </p>
                <p className="text-[14px] font-medium text-[#666]">{m.label}</p>
              </button>
            )
          })}

          {/* Avance global — dark display card, not clickable */}
          <div className="bg-[#0d0d0d] rounded-2xl p-4 text-white">
            <div className="flex items-end justify-between gap-2">
              <p className="text-[30px] font-mono font-semibold leading-none">{avgProgress}%</p>
              <p className="text-[11px] font-mono text-white/55">{doneTasks} / {totalTasks}</p>
            </div>
            <p className="text-[13px] text-white/70 mt-2.5 mb-3">Avance global</p>
            <div className="h-1.5 bg-white/15 rounded-full overflow-hidden">
              <div
                className="h-full bg-[#FFB800] rounded-full transition-all duration-500"
                style={{ width: `${avgProgress}%` }}
              />
            </div>
          </div>
        </div>

        {/* Search + filters */}
        <div className="flex flex-wrap items-center gap-2 mb-6">
          <div className="relative flex-1 max-w-xs">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-[#999] pointer-events-none" width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="6.5" cy="6.5" r="5"/>
              <path d="M10.5 10.5L14 14" strokeLinecap="round"/>
            </svg>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar proyecto, equipo..."
              className="w-full bg-white border border-[#e0ddd4] rounded-xl pl-9 pr-4 py-2.5 text-[15px] text-[#111] placeholder-[#bbb] outline-none focus:border-[#bbb] transition-colors shadow-sm font-sans"
            />
          </div>

          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className={`px-3 py-2.5 rounded-xl border text-[15px] font-medium transition-colors shadow-sm cursor-pointer outline-none focus:border-[#bbb] font-sans ${
              statusFilter !== 'all'
                ? 'bg-[#111] text-white border-[#111]'
                : 'bg-white border-[#e0ddd4] text-[#555] hover:border-[#bbb]'
            }`}
          >
            <option value="all">Estado</option>
            <option value="En proceso">En proceso</option>
            <option value="Pendiente">Pendiente</option>
            <option value="Completado">Completado</option>
          </select>

          <select
            value={deptFilter}
            onChange={e => setDeptFilter(e.target.value)}
            className={`px-3 py-2.5 rounded-xl border text-[15px] font-medium transition-colors shadow-sm cursor-pointer outline-none focus:border-[#bbb] font-sans ${
              deptFilter !== 'all'
                ? 'bg-[#111] text-white border-[#111]'
                : 'bg-white border-[#e0ddd4] text-[#555] hover:border-[#bbb]'
            }`}
          >
            <option value="all">Departamento</option>
            {DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}
          </select>

          <DateRangePicker
            dateFrom={dateFrom}
            dateTo={dateTo}
            onChange={(from, to) => { setDateFrom(from); setDateTo(to) }}
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
            <p className="text-[16px] font-medium text-[#999] mb-4">
              {hasFilters ? 'Sin resultados para esa búsqueda.' : 'No hay proyectos aquí aún.'}
            </p>
            {!hasFilters && (
              <button onClick={onNewProject} className="bg-[#0d0d0d] text-white text-[15px] font-semibold px-5 py-2.5 rounded-xl hover:bg-[#222] transition-colors">
                Crear primer proyecto
              </button>
            )}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 items-start">
              {visible.map(project => (
                <ProjectCard
                  key={project.id}
                  project={project}
                  onView={() => onViewProject(project)}
                  onEdit={() => onEditProject(project)}
                  onDelete={() => onDeleteProject(project.id)}
                  onDuplicate={() => onDuplicateProject(project)}
                />
              ))}
            </div>

            {/* Infinite scroll sentinel */}
            <div ref={sentinelRef} />

            {visibleCount < filtered.length && (
              <p className="text-center text-[14px] text-[#999] mt-6 font-mono">
                Mostrando {visibleCount} de {filtered.length} proyectos
              </p>
            )}
          </>
        )}
      </div>
    </div>
  )
}

export default Dashboard
