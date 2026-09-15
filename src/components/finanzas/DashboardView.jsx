import { useState, useEffect, useMemo } from 'react'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts'
import KpiCard from '../common/KpiCard'
import { fmtUSD } from '../../utils/metricsFinance'
import { clientInMonth } from '../../utils/clientInMonth'
import {
  totalFacturado,
  totalCobrado,
  totalPorCobrar,
  asignadoPorPartida,
  desviacionEnPuntos,
  metaPartida,
} from '../../utils/finanzas'
import { loadAllInvoices } from './finanzasApi'
import { PARTIDAS, PARTIDA_KEYS } from './constants'
import { MONTHS } from '../metricas/constants'
import CerrarMesButton from './CerrarMesButton'

function trendKeysLastN(year, month, n) {
  const out = []
  let y = year
  let m = month
  for (let i = 0; i < n; i++) {
    out.unshift({ year: y, month: m })
    m--
    if (m < 1) {
      m = 12
      y--
    }
  }
  return out
}

export default function DashboardView({
  companyId,
  year,
  month,
  finMonth,
  invoices,
  distributions,
  clients,
  lines,
  loading,
  refetch,
  canCerrarMes,
}) {
  const [trend, setTrend] = useState(null)

  useEffect(() => {
    let cancelled = false
    async function run() {
      if (!companyId) return
      const { data } = await loadAllInvoices(companyId)
      if (cancelled) return
      const keys = trendKeysLastN(year, month, 6)
      const byKey = new Map()
      for (const { year: y, month: m, invoice } of data ?? []) {
        const k = `${y}-${m}`
        byKey.set(k, (byKey.get(k) ?? 0) + Number(invoice.amount ?? 0))
      }
      setTrend(
        keys.map(({ year: y, month: m }) => ({
          label: `${MONTHS[m - 1].slice(0, 3)} ${String(y).slice(2)}`,
          facturado: byKey.get(`${y}-${m}`) ?? 0,
        })),
      )
    }
    run()
    return () => {
      cancelled = true
    }
  }, [companyId, year, month])

  const activeClients = useMemo(
    () => (clients ?? []).filter((c) => clientInMonth(c, year, month)),
    [clients, year, month],
  )

  const facturado = totalFacturado(invoices)
  const cobrado = totalCobrado(invoices)
  const porCobrar = totalPorCobrar(invoices)
  const gananciaReal = asignadoPorPartida(distributions, 'ganancia')
  const margenPct = cobrado ? gananciaReal / cobrado : 0

  const topClientes = useMemo(() => {
    const grp = new Map()
    for (const i of invoices) grp.set(i.clientName, (grp.get(i.clientName) ?? 0) + i.amount)
    return [...grp.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4)
  }, [invoices])
  const maxTop = topClientes[0]?.[1] || 1

  const cobranzaPorLinea = useMemo(() => {
    const clientsById = new Map(clients.map((c) => [c.id, c]))
    const linesById = new Map(lines.map((l) => [l.id, l]))
    const byLine = new Map()
    for (const inv of invoices) {
      const lineId = clientsById.get(inv.clientId)?.line_id ?? null
      const key = lineId ?? '_sin'
      const label = lineId ? (linesById.get(lineId)?.name ?? 'Sin línea') : 'Sin línea'
      const row = byLine.get(key) ?? { label, facturado: 0, cobrado: 0 }
      row.facturado += inv.amount
      const cobradoInv = (inv.payments ?? []).reduce((a, p) => a + p.amount, 0)
      row.cobrado += cobradoInv
      byLine.set(key, row)
    }
    return [...byLine.values()].filter((r) => r.facturado > 0)
  }, [invoices, clients, lines])

  if (loading || trend == null) {
    return <div className="text-[14px] text-[#999] py-10 text-center">Cargando…</div>
  }

  return (
    <div className="space-y-6">
      {!finMonth && (
        <div className="bg-white border border-[#e0ddd4] rounded-xl p-4 text-[14px] text-[#666] flex items-center justify-between gap-3">
          <span>Este mes todavía no se ha abierto. Genera su facturación desde Facturación.</span>
        </div>
      )}

      {canCerrarMes && finMonth && (
        <div className="flex justify-end">
          <CerrarMesButton
            companyId={companyId}
            finMonth={finMonth}
            year={year}
            month={month}
            clients={clients}
            onDone={refetch}
          />
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <KpiCard label="Facturado" value={fmtUSD(facturado)} sub="del mes en curso" />
        <KpiCard
          label="Cobrado"
          value={fmtUSD(cobrado)}
          sub={`${facturado ? Math.round((cobrado / facturado) * 100) : 0}% de lo facturado`}
          accent="#1F9D57"
        />
        <KpiCard
          label="Por cobrar"
          value={fmtUSD(porCobrar)}
          sub="pendiente del mes"
          accent="#D6453F"
        />
        <KpiCard
          label="Ganancia real"
          value={fmtUSD(gananciaReal)}
          sub={`${(margenPct * 100).toFixed(1)}% · meta 14%`}
          accent={margenPct >= 0.14 ? '#1F9D57' : '#D6453F'}
        />
        <KpiCard label="Clientes activos" value={activeClients.length} sub="retainer mensual" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="bg-white border border-[#e0ddd4] rounded-xl p-4">
          <p className="text-[13px] font-mono font-bold uppercase tracking-wide text-[#888] mb-3">
            Facturación mensual
          </p>
          <div style={{ width: '100%', height: 200 }}>
            <ResponsiveContainer>
              <LineChart data={trend}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0ede3" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} width={44} />
                <Tooltip formatter={(v) => fmtUSD(v)} />
                <Line type="monotone" dataKey="facturado" stroke="#FFB800" strokeWidth={2} dot />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white border border-[#e0ddd4] rounded-xl p-4">
          <p className="text-[13px] font-mono font-bold uppercase tracking-wide text-[#888] mb-3">
            Distribución · meta vs real
          </p>
          <div className="space-y-3">
            {PARTIDA_KEYS.map((p) => {
              const real = asignadoPorPartida(distributions, p)
              const { puntos, neutral, favorable } = desviacionEnPuntos(distributions, p)
              return (
                <div key={p}>
                  <div className="flex items-center justify-between text-[13px] mb-1">
                    <span className="flex items-center gap-1.5 font-medium text-[#333]">
                      <span className={`w-2 h-2 rounded-full ${PARTIDAS[p].dot}`} />
                      {PARTIDAS[p].name}
                    </span>
                    <span className="text-[#888]">
                      {fmtUSD(real)} / meta {fmtUSD(metaPartida(cobrado, p))}
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-[#f0ede3] overflow-hidden">
                    <div
                      className={PARTIDAS[p].dot}
                      style={{
                        width: `${Math.min(100, (real / (cobrado || 1)) * 100)}%`,
                        height: '100%',
                      }}
                    />
                  </div>
                  <span
                    className={`text-[11px] font-semibold ${
                      neutral ? 'text-[#999]' : favorable ? 'text-[#1F9D57]' : 'text-[#D6453F]'
                    }`}
                  >
                    {neutral ? '•' : puntos > 0 ? '▲' : '▼'} {puntos >= 0 ? '+' : ''}
                    {puntos.toFixed(1)} pts
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="bg-white border border-[#e0ddd4] rounded-xl p-4">
          <p className="text-[13px] font-mono font-bold uppercase tracking-wide text-[#888] mb-3">
            Top por facturación
          </p>
          {topClientes.length === 0 ? (
            <p className="text-[13px] text-[#999]">Sin facturación este mes.</p>
          ) : (
            <div className="space-y-2">
              {topClientes.map(([name, amount]) => (
                <div key={name} className="flex items-center gap-3 text-[13px]">
                  <span className="w-28 truncate text-[#333]">{name}</span>
                  <div className="flex-1 h-1.5 rounded-full bg-[#f0ede3] overflow-hidden">
                    <div
                      className="h-full bg-[#FFB800]"
                      style={{ width: `${(amount / maxTop) * 100}%` }}
                    />
                  </div>
                  <span className="font-mono text-[#555] w-16 text-right">{fmtUSD(amount)}</span>
                  <span className="text-[#999] w-12 text-right">
                    {facturado ? ((amount / facturado) * 100).toFixed(1) : '0.0'}%
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-white border border-[#e0ddd4] rounded-xl p-4">
          <p className="text-[13px] font-mono font-bold uppercase tracking-wide text-[#888] mb-3">
            Cobranza por línea
          </p>
          {cobranzaPorLinea.length === 0 ? (
            <p className="text-[13px] text-[#999]">Sin facturación este mes.</p>
          ) : (
            <div className="space-y-2">
              {cobranzaPorLinea.map((row) => {
                const pct = row.facturado ? Math.round((row.cobrado / row.facturado) * 100) : 0
                return (
                  <div key={row.label} className="text-[13px]">
                    <div className="flex justify-between mb-1">
                      <span className="text-[#333]">{row.label}</span>
                      <span className="text-[#888]">{pct}%</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-[#f0ede3] overflow-hidden">
                      <div
                        className={pct >= 90 ? 'h-full bg-[#1F9D57]' : 'h-full bg-[#FFB800]'}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
