const COLS = [
  { key: 'V', label: '🎬 4K' },
  { key: 'R', label: '🎞️ Reel' },
  { key: 'F', label: '📷 Foto' },
  { key: 'sinDesglose', label: '≈ Sin desglosar' },
]

/**
 * Piezas pendientes por editar, por línea y por formato. Cada celda > 0 es un botón que
 * lleva a la vista Lista filtrada a las pautas que aportan ese pendiente.
 */
export default function PendientesPanel({ porLinea, onSelect }) {
  const total = porLinea.reduce((s, l) => s + l.total, 0)
  const colTotals = Object.fromEntries(
    COLS.map((c) => [c.key, porLinea.reduce((s, l) => s + (l[c.key] ?? 0), 0)]),
  )
  const cell = (n, lineId, formato) =>
    n > 0 ? (
      <button
        type="button"
        onClick={() => onSelect({ lineId, formato })}
        className="font-mono font-bold text-[14px] text-[#9a7400] hover:underline"
        aria-label={`Ver pautas con ${n} pendientes${formato ? ` de ${formato}` : ''}${lineId ? ` en esta línea` : ''}`}
      >
        {n}
      </button>
    ) : (
      <span className="font-mono text-[13px] text-[#ccc]">0</span>
    )

  return (
    <div className="bg-white border border-[#e0ddd4] rounded-xl p-5" data-tour="datos-pendientes">
      <h2 className="text-[16px] font-semibold text-[#222] mb-0.5">Pendiente por editar</h2>
      <p className="text-[12px] text-[#999] mb-3">
        Piezas capturadas que todavía no están listas, por línea. Haz clic en un número para ver a
        qué pautas pertenecen.
      </p>
      {porLinea.length === 0 ? (
        <p className="text-[13px] text-[#a29b8c]">Todo lo capturado este mes ya está editado.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-[13px] border-collapse" aria-label="Pendiente por editar">
            <thead>
              <tr className="bg-[#fafaf7] border-b border-[#ece9df]">
                <th className="text-left font-mono font-bold uppercase tracking-[0.1em] text-[11px] text-[#888] px-3 py-2">
                  Línea
                </th>
                {COLS.map((c) => (
                  <th
                    key={c.key}
                    className="text-right font-mono font-bold uppercase tracking-[0.1em] text-[11px] text-[#888] px-3 py-2 whitespace-nowrap"
                  >
                    {c.label}
                  </th>
                ))}
                <th className="text-right font-mono font-bold uppercase tracking-[0.1em] text-[11px] text-[#888] px-3 py-2">
                  Total
                </th>
              </tr>
            </thead>
            <tbody>
              {porLinea.map((l) => (
                <tr key={l.lineId} className="border-b border-[#f0ede3]">
                  <td className="px-3 py-2 font-semibold text-[#111]">{l.name}</td>
                  {COLS.map((c) => (
                    <td key={c.key} className="px-3 py-2 text-right">
                      {cell(l[c.key] ?? 0, l.lineId, c.key)}
                    </td>
                  ))}
                  <td className="px-3 py-2 text-right">{cell(l.total, l.lineId, null)}</td>
                </tr>
              ))}
              <tr className="bg-[#fafaf7]">
                <td className="px-3 py-2 font-mono text-[11px] uppercase text-[#888]">Total</td>
                {COLS.map((c) => (
                  <td key={c.key} className="px-3 py-2 text-right">
                    {cell(colTotals[c.key], null, c.key)}
                  </td>
                ))}
                <td className="px-3 py-2 text-right">{cell(total, null, null)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
