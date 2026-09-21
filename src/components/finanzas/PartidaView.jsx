import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { fmtUSD } from '../../utils/metricsFinance'
import { fmtDate } from '../../utils/formatDate'
import {
  asignadoPorPartida,
  pagadoPorPartida,
  saldoArrastrado,
  saldoPartida,
  pctsDelMes,
} from '../../utils/finanzas'
import { loadDistributionsBefore, deleteDistribution } from './finanzasApi'
import { PARTIDAS } from './constants'
import PagoPartidaModal from './PagoPartidaModal'
import ConfirmDeleteDialog from '../common/ConfirmDeleteDialog'

/** Libro mayor de una partida (drill-down desde Distribución), con saldo corriente. */
export default function PartidaView({
  companyId,
  year,
  month,
  monthStr,
  finMonth,
  distributions,
  partida,
  canManage,
  refetch,
}) {
  const navigate = useNavigate()
  const [before, setBefore] = useState([])
  const [pagoOpen, setPagoOpen] = useState(false)
  const [toDelete, setToDelete] = useState(null)

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

  const P = PARTIDAS[partida]
  const pcts = pctsDelMes(finMonth)
  const closed = !!finMonth?.closed
  const asignado = asignadoPorPartida(distributions, partida)
  const pagado = pagadoPorPartida(distributions, partida)
  const prevSaldo = saldoArrastrado(before, partida)
  const saldoDisponible = saldoPartida(before, distributions, partida)

  const movimientos = useMemo(
    () =>
      [...distributions]
        .filter((d) => d.partida === partida)
        .sort((a, b) => new Date(a.movedOn) - new Date(b.movedOn)),
    [distributions, partida],
  )

  let running = prevSaldo
  const rows = movimientos.map((d) => {
    running += d.kind === 'out' ? -d.amount : d.amount
    return { ...d, running }
  })

  if (!P) return null

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <p className="text-[13.5px] text-[#888]">
            Partida {Math.round(pcts[partida] * 100)}% · el saldo se arrastra mes a mes
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => navigate(`/finanzas/distribucion?mes=${monthStr}`)}
            className="px-3 py-2 rounded-xl text-[13.5px] font-semibold text-[#666] border border-[#e0ddd4] hover:bg-[#f5f3eb]"
          >
            ‹ Distribución
          </button>
          {canManage && !closed && (
            <button
              type="button"
              onClick={() => setPagoOpen(true)}
              className="px-3 py-2 rounded-xl text-[13.5px] font-semibold bg-[#111] text-white hover:bg-[#333]"
            >
              + Registrar pago
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3 max-w-xl">
        <div className="bg-white border border-[#e0ddd4] rounded-xl p-3">
          <p className="text-[11px] uppercase text-[#999]">Asignado este mes</p>
          <p className="font-bold text-[#111] text-[16px]">{fmtUSD(asignado)}</p>
        </div>
        <div className="bg-white border border-[#e0ddd4] rounded-xl p-3">
          <p className="text-[11px] uppercase text-[#999]">Pagado este mes</p>
          <p className="font-bold text-[#111] text-[16px]">{fmtUSD(pagado)}</p>
        </div>
        <div className="bg-white border border-[#e0ddd4] rounded-xl p-3">
          <p className="text-[11px] uppercase text-[#999]">Saldo disponible</p>
          <p
            className="font-bold text-[16px]"
            style={{ color: saldoDisponible < 0 ? '#D6453F' : '#111' }}
          >
            {fmtUSD(saldoDisponible)}
          </p>
        </div>
      </div>

      <div className="bg-white border border-[#e0ddd4] rounded-xl overflow-x-auto">
        <table className="w-full text-[13.5px]">
          <thead>
            <tr className="border-b border-[#f0ede3] text-[11px] uppercase tracking-wide text-[#999]">
              <th className="text-left px-4 py-2">Fecha</th>
              <th className="text-left px-4 py-2">Concepto</th>
              <th className="text-left px-4 py-2">Tipo</th>
              <th className="text-right px-4 py-2">Monto</th>
              <th className="text-right px-4 py-2">Saldo</th>
              <th className="text-center px-4 py-2">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {prevSaldo !== 0 && (
              <tr className="bg-[#faf9f5]">
                <td className="px-4 py-2.5 text-[#999]">—</td>
                <td className="px-4 py-2.5 text-[#999]">Saldo arrastrado de meses anteriores</td>
                <td className="px-4 py-2.5" />
                <td className="text-right px-4 py-2.5 text-[#999]">—</td>
                <td className="text-right px-4 py-2.5 font-mono font-bold">{fmtUSD(prevSaldo)}</td>
                <td className="px-4 py-2.5" />
              </tr>
            )}
            {rows.map((d) => (
              <tr key={d.id} className="border-b border-[#f5f3eb] last:border-0">
                <td className="px-4 py-2.5 text-[#888]">{fmtDate(d.movedOn)}</td>
                <td className="px-4 py-2.5">
                  {d.concept}
                  {d.beneficiary && <div className="text-[12px] text-[#999]">{d.beneficiary}</div>}
                </td>
                <td className="px-4 py-2.5">
                  <span
                    className={`inline-block px-2 py-0.5 rounded-full text-[11.5px] font-semibold ${
                      d.kind === 'out'
                        ? 'bg-[#fbe9e8] text-[#c0392b]'
                        : 'bg-[#e6f4ec] text-[#1f9d57]'
                    }`}
                  >
                    {d.kind === 'out' ? 'Pago' : 'Asignación'}
                  </span>
                </td>
                <td className="text-right px-4 py-2.5 font-mono">
                  {d.kind === 'out' ? '− ' : ''}
                  {fmtUSD(d.amount)}
                </td>
                <td className="text-right px-4 py-2.5 font-mono">{fmtUSD(d.running)}</td>
                <td className="text-center px-4 py-2.5">
                  {canManage && !closed && (
                    <button
                      type="button"
                      onClick={() => setToDelete(d)}
                      className="text-[12.5px] text-[#D6453F] hover:underline"
                    >
                      {d.invoiceId ? 'Quitar' : 'Eliminar'}
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {rows.length === 0 && prevSaldo === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-[#999]">
                  Sin movimientos este mes.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {pagoOpen && (
        <PagoPartidaModal
          monthId={finMonth.id}
          partida={partida}
          saldoDisponible={saldoDisponible}
          onClose={() => setPagoOpen(false)}
          onSaved={() => {
            setPagoOpen(false)
            refetch()
          }}
        />
      )}

      {toDelete && (
        <ConfirmDeleteDialog
          itemLabel="movimiento"
          itemName={toDelete.concept}
          onCancel={() => setToDelete(null)}
          onConfirm={async () => {
            await deleteDistribution(toDelete.id)
            setToDelete(null)
            refetch()
          }}
        />
      )}
    </div>
  )
}
