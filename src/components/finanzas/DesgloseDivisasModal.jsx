import { useEffect, useMemo } from 'react'
import { fmtUSD } from '../../utils/metricsFinance'
import { fmtDate } from '../../utils/formatDate'
import {
  detalleDivisaFisica,
  detalleResultadoCambio,
  ledgerConSaldo,
  saldoCajaBs,
} from '../../utils/finanzas'

const GRUPO_LABEL = {
  cobro: 'Cobro en USD',
  compra: 'Compra de divisa',
  venta: 'Venta de divisa',
  pago: 'Pago en USD',
}

const TITULOS = {
  divisa: 'Divisa física',
  cajaBs: 'Caja Bs',
  cambio: 'Resultado por cambio',
}

function fmtBs(n) {
  return Number(n ?? 0).toLocaleString('es-VE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

/** Monto firmado: "+$10.00" / "−$10.00", para que se vea de un vistazo si suma o resta. */
function fmtFirmado(n, fmt = fmtUSD) {
  return `${n < 0 ? '−' : '+'}${fmt(Math.abs(n))}`
}

/**
 * Desglose de las cards de divisas del Dashboard (Divisa física, Caja Bs, Resultado
 * por cambio), que no tienen una lista propia a la cual navegar. Las filas salen de
 * las mismas funciones que calculan el total de la card (`detalleDivisaFisica`,
 * `detalleResultadoCambio`, `ledgerConSaldo`), así que el total del pie siempre
 * coincide con el número de la card.
 *
 * @param {'divisa'|'cajaBs'|'cambio'} tipo
 */
export default function DesgloseDivisasModal({
  tipo,
  invoices,
  distributions,
  fxOperations,
  bsLedger,
  rateBcv,
  onClose,
}) {
  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const filas = useMemo(() => {
    if (tipo === 'cajaBs') return ledgerConSaldo(bsLedger)
    const base =
      tipo === 'divisa'
        ? detalleDivisaFisica({ invoices, fxOperations, distributions })
        : detalleResultadoCambio(distributions)
    return [...base].sort((a, b) => String(b.fecha ?? '').localeCompare(String(a.fecha ?? '')))
  }, [tipo, invoices, distributions, fxOperations, bsLedger])

  const esBs = tipo === 'cajaBs'
  const total = esBs ? saldoCajaBs(bsLedger) : filas.reduce((a, r) => a + r.monto, 0)
  const bcv = Number(rateBcv ?? 0)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/25 backdrop-blur-[3px]">
      <div
        role="dialog"
        aria-label={`Desglose de ${TITULOS[tipo]}`}
        className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col"
      >
        <div className="flex-shrink-0 flex items-start justify-between gap-3 p-5 border-b border-[#f0ede3]">
          <div>
            <h2 className="text-[17px] font-bold text-[#111]">{TITULOS[tipo]}</h2>
            <p className="text-[13px] text-[#888]">
              {esBs
                ? 'Libro de la Caja Bs, acumulado.'
                : tipo === 'divisa'
                  ? 'Cobros y pagos en USD del mes, más las compras y ventas de divisa acumuladas.'
                  : 'Movimientos de la partida técnica de cambio.'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="text-[#999] hover:text-[#111] text-[18px] leading-none"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {filas.length === 0 ? (
            <p className="p-8 text-center text-[13.5px] text-[#999]">Sin movimientos.</p>
          ) : (
            <table className="w-full text-[13.5px]">
              <thead>
                <tr className="border-b border-[#f0ede3] text-[11px] uppercase tracking-wide text-[#999]">
                  <th className="text-left px-4 py-2">Fecha</th>
                  <th className="text-left px-4 py-2">Concepto</th>
                  <th className="text-right px-4 py-2">{esBs ? 'Monto (Bs)' : 'Monto'}</th>
                  {esBs && <th className="text-right px-4 py-2">Saldo (Bs)</th>}
                </tr>
              </thead>
              <tbody>
                {filas.map((r, i) => {
                  const monto = esBs ? (r.kind === 'out' ? -r.amountBs : r.amountBs) : r.monto
                  const detalle = esBs ? null : [GRUPO_LABEL[r.grupo], r.contraparte]
                  return (
                    <tr key={r.id ?? i} className="border-b border-[#f5f3eb] last:border-0">
                      <td className="px-4 py-2.5 whitespace-nowrap text-[#666]">
                        {fmtDate(esBs ? r.movedOn : r.fecha)}
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="font-medium text-[#111]">{(esBs ? r.concept : r.concepto) || '—'}</div>
                        {detalle && (
                          <div className="text-[12px] text-[#999]">
                            {detalle.filter((x) => x && x !== r.concepto).join(' · ')}
                          </div>
                        )}
                      </td>
                      <td
                        className="text-right px-4 py-2.5 font-mono"
                        style={{ color: monto < 0 ? '#D6453F' : '#1F9D57' }}
                      >
                        {fmtFirmado(monto, esBs ? fmtBs : fmtUSD)}
                      </td>
                      {esBs && (
                        <td className="text-right px-4 py-2.5 font-mono text-[#111]">
                          {fmtBs(r.saldo)}
                        </td>
                      )}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>

        <div className="flex-shrink-0 flex items-center justify-between gap-3 px-5 py-3 border-t border-[#f0ede3]">
          <span className="text-[12px] uppercase text-[#999]">{esBs ? 'Saldo' : 'Total'}</span>
          <span className="font-bold text-[16px] text-[#111]">
            {esBs ? `${fmtBs(total)} Bs` : fmtUSD(total)}
            {esBs && bcv > 0 && (
              <span className="text-[12px] font-normal text-[#999]"> ≈ {fmtUSD(total / bcv)}</span>
            )}
          </span>
        </div>
      </div>
    </div>
  )
}
