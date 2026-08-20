import { aggregatePiezasByLine, aggregateByResource } from '../../utils/audiovisual'

/** «Piezas totales vs. editadas por línea» + «Rendimiento por recurso» (quién graba/edita). */
export default function AvAnalytics({ pautas, lines, usersById, piezasByPauta }) {
  const byLine = aggregatePiezasByLine(pautas, lines).filter((l) => l.totales || l.editadas)
  const byResource = aggregateByResource(pautas, usersById, piezasByPauta)

  return (
    <div className="grid md:grid-cols-2 gap-4 mb-4">
      <div className="bg-white border border-[#e0ddd4] rounded-xl p-5">
        <div className="text-[11px] font-mono uppercase tracking-wide text-[#FFB800] mb-0.5">
          ↓ alimenta el indicador «6. Nº Piezas vs Piezas editadas» del reporte
        </div>
        <h2 className="text-[16px] font-semibold text-[#222] mb-3">
          Piezas totales vs. editadas — por línea
        </h2>
        {byLine.length === 0 ? (
          <p className="text-[13px] text-[#a29b8c]">Sin piezas registradas este mes.</p>
        ) : (
          <div className="space-y-2.5">
            {byLine.map((l) => {
              const pct = l.totales ? Math.min(100, Math.round((l.editadas / l.totales) * 100)) : 0
              return (
                <div key={l.lineId} className="flex items-center gap-3">
                  <div className="w-[92px] text-[13px] font-medium text-[#333] truncate">
                    {l.label}
                  </div>
                  <div className="flex-1 h-[10px] bg-[#f0ede4] rounded-full overflow-hidden">
                    <div
                      className="h-full bg-[#1f8a43] rounded-full transition-all"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <div className="w-[92px] text-right text-[12px] font-mono text-[#555]">
                    {l.editadas} / {l.totales} ed.
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
      <div className="bg-white border border-[#e0ddd4] rounded-xl p-5">
        <h2 className="text-[16px] font-semibold text-[#222] mb-1">Rendimiento por recurso</h2>
        <p className="text-[12px] text-[#999] mb-3">
          Piezas <strong>grabadas</strong> (por quien graba) y <strong>editadas</strong> (por quien
          edita), en pautas realizadas.
        </p>
        {byResource.length === 0 ? (
          <p className="text-[13px] text-[#a29b8c]">Aún no hay pautas realizadas.</p>
        ) : (
          <div className="space-y-1">
            {byResource.map((r) => (
              <div
                key={r.name}
                className="flex items-center justify-between text-[13px] py-1 border-b border-[#f4f1e9] last:border-0"
              >
                <span className="text-[#333]">{r.name}</span>
                <span className="font-mono text-[#555]">
                  <strong className="text-[#3b6fd4]">{r.graba}</strong> graba ·{' '}
                  <strong className="text-[#1f8a43]">{r.edita}</strong> edita
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
