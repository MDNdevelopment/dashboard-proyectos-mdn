import { computeProductividad, TASK_LABELS } from '../../utils/fixedTasks'
import { computePlataformasProductividad } from '../../utils/chequeo'
import { calcProductividad } from '../../utils/metricsScore'

const PLATAFORMAS_LABEL = 'Actualización de Plataformas'
// Encabezados de la vista previa: las 4 tareas de Tareas Fijas + la fila derivada de
// Chequeo, en el mismo orden en que las mostraba la columna vieja.
const PREVIEW_LABELS = [...Object.values(TASK_LABELS), PLATAFORMAS_LABEL]

/**
 * Vista previa de solo-lectura del indicador «2. Productividad – Tareas Fijas»
 * del reporte mensual, calculado en vivo desde la grilla de arriba (todas las
 * semanas del mes) más la fila «Actualización de Plataformas» derivada de la grilla de
 * Chequeo del mes. Es exactamente lo que OperacionesView derivará y guardará en
 * `report.productividad.tareas` — ver utils/fixedTasks.js:computeProductividad y
 * utils/chequeo.js:computePlataformasProductividad.
 *
 * showMatrix=true (alcance "Todas las líneas"): una fila por línea con su score.
 */
export default function FixedTasksReportPreview({
  lines,
  clients,
  marks,
  weeks,
  checks,
  showMatrix,
  lineLabel,
}) {
  function rowsForLine(line) {
    const lineClients = clients.filter((c) => c.line_id === line.id)
    const lineMarks = marks.filter((m) => m.line_id === line.id)
    const lineChecks = (checks ?? []).filter((c) => c.line_id === line.id)
    return [
      ...computeProductividad(lineMarks, lineClients, weeks),
      computePlataformasProductividad(lineChecks, lineClients, weeks),
    ]
  }

  function scoreOf(rows) {
    return calcProductividad({ productividad: { tareas: rows } })
  }

  if (showMatrix) {
    return (
      <div className="bg-white border border-[#e0ddd4] rounded-xl p-5 mb-4">
        <div className="mb-3">
          <div className="text-[11px] font-mono uppercase tracking-wide text-[#FFB800] mb-0.5">
            ↓ Se llena automáticamente en el reporte de cada línea
          </div>
          <h2 className="text-[17px] font-semibold text-[#222]">
            2. Productividad – Tareas Fijas · todas las líneas
          </h2>
          <p className="text-[12.5px] text-[#999] mt-0.5">Peso: 20 pts por línea</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[13px] min-w-[640px]">
            <thead>
              <tr className="text-[11px] font-mono uppercase tracking-wide text-[#a29b8c] border-b border-[#eee9dd]">
                <th className="text-left py-2 pr-3">Línea</th>
                {PREVIEW_LABELS.map((label) => (
                  <th key={label} className="px-2 py-2 text-center">
                    {label}
                  </th>
                ))}
                <th className="px-2 py-2 text-center">Score</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line) => {
                const rows = rowsForLine(line)
                const score = scoreOf(rows)
                return (
                  <tr key={line.id} className="border-b border-[#f4f1e9]">
                    <td className="py-2 pr-3 font-medium text-[#333]">{line.name}</td>
                    {rows.map((r) => {
                      const ok = r.meta > 0 && r.realizado >= r.meta
                      return (
                        <td
                          key={r.nombre}
                          className={`px-2 py-2 text-center font-mono ${
                            r.meta === 0 ? 'text-[#ccc]' : ok ? 'text-[#1f8a43]' : 'text-[#c0392b]'
                          }`}
                        >
                          {r.realizado}/{r.meta}
                        </td>
                      )
                    })}
                    <td className="px-2 py-2 text-center font-semibold text-[#222]">
                      {score.toFixed(1)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    )
  }

  const line = lines[0]
  if (!line) return null
  const rows = rowsForLine(line)
  const score = scoreOf(rows)

  return (
    <div className="bg-white border border-[#e0ddd4] rounded-xl p-5 mb-4">
      <div className="flex items-start justify-between gap-4 mb-1">
        <div>
          <div className="text-[11px] font-mono uppercase tracking-wide text-[#FFB800] mb-0.5">
            ↓ Se llena automáticamente en el reporte
          </div>
          <h2 className="text-[17px] font-semibold text-[#222]">2. Productividad – Tareas Fijas</h2>
          <p className="text-[12.5px] text-[#999] mt-0.5">
            Peso: 20 pts · Línea {lineLabel} · el «Real» y la «Meta» salen de la grilla de arriba
            (todas las semanas del mes)
          </p>
        </div>
        <div className="text-right shrink-0">
          <div className="text-[26px] font-semibold text-[#222] leading-none">
            {score.toFixed(1)}
          </div>
          <div className="text-[12px] text-[#999] font-mono">/20 pts</div>
        </div>
      </div>
      <div className="mt-4 space-y-2.5">
        {rows
          .filter((r) => r.meta > 0)
          .map((r) => {
            const ok = r.realizado >= r.meta
            return (
              <div key={r.nombre} className="flex items-center gap-3">
                <div className="flex-1 bg-[#faf8f2] border border-[#efece2] rounded-lg px-3.5 py-2.5 text-[14px] text-[#333]">
                  {r.nombre}
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] font-mono uppercase text-[#a29b8c]">Real</span>
                  <div
                    className={`w-[64px] text-center border border-[#efece2] rounded-lg px-2 py-2 text-[15px] font-semibold bg-white ${ok ? 'text-[#1f8a43]' : 'text-[#c0392b]'}`}
                  >
                    {r.realizado}
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] font-mono uppercase text-[#a29b8c]">Meta</span>
                  <div className="w-[64px] text-center border border-[#efece2] rounded-lg px-2 py-2 text-[15px] font-semibold text-[#555] bg-white">
                    {r.meta}
                  </div>
                </div>
              </div>
            )
          })}
        {rows.every((r) => r.meta === 0) && (
          <p className="text-[14px] text-[#bbb]">Sin cuentas configuradas para esta línea.</p>
        )}
      </div>
    </div>
  )
}
