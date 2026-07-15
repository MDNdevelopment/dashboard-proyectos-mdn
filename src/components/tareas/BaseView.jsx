import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useSearchParams } from 'react-router-dom'
import { isLate, isDragged, isContinuous, isClosed, fmtShort, ESTADOS, COL_META, taskInMonth, currentMonthIndex } from './constants'
import { checklistProgress } from './taskChecklist'
import { Avatar } from './UserPickerSingle'
import { teamMemberUsers, tasksForVisibleLines } from '../../utils/lineFilters'
import { updateTaskStatus } from './taskStatus'

// --- Status dropdown (portal-based to escape overflow:hidden table containers) ---

function useStatusDropdown() {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState({ top: 0, left: 0 })
  const btnRef = useRef(null)
  const menuRef = useRef(null)

  function toggle(e) {
    e?.stopPropagation()
    if (!open && btnRef.current) {
      const r = btnRef.current.getBoundingClientRect()
      const menuH = ESTADOS.length * 36 + 12
      const menuW = 152
      setPos({
        top: window.innerHeight - r.bottom < menuH + 8 ? r.top - menuH - 4 : r.bottom + 4,
        left: Math.max(8, Math.min(r.left, window.innerWidth - menuW - 8)),
      })
    }
    setOpen(o => !o)
  }

  useEffect(() => {
    if (!open) return
    function handleOutside(e) {
      if (!menuRef.current?.contains(e.target) && !btnRef.current?.contains(e.target)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleOutside)
    return () => document.removeEventListener('mousedown', handleOutside)
  }, [open])

  return { open, pos, toggle, btnRef, menuRef, close: () => setOpen(false) }
}

function StatusBadge({ task, onUpdated }) {
  const { open, pos, toggle, btnRef, menuRef, close } = useStatusDropdown()
  const meta = COL_META[task.status] ?? { color: '#ccc' }

  async function handleSelect(e, newStatus) {
    e.stopPropagation()
    close()
    if (newStatus === task.status) return
    const { data, error } = await updateTaskStatus(task.id, newStatus)
    if (!error && data) onUpdated(data)
  }

  return (
    <>
      <button
        ref={btnRef}
        onClick={toggle}
        title="Cambiar estado"
        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[13px] font-bold cursor-pointer hover:opacity-75 transition-opacity"
        style={{ background: meta.color + '22', color: meta.color, border: `1px solid ${meta.color}44` }}
      >
        {task.status}
        <svg width="8" height="8" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M2 3.5l3 3 3-3" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>

      {open && createPortal(
        <div
          ref={menuRef}
          style={{ position: 'fixed', top: pos.top, left: pos.left, zIndex: 9999 }}
          className="bg-white border border-[#e8e5db] rounded-xl shadow-lg min-w-[152px] py-1.5 overflow-hidden"
        >
          {ESTADOS.map(s => {
            const m = COL_META[s] ?? { color: '#ccc' }
            const active = s === task.status
            return (
              <button
                key={s}
                onClick={e => handleSelect(e, s)}
                className="w-full text-left px-3 py-2 text-[13.5px] flex items-center gap-2 hover:bg-[#f5f3eb] transition-colors"
              >
                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: m.color }} />
                <span style={{ color: active ? '#111' : '#555', fontWeight: active ? '700' : '500' }}>{s}</span>
                {active && <span className="ml-auto text-[11px] text-[#aaa]">✓</span>}
              </button>
            )
          })}
        </div>,
        document.body,
      )}
    </>
  )
}

// --- Direction multi-select filter ---

