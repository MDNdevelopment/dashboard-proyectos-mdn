import { useState } from 'react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import {
  generateDayAgendaText,
  formatCodes,
  formatTime12,
  resourceNames,
  grillaStatus,
} from '../../utils/audiovisual'
import WhatsAppTextPanel from './WhatsAppTextPanel'

const DOT_COLOR = {
  solicitada: 'bg-[#d99a00]',
  programada: 'bg-blue-500',
  realizada: 'bg-green-600',
  declinada: 'bg-[#bbb]',
}

const pad = (n) => String(n).padStart(2, '0')

function dateKey(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/**
 * Modal de detalle de un día del calendario: lista las pautas agendadas de esa
 * fecha (mismo filtro que AvCalendar: 'programada'/'realizada') y permite generar
 * el mensaje de WhatsApp de ese día en específico. Se abre al hacer clic en el día
 * o en el "+N más" — antes ese clic caía en `onDayClick` y creaba una pauta nueva
 * sin querer; ahora ambos casos solo abren esta vista de lectura.
 */
export default function DayPautasModal({ date, pautas, usersById, onPautaClick, onClose }) {
  const [view, setView] = useState('list')
  const key = dateKey(date)
  const dayPautas = pautas
    .filter((p) => p.pauta_date === key && (p.status === 'programada' || p.status === 'realizada'))
    .sort((a, b) => (a.salida || '').localeCompare(b.salida || ''))
  const text = generateDayAgendaText(key, pautas, usersById)

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-sm bg-black/30"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="bg-white rounded-2xl border border-[#e8e5db] w-full max-w-lg max-h-[85vh] flex flex-col shadow-2xl">
        <div className="px-6 py-5 border-b border-[#eeebe0] flex items-start justify-between flex-shrink-0">
          <h2 className="text-[16px] font-semibold text-[#111] capitalize">
            {format(date, "EEEE d 'de' MMMM", { locale: es })}
          </h2>
          <button
            onClick={onClose}
            aria-label="Cerrar"
            className="w-8 h-8 flex items-center justify-center rounded-lg text-[#bbb] hover:text-[#555] hover:bg-[#f5f3eb] transition-colors"
          >
            <svg
              width="14"
              height="14"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2.5}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="overflow-y-auto flex-1 px-6 py-5">
          {view === 'wa' ? (
            <WhatsAppTextPanel text={text} height={280} />
          ) : dayPautas.length === 0 ? (
            <p className="text-[13px] text-[#bbb]">Sin pautas agendadas este día.</p>
          ) : (
            <ul className="space-y-2">
              {dayPautas.map((p) => (
                <PautaRow
                  key={p.id}
                  pauta={p}
                  usersById={usersById}
                  onClick={() => onPautaClick(p)}
                />
              ))}
            </ul>
          )}
        </div>

        <div className="flex gap-3 px-6 py-4 border-t border-[#eeebe0] flex-shrink-0">
          {view === 'wa' ? (
            <button
              onClick={() => setView('list')}
              className="flex-1 px-3 py-1.5 border border-[#e0ddd4] text-[#666] rounded-lg text-[13.5px] font-semibold hover:bg-[#f5f3eb] transition-colors"
            >
              Volver
            </button>
          ) : (
            <>
              <button
                onClick={onClose}
                className="flex-1 px-3 py-1.5 border border-[#e0ddd4] text-[#666] rounded-lg text-[13.5px] font-semibold hover:bg-[#f5f3eb] transition-colors"
              >
                Cerrar
              </button>
              <button
                onClick={() => setView('wa')}
                className="flex-1 px-3 py-1.5 text-[#111] bg-[#25D366]/15 border border-[#25D366]/40 rounded-lg text-[13.5px] font-semibold hover:bg-[#25D366]/25 transition-colors"
              >
                Generar mensaje WhatsApp
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function PautaRow({ pauta, usersById, onClick }) {
  const codes = formatCodes(pauta) || '—'
  const recs = resourceNames(pauta, usersById)
  const rec = recs.length ? recs.join(', ') : 'sin asignar'
  const status = grillaStatus(pauta)
  const border = status === 'incumple' ? 'border-red-300' : 'border-[#ece9df]'

  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className={`w-full text-left flex items-start gap-2.5 rounded-xl border bg-[#faf9f5] px-3.5 py-3 hover:bg-[#f0ede3] transition-colors ${border}`}
      >
        <span
          className={`w-[8px] h-[8px] rounded-full flex-shrink-0 mt-1.5 ${DOT_COLOR[pauta.status]}`}
        />
        <div className="min-w-0 flex-1">
          <p className="text-[13.5px] font-semibold text-[#222] truncate">
            {pauta.client_name ?? 'Sin cliente'}
          </p>
          <p className="text-[12px] text-[#777] truncate">
            ({codes}: {rec}){pauta.salida ? ` · ${formatTime12(pauta.salida)}` : ''}
          </p>
        </div>
      </button>
    </li>
  )
}
