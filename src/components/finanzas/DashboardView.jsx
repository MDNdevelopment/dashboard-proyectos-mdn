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
  pctsEnterosPorPartida,
  metaPartida,
  pctsDelMes,
  cobradoPorMoneda,
  movimientoCartera,
} from '../../utils/finanzas'
import { loadAllInvoices, loadAllMonthTotals } from './finanzasApi'
import { PARTIDAS, PARTIDA_KEYS, NOTA_TRASPASO_PARTIDA } from './constants'
import { MONTHS } from '../metricas/constants'
import CerrarMesButton from './CerrarMesButton'
import ResumenMesModal from './ResumenMesModal'

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
  monthTotals,
  clients,
  lines,
  loading,
  refetch,
  canCerrarMes,
}) {
  const [trend, setTrend] = useState(null)
  const [resumenOpen, setResumenOpen] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function run() {
      if (!companyId) return
      const [{ data: invData }, { data: totalsData }] = await Promise.all([
        loadAllInvoices(companyId),
        loadAllMonthTotals(companyId),
      ])
      if (cancelled) return
      const keys = trendKeysLastN(year, month, 6)
      const byKey = new Map()
      for (const { year: y, month: m, invoice } of invData ?? []) {
        const k = `${y}-${m}`
        byKey.set(k, (byKey.get(k) ?? 0) + Number(invoice.amount ?? 0))
      }
      // Meses "resumen" (sin facturas fila por fila) aportan su total facturado
      // directo — no hay filas en fin_invoices para ellos.
      for (const { year: y, month: m, totals } of totalsData ?? []) {
        byKey.set(`${y}-${m}`, totals.totalFacturado)
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

  const isSummary = !!finMonth?.summaryOnly
  const pcts = pctsDelMes(finMonth)
  const facturado = isSummary ? (monthTotals?.totalFacturado ?? 0) : totalFacturado(invoices)
  const cobrado = isSummary ? (monthTotals?.totalCobrado ?? 0) : totalCobrado(invoices)
  const porCobrar = isSummary ? 0 : totalPorCobrar(invoices)
  const { bs: cobradoBs, divisa: cobradoDivisa } = cobradoPorMoneda(invoices)
  // Los movimientos de "traspaso entre partidas" (PagoPartidaModal, cuando un pago
  // excede el disponible) mueven plata ya cobrada de una partida a otra — no son
  // dinero nuevo. Contarlos aquí infla el total por encima del 100% del cobrado
  // (ver pctsEnterosPorPartida más abajo), así que se excluyen de todo lo que se
  // compara contra "lo cobrado del mes" en este Dashboard. El ledger real —
  // incluido el traspaso — sigue completo en Distribución → Acumulado por partida.
  const distributionsParaMeta = useMemo(
    () => distributions.filter((d) => d.note !== NOTA_TRASPASO_PARTIDA),
    [distributions],
  )
  const gananciaReal = isSummary
    ? (monthTotals?.totalGanancia ?? 0)
    : asignadoPorPartida(distributionsParaMeta, 'ganancia')
  const margenPct = cobrado ? gananciaReal / cobrado : 0
  const realesPorPartida = useMemo(
    () =>
      Object.fromEntries(
        PARTIDA_KEYS.map((p) => [
          p,
          isSummary
            ? (monthTotals?.[`total${p[0].toUpperCase()}${p.slice(1)}`] ?? 0)
            : asignadoPorPartida(distributionsParaMeta, p),
        ]),
      ),
    [isSummary, monthTotals, distributionsParaMeta],
  )
  // Método del resto mayor: redondear cada partida por separado (Math.round) podía
  // dar una suma como 101% en vez de 100% — ver pctsEnterosPorPartida().
  const pctsPorPartida = useMemo(
    () => pctsEnterosPorPartida(realesPorPartida, cobrado),
    [realesPorPartida, cobrado],
  )
  const cartera = useMemo(() => movimientoCartera(clients, year, month), [clients, year, month])
  const carteraEntraronFee = cartera.entraron.reduce((a, c) => a + Number(c.monthly_fee ?? 0), 0)
  const carteraSalieronFee = cartera.salieron.reduce((a, c) => a + Number(c.monthly_fee ?? 0), 0)

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
        <div className="bg-white border border-[#e0ddd4] rounded-xl p-4 text-[14px] text-[#666] flex items-center justify-between gap-3 flex-wrap">
          <span>Este mes todavía no se ha abierto. Genera su facturación desde Facturación.</span>
          {canCerrarMes && (
            <button
              type="button"
              onClick={() => setResumenOpen(true)}
              className="px-3 py-1.5 rounded-lg text-[13px] font-semibold text-[#666] border border-[#e0ddd4] hover:bg-[#f5f3eb] transition-colors whitespace-nowrap"
            >
              Cargar como resumen (sin desglose)
            </button>
          )}
        </div>
      )}

      {isSummary && (
        <div className="bg-white border border-[#e0ddd4] rounded-xl p-4 text-[13.5px] text-[#666]">
          Mes cargado como resumen{monthTotals?.note ? ` — ${monthTotals.note}` : ''}: solo totales,
          sin factura ni cobro por cliente.
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
          sub={`Bs ${fmtUSD(cobradoBs)} · Divisa ${fmtUSD(cobradoDivisa)} · ${facturado ? Math.round((cobrado / facturado) * 100) : 0}%`}
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
          sub={`${(margenPct * 100).toFixed(1)}% · meta ${Math.round(pcts.ganancia * 100)}%`}
          accent={margenPct >= pcts.ganancia ? '#1F9D57' : '#D6453F'}
        />
        <KpiCard label="Clientes activos" value={activeClients.length} sub="retainer mensual" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="bg-white border border-[#e0ddd4] rounded-xl p-4">
          <p className="text-[13px] font-mono font-bold uppercase tracking-wide text-[#888] mb-3">
            Movimiento de cartera
          </p>
          {cartera.entraron.length === 0 && cartera.salieron.length === 0 ? (
            <p className="text-[13px] text-[#999]">Sin movimiento este mes.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-[13.5px]">
              <div>
                <p className="font-semibold text-[#1F9D57] mb-1">
                  +{cartera.entraron.length} clientes ({fmtUSD(carteraEntraronFee)}/mes)
                </p>
                {cartera.entraron.map((c) => (
                  <p key={c.id} className="text-[#666]">
                    {c.name}
                  </p>
                ))}
              </div>
              <div>
                <p className="font-semibold text-[#D6453F] mb-1">
                  −{cartera.salieron.length} clientes ({fmtUSD(carteraSalieronFee)}/mes)
                </p>
                {cartera.salieron.map((c) => (
                  <p key={c.id} className="text-[#666]">
                    {c.name}
                  </p>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="bg-white border border-[#e0ddd4] rounded-xl p-4">
          <p className="text-[13px] font-mono font-bold uppercase tracking-wide text-[#888] mb-3">
            Cobranza por línea
          </p>
          {isSummary ? (
            <p className="text-[13px] text-[#999]">Mes cargado como resumen, sin desglose.</p>
          ) : cobranzaPorLinea.length === 0 ? (
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
          <div className="space-y-4">
            {PARTIDA_KEYS.map((p) => {
              const real = realesPorPartida[p]
              const { puntos, neutral, favorable } = isSummary
                ? { puntos: 0, neutral: true, favorable: null }
                : desviacionEnPuntos(distributionsParaMeta, p, pcts)
              const pctDelCobrado = pctsPorPartida[p]
              // La barra va de 0 a 100% de lo cobrado. `metaPct` marca dónde cae la
              // meta de esta partida; lo que llena hasta ahí es sólido, y si `real`
              // se pasa de la meta, el excedente se pinta distinto (outline +
              // rayado) para que se note de un vistazo que ya superó su objetivo.
              const pctReal = Math.min(100, (real / (cobrado || 1)) * 100)
              const metaPct = Math.min(100, (pcts[p] || 0) * 100)
              return (
                <div key={p}>
                  <div className="flex items-center justify-between text-[13px] mb-1.5">
                    <span className="flex items-center gap-1.5 font-medium text-[#333]">
                      <span className={`w-2 h-2 rounded-full ${PARTIDAS[p].dot}`} />
                      {PARTIDAS[p].name} · {pctDelCobrado}%
                    </span>
                    <span className="text-[#888]">
                      {fmtUSD(real)} / meta {fmtUSD(metaPartida(cobrado, p, pcts))}
                    </span>
                  </div>
                  {/* py-1.5 le da aire arriba/abajo para que la línea de meta pueda
                      sobresalir de la barra (más visible) sin que el overflow del
                      track la corte. */}
                  <div className="relative py-1.5">
                    <div className="relative h-3.5 rounded-full bg-[#eeebe0] shadow-[inset_0_1px_2px_rgba(0,0,0,0.06)] overflow-hidden">
                      <div
                        className={PARTIDAS[p].dot}
                        style={{
                          position: 'absolute',
                          left: 0,
                          top: 0,
                          bottom: 0,
                          width: `${Math.min(pctReal, metaPct)}%`,
                        }}
                      />
                      {pctReal > metaPct && (
                        <div
                          data-testid={`excedente-${p}`}
                          style={{
                            position: 'absolute',
                            top: 0,
                            bottom: 0,
                            left: `${metaPct}%`,
                            width: `${pctReal - metaPct}%`,
                            boxSizing: 'border-box',
                            border: `2px solid ${PARTIDAS[p].hex}`,
                            backgroundImage: `repeating-linear-gradient(45deg, transparent, transparent 3px, ${PARTIDAS[p].hex}80 3px, ${PARTIDAS[p].hex}80 6px)`,
                          }}
                        />
                      )}
                    </div>
                    {metaPct > 0 && (
                      // Vive fuera del track (que tiene overflow-hidden) para poder
                      // sobresalir arriba/abajo de la barra — el padding vertical del
                      // wrapper (py-1.5) es justo ese margen de sobresalida.
                      <div
                        data-testid={`meta-linea-${p}`}
                        className="absolute top-0 bottom-0 w-[3px] rounded-full bg-[#111]"
                        style={{ left: `calc(${metaPct}% - 1.5px)` }}
                      />
                    )}
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

      {resumenOpen && (
        <ResumenMesModal
          companyId={companyId}
          year={year}
          month={month}
          onClose={() => setResumenOpen(false)}
          onSaved={() => {
            setResumenOpen(false)
            refetch()
          }}
        />
      )}
    </div>
  )
}
