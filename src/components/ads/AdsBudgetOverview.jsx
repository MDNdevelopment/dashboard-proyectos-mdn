import { useState, useEffect, useMemo } from 'react'
import { loadLines } from '../metricas/metricsApi'
import { MONTHS } from '../metricas/constants'
import { spentByClientInPeriod } from './campaignSpendApi'
import { fmtUSD } from '../../utils/metricsFinance'
import ClientCell from './ClientCell'

/**
 * Modal "Presupuestos por cliente": para el periodo seleccionado en la tab Ads,
 * muestra a todos los clientes (ordenados alfabéticamente) con su presupuesto,
 * lo invertido y lo disponible. Complementa la tarjeta de tracking de
 * AdsSpendView, que solo cubre un cliente a la vez.
 *
 * `ads` y `clients` llegan ya cargados desde AdsSpendView (no se re-consultan);
 * las líneas (equipos) sí se cargan aquí, ya que AdsSpendView no las necesita.
 */
export default function AdsBudgetOverview({ companyId, periodo, ads, clients, onClose }) {
  const [lines, setLines] = useState([])
  const [lineFilter, setLineFilter] = useState('all')

  useEffect(() => {
    if (!companyId) return
    loadLines(companyId).then(({ data }) => setLines(data ?? []))
  }, [companyId])

  const rows = useMemo(() => {
    const filtered = lineFilter === 'all' ? clients : clients.filter(c => c.line_id === lineFilter)
    return filtered
      .map(client => {
        const spent = spentByClientInPeriod(ads, client.id, periodo)
        const budget = client.campaign_budget != null ? Number(client.campaign_budget) : null
        const remaining = budget != null ? budget - spent : null
        return { client, budget, spent, remaining }
      })
      .sort((a, b) => a.client.name.localeCompare(b.client.name, 'es', { sensitivity: 'base' }))
  }, [clients, ads, periodo, lineFilter])

  const totals = useMemo(() => {
    return rows.reduce(
      (acc, r) => ({
        budget: acc.budget + (r.budget ?? 0),
        spent: acc.spent + r.spent,
        remaining: acc.remaining + (r.remaining ?? 0),
      }),
      { budget: 0, spent: 0, remaining: 0 }
    )
  }, [rows])

  const periodLabel = `${MONTHS[periodo.month - 1]} ${periodo.year}`

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-sm bg-black/30">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="flex-shrink-0 px-6 pt-6 pb-5 border-b border-[#ece9df] flex items-start justify-between">
          <div>
            <h2 className="text-[19px] font-bold text-[#111]">Presupuestos por cliente</h2>
            <p className="text-[13px] text-[#888] mt-0.5">Periodo: {periodLabel}</p>
          </div>
          <button onClick={onClose} className="text-[#999] hover:text-[#111] transition-colors p-1">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M2 2l12 12M14 2L2 14" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div className="flex-shrink-0 px-6 pt-4">
          <select
            value={lineFilter}
            onChange={e => setLineFilter(e.target.value)}
            className="input-base text-[14px] py-1.5"
          >
            <option value="all">Todas las líneas</option>
            {lines.map(l => (
              <option key={l.id} value={l.id}>{l.name}</option>
            ))}
          </select>
        </div>

        <div className="px-6 py-4 overflow-y-auto flex-1">
          {rows.length === 0 ? (
            <div className="text-center py-16">
              <p className="text-[16px] font-medium text-[#888]">No hay clientes para este filtro.</p>
            </div>
          ) : (
            <div className="bg-white border border-[#e0ddd4] rounded-2xl overflow-hidden overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-[#ece9df] bg-[#fafaf7]">
                    {['Cliente', 'Presupuesto', 'Invertido', 'Disponible'].map(h => (
                      <th key={h} className="px-3 py-2.5 text-[12px] font-mono font-bold tracking-[0.14em] uppercase text-[#888] whitespace-nowrap">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map(({ client, budget, spent, remaining }) => (
                    <tr key={client.id} className="border-b border-[#f0ede3] last:border-0">
                      <td className="px-3 py-2.5 text-[14px] text-[#444] whitespace-nowrap">
                        <ClientCell name={client.name} logoUrl={client.logo_url} />
                      </td>
                      <td className="px-3 py-2.5 text-[14px] text-[#555] whitespace-nowrap">
                        {budget != null ? fmtUSD(budget) : '—'}
                      </td>
                      <td className="px-3 py-2.5 text-[14px] font-semibold text-[#111] whitespace-nowrap">
                        {fmtUSD(spent)}
                      </td>
                      <td className={`px-3 py-2.5 text-[14px] font-semibold whitespace-nowrap ${
                        remaining == null ? 'text-[#111]' : remaining < 0 ? 'text-red-600' : 'text-green-600'
                      }`}>
                        {remaining != null ? fmtUSD(remaining) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-[#fafaf7] border-t border-[#ece9df]">
                    <td className="px-3 py-2.5 text-[13px] font-mono font-bold uppercase text-[#888]">Total</td>
                    <td className="px-3 py-2.5 text-[14px] font-semibold text-[#555] whitespace-nowrap">
                      {fmtUSD(totals.budget)}
                    </td>
                    <td className="px-3 py-2.5 text-[14px] font-semibold text-[#111] whitespace-nowrap">
                      {fmtUSD(totals.spent)}
                    </td>
                    <td className={`px-3 py-2.5 text-[14px] font-semibold whitespace-nowrap ${
                      totals.remaining < 0 ? 'text-red-600' : 'text-green-600'
                    }`}>
                      {fmtUSD(totals.remaining)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
