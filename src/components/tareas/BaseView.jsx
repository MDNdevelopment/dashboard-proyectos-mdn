import { useState, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { isLate, isDragged, isClosed, fmtShort, ESTADOS, COL_META } from './constants'
import { Avatar } from './UserPickerSingle'
import { teamMemberUsers } from '../../utils/lineFilters'

function StatusBadge({ status }) {
  const meta = COL_META[status] ?? { color: '#ccc', textColor: '#111' }
  return (
    <span
      className="inline-block px-2 py-0.5 rounded-full text-[13px] font-bold"
      style={{ background: meta.color + '22', color: meta.color, border: `1px solid ${meta.color}44` }}
    >
      {status}
    </span>
  )
}

export default function BaseView({ tasks, teams, team, usersMap, clientsById = new Map(), onOpenTask }) {
  const [searchParams] = useSearchParams()

  // Inicializar filtros desde URL params (solo en el primer render)
  const [q, setQ] = useState('')
  const [fStatus, setFStatus] = useState(() => searchParams.get('status') ?? '')
  const [fClient, setFClient] = useState('')
  const [fSupport, setFSupport] = useState('')   // '' | 'with' | 'without'
  const [fAlert, setFAlert] = useState(() => searchParams.get('fAlert') ?? '')  // '' | 'late' | 'drag' | 'ok'
  const [fAssignee, setFAssignee] = useState(() => searchParams.get('assignee') ?? '') // user_id | ''

  // Solo tareas del team seleccionado
  const baseTasks = team ? tasks.filter(t => t.team_id === team.id) : []

  const clients = useMemo(
    () => [...new Set(baseTasks.map(t => t.client).filter(Boolean))].sort(),
    [baseTasks],
  )

  // Responsable: solo miembros del team seleccionado
  const usersList = useMemo(() => {
    const allUsers = Array.from(usersMap.values())
    return teamMemberUsers(allUsers, team)
      .sort((a, b) => `${a.first_name} ${a.last_name}`.localeCompare(`${b.first_name} ${b.last_name}`))
  }, [team, usersMap])

  const filtered = baseTasks.filter(t => {
    const sq = q.toLowerCase()
    if (sq && !((t.client ?? '').toLowerCase().includes(sq) || (t.description ?? '').toLowerCase().includes(sq))) return false
    if (fStatus && t.status !== fStatus) return false
    if (fClient && t.client !== fClient) return false
    if (fSupport === 'with' && !t.support_id) return false
    if (fSupport === 'without' && t.support_id) return false
    if (fAlert === 'late' && !isLate(t)) return false
    if (fAlert === 'drag' && !isDragged(t)) return false
    if (fAlert === 'ok' && (isLate(t) || isDragged(t))) return false
    if (fAssignee && t.assignee_id !== fAssignee) return false
    return true
  }).sort((a, b) => (b.request_date ?? '').localeCompare(a.request_date ?? ''))

  const hasFilters = q || fStatus || fClient || fSupport || fAlert || fAssignee
  function clearFilters() { setQ(''); setFStatus(''); setFClient(''); setFSupport(''); setFAlert(''); setFAssignee('') }

  function userDisplay(id) {
    const u = usersMap.get(id)
    return u ? { name: `${u.first_name} ${u.last_name}`, user: u } : null
  }

  if (!team) {
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
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
          <div className="relative col-span-2 sm:col-span-1">
            <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#999] pointer-events-none" width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="6.5" cy="6.5" r="5"/><path d="M10.5 10.5L14 14" strokeLinecap="round"/>
            </svg>
            <input
              value={q}
              onChange={e => setQ(e.target.value)}
              placeholder="Buscar tarea o cliente..."
              className="w-full pl-8 pr-3 py-2 text-[14.5px] bg-white border border-[#e0ddd4] rounded-lg outline-none focus:border-[#bbb] transition-colors"
            />
          </div>
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
            {clients.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <select value={fSupport} onChange={e => setFSupport(e.target.value)} className="input-base text-[14.5px] py-2">
            <option value="">Apoyo dir.: todos</option>
            <option value="with">Con apoyo</option>
            <option value="without">Sin apoyo</option>
          </select>
          <select value={fAlert} onChange={e => setFAlert(e.target.value)} className="input-base text-[14.5px] py-2">
            <option value="">Alerta: todas</option>
            <option value="late">Retrasadas</option>
            <option value="drag">Arrastradas (mes anterior)</option>
            <option value="ok">Al día</option>
          </select>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-[14px] text-[#888]">
            {hasFilters ? `${filtered.length} de ${baseTasks.length}` : baseTasks.length} tarea{baseTasks.length !== 1 ? 's' : ''}
          </span>
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
                  const resp = userDisplay(t.assignee_id)
                  const support = userDisplay(t.support_id)
                  const late = isLate(t)
                  const drag = isDragged(t)
                  return (
                    <tr
                      key={t.id}
                      className={`border-b border-[#f5f3eb] last:border-0 hover:bg-[#faf9f5] cursor-pointer transition-colors ${late ? 'bg-red-50/50' : ''}`}
                      onClick={() => onOpenTask(t)}
                    >
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
                        {drag && !late && <span className="block text-[13px] text-[#F0871F] mt-0.5">Arrastrada</span>}
                      </td>
                      <td className="px-4 py-3"><StatusBadge status={t.status} /></td>
                      <td className="px-4 py-3">
                        {resp ? (
                          <div className="flex items-center gap-1.5">
                            <Avatar user={resp.user} size={20} />
                            <span className="text-[14px] text-[#333]">{resp.name}</span>
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
