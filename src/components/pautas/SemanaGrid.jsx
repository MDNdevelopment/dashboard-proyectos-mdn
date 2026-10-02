import PautaCard from './PautaCard'
import { parseISODate } from '../../utils/audiovisual'

const DOW = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']

/** Seis columnas (lun–sáb) con las tarjetas de cada día. */
export default function SemanaGrid({ days, byDay, piezasByPauta, usersById, today, onPautaClick }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2" data-testid="semana-grid">
      {days.map((iso, i) => {
        const d = parseISODate(iso)
        const esHoy = iso === today
        const items = byDay.get(iso) ?? []
        return (
          <div
            key={iso}
            className={`rounded-xl border p-2 min-h-[120px] ${
              esHoy ? 'border-[#FFB800] bg-[#fffdf5]' : 'border-[#ece9df] bg-[#fcfbf7]'
            }`}
            aria-label={`${DOW[i]} ${d.getDate()}`}
          >
            <div className="flex items-baseline justify-between mb-2">
              <span className="text-[11px] font-mono font-bold uppercase tracking-widest text-[#999]">
                {DOW[i]}
              </span>
              <span
                className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-[13px] font-semibold ${
                  esHoy ? 'bg-[#FFB800] text-[#111]' : 'text-[#333]'
                }`}
              >
                {d.getDate()}
              </span>
            </div>
            <div className="space-y-1.5">
              {items.length === 0 ? (
                <p className="text-[11.5px] text-[#c7c2b4] text-center py-4">—</p>
              ) : (
                items.map((p) => (
                  <PautaCard
                    key={p.id}
                    pauta={p}
                    piezas={piezasByPauta?.get(p.id) ?? []}
                    usersById={usersById}
                    onClick={onPautaClick}
                  />
                ))
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
