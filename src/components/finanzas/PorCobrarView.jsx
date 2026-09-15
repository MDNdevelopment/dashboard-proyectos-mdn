import { useState, useEffect, useMemo } from 'react'
import { fmtUSD } from '../../utils/metricsFinance'
import { MONTHS } from '../metricas/constants'
import { cuentasPorCobrar } from '../../utils/finanzas'
import { loadAllInvoices } from './finanzasApi'
import CobroModal from './CobroModal'

export default function PorCobrarView({ companyId, canManageCobros }) {
  const [monthsWithInvoices, setMonthsWithInvoices] = useState(null)
  const [cobroInvoice, setCobroInvoice] = useState(null)

  async function fetchAll() {
    if (!companyId) return
    const { data } = await loadAllInvoices(companyId)
    const byPeriod = new Map()
    for (const { year, month, invoice } of data ?? []) {
      const key = `${year}-${month}`
      if (!byPeriod.has(key)) byPeriod.set(key, { year, month, invoices: [] })
      byPeriod.get(key).invoices.push(invoice)
    }
    setMonthsWithInvoices([...byPeriod.values()])
  }

  useEffect(() => {
    fetchAll()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId])

  const now = new Date()
  const curYear = now.getFullYear()
  const curMonth = now.getMonth() + 1

  const ar = useMemo(
    () => (monthsWithInvoices ? cuentasPorCobrar(monthsWithInvoices) : []),
    [monthsWithInvoices],
  )
  const totalAr = ar.reduce((a, r) => a + r.pendiente, 0)
  const deMesAnterior = ar
    .filter((r) => !(r.year === curYear && r.month === curMonth))
    .reduce((a, r) => a + r.pendiente, 0)
  const delMesActual = totalAr - deMesAnterior

  if (monthsWithInvoices == null) {
    return <div className="text-[14px] text-[#999] py-10 text-center">Cargando…</div>
  }

  return (
    <div className="space-y-4">
      {ar.length === 0 ? (
        <div className="bg-white border border-[#e0ddd4] rounded-xl p-10 text-center">
          <p className="text-[15px] font-semibold text-[#888]">Todo cobrado</p>
          <p className="text-[13.5px] text-[#bbb] mt-1">No hay cuentas pendientes en ningún mes.</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-3 max-w-xl">
            <div className="bg-white border border-[#e0ddd4] rounded-xl p-3">
              <p className="text-[11px] uppercase text-[#999]">Total por cobrar</p>
              <p className="font-bold text-[#111] text-[16px]">{fmtUSD(totalAr)}</p>
            </div>
            <div className="bg-white border border-[#e0ddd4] rounded-xl p-3">
              <p className="text-[11px] uppercase text-[#999]">De meses anteriores</p>
              <p className="font-bold text-[#D6453F] text-[16px]">{fmtUSD(deMesAnterior)}</p>
            </div>
            <div className="bg-white border border-[#e0ddd4] rounded-xl p-3">
              <p className="text-[11px] uppercase text-[#999]">Del mes actual</p>
              <p className="font-bold text-[#111] text-[16px]">{fmtUSD(delMesActual)}</p>
            </div>
          </div>

          <div className="bg-white border border-[#e0ddd4] rounded-xl overflow-x-auto">
            <table className="w-full text-[13.5px]">
              <thead>
                <tr className="border-b border-[#f0ede3] text-[11px] uppercase tracking-wide text-[#999]">
                  <th className="text-left px-4 py-2">Cliente / concepto</th>
                  <th className="text-left px-4 py-2">Periodo</th>
                  <th className="text-right px-4 py-2">Facturado</th>
                  <th className="text-right px-4 py-2">Cobrado</th>
                  <th className="text-right px-4 py-2">Pendiente</th>
                  <th className="text-center px-4 py-2">Antigüedad</th>
                  <th className="text-center px-4 py-2">Acción</th>
                </tr>
              </thead>
              <tbody>
                {ar.map((r) => {
                  const old = !(r.year === curYear && r.month === curMonth)
                  return (
                    <tr key={r.invoice.id} className="border-b border-[#f5f3eb] last:border-0">
                      <td className="px-4 py-2.5">
                        <div className="font-medium text-[#111]">{r.invoice.clientName}</div>
                        <div className="text-[12px] text-[#999]">{r.invoice.concept}</div>
                      </td>
                      <td className="px-4 py-2.5">
                        {MONTHS[r.month - 1]} {r.year}
                      </td>
                      <td className="text-right px-4 py-2.5 font-mono">
                        {fmtUSD(r.invoice.amount)}
                      </td>
                      <td className="text-right px-4 py-2.5 font-mono text-[#1F9D57]">
                        {r.cobrado > 0 ? fmtUSD(r.cobrado) : '—'}
                      </td>
                      <td className="text-right px-4 py-2.5 font-mono text-[#D6453F]">
                        {fmtUSD(r.pendiente)}
                      </td>
                      <td className="text-center px-4 py-2.5">
                        <span
                          className={`inline-block px-2 py-0.5 rounded-full text-[11.5px] font-semibold ${
                            old ? 'bg-[#fbe9e8] text-[#c0392b]' : 'bg-[#fff4d6] text-[#9a6800]'
                          }`}
                        >
                          {old ? 'Mes anterior' : 'Mes actual'}
                        </span>
                      </td>
                      <td className="text-center px-4 py-2.5">
                        {canManageCobros && (
                          <button
                            type="button"
                            onClick={() => setCobroInvoice(r.invoice)}
                            className="text-[12.5px] font-semibold text-[#111] hover:underline"
                          >
                            {r.cobrado > 0 ? 'Abonar' : 'Registrar cobro'}
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {cobroInvoice && (
        <CobroModal
          invoice={cobroInvoice}
          canManage={canManageCobros}
          onClose={() => setCobroInvoice(null)}
          onSaved={() => {
            fetchAll()
          }}
        />
      )}
    </div>
  )
}
