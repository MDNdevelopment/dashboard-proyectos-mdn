import { useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'

const MONTHS = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
]

/**
 * Modal de recordatorio de cierre de reportes: se muestra a las jefas de
 * línea del día 1 al 5 del mes mientras tengan el reporte del mes anterior
 * sin cerrar. Ver `src/hooks/useReportCloseReminder.js`.
 */
export default function ReportCloseReminderModal({ show, pending, period, daysLeft, onClose }) {
  const doneRef = useRef(null)

  useEffect(() => {
    if (!show) return
    const h = (e) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', h)
    const t = setTimeout(() => doneRef.current?.focus(), 50)
    return () => {
      clearTimeout(t)
      document.removeEventListener('keydown', h)
    }
  }, [show, onClose])

  if (!show) return null

  const monthLabel = MONTHS[period.month - 1]
  const title =
    daysLeft === 0 ? 'Tu reporte cierra hoy' : `Tu reporte de ${monthLabel} cierra el día 5`

  return (
    <div
      className="fixed inset-0 bg-black/25 backdrop-blur-[3px] flex items-center justify-center z-50 p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Cierre de reportes"
        className="bg-white rounded-2xl border border-[#e8e5db] w-full max-w-md shadow-2xl"
      >
        <div className="px-6 py-5 border-b border-[#eeebe0]">
          <h2 className="text-[18px] font-semibold text-[#111] tracking-[-0.01em]">{title}</h2>
          <p className="text-[14px] text-[#999] mt-0.5">
            {daysLeft === 0
              ? 'Hoy se cierra automáticamente, tal como esté.'
              : `Se cierra automáticamente en ${daysLeft} día${daysLeft === 1 ? '' : 's'} si no lo marcás como listo antes.`}
          </p>
        </div>

        <div className="px-6 py-5 space-y-2">
          {pending.map((line) => (
            <Link
              key={line.id}
              to={`/reportes/linea/${line.id}?tab=operaciones&year=${period.year}&month=${period.month}`}
              onClick={onClose}
              className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl border border-[#e0ddd4] hover:bg-[#f5f3eb] transition-colors"
            >
              <span
                className="w-3 h-3 rounded-full flex-shrink-0"
                style={{ background: line.color }}
              />
              <span className="text-[14px] font-semibold text-[#222]">{line.name}</span>
              <span className="ml-auto text-[12px] font-mono text-[#bbb]">
                {monthLabel} {period.year}
              </span>
            </Link>
          ))}
        </div>

        <div className="px-6 py-4 border-t border-[#eeebe0]">
          <button
            ref={doneRef}
            onClick={onClose}
            className="w-full px-4 py-2.5 bg-[#f5f3eb] text-[#666] rounded-xl text-[14px] font-semibold hover:bg-[#eeebe0] transition-colors"
          >
            Después
          </button>
        </div>
      </div>
    </div>
  )
}
