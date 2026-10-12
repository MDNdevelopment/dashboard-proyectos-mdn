const FORMATOS = [
  { key: 'R', label: '🎞️ Reels' },
  { key: 'V', label: '🎬 Videos 4K' },
  { key: 'F', label: '📷 Fotos' },
  { key: 'sinDesglose', label: '≈ Sin desglosar', soloSiHay: true },
  { key: 'cnp', label: 'CNP', soloSiHay: true },
]

/**
 * Resumen arriba del panel de "piezas atrasadas": piezas que faltan por formato y por
 * cliente (solo los clientes con algo pendiente). Los CNP van en su propio contador porque
 * no guardan formato.
 */
export default function PendientesResumen({ resumen }) {
  const { porFormato, porCliente } = resumen
  if (porFormato.total === 0) return null
  const columnas = FORMATOS.filter((f) => !f.soloSiHay || porFormato[f.key] > 0)

  return (
    <section
      aria-label="Resumen de piezas pendientes"
      className="rounded-xl border border-[#e8e4d8] bg-white px-3 py-3 space-y-3"
    >
      <div>
        <h3 className="font-mono text-[10.5px] uppercase tracking-wider text-[#999] mb-1.5">
          Piezas pendientes · {porFormato.total}
        </h3>
        <div
          className="grid gap-2"
          style={{ gridTemplateColumns: `repeat(${columnas.length}, 1fr)` }}
        >
          {columnas.map((f) => (
            <div key={f.key} className="rounded-lg bg-white border border-[#ece9df] px-2 py-1.5">
              <div className="font-mono font-bold text-[18px] text-[#9a7400] leading-none">
                {porFormato[f.key]}
              </div>
              <div className="text-[11px] text-[#777] mt-1 truncate">{f.label}</div>
            </div>
          ))}
        </div>
      </div>
      <div>
        <h3 className="font-mono text-[10.5px] uppercase tracking-wider text-[#999] mb-1">
          Por cliente
        </h3>
        <ul className="divide-y divide-[#ece9df]">
          {porCliente.map((c) => (
            <li key={c.key} className="flex items-center justify-between gap-2 py-1.5">
              <span className="text-[13px] font-semibold text-[#111] truncate">{c.name}</span>
              <span className="flex items-center gap-2 shrink-0 text-[11px] text-[#777]">
                {columnas
                  .filter((f) => c[f.key] > 0)
                  .map((f) => (
                    <span key={f.key} className="font-mono">
                      {c[f.key]} {f.label.split(' ').slice(1).join(' ') || f.label}
                    </span>
                  ))}
                <span className="font-mono font-bold text-[13px] text-[#9a7400]">{c.total}</span>
              </span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
