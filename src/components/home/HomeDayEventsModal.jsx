import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { Avatar } from '../tareas/UserPickerSingle'
import { EVENT_TYPES } from '../../utils/homeCalendar'
import EventTypeIcon from '../empresa/EventTypeIcon'

/**
 * Modal de detalle de un día del calendario "Fechas del equipo y clientes" (ver
 * HomeDatesCalendar.jsx). Calcado de empresa/EmployeeDayEventsModal.jsx. Las filas son de
 * solo lectura (sin navegar a la ficha del empleado ni del cliente) — el clic en una card
 * del calendario solo debe mostrar la información del evento.
 */
export default function HomeDayEventsModal({ date, events, onClose }) {
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
          {events.length === 0 ? (
            <p className="text-[13px] text-[#bbb]">Sin fechas importantes este día.</p>
          ) : (
            <ul className="space-y-2">
              {events.map((ev) => (
                <EventRow key={ev.id} event={ev} />
              ))}
            </ul>
          )}
        </div>

        <div className="flex gap-3 px-6 py-4 border-t border-[#eeebe0] flex-shrink-0">
          <button
            onClick={onClose}
            className="flex-1 px-3 py-1.5 border border-[#e0ddd4] text-[#666] rounded-lg text-[13.5px] font-semibold hover:bg-[#f5f3eb] transition-colors"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  )
}

/**
 * Un evento es de empleado (`employeeId`/`employeeName`) o de cliente (`clientId`/
 * `clientName`) — nunca ambos. El avatar (foto o iniciales) solo aplica a personas del
 * equipo; las marcas/clientes no tienen foto ni círculo de iniciales.
 */
function EventRow({ event }) {
  const meta = EVENT_TYPES[event.type]
  const name = event.employeeName ?? event.clientName ?? ''
  const isEmployee = event.employeeId != null
  const user = {
    user_id: event.employeeId,
    first_name: name.split(' ')[0],
    last_name: name.split(' ').slice(1).join(' '),
    avatar_url: event.avatarUrl ?? null,
  }
  return (
    <li className="flex items-start gap-2.5 rounded-xl border border-[#ece9df] bg-[#faf9f5] px-3.5 py-3">
      <div className="min-w-0 flex-1">
        <p className="text-[13.5px] font-semibold text-[#222] truncate">{event.label}</p>
        <p
          className={`inline-flex items-center gap-1 mt-1 rounded px-1.5 py-0.5 border text-[10.5px] font-medium ${meta.pill}`}
        >
          <EventTypeIcon type={event.type} className={meta.iconColor} />
          {meta.label}
        </p>
        {event.detail && <p className="text-[11.5px] text-[#999] mt-1">{event.detail}</p>}
      </div>
      {isEmployee && <Avatar user={user} size={40} />}
    </li>
  )
}
