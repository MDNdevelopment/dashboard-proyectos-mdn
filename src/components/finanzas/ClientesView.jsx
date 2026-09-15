import { useMemo } from 'react'
import { fmtUSD } from '../../utils/metricsFinance'
import { clientInMonth } from '../../utils/clientInMonth'

function initials(name) {
  return (name ?? '')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join('')
}

/**
 * Vista de solo lectura financiera de la cartera: deriva de metric_clients
 * (mensualidad, línea, alta/baja) — Finanzas no mantiene un maestro propio de
 * clientes, esa es responsabilidad de Empresa → Clientes.
 */
export default function ClientesView({ clients, lines, loading }) {
  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth() + 1

  const linesById = useMemo(() => new Map((lines ?? []).map((l) => [l.id, l])), [lines])

  const rows = useMemo(() => {
    const list = (clients ?? []).map((c) => ({
      ...c,
      active: clientInMonth(c, year, month),
    }))
    return list.sort((a, b) => b.active - a.active || (b.monthly_fee ?? 0) - (a.monthly_fee ?? 0))
  }, [clients, year, month])

  const activeRows = rows.filter((c) => c.active)
  const totalActivo = activeRows.reduce((a, c) => a + Number(c.monthly_fee ?? 0), 0) || 1

  if (loading) return <div className="text-[14px] text-[#999] py-10 text-center">Cargando…</div>

  return (
    <div className="space-y-3">
      <p className="text-[13.5px] text-[#888]">
        {activeRows.length} activos · {rows.length - activeRows.length} retirados
      </p>

      <div className="bg-white border border-[#e0ddd4] rounded-xl overflow-x-auto">
        <table className="w-full text-[13.5px]">
          <thead>
            <tr className="border-b border-[#f0ede3] text-[11px] uppercase tracking-wide text-[#999]">
              <th className="text-left px-4 py-2">Cliente</th>
              <th className="text-right px-4 py-2">Monto / mes</th>
              <th className="text-right px-4 py-2">% cartera</th>
              <th className="text-left px-4 py-2">Línea</th>
              <th className="text-center px-4 py-2">Estado</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => (
              <tr
                key={c.id}
                className={`border-b border-[#f5f3eb] last:border-0 ${!c.active ? 'opacity-55' : ''}`}
              >
                <td className="px-4 py-2.5 flex items-center gap-2">
                  <span className="w-7 h-7 rounded-full bg-[#f0ede3] text-[#666] text-[11px] font-bold flex items-center justify-center">
                    {initials(c.name)}
                  </span>
                  {c.name}
                </td>
                <td className="text-right px-4 py-2.5 font-mono">{fmtUSD(c.monthly_fee ?? 0)}</td>
                <td className="text-right px-4 py-2.5 text-[#999]">
                  {c.active ? `${(((c.monthly_fee ?? 0) / totalActivo) * 100).toFixed(1)}%` : '—'}
                </td>
                <td className="px-4 py-2.5">{linesById.get(c.line_id)?.name ?? 'Sin asignar'}</td>
                <td className="text-center px-4 py-2.5">
                  <span
                    className={`inline-block px-2 py-0.5 rounded-full text-[11.5px] font-semibold ${
                      c.active ? 'bg-[#e6f4ec] text-[#1f9d57]' : 'bg-[#f0ede3] text-[#888]'
                    }`}
                  >
                    {c.active ? 'Activo' : 'Retirado'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
