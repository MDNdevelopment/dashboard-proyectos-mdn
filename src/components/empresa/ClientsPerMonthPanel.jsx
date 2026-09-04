import { Fragment, useMemo, useState } from 'react'
import { MONTHS } from '../metricas/constants'
import { clientsPerMonth } from '../../utils/clientsPerMonth'

/**
 * Panel "Clientes por mes": serie de activos/altas/bajas/neto del año, con el
 * detalle (nombre + motivo) de las cuentas dadas de baja en cada mes.
 * Se calcula en el cliente sobre la lista de clientes ya cargada por ClientsView
 * (incluArchived: true) — no dispara ninguna consulta nueva.
 */
export default function ClientsPerMonthPanel({ clients, years }) {
  const [year, setYear] = useState(years[0])
  const rows = useMemo(() => clientsPerMonth(clients, year), [clients, year])
  const [openMonth, setOpenMonth] = useState(null)

  return (
    <div className="bg-white rounded-2xl border border-[#e0ddd4] overflow-hidden">
      <div className="px-5 py-3 bg-[#fafaf7] border-b border-[#f0ede3] flex items-center justify-between flex-wrap gap-2">
        <span className="text-[13px] font-mono font-bold uppercase tracking-[0.12em] text-[#888]">
          Clientes por mes
        </span>
        <select
          value={year}
          onChange={(e) => setYear(Number(e.target.value))}
          className="text-[13.5px] border border-[#e0ddd4] rounded-lg px-2 py-1.5 bg-white text-[#333] focus:outline-none focus:border-[#FFB800]"
        >
          {years.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-[13.5px]">
          <thead>
            <tr className="text-[11.5px] font-mono font-bold uppercase tracking-[0.08em] text-[#aaa] border-b border-[#f0ede3]">
              <th className="text-left px-5 py-2">Mes</th>
              <th className="text-right px-3 py-2">Activos</th>
              <th className="text-right px-3 py-2">Altas</th>
              <th className="text-right px-3 py-2">Bajas</th>
              <th className="text-right px-5 py-2">Neto</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const isOpen = openMonth === r.month
              return (
                <Fragment key={r.month}>
                  <tr
                    className={`border-b border-[#f5f3eb] ${
                      r.bajas > 0 ? 'cursor-pointer hover:bg-[#fafaf7]' : ''
                    }`}
                    onClick={() => r.bajas > 0 && setOpenMonth(isOpen ? null : r.month)}
                  >
                    <td className="px-5 py-2 text-[#333] font-medium">{MONTHS[r.month - 1]}</td>
                    <td className="px-3 py-2 text-right text-[#111] font-semibold">{r.activos}</td>
                    <td className="px-3 py-2 text-right text-[#1f8a43]">
                      {r.altas > 0 ? `+${r.altas}` : r.altas}
                    </td>
                    <td className="px-3 py-2 text-right text-[#c0392b]">
                      {r.bajas > 0 ? `-${r.bajas}` : r.bajas}
                    </td>
                    <td
                      className={`px-5 py-2 text-right font-semibold ${
                        r.netos > 0
                          ? 'text-[#1f8a43]'
                          : r.netos < 0
                            ? 'text-[#c0392b]'
                            : 'text-[#aaa]'
                      }`}
                    >
                      {r.netos > 0 ? `+${r.netos}` : r.netos}
                    </td>
                  </tr>
                  {isOpen && r.bajas > 0 && (
                    <tr className="bg-[#faf9f4] border-b border-[#f0ede3]">
                      <td colSpan={5} className="px-5 py-3">
                        <ul className="space-y-1">
                          {r.bajasDetalle.map((b) => (
                            <li key={b.id} className="text-[13px] text-[#666]">
                              <span className="font-semibold text-[#333]">{b.name}</span>
                              {b.reason ? ` — ${b.reason}` : ''}
                            </li>
                          ))}
                        </ul>
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
