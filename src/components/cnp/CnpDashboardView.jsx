import { fmtMonth, lightOf, isClosed, ESTADOS, COL_META } from '../tareas/constants'
import KpiCard from '../tareas/KpiCard'
import { cnpMonthStats } from './constants'

/**
 * Dashboard de CNP para la línea/mes activos, calcado del TeamView de Gestión de
 * Tareas: fila de KPIs clickeables (navegan a Base con el filtro aplicado), barra
 * de pipeline por estado y tabla de cumplimiento por cliente con semáforo.
 */
export default function CnpDashboardView({
  cnps = [],
  clientsById = new Map(),
  monthIdx,
  teamName,
  onNavigateToBase,
}) {
  const { total, closed, pct, blocked, late, printPending, inMonth } = cnpMonthStats(cnps, monthIdx)

  const counts = ESTADOS.map((e) => ({ e, n: cnps.filter((c) => c.status === e).length }))
  const tot = cnps.length

  const byClient = new Map()
  for (const c of inMonth) {
    const id = c.client_id ?? null
    const entry = byClient.get(id) ?? { total: 0, closed: 0 }
    entry.total += 1
    if (isClosed(c)) entry.closed += 1
    byClient.set(id, entry)
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-[20px] font-bold text-[#111]">{teamName ?? 'Todas las líneas'}</h2>
        <p className="text-[14.5px] text-[#888]">{fmtMonth(monthIdx)}</p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <KpiCard
          label="Solicitados"
          value={total}
          sub={fmtMonth(monthIdx)}
          onClick={() => onNavigateToBase(null)}
        />
        <KpiCard
          label="Entregados"
          value={`${closed}/${total}`}
          sub="Completados"
          color="#16A34A"
          onClick={() => onNavigateToBase({ status: 'Terminado' })}
        />
        <KpiCard
          label="Cumplimiento"
          value={`${pct}%`}
          sub={
            !total
              ? 'Sin movimiento'
              : pct >= 90
                ? 'Al día'
                : pct < 70
                  ? 'Necesita foco'
                  : 'En marcha'
          }
          color={!total ? undefined : pct >= 90 ? '#16A34A' : pct < 70 ? '#E14848' : '#F0871F'}
          onClick={() => onNavigateToBase(null)}
        />
        <KpiCard
          label="Paralizados"
          value={blocked}
          sub={blocked ? 'Cuellos de botella' : 'Sin paralizaciones'}
          color={blocked ? '#E14848' : undefined}
          onClick={() => onNavigateToBase({ status: 'Paralizado' })}
        />
        <KpiCard
          label="Retrasados"
          value={late}
          sub="Entregas vencidas"
          color={late ? '#E14848' : undefined}
          onClick={() => onNavigateToBase({ alert: 'late' })}
        />
        <KpiCard
          label="Impresión pend."
          value={printPending}
          sub={printPending ? 'Por aprobar' : 'Sin pendientes'}
          color={printPending ? '#F0871F' : undefined}
          onClick={() => onNavigateToBase({ print: 'pending' })}
        />
      </div>

      {tot > 0 && (
        <div className="bg-white rounded-xl border border-[#e0ddd4] p-4">
          <p className="text-[13px] font-mono font-bold tracking-[0.12em] uppercase text-[#888] mb-3">
            Estado del pipeline · {tot} CNP activos
          </p>
          <div className="flex rounded-full overflow-hidden h-2 mb-3">
            {counts
              .filter((c) => c.n > 0)
              .map((c) => (
                <div
                  key={c.e}
                  style={{
                    width: `${(c.n / tot) * 100}%`,
                    background: COL_META[c.e]?.color ?? '#ccc',
                  }}
                  title={`${c.e}: ${c.n}`}
                />
              ))}
          </div>
          <div className="flex flex-wrap gap-3">
            {counts.map((c) => (
              <span key={c.e} className="flex items-center gap-1.5 text-[14px] text-[#555]">
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    background: COL_META[c.e]?.color ?? '#ccc',
                    display: 'inline-block',
                    flexShrink: 0,
                  }}
                />
                <b className="text-[#111]">{c.n}</b> {c.e}
              </span>
            ))}
          </div>
        </div>
      )}

      {inMonth.length === 0 ? (
        <div className="bg-white rounded-xl border border-[#e0ddd4] p-8 text-center">
          <p className="text-[15px] text-[#888]">Sin movimiento en {fmtMonth(monthIdx)}</p>
          <p className="text-[14px] text-[#bbb] mt-1">No hay CNP activos en este mes</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-[#e0ddd4] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-[15px]">
              <thead>
                <tr className="border-b border-[#ece9df] text-left">
                  <th className="px-4 py-3 text-[13px] font-mono font-bold tracking-[0.12em] uppercase text-[#888]">
                    Cliente
                  </th>
                  <th className="px-4 py-3 text-[13px] font-mono font-bold tracking-[0.12em] uppercase text-[#888]">
                    CNP
                  </th>
                  <th className="px-4 py-3 text-[13px] font-mono font-bold tracking-[0.12em] uppercase text-[#888]">
                    Entregados
                  </th>
                  <th className="px-4 py-3 text-[13px] font-mono font-bold tracking-[0.12em] uppercase text-[#888] min-w-[160px]">
                    Cumplimiento
                  </th>
                  <th className="px-4 py-3 text-[13px] font-mono font-bold tracking-[0.12em] uppercase text-[#888]">
                    Semáforo
                  </th>
                </tr>
              </thead>
              <tbody>
                {[...byClient.entries()]
                  .sort((a, b) => b[1].total - a[1].total)
                  .map(([clientId, entry]) => {
                    const client = clientId ? clientsById.get(clientId) : null
                    const name = client?.name ?? 'Sin cliente'
                    const pp = entry.total ? Math.round((entry.closed / entry.total) * 100) : 0
                    const lg = lightOf(pp, entry.total)
                    return (
                      <tr
                        key={clientId ?? 'sin-cliente'}
                        onClick={() => onNavigateToBase({ clientId })}
                        className="border-b border-[#f5f3eb] last:border-0 hover:bg-[#faf9f5] cursor-pointer transition-colors"
                      >
                        <td className="px-4 py-3 font-medium text-[#111]">
                          <div className="flex items-center gap-2 min-w-0">
                            {client?.logo_url ? (
                              <img
                                src={client.logo_url}
                                alt={name}
                                className="w-7 h-7 rounded-full object-cover flex-shrink-0 border border-[#e0ddd4]"
                              />
                            ) : (
                              <span className="w-7 h-7 rounded-full bg-[#f0ede3] flex items-center justify-center flex-shrink-0 text-[12px] font-bold text-[#aaa] uppercase">
                                {name[0]}
                              </span>
                            )}
                            <span className="truncate">{name}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-[#666] font-mono">{entry.total}</td>
                        <td className="px-4 py-3 text-[#666] font-mono">{entry.closed}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-[#111]">{pp}%</span>
                            <div className="flex-1 h-1.5 rounded-full bg-[#f0ede3] overflow-hidden">
                              <div
                                className="h-full rounded-full"
                                style={{ width: `${pp}%`, background: lg.color }}
                              />
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className="inline-flex items-center gap-1.5 text-[14px] font-semibold"
                            style={{ color: lg.color }}
                          >
                            <span
                              style={{
                                width: 7,
                                height: 7,
                                borderRadius: '50%',
                                background: lg.color,
                                display: 'inline-block',
                              }}
                            />
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
