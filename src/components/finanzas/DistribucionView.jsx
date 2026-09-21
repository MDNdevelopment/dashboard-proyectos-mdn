import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { fmtUSD } from '../../utils/metricsFinance'
import { fmtDate } from '../../utils/formatDate'
import {
  cobradoDe,
  distribuidoDe,
  totalCobrado,
  asignadoPorPartida,
  pagadoPorPartida,
  saldoPartida,
  pctsDelMes,
} from '../../utils/finanzas'
import { loadDistributionsBefore, updateMonthPcts } from './finanzasApi'
import { PARTIDAS, PARTIDA_KEYS } from './constants'
import DistribucionModal from './DistribucionModal'
import PagoPartidaModal from './PagoPartidaModal'
import CerrarMesButton from './CerrarMesButton'
import PartidasPctEditor from './PartidasPctEditor'

export default function DistribucionView({
  companyId,
  year,
  month,
  finMonth,
  invoices,
  distributions,
  clients,
  loading,
  refetch,
  canManage,
  canCerrarMes,
  canManagePartidas,
}) {
  const navigate = useNavigate()
  const [distModal, setDistModal] = useState(undefined) // undefined=cerrado
  const [pagoPartida, setPagoPartida] = useState(null)
  const [before, setBefore] = useState([])

  useEffect(() => {
    let cancelled = false
    async function run() {
      if (!companyId) return
      const { data } = await loadDistributionsBefore(companyId, year, month)
      if (!cancelled) setBefore(data ?? [])
    }
    run()
    return () => {
      cancelled = true
    }
  }, [companyId, year, month])

  const closed = !!finMonth?.closed
  const pcts = pctsDelMes(finMonth)
  const cobrado = totalCobrado(invoices)
  const distribuidoTotal = PARTIDA_KEYS.reduce(
    (a, p) => a + asignadoPorPartida(distributions, p),
    0,
  )
  const sinDistribuir = Math.max(cobrado - distribuidoTotal, 0)

  const cobrosPorDistribuir = useMemo(
    () =>
      invoices.filter((inv) => {
        const cob = cobradoDe(inv)
        return cob > 0.5 && cob - distribuidoDe(inv, distributions) > 0.5
      }),
    [invoices, distributions],
  )

  const movimientosRecientes = useMemo(
    () => [...distributions].sort((a, b) => new Date(b.movedOn) - new Date(a.movedOn)).slice(0, 6),
    [distributions],
  )

  if (loading) return <div className="text-[14px] text-[#999] py-10 text-center">Cargando…</div>

  if (!finMonth) {
    return (
      <div className="bg-white border border-[#e0ddd4] rounded-xl p-10 text-center text-[13.5px] text-[#999]">
        Este mes aún no se ha abierto.
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {closed && (
        <div className="bg-white border border-[#e0ddd4] rounded-xl p-3 text-[13.5px] text-[#888]">
          Este mes está cerrado — solo lectura.
        </div>
      )}

      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="grid grid-cols-3 gap-3 max-w-xl flex-1">
          <div className="bg-white border border-[#e0ddd4] rounded-xl p-3">
            <p className="text-[11px] uppercase text-[#999]">Base a distribuir</p>
            <p className="font-bold text-[#111] text-[16px]">{fmtUSD(cobrado)}</p>
          </div>
          <div className="bg-white border border-[#e0ddd4] rounded-xl p-3">
            <p className="text-[11px] uppercase text-[#999]">Distribuido</p>
            <p className="font-bold text-[#111] text-[16px]">{fmtUSD(distribuidoTotal)}</p>
          </div>
          <div className="bg-white border border-[#e0ddd4] rounded-xl p-3">
            <p className="text-[11px] uppercase text-[#999]">Sin distribuir</p>
            <p
              className="font-bold text-[16px]"
              style={{ color: sinDistribuir > 0.5 ? '#D6453F' : '#111' }}
            >
              {fmtUSD(sinDistribuir)}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <PartidasPctEditor
            finMonth={finMonth}
            pcts={pcts}
            canManage={canManagePartidas}
            closed={closed}
            onSaved={refetch}
          />
          {canCerrarMes && (
            <CerrarMesButton
              companyId={companyId}
              finMonth={finMonth}
              year={year}
              month={month}
              clients={clients}
              onDone={refetch}
            />
          )}
          {canManage && !closed && (
            <button
              type="button"
              onClick={() => setDistModal(null)}
              className="px-3 py-2 rounded-xl text-[13.5px] font-semibold bg-[#111] text-white hover:bg-[#333]"
            >
              + Registrar distribución
            </button>
          )}
        </div>
      </div>

      {!closed && (
        <div>
          <p className="text-[13px] font-mono font-bold uppercase tracking-wide text-[#888] mb-2">
            Cobros por distribuir
          </p>
          {cobrosPorDistribuir.length === 0 ? (
            <div className="bg-white border border-[#e0ddd4] rounded-xl p-4 text-[13.5px] text-[#888]">
              {invoices.some((i) => cobradoDe(i) > 0.5)
                ? 'Todo distribuido.'
                : 'Aún no hay cobros este mes.'}
            </div>
          ) : (
            <div className="bg-white border border-[#e0ddd4] rounded-xl overflow-x-auto">
              <table className="w-full text-[13.5px]">
                <thead>
                  <tr className="border-b border-[#f0ede3] text-[11px] uppercase tracking-wide text-[#999]">
                    <th className="text-left px-4 py-2">Cliente / concepto</th>
                    <th className="text-right px-4 py-2">Cobrado</th>
                    <th className="text-center px-4 py-2">Moneda</th>
                    <th className="text-center px-4 py-2">Acción</th>
                  </tr>
                </thead>
                <tbody>
                  {cobrosPorDistribuir.map((inv) => (
                    <tr key={inv.id} className="border-b border-[#f5f3eb] last:border-0">
                      <td className="px-4 py-2.5">
                        <div className="font-medium text-[#111]">{inv.clientName}</div>
                        <div className="text-[12px] text-[#999]">{inv.concept}</div>
                      </td>
                      <td className="text-right px-4 py-2.5 font-mono">{fmtUSD(cobradoDe(inv))}</td>
                      <td className="text-center px-4 py-2.5 text-[#999]">{inv.currency}</td>
                      <td className="text-center px-4 py-2.5">
                        {canManage && (
                          <button
                            type="button"
                            onClick={() => setDistModal(inv)}
                            className="text-[12.5px] font-semibold text-[#111] hover:underline"
                          >
                            Distribuir
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      <div>
        <p className="text-[13px] font-mono font-bold uppercase tracking-wide text-[#888] mb-2">
          Acumulado por partida
        </p>
        <div className="bg-white border border-[#e0ddd4] rounded-xl overflow-x-auto">
          <table className="w-full text-[13.5px]">
            <thead>
              <tr className="border-b border-[#f0ede3] text-[11px] uppercase tracking-wide text-[#999]">
                <th className="text-left px-4 py-2">Partida</th>
                <th className="text-right px-4 py-2">Asignado</th>
                <th className="text-right px-4 py-2">Pagado</th>
                <th className="text-right px-4 py-2">Disponible</th>
                <th className="text-center px-4 py-2">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {PARTIDA_KEYS.map((p) => {
                const asg = asignadoPorPartida(distributions, p)
                const pag = pagadoPorPartida(distributions, p)
                const disp = saldoPartida(before, distributions, p)
                return (
                  <tr key={p} className="border-b border-[#f5f3eb] last:border-0">
                    <td className="px-4 py-2.5">
                      <span
                        className={`inline-flex items-center gap-1.5 font-medium ${PARTIDAS[p].text}`}
                      >
                        <span className={`w-2 h-2 rounded-full ${PARTIDAS[p].dot}`} />
                        {PARTIDAS[p].name} · {Math.round(pcts[p] * 100)}%
                      </span>
                    </td>
                    <td className="text-right px-4 py-2.5 font-mono">{fmtUSD(asg)}</td>
                    <td className="text-right px-4 py-2.5 font-mono">{fmtUSD(pag)}</td>
                    <td
                      className="text-right px-4 py-2.5 font-mono"
                      style={{ color: disp < 0 ? '#D6453F' : undefined }}
                    >
                      {fmtUSD(disp)}
                    </td>
                    <td className="text-center px-4 py-2.5 whitespace-nowrap">
                      {canManage && !closed && (
                        <button
                          type="button"
                          onClick={() => setPagoPartida(p)}
                          className="text-[12.5px] font-semibold text-[#111] hover:underline mr-3"
                        >
                          Pagar
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() =>
                          navigate(
                            `/finanzas/distribucion/${p}?mes=${year}-${String(month).padStart(2, '0')}`,
                          )
                        }
                        className="text-[12.5px] text-[#666] hover:text-[#111] hover:underline"
                      >
                        Ver ›
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <p className="text-[13px] font-mono font-bold uppercase tracking-wide text-[#888] mb-2">
          Movimientos recientes
        </p>
        {movimientosRecientes.length === 0 ? (
          <div className="bg-white border border-[#e0ddd4] rounded-xl p-4 text-[13.5px] text-[#888]">
            Sin movimientos este mes.
          </div>
        ) : (
          <div className="bg-white border border-[#e0ddd4] rounded-xl overflow-x-auto">
            <table className="w-full text-[13.5px]">
              <thead>
                <tr className="border-b border-[#f0ede3] text-[11px] uppercase tracking-wide text-[#999]">
                  <th className="text-left px-4 py-2">Fecha</th>
                  <th className="text-left px-4 py-2">Partida</th>
                  <th className="text-left px-4 py-2">Concepto</th>
                  <th className="text-right px-4 py-2">Monto</th>
                </tr>
              </thead>
              <tbody>
                {movimientosRecientes.map((d) => (
                  <tr key={d.id} className="border-b border-[#f5f3eb] last:border-0">
                    <td className="px-4 py-2.5 text-[#888]">{fmtDate(d.movedOn)}</td>
                    <td className="px-4 py-2.5">
                      <span
                        className={`inline-flex items-center gap-1.5 ${PARTIDAS[d.partida].text}`}
                      >
                        <span className={`w-2 h-2 rounded-full ${PARTIDAS[d.partida].dot}`} />
                        {PARTIDAS[d.partida].name}
                      </span>
                    </td>
                    <td className="px-4 py-2.5">{d.concept}</td>
                    <td className="text-right px-4 py-2.5 font-mono">
                      {d.kind === 'out' ? '− ' : ''}
                      {fmtUSD(d.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {distModal !== undefined && (
        <DistribucionModal
          monthId={finMonth.id}
          invoice={distModal}
          invoices={invoices}
          distributions={distributions}
          finMonth={finMonth}
          onClose={() => setDistModal(undefined)}
          onSaved={() => {
            setDistModal(undefined)
            refetch()
          }}
        />
      )}

      {pagoPartida && (
        <PagoPartidaModal
          monthId={finMonth.id}
          partida={pagoPartida}
          saldoDisponible={saldoPartida(before, distributions, pagoPartida)}
          onClose={() => setPagoPartida(null)}
          onSaved={() => {
            setPagoPartida(null)
            refetch()
          }}
        />
      )}
    </div>
  )
}
