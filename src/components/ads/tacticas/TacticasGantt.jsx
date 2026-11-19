import { useMemo, useState } from 'react'
import { fmtDate } from '../campaignSpendApi'
import {
  daysLabel,
  daysLeft,
  durationLabel,
  ganttDayPct,
  ganttRows,
  ganttWindow,
} from '../../../utils/tacticas'

// Clases literales: Tailwind no genera CSS para clases armadas por interpolación.
const TONES = {
  red: 'bg-[#e05252] text-white border-[#c03a3a]',
  yellow: 'bg-[#FFB800] text-[#111] border-[#e6a600]',
  green: 'bg-[#4caf63] text-white border-[#3a9150]',
  programada: 'bg-white text-[#1e5e24] border-[#4caf63] border-dashed',
  done: 'bg-[#d9d6cc] text-[#555] border-[#c9c5b9]',
}

const TONE_TEXT = {
  red: 'vence pronto',
  yellow: 'vence en 10 días o menos',
  green: 'vigente',
  programada: 'programada',
  done: 'terminada',
}

const LEGEND = [
  { tone: 'red', label: '≤ 3 días o vencida' },
  { tone: 'yellow', label: '≤ 10 días' },
  { tone: 'green', label: 'Vigente' },
  { tone: 'programada', label: 'Programada' },
  { tone: 'done', label: 'Terminada' },
]

/**
 * Diagrama de Gantt de la vista Vigentes: una fila por marca y una barra por táctica, con la
 * línea de "hoy". Muestra un mes atrás y tres adelante; las flechas corren la ventana de a un
 * mes. Clic en una barra → detalle de la táctica; clic en la marca → filtra por esa marca.
 *
 * @param {object}   props
 * @param {Array}    props.brands      — marcas a mostrar (ya filtradas)
 * @param {Array}    props.campaigns   — tácticas de esas marcas
 * @param {string}   props.today       — hoy en Caracas (YYYY-MM-DD)
 * @param {Function} props.onSelect    — (campaign) => void, abre el detalle
 * @param {Function} props.onOpenBrand — (clientId) => void, filtra por la marca
 */
export default function TacticasGantt({ brands, campaigns, today, onSelect, onOpenBrand }) {
  const [offset, setOffset] = useState(0)
  const win = useMemo(() => ganttWindow(today, offset), [today, offset])
  const rows = useMemo(
    () => ganttRows(brands, campaigns, win, today),
    [brands, campaigns, win, today],
  )
  const todayPct = ganttDayPct(today, win)

  const navBtn =
    'w-8 h-8 rounded-lg border border-[#e0ddd4] bg-white text-[#555] hover:border-[#FFB800] hover:text-[#111] transition-colors'

  return (
    <section
      aria-label="Diagrama de tácticas por marca"
      className="bg-white border border-[#e0ddd4] rounded-2xl p-4 mb-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <h3 className="text-[17px] font-bold text-[#111]">Tácticas por marca</h3>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            className={navBtn}
            aria-label="Mes anterior"
            onClick={() => setOffset((o) => o - 1)}
          >
            ‹
          </button>
          {offset !== 0 && (
            <button
              type="button"
              onClick={() => setOffset(0)}
              className="h-8 px-3 rounded-lg border border-[#e0ddd4] bg-white text-[13px] font-semibold text-[#555] hover:border-[#FFB800] hover:text-[#111] transition-colors"
            >
              Hoy
            </button>
          )}
          <button
            type="button"
            className={navBtn}
            aria-label="Mes siguiente"
            onClick={() => setOffset((o) => o + 1)}
          >
            ›
          </button>
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="text-center py-8 text-[15px] text-[#888]">
          Sin marcas para los filtros aplicados
        </p>
      ) : (
        <div className="overflow-x-auto">
          <div className="min-w-[720px]">
            {/* Encabezado de meses */}
            <div className="flex">
              <div className="w-[180px] shrink-0" />
              <div className="relative flex-1 h-7 border-b border-[#ece9df]">
                {win.months.map((m) => (
                  <div
                    key={m.month}
                    className="absolute top-0 h-full border-l border-[#ece9df] pl-1.5 text-[12px] font-mono font-bold tracking-[0.08em] uppercase text-[#888]"
                    style={{ left: `${m.leftPct}%`, width: `${m.widthPct}%` }}
                  >
                    {m.label}
                  </div>
                ))}
              </div>
            </div>

            {/* Filas */}
            <ul>
              {rows.map(({ brand, bars, nextEnd }) => (
                <li key={brand.id} className="flex items-center border-b border-[#f3f1ea]">
                  <div className="w-[180px] shrink-0 pr-3 py-1.5">
                    <button
                      type="button"
                      onClick={() => onOpenBrand(brand.id)}
                      className="text-[14px] font-semibold text-[#111] hover:underline text-left truncate max-w-full block"
                      title={`Ver la ficha de ${brand.name}`}
                    >
                      {brand.name}
                    </button>
                  </div>
                  <div className="relative flex-1 h-9">
                    {win.months.map((m) => (
                      <div
                        key={m.month}
                        aria-hidden="true"
                        className="absolute top-0 h-full border-l border-[#f3f1ea]"
                        style={{ left: `${m.leftPct}%` }}
                      />
                    ))}
                    {todayPct != null && (
                      <div
                        aria-hidden="true"
                        className="absolute top-0 h-full w-[2px] bg-[#111] z-10"
                        style={{ left: `${todayPct}%` }}
                      />
                    )}
                    {!nextEnd && (
                      <span className="absolute inset-y-0 right-2 flex items-center text-[12.5px] font-semibold text-[#1565c0]">
                        Sin táctica vigente
                      </span>
                    )}
                    {bars.map(({ campaign: c, bar, tone }) => {
                      const extra =
                        tone === 'done' || tone === 'programada'
                          ? TONE_TEXT[tone]
                          : daysLabel(daysLeft(c, today))
                      const label = `${c.name}: ${fmtDate(c.start_date)} → ${fmtDate(
                        c.end_date,
                      )} (${durationLabel(c)}) · ${extra}`
                      return (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => onSelect(c)}
                          aria-label={label}
                          title={label}
                          className={`absolute top-1.5 h-6 border text-[12px] font-semibold px-1.5 truncate text-left hover:brightness-95 transition ${
                            TONES[tone]
                          } ${bar.cutStart ? 'rounded-l-none' : 'rounded-l-md'} ${
                            bar.cutEnd ? 'rounded-r-none' : 'rounded-r-md'
                          }`}
                          style={{ left: `${bar.leftPct}%`, width: `${bar.widthPct}%` }}
                        >
                          {c.name}
                        </button>
                      )
                    })}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-x-4 gap-y-1.5 mt-3 text-[12.5px] text-[#666]">
        {LEGEND.map((l) => (
          <span key={l.tone} className="flex items-center gap-1.5">
            <span className={`inline-block w-4 h-2.5 rounded-sm border ${TONES[l.tone]}`} />
            {l.label}
          </span>
        ))}
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-[2px] h-3 bg-[#111]" />
          Hoy
        </span>
      </div>
    </section>
  )
}
