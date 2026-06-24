import { fmtMonth, lightOf, teamMonthStats, taskInMonth, isClosed, isBlocked, isLate, fmtShort, COL_META, ESTADOS } from './constants'

function KpiCard({ label, value, sub, color }) {
  return (
    <div className="bg-white rounded-xl border border-[#e0ddd4] px-4 py-3.5">
      <p className="text-[13px] font-mono font-bold tracking-[0.12em] uppercase text-[#888] mb-1">{label}</p>
      <p className="text-[24px] font-bold text-[#111] leading-none" style={color ? { color } : {}}>
        {value}
      </p>
      {sub && <p className="text-[13.5px] text-[#888] mt-1">{sub}</p>}
    </div>
  )
}

export default function TeamView({ team, tasks, usersMap, monthIdx, onOpenTask }) {
  if (!team) {
    return (
      <div className="bg-white rounded-xl border border-[#e0ddd4] p-10 text-center">
        <p className="text-[16px] font-medium text-[#888]">Selecciona un team para ver su dashboard</p>
      </div>
    )
  }

  const all = tasks.filter(t => t.team_id === team.id)
  const monthTasks = all.filter(t => taskInMonth(t, monthIdx))
  const total = monthTasks.length
  const closed = monthTasks.filter(isClosed).length
  const pct = total ? Math.round((closed / total) * 100) : 0
  const blocked = all.filter(isBlocked).length
  const late = all.filter(isLate).length
  const supportCount = all.filter(t => t.support_id && !isClosed(t)).length

  const semLabel = !total ? 'Sin movimiento' : pct >= 90 ? 'Team al día' : pct >= 70 ? 'Atención: retrasos leves' : 'Alerta: plan de acción'
  const semColor = !total ? '#bbb' : pct >= 90 ? '#16A34A' : pct < 70 ? '#E14848' : '#F0871F'

  const counts = ESTADOS.map(e => ({ e, n: all.filter(t => t.status === e).length }))
  const tot = all.length

  const clients = [...new Set(monthTasks.map(t => t.client).filter(Boolean))].sort()

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-[20px] font-bold text-[#111]">Team {team.name}</h2>
        <p className="text-[14.5px] text-[#888]">{fmtMonth(monthIdx)}</p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <KpiCard label="Planificadas" value={total} sub={fmtMonth(monthIdx)} />
        <KpiCard label="Cerradas" value={`${closed}/${total}`} sub="Completadas" color="#16A34A" />
        <KpiCard label="Cumplimiento" value={`${pct}%`} sub={semLabel} color={semColor} />
        <KpiCard label="Bloqueados" value={blocked} sub={blocked ? 'Este mes' : 'Sin bloqueos'} color={blocked ? '#E14848' : undefined} />
        <KpiCard label="Retrasados" value={late} sub="Entregas vencidas" color={late ? '#E14848' : undefined} />
        <KpiCard label="Apoyo dir." value={supportCount} sub={supportCount ? 'Activos' : 'Ninguno'} />
      </div>

      {tot > 0 && (
        <div className="bg-white rounded-xl border border-[#e0ddd4] p-4">
          <p className="text-[13px] font-mono font-bold tracking-[0.12em] uppercase text-[#888] mb-3">
            Estado del pipeline · {tot} tareas activas
          </p>
          <div className="flex rounded-full overflow-hidden h-2 mb-3">
            {counts.filter(c => c.n > 0).map(c => (
              <div key={c.e} style={{ width: `${(c.n / tot) * 100}%`, background: COL_META[c.e]?.color ?? '#ccc' }} title={`${c.e}: ${c.n}`} />
            ))}
          </div>
          <div className="flex flex-wrap gap-3">
            {counts.map(c => (
              <span key={c.e} className="flex items-center gap-1.5 text-[14px] text-[#555]">
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: COL_META[c.e]?.color ?? '#ccc', display: 'inline-block', flexShrink: 0 }} />
                <b className="text-[#111]">{c.n}</b> {c.e}
              </span>
            ))}
          </div>
        </div>
      )}

      {monthTasks.length === 0 ? (
        <div className="bg-white rounded-xl border border-[#e0ddd4] p-8 text-center">
          <p className="text-[15px] text-[#888]">Sin movimiento en {fmtMonth(monthIdx)}</p>
          <p className="text-[14px] text-[#bbb] mt-1">No hay tareas activas en este mes</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-[#e0ddd4] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-[15px]">
              <thead>
                <tr className="border-b border-[#ece9df] text-left">
                  <th className="px-4 py-3 text-[13px] font-mono font-bold tracking-[0.12em] uppercase text-[#888]">Cliente</th>
                  <th className="px-4 py-3 text-[13px] font-mono font-bold tracking-[0.12em] uppercase text-[#888]">Tareas</th>
                  <th className="px-4 py-3 text-[13px] font-mono font-bold tracking-[0.12em] uppercase text-[#888]">Cerradas</th>
                  <th className="px-4 py-3 text-[13px] font-mono font-bold tracking-[0.12em] uppercase text-[#888] min-w-[160px]">Cumplimiento</th>
                  <th className="px-4 py-3 text-[13px] font-mono font-bold tracking-[0.12em] uppercase text-[#888]">Semáforo</th>
                </tr>
              </thead>
              <tbody>
                {(clients.length > 0 ? clients : ['(sin cliente)']).map(cl => {
                  const ct = monthTasks.filter(t => (t.client || '(sin cliente)') === cl)
                  const tt = ct.length
                  const cer = ct.filter(isClosed).length
                  const pp = tt ? Math.round((cer / tt) * 100) : 0
                  const lg = lightOf(pp, tt)
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
                        <span className="inline-flex items-center gap-1.5 text-[14px] font-semibold" style={{ color: lg.color }}>
                          <span style={{ width: 7, height: 7, borderRadius: '50%', background: lg.color, display: 'inline-block' }} />
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
