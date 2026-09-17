import { aggregatePiezasByLine, aggregateResourcePerformance } from '../../utils/audiovisual'
import Avatar from '../Avatar'

/** Desglose chico "🎬 N video · 📷 N foto · ≈ N sin desglosar" — omite las partes en 0. */
function formatoDesglose({ av, foto, sinDesglose }) {
  return [
    av ? `🎬 ${av} video` : null,
    foto ? `📷 ${foto} foto` : null,
    sinDesglose ? `≈ ${sinDesglose} sin desglosar` : null,
  ]
    .filter(Boolean)
    .join(' · ')
}

/** «Piezas totales vs. editadas por línea» + «Rendimiento por recurso» (quién captura/edita). */
export default function AvAnalytics({ pautas, lines, usersById, piezasByPauta }) {
  const byLine = aggregatePiezasByLine(pautas, lines).filter((l) => l.totales || l.editadas)
  const byResource = aggregateResourcePerformance(pautas, usersById, piezasByPauta)
  const anyEstimado = byResource.some((r) => r.grabaEstimado)

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
              const { av, foto, sinDesglose } = l.porGrupo
              const desglose = [
                av.totales ? `Video/Reel ${av.editadas}/${av.totales}` : null,
                foto.totales ? `Foto ${foto.editadas}/${foto.totales}` : null,
                sinDesglose.totales
                  ? `Sin desglosar ${sinDesglose.editadas}/${sinDesglose.totales}`
                  : null,
              ]
                .filter(Boolean)
                .join(' · ')
              return (
                <div key={l.lineId}>
                  <div className="flex items-center gap-3">
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
                  {desglose && (
                    <div className="text-[11px] text-[#a29b8c] ml-[104px] mt-0.5">{desglose}</div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
      <div className="bg-white border border-[#e0ddd4] rounded-xl p-5">
        <h2 className="text-[16px] font-semibold text-[#222] mb-1">Rendimiento por recurso</h2>
        <p className="text-[12px] text-[#999] mb-3">
          Piezas <strong>capturadas</strong> (grabó video/reel o tomó fotos) y{' '}
          <strong>editadas</strong>, por persona, en pautas realizadas.
        </p>
        {byResource.length === 0 ? (
          <p className="text-[13px] text-[#a29b8c]">Aún no hay pautas realizadas.</p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-[13px] border-collapse">
                <thead>
                  <tr className="bg-[#fafaf7] border-b border-[#ece9df]">
                    <th className="text-left font-mono font-bold uppercase tracking-[0.1em] text-[11px] text-[#888] px-3 py-2">
                      Recurso
                    </th>
                    <th className="text-right font-mono font-bold uppercase tracking-[0.1em] text-[11px] text-[#888] px-3 py-2">
                      Capturadas
                    </th>
                    <th className="text-right font-mono font-bold uppercase tracking-[0.1em] text-[11px] text-[#888] px-3 py-2">
                      Editadas
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {byResource.map((r) => {
                    const user = usersById?.get(r.id) ?? {
                      user_id: r.id,
                      first_name: r.name,
                      last_name: '',
                      avatar_url: null,
                    }
                    const capturaDesglose = formatoDesglose({
                      av: r.grabaAv,
                      foto: r.grabaFoto,
                      sinDesglose: r.grabaSinDesglose,
                    })
                    const editaDesglose = formatoDesglose({
                      av: r.editaAv,
                      foto: r.editaFoto,
                      sinDesglose: r.editaOtro,
                    })
                    return (
                      <tr key={r.id} className="border-b border-[#f0ede3] last:border-0">
                        <td className="px-3 py-2.5">
                          <div className="flex items-center gap-2.5 min-w-[140px]">
                            <Avatar user={user} size={26} />
                            <span className="font-semibold text-[#111] truncate">{r.name}</span>
                          </div>
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          <div className="font-mono font-bold text-[15px] text-[#3b6fd4]">
                            {r.grabaEstimado && '≈ '}
                            {r.graba}
                          </div>
                          {capturaDesglose && (
                            <div className="text-[11px] text-[#999] mt-0.5">{capturaDesglose}</div>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          <div className="font-mono font-bold text-[15px] text-[#1f8a43]">
                            {r.edita}
                          </div>
                          {editaDesglose && (
                            <div className="text-[11px] text-[#999] mt-0.5">{editaDesglose}</div>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            {anyEstimado && (
              <p className="text-[11px] text-[#a29b8c] mt-2">
                ≈ pauta sin reparto de captura por formato: se atribuye el total completo de la
                pauta al recurso. Se completa desde el detalle de cada pauta.
              </p>
            )}
          </>
        )}
      </div>
    </div>
  )
}
