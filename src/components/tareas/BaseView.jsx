import { useState, useMemo } from 'react'
import { isLate, isDragged, isClosed, fmtShort, ESTADOS, COL_META } from './constants'
import { Avatar } from './UserPickerSingle'

function StatusBadge({ estatus }) {
  const meta = COL_META[estatus] ?? { color: '#ccc', textColor: '#111' }
  return (
    <span
      className="inline-block px-2 py-0.5 rounded-full text-[11px] font-bold"
      style={{ background: meta.color + '22', color: meta.color, border: `1px solid ${meta.color}44` }}
    >
      {estatus}
    </span>
  )
}

export default function BaseView({ tareas, teams, team, usersMap, onOpenTask }) {
  const [q, setQ] = useState('')
  const [fEstatus, setFEstatus] = useState('')
  const [fCliente, setFCliente] = useState('')
  const [fApoyo, setFApoyo] = useState('')   // '' | 'con_apoyo' | 'sin_apoyo'
  const [fAlerta, setFAlerta] = useState('') // '' | 'late' | 'drag' | 'ok'

  const teamTareas = team ? tareas.filter(t => t.team_id === team.id) : []
  const clientes = useMemo(() =>
    [...new Set(teamTareas.map(t => t.cliente).filter(Boolean))].sort(),
    [teamTareas]
  )

  const filtered = teamTareas.filter(t => {
    const sq = q.toLowerCase()
    if (sq && !((t.cliente ?? '').toLowerCase().includes(sq) || (t.tarea ?? '').toLowerCase().includes(sq))) return false
    if (fEstatus && t.estatus !== fEstatus) return false
    if (fCliente && t.cliente !== fCliente) return false
    if (fApoyo === 'con_apoyo' && !t.apoyo_id) return false
    if (fApoyo === 'sin_apoyo' && t.apoyo_id) return false
    if (fAlerta === 'late' && !isLate(t)) return false
    if (fAlerta === 'drag' && !isDragged(t)) return false
    if (fAlerta === 'ok' && (isLate(t) || isDragged(t))) return false
    return true
  }).sort((a, b) => (b.fecha_solicitud ?? '').localeCompare(a.fecha_solicitud ?? ''))

  const hasFilters = q || fEstatus || fCliente || fApoyo || fAlerta
  function clearFilters() { setQ(''); setFEstatus(''); setFCliente(''); setFApoyo(''); setFAlerta('') }

  function userDisplay(id) {
    const u = usersMap.get(id)
    return u ? { name: `${u.first_name} ${u.last_name}`, user: u } : null
  }

  if (!team) {
    return (
      <div className="bg-white rounded-xl border border-[#e0ddd4] p-10 text-center">
        <p className="text-[14px] font-medium text-[#888]">Selecciona un team para ver su base de tareas</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#999] pointer-events-none" width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="6.5" cy="6.5" r="5"/><path d="M10.5 10.5L14 14" strokeLinecap="round"/>
          </svg>
          <input
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="Buscar tarea o cliente..."
            className="pl-8 pr-3 py-2 text-[12.5px] bg-white border border-[#e0ddd4] rounded-lg outline-none focus:border-[#bbb] transition-colors w-52"
          />
        </div>
        <select
          value={fEstatus}
          onChange={e => setFEstatus(e.target.value)}
          className="input-base text-[12.5px] py-2 w-auto"
        >
          <option value="">Estatus: todos</option>
          {ESTADOS.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select
          value={fCliente}
          onChange={e => setFCliente(e.target.value)}
          className="input-base text-[12.5px] py-2 w-auto"
        >
          <option value="">Cliente: todos</option>
          {clientes.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <select
          value={fApoyo}
          onChange={e => setFApoyo(e.target.value)}
          className="input-base text-[12.5px] py-2 w-auto"
        >
          <option value="">Apoyo dir.: todos</option>
          <option value="con_apoyo">Con apoyo</option>
          <option value="sin_apoyo">Sin apoyo</option>
        </select>
        <select
          value={fAlerta}
          onChange={e => setFAlerta(e.target.value)}
          className="input-base text-[12.5px] py-2 w-auto"
        >
          <option value="">Alerta: todas</option>
          <option value="late">Retrasadas</option>
          <option value="drag">Arrastradas &gt;7 días</option>
          <option value="ok">Al día</option>
        </select>
        {hasFilters && (
          <button
            onClick={clearFilters}
            className="text-[12px] font-semibold text-[#888] hover:text-[#111] transition-colors"
          >
            Limpiar filtros
          </button>
        )}
        <span className="ml-auto text-[12px] text-[#888]">
          {hasFilters ? `${filtered.length} de ${teamTareas.length}` : teamTareas.length} tarea{teamTareas.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Table */}
      {teamTareas.length === 0 ? (
        <div className="bg-white rounded-xl border border-[#e0ddd4] p-10 text-center">
          <p className="text-[14px] font-medium text-[#888] mb-1">Sin tareas</p>
          <p className="text-[12px] text-[#bbb]">Crea la primera tarea con el botón "Nueva tarea"</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-[#e0ddd4] p-8 text-center">
          <p className="text-[13px] text-[#888]">No hay tareas con esos filtros</p>
          <button onClick={clearFilters} className="mt-2 text-[12px] font-semibold text-[#FFB800] hover:underline">Limpiar filtros</button>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-[#e0ddd4] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-[#ece9df] text-left bg-[#faf9f5]">
                  <th className="px-4 py-3 text-[10.5px] font-mono font-bold tracking-[0.12em] uppercase text-[#888]">Cliente</th>
                  <th className="px-4 py-3 text-[10.5px] font-mono font-bold tracking-[0.12em] uppercase text-[#888] max-w-[220px]">Tarea</th>
                  <th className="px-4 py-3 text-[10.5px] font-mono font-bold tracking-[0.12em] uppercase text-[#888]">Estatus</th>
                  <th className="px-4 py-3 text-[10.5px] font-mono font-bold tracking-[0.12em] uppercase text-[#888]">Responsable</th>
                  <th className="px-4 py-3 text-[10.5px] font-mono font-bold tracking-[0.12em] uppercase text-[#888]">Apoyo</th>
                  <th className="px-4 py-3 text-[10.5px] font-mono font-bold tracking-[0.12em] uppercase text-[#888]">Solicitud</th>
                  <th className="px-4 py-3 text-[10.5px] font-mono font-bold tracking-[0.12em] uppercase text-[#888]">Entrega</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(t => {
                  const resp = userDisplay(t.responsable_id)
                  const apoyo = userDisplay(t.apoyo_id)
                  const late = isLate(t)
                  const drag = isDragged(t)
                  return (
                    <tr
                      key={t.id}
                      className={`border-b border-[#f5f3eb] last:border-0 hover:bg-[#faf9f5] cursor-pointer transition-colors ${late ? 'bg-red-50/50' : ''}`}
                      onClick={() => onOpenTask(t)}
                    >
                      <td className="px-4 py-3 font-medium text-[#111] max-w-[140px] truncate">
                        {late && <span className="text-red-500 mr-1">⚠</span>}
                        {t.cliente || <span className="text-[#bbb]">—</span>}
                      </td>
                      <td className="px-4 py-3 text-[#333] max-w-[220px]">
                        <span className="line-clamp-2">{t.tarea}</span>
                        {drag && !late && <span className="block text-[11px] text-[#F0871F] mt-0.5">Arrastrada</span>}
                      </td>
                      <td className="px-4 py-3"><StatusBadge estatus={t.estatus} /></td>
                      <td className="px-4 py-3">
                        {resp ? (
                          <div className="flex items-center gap-1.5">
                            <Avatar user={resp.user} size={20} />
                            <span className="text-[12px] text-[#333]">{resp.name}</span>
                          </div>
                        ) : <span className="text-[#bbb]">—</span>}
                      </td>
                      <td className="px-4 py-3">
                        {apoyo ? (
                          <div className="flex items-center gap-1.5">
                            <span className="text-[11px]">🤝</span>
                            <span className="text-[12px] text-[#555]">{apoyo.name}</span>
                          </div>
                        ) : <span className="text-[#bbb]">—</span>}
                      </td>
                      <td className="px-4 py-3 text-[12px] font-mono text-[#666]">{fmtShort(t.fecha_solicitud)}</td>
                      <td className="px-4 py-3 text-[12px] font-mono text-[#666]">
                        {late ? <span className="text-red-500">{fmtShort(t.fecha_entrega)}</span> : fmtShort(t.fecha_entrega)}
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={e => { e.stopPropagation(); onOpenTask(t) }}
                          className="text-[11px] font-semibold text-[#888] hover:text-[#111] transition-colors"
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
