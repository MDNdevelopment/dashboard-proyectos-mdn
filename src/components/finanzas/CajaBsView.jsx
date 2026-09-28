import { useMemo, useState } from 'react'
import { fmtUSD } from '../../utils/metricsFinance'
import { fmtDate } from '../../utils/formatDate'
import { ledgerConSaldo, cuadreDivisas } from '../../utils/finanzas'
import { BS_LEDGER_SOURCES } from './constants'
import FxOperacionModal from './FxOperacionModal'
import AjusteCajaBsModal from './AjusteCajaBsModal'

/** Bolívares no llevan símbolo de dólar — mismo formato que fmtUSD pero sin '$'. */
function fmtBs(n) {
  return Number(n ?? 0).toLocaleString('es-VE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

/**
 * Caja Bs (§8.4 de la spec): libro único que se llena SOLO — cada fila la genera
 * un trigger a partir de un cobro en Bs, una compra/venta de divisas o un pago
 * directo en Bs. La única acción manual es el ajuste de cuadre. El libro se
 * filtra por mes para consultar (`year`/`month`), pero el saldo mostrado en cada
 * fila y en las cards de arriba es ACUMULADO — la Caja Bs nunca se cierra por mes.
 */
export default function CajaBsView({
  year,
  month,
  finMonth,
  invoices,
  distributions,
  fxOperations,
  bsLedger,
  rateBcv,
  companyId,
  canManage,
  loading,
  refetch,
}) {
  const [fxOpen, setFxOpen] = useState(null) // null=cerrado, 'compra'|'venta'
  const [ajusteOpen, setAjusteOpen] = useState(false)

  const closed = !!finMonth?.closed
  const monthKey = `${year}-${String(month).padStart(2, '0')}`

  // Saldo acumulado por fila sobre TODO el histórico (bsLedger ya llega acumulado
  // hasta este mes desde FinanzasPage), pero la tabla solo MUESTRA las filas del
  // mes activo — el saldo que arrastran sí es el real, no se recalcula desde 0.
  const ledgerConSaldoCompleto = useMemo(() => ledgerConSaldo(bsLedger), [bsLedger])
  const filasDelMes = useMemo(
    () => ledgerConSaldoCompleto.filter((l) => (l.movedOn ?? '').slice(0, 7) === monthKey),
    [ledgerConSaldoCompleto, monthKey],
  )

  const cuadre = useMemo(
    () =>
      cuadreDivisas({
        invoices,
        distributions,
        fxOperations,
        ledger: bsLedger,
        rateBcv: rateBcv?.rate,
      }),
    [invoices, distributions, fxOperations, bsLedger, rateBcv],
  )

  if (loading) return <div className="text-[14px] text-[#999] py-10 text-center">Cargando…</div>

  return (
    <div className="space-y-5">
      {closed && (
        <div className="bg-white border border-[#e0ddd4] rounded-xl p-3 text-[13.5px] text-[#888]">
          Este mes está cerrado — solo lectura.
        </div>
      )}

      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="grid grid-cols-3 gap-3 max-w-2xl flex-1">
          <div className="bg-white border border-[#e0ddd4] rounded-xl p-3">
            <p className="text-[11px] uppercase text-[#999]">Divisa física</p>
            <p className="font-bold text-[#111] text-[16px]">{fmtUSD(cuadre.divisaFisica)}</p>
          </div>
          <div className="bg-white border border-[#e0ddd4] rounded-xl p-3">
            <p className="text-[11px] uppercase text-[#999]">Caja Bs</p>
            <p className="font-bold text-[#111] text-[16px]">{fmtBs(cuadre.saldoBs)} Bs</p>
            <p className="text-[11px] text-[#999]">
              {cuadre.bcvFaltante
                ? 'Sin tasa BCV cargada'
                : `≈ ${fmtUSD(cuadre.saldoBsUsdRef)} a BCV ${fmtBs(rateBcv?.rate)}`}
              {rateBcv?.source === 'stale' && ` (tasa del ${fmtDate(rateBcv.rateDate)})`}
            </p>
          </div>
          <div className="bg-white border border-[#e0ddd4] rounded-xl p-3">
            <p className="text-[11px] uppercase text-[#999]">Resultado por cambio</p>
            <p
              className="font-bold text-[16px]"
              style={{ color: cuadre.cambio < 0 ? '#D6453F' : '#111' }}
            >
              {fmtUSD(cuadre.cambio)}
            </p>
            <p className="text-[11px] text-[#999]">del acumulado</p>
          </div>
        </div>
        {canManage && !closed && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setFxOpen('venta')}
              className="px-3 py-2 rounded-xl text-[13.5px] font-semibold text-[#666] border border-[#e0ddd4] hover:bg-[#f5f3eb]"
            >
              Vender dólares
            </button>
            <button
              type="button"
              onClick={() => setFxOpen('compra')}
              className="px-3 py-2 rounded-xl text-[13.5px] font-semibold bg-[#111] text-white hover:bg-[#333]"
            >
              Comprar dólares
            </button>
          </div>
        )}
      </div>

      {/* La identidad de cuadre (§7, corregida — ver ARQUITECTURA.md) es exacta
          solo si todos los Bs se valoran a la misma BCV. Un residuo pequeño es
          normal si la tasa cambió entre movimientos (revaluación del saldo en
          Bs parado) — no se pinta como un error a corregir con un ajuste falso. */}
      {!cuadre.bcvFaltante && Math.abs(cuadre.diferencia ?? 0) > 1 && (
        <div className="bg-[#fff8ea] border border-[#f0d9a0] rounded-xl p-3 text-[13px] text-[#9a6800]">
          Diferencia de cuadre: {fmtUSD(cuadre.diferencia)} — revisa si es una revaluación de Caja
          Bs (la BCV cambió entre movimientos) o si falta registrar algo.
        </div>
      )}

      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="text-[13px] font-mono font-bold uppercase tracking-wide text-[#888]">
            Caja Bs — libro
          </p>
          {canManage && !closed && (
            <button
              type="button"
              onClick={() => setAjusteOpen(true)}
              className="text-[12.5px] text-[#666] hover:text-[#111] hover:underline"
            >
              Ajuste de cuadre
            </button>
          )}
        </div>
        {filasDelMes.length === 0 ? (
          <div className="bg-white border border-[#e0ddd4] rounded-xl p-4 text-[13.5px] text-[#888]">
            Sin movimientos este mes.
          </div>
        ) : (
          <div className="bg-white border border-[#e0ddd4] rounded-xl overflow-x-auto">
            <table className="w-full text-[13.5px]">
              <thead>
                <tr className="border-b border-[#f0ede3] text-[11px] uppercase tracking-wide text-[#999]">
                  <th className="text-left px-4 py-2">Fecha</th>
                  <th className="text-left px-4 py-2">Concepto</th>
                  <th className="text-left px-4 py-2">Origen</th>
                  <th className="text-right px-4 py-2">Entrada</th>
                  <th className="text-right px-4 py-2">Salida</th>
                  <th className="text-right px-4 py-2">Saldo</th>
                </tr>
              </thead>
              <tbody>
                {filasDelMes.map((l) => (
                  <tr key={l.id} className="border-b border-[#f5f3eb] last:border-0">
                    <td className="px-4 py-2.5 text-[#888]">{fmtDate(l.movedOn)}</td>
                    <td className="px-4 py-2.5">{l.concept}</td>
                    <td className="px-4 py-2.5 text-[#999]">
                      {BS_LEDGER_SOURCES[l.source] ?? l.source}
                    </td>
                    <td className="text-right px-4 py-2.5 font-mono text-[#1F9D57]">
                      {l.kind === 'in' ? fmtBs(l.amountBs) : ''}
                    </td>
                    <td className="text-right px-4 py-2.5 font-mono text-[#D6453F]">
                      {l.kind === 'out' ? fmtBs(l.amountBs) : ''}
                    </td>
                    <td className="text-right px-4 py-2.5 font-mono font-bold">{fmtBs(l.saldo)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {fxOpen && (
        <FxOperacionModal
          companyId={companyId}
          monthId={finMonth?.id}
          opType={fxOpen}
          rateBcv={rateBcv}
          saldoBs={cuadre.saldoBs}
          divisaFisica={cuadre.divisaFisica}
          onClose={() => setFxOpen(null)}
          onSaved={() => {
            setFxOpen(null)
            refetch()
          }}
        />
      )}

      {ajusteOpen && (
        <AjusteCajaBsModal
          companyId={companyId}
          monthId={finMonth?.id}
          rateBcv={rateBcv}
          onClose={() => setAjusteOpen(false)}
          onSaved={() => {
            setAjusteOpen(false)
            refetch()
          }}
        />
      )}
    </div>
  )
}