function DirectionFilter({ directionUsers, selectedIds, onChange }) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef(null)

  useEffect(() => {
    if (!open) return
    function handleOutside(e) {
      if (!containerRef.current?.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handleOutside)
    return () => document.removeEventListener('mousedown', handleOutside)
  }, [open])

  function toggle(userId) {
    onChange(
      selectedIds.includes(userId)
        ? selectedIds.filter(id => id !== userId)
        : [...selectedIds, userId],
    )
  }

  function label() {
    if (selectedIds.length === 0) return 'Apoyo dir.: todos'
    const first = directionUsers.find(u => u.user_id === selectedIds[0])
    const name = first ? first.first_name : 'Apoyo'
    return selectedIds.length === 1 ? `Apoyo: ${name}` : `Apoyo: ${name} +${selectedIds.length - 1}`
  }

  const active = selectedIds.length > 0

  return (
    <div ref={containerRef} className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className={`w-full text-left flex items-center justify-between gap-1 px-3 py-[10px] text-[14.5px] border rounded-lg outline-none transition-colors ${
          active
            ? 'border-[#6366F1] bg-[#f0f0ff] text-[#4338ca] font-semibold'
            : 'border-[#e0ddd4] bg-white text-[#555]'
        }`}
      >
        <span className="truncate">{label()}</span>
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="2" className="flex-shrink-0">
          <path d="M2 3.5l3 3 3-3" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>

      {open && (
        <div data-testid="direction-filter-panel" className="absolute z-50 top-full mt-1 left-0 right-0 bg-white border border-[#e0ddd4] rounded-xl shadow-lg overflow-hidden min-w-[180px]">
          {directionUsers.length === 0 ? (
            <p className="px-3 py-2 text-[13.5px] text-[#aaa]">Sin usuarios de dirección</p>
          ) : (
            <>
              <div className="max-h-48 overflow-y-auto py-1">
                {directionUsers.map(u => {
                  const checked = selectedIds.includes(u.user_id)
                  return (
                    <button
                      key={u.user_id}
                      onClick={() => toggle(u.user_id)}
                      className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-[#f5f3eb] transition-colors text-left"
                    >
                      <div className="flex-shrink-0">
                        <Avatar user={u} size={24} />
                      </div>
                      <span className="flex-1 text-[14px] text-[#333]">{u.first_name} {u.last_name}</span>
                      {checked && (
                        <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="#6366F1" strokeWidth="2.5">
                          <path d="M2 6.5l3.5 3.5L11 3" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      )}
                    </button>
                  )
                })}
              </div>
              {active && (
                <div className="border-t border-[#e0ddd4] px-3 py-1.5">
                  <button
                    onClick={() => { onChange([]); setOpen(false) }}
                    className="text-[13px] font-semibold text-[#888] hover:text-[#111] transition-colors"
                  >
                    Limpiar
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}

// --- Main component ---

export default function BaseView({ tasks, teams, team, allLines = false, usersMap, clientsById = new Map(), monthIdx = currentMonthIndex(), onOpenTask, onUpdated, initialFilter = null }) {
  const [searchParams] = useSearchParams()

  // Inicializar filtros desde initialFilter (cards del dashboard) o URL params (Reportes), en ese orden
  const [q, setQ] = useState('')
  const [fStatus, setFStatus] = useState(() => initialFilter?.status ?? searchParams.get('status') ?? '')
  const [fClient, setFClient] = useState('')
  const [fClientId, setFClientId] = useState(() => searchParams.get('client') ?? '') // client_id desde Reportes
  // user_id[] de personas de dirección; precargable desde Home vía ?support=<userId>, o desde la
  // card "Apoyo dir." del dashboard (initialFilter.support === 'all') que marca a todos los directores
  const [fSupportIds, setFSupportIds] = useState(() => {
    if (initialFilter?.support === 'all') {
      return Array.from(usersMap.values())
        .filter(u => (u.access_level ?? 0) >= 3)
        .map(u => u.user_id)
    }
    const s = searchParams.get('support')
    return s ? [s] : []
  })
  const [fAlert, setFAlert] = useState(() => initialFilter?.alert ?? searchParams.get('fAlert') ?? '')  // '' | 'late' | 'drag' | 'cont' | 'ok'
  const [fAssignee, setFAssignee] = useState(() => searchParams.get('assignee') ?? '') // user_id | ''
  const [fLine, setFLine] = useState('')  // team_id | '' (solo en modo allLines)
  // Oculta tareas Terminado; precargable desde Home (nivel 4) vía ?hideDone=1
  const [hideCompleted, setHideCompleted] = useState(() => searchParams.get('hideDone') === '1')

  // Tareas del team seleccionado, o de todas las líneas visibles en modo "Todos",
  // acotadas al mes seleccionado (activas en el mes: incluye arrastradas y en curso)
  const baseTasks = (allLines
    ? tasksForVisibleLines(tasks, teams).filter(t => !fLine || t.team_id === fLine)
    : (team ? tasks.filter(t => t.team_id === team.id) : [])
  ).filter(t => taskInMonth(t, monthIdx))

  const clientList = [...new Set(baseTasks.map(t => t.client).filter(Boolean))].sort()

  // Responsable: miembros del team seleccionado, o todos los usuarios en modo "Todos"
  const usersList = (() => {
    const allUsers = Array.from(usersMap.values())
    const list = allLines ? allUsers : teamMemberUsers(allUsers, team)
    return list.sort((a, b) => `${a.first_name} ${a.last_name}`.localeCompare(`${b.first_name} ${b.last_name}`))
  })()

  // Usuarios de dirección: access_level >= 3 (pueden ser asignados como apoyo)
  const directionUsers = Array.from(usersMap.values())
    .filter(u => (u.access_level ?? 0) >= 3)
    .sort((a, b) => `${a.first_name} ${a.last_name}`.localeCompare(`${b.first_name} ${b.last_name}`))

  const filtered = baseTasks.filter(t => {
    const sq = q.toLowerCase()
    if (sq && !((t.client ?? '').toLowerCase().includes(sq) || (t.description ?? '').toLowerCase().includes(sq))) return false
    if (fStatus && t.status !== fStatus) return false
    if (fClient && t.client !== fClient) return false
    if (fSupportIds.length > 0 && !fSupportIds.includes(t.support_id)) return false
    if (fAlert === 'late' && !isLate(t)) return false
    if (fAlert === 'drag' && !isDragged(t)) return false
    if (fAlert === 'cont' && !isContinuous(t)) return false
    if (fAlert === 'ok' && (isLate(t) || isDragged(t))) return false
    if (fAssignee && !(t.assignee_ids ?? (t.assignee_id ? [t.assignee_id] : [])).includes(fAssignee)) return false
    if (fClientId && t.client_id !== fClientId) return false
    if (hideCompleted && isClosed(t)) return false
    return true
  }).sort((a, b) => (b.request_date ?? '').localeCompare(a.request_date ?? ''))

  const hasFilters = q || fStatus || fClient || fClientId || fSupportIds.length > 0 || fAlert || fAssignee || fLine || hideCompleted
  function clearFilters() { setQ(''); setFStatus(''); setFClient(''); setFClientId(''); setFSupportIds([]); setFAlert(''); setFAssignee(''); setFLine(''); setHideCompleted(false) }

  // Nombre del cliente filtrado por ID (para mostrar etiqueta cuando viene de Reportes)
  const activeClientName = fClientId ? clientsById.get(fClientId)?.name ?? null : null

  function userDisplay(id) {
    const u = usersMap.get(id)
    return u ? { name: `${u.first_name} ${u.last_name}`, user: u } : null
  }

  if (!team && !allLines) {
    return (
      <div className="bg-white rounded-xl border border-[#e0ddd4] p-10 text-center">
        <p className="text-[16px] font-medium text-[#888]">Selecciona un team para ver su base de tareas</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Filter bar */}
      <div className="space-y-1.5">
        <div className={`grid grid-cols-2 sm:grid-cols-3 gap-2 ${allLines ? 'lg:grid-cols-7' : 'lg:grid-cols-6'}`}>
          <div className="relative col-span-2 sm:col-span-1">
            <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#999] pointer-events-none" width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="6.5" cy="6.5" r="5"/><path d="M10.5 10.5L14 14" strokeLinecap="round"/>
            </svg>
            <input
              value={q}
              onChange={e => setQ(e.target.value)}
              placeholder="Buscar tarea o cliente..."
              className="w-full pl-8 pr-3 py-[10px] text-[14.5px] bg-white border border-[#e0ddd4] rounded-lg outline-none focus:border-[#bbb] transition-colors"
            />
          </div>
          {allLines && (
            <select value={fLine} onChange={e => setFLine(e.target.value)} className="input-base text-[14.5px] py-2">
              <option value="">Línea: todas</option>
              {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          )}
          <select value={fAssignee} onChange={e => setFAssignee(e.target.value)} className="input-base text-[14.5px] py-2">
            <option value="">Responsable: todos</option>
            {usersList.map(u => (
              <option key={u.user_id} value={u.user_id}>
                {u.first_name} {u.last_name}
              </option>
            ))}
          </select>
          <select value={fStatus} onChange={e => setFStatus(e.target.value)} className="input-base text-[14.5px] py-2">
            <option value="">Estatus: todos</option>
            {ESTADOS.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <select value={fClient} onChange={e => setFClient(e.target.value)} className="input-base text-[14.5px] py-2">
            <option value="">Cliente: todos</option>
            {clientList.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <DirectionFilter
            directionUsers={directionUsers}
            selectedIds={fSupportIds}
            onChange={setFSupportIds}
          />
          <select value={fAlert} onChange={e => setFAlert(e.target.value)} className="input-base text-[14.5px] py-2">
            <option value="">Alerta: todas</option>
            <option value="late">Retrasadas</option>
            <option value="drag">Atrasadas (mes anterior)</option>
            <option value="cont">Continuas</option>
            <option value="ok">Al día</option>
          </select>
        </div>
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[14px] text-[#888]">
              {hasFilters ? `${filtered.length} de ${baseTasks.length}` : baseTasks.length} tarea{baseTasks.length !== 1 ? 's' : ''}
            </span>
            {activeClientName && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 bg-[#fff6e0] border border-[#e8c96a] rounded-full text-[12.5px] font-semibold text-[#a06a00]">
                {activeClientName}
                <button
                  onClick={() => setFClientId('')}
                  className="text-[#b58a00] hover:text-[#7a5c00] leading-none"
                  title="Quitar filtro de cliente"
                >
                  ×
                </button>
              </span>
            )}
            <label className="flex items-center gap-1.5 text-[14px] text-[#555] cursor-pointer select-none">
              <input
                type="checkbox"
                checked={hideCompleted}
                onChange={e => setHideCompleted(e.target.checked)}
                className="w-3.5 h-3.5 accent-[#FFB800] cursor-pointer"
              />
              Ocultar completadas
            </label>
          </div>
          {hasFilters && (
            <button onClick={clearFilters} className="text-[14px] font-semibold text-[#888] hover:text-[#111] transition-colors">
              Limpiar filtros
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      {baseTasks.length === 0 ? (
        <div className="bg-white rounded-xl border border-[#e0ddd4] p-10 text-center">
          <p className="text-[16px] font-medium text-[#888] mb-1">Sin tareas</p>
          <p className="text-[14px] text-[#bbb]">Crea la primera tarea con el botón "Nueva tarea"</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-[#e0ddd4] p-8 text-center">
          <p className="text-[15px] text-[#888]">No hay tareas con esos filtros</p>
          <button onClick={clearFilters} className="mt-2 text-[14px] font-semibold text-[#FFB800] hover:underline">Limpiar filtros</button>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-[#e0ddd4] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-[15px]">
              <thead>
                <tr className="border-b border-[#ece9df] text-left bg-[#faf9f5]">
                  {allLines && <th className="px-4 py-3 text-[12.5px] font-mono font-bold tracking-[0.12em] uppercase text-[#888]">Línea</th>}
                  <th className="px-4 py-3 text-[12.5px] font-mono font-bold tracking-[0.12em] uppercase text-[#888]">Cliente</th>
                  <th className="px-4 py-3 text-[12.5px] font-mono font-bold tracking-[0.12em] uppercase text-[#888] max-w-[220px]">Tarea</th>
                  <th className="px-4 py-3 text-[12.5px] font-mono font-bold tracking-[0.12em] uppercase text-[#888]">Estatus</th>
                  <th className="px-4 py-3 text-[12.5px] font-mono font-bold tracking-[0.12em] uppercase text-[#888]">Responsable</th>
                  <th className="px-4 py-3 text-[12.5px] font-mono font-bold tracking-[0.12em] uppercase text-[#888]">Apoyo</th>
                  <th className="px-4 py-3 text-[12.5px] font-mono font-bold tracking-[0.12em] uppercase text-[#888]">Solicitud</th>
                  <th className="px-4 py-3 text-[12.5px] font-mono font-bold tracking-[0.12em] uppercase text-[#888]">Entrega</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(t => {
                  const resps = (t.assignee_ids ?? (t.assignee_id ? [t.assignee_id] : [])).map(id => usersMap.get(id)).filter(Boolean)
                  const support = userDisplay(t.support_id)
                  const late = isLate(t)
                  return (
                    <tr
                      key={t.id}
                      className={`border-b border-[#f5f3eb] last:border-0 hover:bg-[#faf9f5] cursor-pointer transition-colors ${late ? 'bg-red-50/50' : ''}`}
                      onClick={() => onOpenTask(t)}
                    >
                      {allLines && (
                        <td className="px-4 py-3 text-[13.5px] text-[#666]">
                          {teams.find(tm => tm.id === t.team_id)?.name ?? '—'}
                        </td>
                      )}
                      <td className="px-4 py-3 font-medium text-[#111] max-w-[140px]">
                        <div className="flex items-center gap-1.5 min-w-0">
                          {late && <span className="text-red-500 flex-shrink-0">⚠</span>}
                          {(() => {
                            const logo = t.client_id ? clientsById.get(t.client_id)?.logo_url : null
                            const name = t.client
                            if (!name) return <span className="text-[#bbb]">—</span>
                            return (
                              <>
                                {logo ? (
                                  <img src={logo} alt={name} className="w-7 h-7 rounded-full object-cover flex-shrink-0 border border-[#e0ddd4]" />
                                ) : (
                                  <span className="w-7 h-7 rounded-full bg-[#f0ede3] flex items-center justify-center flex-shrink-0 text-[12px] font-bold text-[#aaa] uppercase">{name[0]}</span>
                                )}
                                <span className="truncate">{name}</span>
                              </>
                            )
                          })()}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-[#333] max-w-[220px]">
                        <span className="line-clamp-2">{t.description}</span>
                        {late
                          ? <span className="block text-[13px] text-[#E14848] font-semibold mt-0.5">atrasada</span>
                          : isContinuous(t) && <span className="block text-[13px] text-[#F0871F] mt-0.5">Tarea continua</span>}
                        {(() => {
                          const { done, total } = checklistProgress(t.checklist)
                          if (total === 0) return null
                          return (
                            <span className="inline-flex items-center gap-1 mt-1 text-[11px] font-mono text-[#999]">
                              Actividades: {done}/{total}
                            </span>
                          )
                        })()}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge task={t} onUpdated={onUpdated} />
                      </td>
                      <td className="px-4 py-3">
                        {resps.length > 0 ? (
                          <div className="flex items-center">
                            {resps.map((u, i) => (
                              <div
                                key={u.user_id}
                                title={`${u.first_name} ${u.last_name}`}
                                className={`rounded-full ring-2 ring-white flex-shrink-0${i > 0 ? ' -ml-2' : ''}`}
                              >
                                <Avatar user={u} size={30} />
                              </div>
                            ))}
                          </div>
                        ) : <span className="text-[#bbb]">—</span>}
                      </td>
                      <td className="px-4 py-3">
                        {support ? (
                          <div className="flex items-center gap-1.5">
                            <span className="text-[13px]">🤝</span>
                            <span className="text-[14px] text-[#555]">{support.name}</span>
                          </div>
                        ) : <span className="text-[#bbb]">—</span>}
                      </td>
                      <td className="px-4 py-3 text-[14px] font-mono text-[#666]">{fmtShort(t.request_date)}</td>
                      <td className="px-4 py-3 text-[14px] font-mono text-[#666]">
                        {late ? <span className="text-red-500">{fmtShort(t.due_date)}</span> : fmtShort(t.due_date)}
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={e => { e.stopPropagation(); onOpenTask(t) }}
                          className="text-[13px] font-semibold text-[#888] hover:text-[#111] transition-colors"
                          aria-label="Editar tarea"
                        >
                          <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path d="M12 20h9M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4 12.5-12.5z" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
