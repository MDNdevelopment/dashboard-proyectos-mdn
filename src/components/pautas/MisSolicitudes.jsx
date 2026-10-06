import { useState } from 'react'
import { misSolicitudes, hitosPauta, formatDayShort, formatTime12 } from '../../utils/audiovisual'

const MAX_VISIBLE = 4

/**
 * Tira "Mis solicitudes" para quien pide pautas: cada una con su mini-timeline
 * Solicitada → Agendada → Realizada (o Declinada) y la fecha de cada hito, para saber en
 * qué va sin preguntar. Las realizadas de más de un mes no se listan.
 */
export default function MisSolicitudes({ pautas, userId, today = new Date(), onPautaClick }) {
  const [todas, setTodas] = useState(false)
  const limite = new Date(today)
  limite.setDate(limite.getDate() - 30)
  const corte = limite.toISOString().slice(0, 10)
  const mias = misSolicitudes(pautas, userId).filter(
    (p) => p.status !== 'realizada' || !p.pauta_date || p.pauta_date >= corte,
  )
  if (mias.length === 0) return null
  const visibles = todas ? mias : mias.slice(0, MAX_VISIBLE)

  return (
    <section
      className="rounded-xl border border-[#ece9df] bg-white px-4 py-3"
      aria-label="Mis solicitudes"
      data-tour="mis-solicitudes"
    >
      <div className="flex items-center justify-between gap-2 mb-2">
        <h3 className="text-[11.5px] font-mono font-bold uppercase tracking-[0.1em] text-[#aaa]">
          Mis solicitudes
        </h3>
        {mias.length > MAX_VISIBLE && (
          <button
            type="button"
            onClick={() => setTodas((v) => !v)}
            className="text-[12px] font-semibold text-[#2563eb] hover:underline"
          >
            {todas ? 'Ver menos' : `Ver las ${mias.length}`}
          </button>
        )}
      </div>
      <ul className="divide-y divide-[#f0ede4]">
        {visibles.map((p) => (
          <li key={p.id}>
            <button
              type="button"
              onClick={() => onPautaClick?.(p)}
              className="w-full text-left py-2 flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4 hover:bg-[#faf9f5] -mx-1 px-1 rounded-lg"
              aria-label={`Mi solicitud ${p.client_name ?? ''}`}
            >
              <span className="min-w-0 sm:w-[220px]">
                <span className="block text-[13.5px] font-semibold text-[#111] truncate">
                  {p.client_name ?? 'Sin cliente'}
                </span>
                <span className="block text-[12px] text-[#888] truncate">
                  {p.tema || 'Sin tema'}
                  {p.pauta_date
                    ? ` · ${formatDayShort(p.pauta_date)}${p.salida ? ` ${formatTime12(p.salida)}` : ''}`
                    : ' · sin fecha fija'}
                </span>
              </span>
              <Timeline hitos={hitosPauta(p)} />
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}

function Timeline({ hitos }) {
  return (
    <ol className="flex items-center gap-1 flex-1" aria-label="Avance">
      {hitos.map((h, i) => {
        const declinada = h.key === 'declinada'
        return (
          <li key={h.key} className="flex items-center gap-1 min-w-0">
            <span
              className={`inline-flex items-center justify-center w-4 h-4 rounded-full text-[9px] font-bold ${
                declinada
                  ? 'bg-[#fdecec] text-[#c0392b]'
                  : h.done
                    ? 'bg-[#1f8a43] text-white'
                    : 'bg-[#ece9df] text-[#bbb]'
              }`}
              aria-hidden="true"
            >
              {declinada ? '✕' : h.done ? '✓' : ''}
            </span>
            <span
              className={`text-[11.5px] whitespace-nowrap ${
                h.done
                  ? declinada
                    ? 'text-[#c0392b]'
                    : 'text-[#111] font-semibold'
                  : 'text-[#bbb]'
              }`}
            >
              {h.label}
              {h.date && h.done && (
                <span className="font-mono text-[10.5px] text-[#999]">
                  {' '}
                  {formatDayShort(h.date)}
                </span>
              )}
            </span>
            {i < hitos.length - 1 && <span className="w-4 h-px bg-[#e0ddd4] mx-0.5" />}
          </li>
        )
      })}
    </ol>
  )
}
