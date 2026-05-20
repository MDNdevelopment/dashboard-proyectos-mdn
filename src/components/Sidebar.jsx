
const DEPARTMENTS = ['Redes', 'Diseño', 'Audiovisual', 'Tecnología']

const VIEWS = [
  { key: 'all',        label: 'Todos los proyectos' },
  { key: 'En proceso', label: 'En proceso'           },
  { key: 'Pendiente',  label: 'Pendientes'           },
  { key: 'Completado', label: 'Completados'          },
]

const VIEW_ICONS = {
  all:         <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7"><rect x="1" y="1" width="6" height="6" rx="1.5"/><rect x="9" y="1" width="6" height="6" rx="1.5"/><rect x="1" y="9" width="6" height="6" rx="1.5"/><rect x="9" y="9" width="6" height="6" rx="1.5"/></svg>,
  'En proceso':<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7"><circle cx="8" cy="8" r="6.5"/><path d="M8 4.5V8l2.5 2" strokeLinecap="round"/></svg>,
  Pendiente:   <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7"><circle cx="8" cy="8" r="6.5"/><circle cx="8" cy="8" r="2" fill="currentColor" stroke="none"/></svg>,
  Completado:  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7"><circle cx="8" cy="8" r="6.5"/><path d="M5 8.5l2 2 4-4" strokeLinecap="round" strokeLinejoin="round"/></svg>,
}

function Sidebar({ projects, activeFilter, onFilterChange, onNewProject, connected }) {
  const counts = {
    all:           projects.length,
    'En proceso':  projects.filter(p => p.status === 'En proceso').length,
    'Pendiente':   projects.filter(p => p.status === 'Pendiente').length,
    'Completado':  projects.filter(p => p.status === 'Completado').length,
  }

  const deptCounts = {}
  DEPARTMENTS.forEach(d => {
    deptCounts[d] = projects.filter(p =>
      (p.departments ?? (p.department ? [p.department] : [])).includes(d)
    ).length
  })

  const hasDepts = DEPARTMENTS.some(d => deptCounts[d] > 0)

  return (
    <aside className="w-[230px] flex-shrink-0 bg-white border-r border-[#e0ddd4] flex flex-col h-full">

      {/* Brand */}
      <div className="px-5 pt-6 pb-5 border-b border-[#ece9df]">
        <div className="mb-3">
          <p className="text-[14px] font-bold text-[#111] leading-none tracking-tight">MDN</p>
          <p className="text-[11px] font-medium text-[#666] mt-0.5">Publicidad</p>
        </div>
        <div className={`flex items-center gap-1.5 text-[11px] font-semibold ${connected ? 'text-[#16a34a]' : 'text-[#888]'}`}>
          <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${connected ? 'bg-[#22c55e] animate-pulse' : 'bg-[#bbb]'}`} />
          {connected ? 'En vivo' : 'Conectando...'}
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 overflow-y-auto">

        <p className="text-[10px] font-mono font-bold tracking-[0.16em] uppercase text-[#888] px-2 mb-2">
          Vistas
        </p>

        <div className="space-y-0.5">
          {VIEWS.map(view => {
            const active = activeFilter === view.key
            return (
              <button
                key={view.key}
                onClick={() => onFilterChange(view.key)}
                className={`flex items-center gap-2.5 w-full px-3 py-2 rounded-lg text-[13px] font-medium transition-all text-left ${
                  active
                    ? 'bg-[#FFB800] text-[#111]'
                    : 'text-[#444] hover:bg-[#f5f3eb] hover:text-[#111]'
                }`}
              >
                <span className={`flex-shrink-0 ${active ? 'text-[#111]' : 'text-[#666]'}`}>
                  {VIEW_ICONS[view.key]}
                </span>
                <span className="flex-1">{view.label}</span>
                <span className={`text-[11px] font-mono font-bold min-w-[22px] text-center px-1.5 py-0.5 rounded-md ${
                  active ? 'bg-black/12 text-[#111]' : 'bg-[#f0ede3] text-[#555]'
                }`}>
                  {counts[view.key] ?? 0}
                </span>
              </button>
            )
          })}
        </div>

        {hasDepts && (
          <>
            <div className="h-px bg-[#ece9df] mx-2 my-4" />
            <p className="text-[10px] font-mono font-bold tracking-[0.16em] uppercase text-[#888] px-2 mb-2">
              Departamentos
            </p>
            <div className="space-y-0.5">
              {DEPARTMENTS.filter(d => deptCounts[d] > 0).map(dept => {
                const key = `dept:${dept}`
                const active = activeFilter === key
                return (
                  <button
                    key={dept}
                    onClick={() => onFilterChange(key)}
                    className={`flex items-center gap-2.5 w-full px-3 py-2 rounded-lg text-[13px] font-medium transition-all text-left ${
                      active
                        ? 'bg-[#FFB800] text-[#111]'
                        : 'text-[#444] hover:bg-[#f5f3eb] hover:text-[#111]'
                    }`}
                  >
                    <span className={`w-2 h-2 rounded-full flex-shrink-0 ${active ? 'bg-[#111]' : 'bg-[#bbb]'}`} />
                    <span className="flex-1">{dept}</span>
                    <span className={`text-[11px] font-mono font-bold min-w-[22px] text-center px-1.5 py-0.5 rounded-md ${
                      active ? 'bg-black/12 text-[#111]' : 'bg-[#f0ede3] text-[#555]'
                    }`}>
                      {deptCounts[dept]}
                    </span>
                  </button>
                )
              })}
            </div>
          </>
        )}
      </nav>

      {/* CTA */}
      <div className="px-4 pb-6 pt-3 border-t border-[#ece9df]">
        <button
          onClick={onNewProject}
          className="w-full bg-[#111] text-white text-[13px] font-bold py-2.5 rounded-xl hover:bg-[#222] transition-colors flex items-center justify-center gap-2"
        >
          <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2.8">
            <path d="M6 1v10M1 6h10" strokeLinecap="round"/>
          </svg>
          Nuevo proyecto
        </button>
        <div className="mt-3 text-center">
          <p className="text-[18px] font-bold text-[#111] leading-none">
            {new Date().toLocaleDateString('es-VE', { day: 'numeric', month: 'short' })}
          </p>
          <p className="text-[11px] font-medium text-[#888] mt-0.5 capitalize">
            {new Date().toLocaleDateString('es-VE', { weekday: 'long' })}
          </p>
        </div>
      </div>
    </aside>
  )
}

export default Sidebar
