import KpiMes from './KpiMes'
import RankingTable from './RankingTable'
import PendientesPanel from './PendientesPanel'
import {
  aggregatePiezasByLine,
  aggregateResourcePerformance,
  rankingFotos,
  rankingVideos,
  resumenMes,
} from '../../utils/audiovisual'

/**
 * Vista Datos: conclusiones del mes (KPIs con delta vs. mes anterior), pendientes por
 * editar (línea × formato → Lista filtrada), rankings de Fotos y de Videos (4K + Reel, con
 * CNP en editadas) y piezas por línea (alimenta el indicador «6» de Reportes). `pautas` ya
 * viene acotada al mes; `allPautas` trae todo el alcance para calcular el mes anterior.
 */
export default function AvDatosView({
  pautas,
  allPautas,
  year,
  month,
  lines,
  generalLineId,
  usersById,
  piezasByPauta,
  cnpAv,
  pendientes,
  onMonthChange,
  onSelectPendiente,
  onSelectLine,
}) {
  const actual = resumenMes(allPautas, piezasByPauta, { year, month })
  const prev = month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 }
  const anterior = resumenMes(allPautas, piezasByPauta, prev)
  const perf = aggregateResourcePerformance(pautas, usersById, piezasByPauta, cnpAv)
  const fotos = rankingFotos(perf)
  const videos = rankingVideos(perf)
  const byLine = aggregatePiezasByLine(pautas, lines, generalLineId).filter(
    (l) => l.totales || l.editadas,
  )
  const realizadasPorLinea = (lineId) =>
    pautas.filter((p) => p.status === 'realizada' && (p.line_id ?? generalLineId) === lineId).length

  return (
    <div className="space-y-4">
      <KpiMes
        year={year}
        month={month}
        actual={actual}
        anterior={anterior}
        onMonthChange={onMonthChange}
        onGoPendientes={() => onSelectPendiente({ lineId: null, formato: null })}
      />
      <PendientesPanel porLinea={pendientes.porLinea} onSelect={onSelectPendiente} />
      <div className="grid md:grid-cols-2 gap-4">
        <RankingTable
          title="Videos 4K + Reels"
          subtitle="Capturadas y editadas por persona en pautas realizadas. Las piezas de CNP de audiovisual suman en editadas."
          rows={videos}
          usersById={usersById}
          empty="Aún no hay videos capturados ni editados este mes."
          renderDesglose={(r) => ({
            capturadas: join([
              r.desglose.video4k.capturadas && `🎬 ${r.desglose.video4k.capturadas} 4K`,
              r.desglose.reel.capturadas && `🎞️ ${r.desglose.reel.capturadas} reel`,
              r.desglose.sinDesglose.capturadas &&
                `≈ ${r.desglose.sinDesglose.capturadas} sin desglosar`,
            ]),
            editadas: join([
              r.desglose.video4k.editadas && `🎬 ${r.desglose.video4k.editadas} 4K`,
              r.desglose.reel.editadas && `🎞️ ${r.desglose.reel.editadas} reel`,
              r.desglose.sinDesglose.editadas &&
                `≈ ${r.desglose.sinDesglose.editadas} sin desglosar`,
              r.desglose.cnp && `🗂️ ${r.desglose.cnp} CNP`,
            ]),
          })}
        />
        <RankingTable
          title="Fotos"
          subtitle="Capturadas y editadas por persona en pautas realizadas."
          rows={fotos}
          usersById={usersById}
          empty="Aún no hay fotos capturadas ni editadas este mes."
        />
      </div>
      <div className="bg-white border border-[#e0ddd4] rounded-xl p-5">
        <div className="text-[11px] font-mono uppercase tracking-wide text-[#FFB800] mb-0.5">
          ↓ alimenta el indicador «6. Nº Piezas vs Piezas editadas» del reporte
        </div>
        <h2 className="text-[16px] font-semibold text-[#222] mb-0.5">
          Piezas totales vs. editadas — por línea
        </h2>
        <p className="text-[12px] text-[#999] mb-3">
          Haz clic en una línea para ver sus pautas del mes.
        </p>
        {byLine.length === 0 ? (
          <p className="text-[13px] text-[#a29b8c]">Sin piezas registradas este mes.</p>
        ) : (
          <div className="space-y-2.5">
            {byLine.map((l) => {
              const pct = l.totales ? Math.min(100, Math.round((l.editadas / l.totales) * 100)) : 0
              const { av, foto, sinDesglose } = l.porGrupo
              const desglose = join([
                av.totales && `Video/Reel ${av.editadas}/${av.totales}`,
                foto.totales && `Foto ${foto.editadas}/${foto.totales}`,
                sinDesglose.totales &&
                  `Sin desglosar ${sinDesglose.editadas}/${sinDesglose.totales}`,
                `${realizadasPorLinea(l.lineId)} realizadas`,
              ])
              return (
                <button
                  type="button"
                  key={l.lineId}
                  onClick={() => onSelectLine?.(l.lineId)}
                  className="w-full text-left rounded-lg px-1 py-1 -mx-1 hover:bg-[#faf9f5]"
                  aria-label={`Ver pautas de ${l.label}`}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-[120px] text-[13px] font-medium text-[#333] truncate">
                      {l.label}
                    </div>
                    <div className="flex-1 h-[10px] bg-[#f0ede4] rounded-full overflow-hidden">
                      <div
                        className="h-full bg-[#1f8a43] rounded-full"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <div className="w-[92px] text-right text-[12px] font-mono text-[#555]">
                      {l.editadas} / {l.totales} ed.
                    </div>
                  </div>
                  {desglose && (
                    <div className="text-[11px] text-[#a29b8c] ml-[132px] mt-0.5">{desglose}</div>
                  )}
                </button>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

function join(parts) {
  const s = parts.filter(Boolean).join(' · ')
  return s || null
}
