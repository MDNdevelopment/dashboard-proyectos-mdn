import { isoWeek, lightOf, teamWeekStats, taskWeek, isClosed, isBlocked, isLate, fmtShort, COL_META, ESTADOS } from './constants'

function KpiCard({ label, value, sub, color }) {
  return (
    <div className="bg-white rounded-xl border border-[#e0ddd4] px-4 py-3.5">
      <p className="text-[11px] font-mono font-bold tracking-[0.12em] uppercase text-[#888] mb-1">{label}</p>
      <p className="text-[22px] font-bold text-[#111] leading-none" style={color ? { color } : {}}>
        {value}
      </p>
      {sub && <p className="text-[11.5px] text-[#888] mt-1">{sub}</p>}
    </div>
  )
}

export default function TeamView({ team, tareas, usersMap, onOpenTask }) {
  if (!team) {
    return (
      <div className="bg-white rounded-xl border border-[#e0ddd4] p-10 text-center">
        <p className="text-[14px] font-medium text-[#888]">Selecciona un team para ver su dashboard</p>
      </div>
    )
  }

  const wk = isoWeek(new Date())
  const all = tareas.filter(t => t.team_id === team.id)
  const tasks = all.filter(t => taskWeek(t) === wk)
  const total = tasks.length
  const cerradas = tasks.filter(isClosed).length
  const pct = total ? Math.round((cerradas / total) * 100) : 0
  const bloqueados = all.filter(isBlocked).length
  const retrasados = all.filter(isLate).length
  const apoyoN = all.filter(t => t.apoyo_id && !isClosed(t)).length

  const semLabel = !total ? 'Sin movimiento' : pct >= 90 ? 'Team al día' : pct >= 70 ? 'Atención: retrasos leves' : 'Alerta: plan de acción'
  const semColor = !total ? '#bbb' : pct >= 90 ? '#16A34A' : pct < 70 ? '#E14848' : '#F0871F'

  // Pipeline distribution
  const counts = ESTADOS.map(e => ({ e, n: all.filter(t => t.estatus === e).length }))
  const tot = all.length

  // Table by client
  const clientes = [...new Set(tasks.map(t => t.cliente).filter(Boolean))].sort()

  function userName(id) {
    const u = usersMap.get(id)
    return u ? `${u.first_name} ${u.last_name}` : '—'
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div>
        <h2 className="text-[18px] font-bold text-[#111]">Team {team.name}</h2>
        <p className="text-[12.5px] text-[#888]">Semana {wk}</p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <KpiCard label="Planificadas" value={total} sub={`Semana ${wk}`} />
        <KpiCard label="Cerradas" value={`${cerradas}/${total}`} sub="Completadas" color="#16A34A" />
        <KpiCard label="Cumplimiento" value={`${pct}%`} sub={semLabel} color={semColor} />
        <KpiCard label="Bloqueados" value={bloqueados} sub={bloqueados ? 'Esta semana' : 'Sin bloqueos'} color={bloqueados ? '#E14848' : undefined} />
        <KpiCard label="Retrasados" value={retrasados} sub="Entregas vencidas" color={retrasados ? '#E14848' : undefined} />
        <KpiCard label="Apoyo dir." value={apoyoN} sub={apoyoN ? 'Activos' : 'Ninguno'} />
      </div>

      {/* Pipeline distribution */}
      {tot > 0 && (
        <div className="bg-white rounded-xl border border-[#e0ddd4] p-4">
          <p className="text-[11px] font-mono font-bold tracking-[0.12em] uppercase text-[#888] mb-3">
            Estado del pipeline · {tot} tareas activas
          </p>
          <div className="flex rounded-full overflow-hidden h-2 mb-3">
            {counts.filter(c => c.n > 0).map(c => (
              <div
                key={c.e}
                style={{ width: `${(c.n / tot) * 100}%`, background: COL_META[c.e]?.color ?? '#ccc' }}
                title={`${c.e}: ${c.n}`}
              />
            ))}
          </div>
          <div className="flex flex-wrap gap-3">
            {counts.map(c => (
              <span key={c.e} className="flex items-center gap-1.5 text-[12px] text-[#555]">
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: COL_META[c.e]?.color ?? '#ccc', display: 'inline-block', flexShrink: 0 }} />
                <b className="text-[#111]">{c.n}</b> {c.e}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Client table */}
      {tasks.length === 0 ? (
        <div className="bg-white rounded-xl border border-[#e0ddd4] p-8 text-center">
          <p className="text-[13px] text-[#888]">Sin movimiento en la semana {wk}</p>
          <p className="text-[12px] text-[#bbb] mt-1">No hay tareas con fecha de solicitud esta semana</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-[#e0ddd4] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-[#ece9df] text-left">
                  <th className="px-4 py-3 text-[11px] font-mono font-bold tracking-[0.12em] uppercase text-[#888]">Cliente</th>
                  <th className="px-4 py-3 text-[11px] font-mono font-bold tracking-[0.12em] uppercase text-[#888]">Tareas</th>
                  <th className="px-4 py-3 text-[11px] font-mono font-bold tracking-[0.12em] uppercase text-[#888]">Cerradas</th>
                  <th className="px-4 py-3 text-[11px] font-mono font-bold tracking-[0.12em] uppercase text-[#888] min-w-[160px]">Cumplimiento</th>
                  <th className="px-4 py-3 text-[11px] font-mono font-bold tracking-[0.12em] uppercase text-[#888]">Semáforo</th>
                </tr>
              </thead>
              <tbody>
                {(clientes.length > 0 ? clientes : ['(sin cliente)']).map(cl => {
                  const ct = tasks.filter(t => (t.cliente || '(sin cliente)') === cl)
                  const tt = ct.length
                  const cer = ct.filter(isClosed).length
                  const pp = tt ? Math.round((cer / tt) * 100) : 0
                  const lg = lightOf(pp, tt)
                  const DOT = { green: '#16A34A', yellow: '#FFB800', red: '#E14848', none: '#bbb' }
                  const dotColor = DOT[lg.cls] ?? '#bbb'
                  return (
                    <tr key={cl} className="border-b border-[#f5f3eb] last:border-0 hover:bg-[#faf9f5]">
                      <td className="px-4 py-3 font-medium text-[#111]">{cl}</td>
                      <td className="px-4 py-3 text-[#666] font-mono">{tt}</td>
                      <td className="px-4 py-3 text-[#666] font-mono">{cer}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-[#111]">{pp}%</span>
                          <div className="flex-1 h-1.5 rounded-full bg-[#f0ede3] overflow-hidden">
                            <div className="h-full rounded-full" style={{ width: `${pp}%`, background: lg.color }} />
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-1.5 text-[12px] font-semibold" style={{ color: dotColor }}>
                          <span style={{ width: 7, height: 7, borderRadius: '50%', background: dotColor, display: 'inline-block' }} />
                          {lg.label}
                        </span>
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
