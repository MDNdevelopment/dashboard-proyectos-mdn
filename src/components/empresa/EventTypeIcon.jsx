/**
 * Icono por tipo de evento del calendario de fechas del equipo (ver
 * utils/employeeCalendar.js#EVENT_TYPES). Compartido entre EmployeeDatesCalendar (pills +
 * leyenda) y EmployeeDayEventsModal, para que el mismo tipo se reconozca siempre con el
 * mismo dibujo. Usa `currentColor`: el color lo pone el className del llamador
 * (EVENT_TYPES[type].iconColor).
 */
export default function EventTypeIcon({ type, size = 11, className = '' }) {
  const props = {
    width: size,
    height: size,
    viewBox: '0 0 14 14',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: '1.4',
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    className: `flex-shrink-0 ${className}`,
  }

  switch (type) {
    case 'birthday':
      // Pastel con velas
      return (
        <svg {...props}>
          <path d="M1.5 8.5h11v4h-11z" />
          <path d="M1.5 8.5c1.5-1.2 3-1.2 4.5 0s3 1.2 4.5 0 1.5-1.2 2-1.2" />
          <line x1="4" y1="5.5" x2="4" y2="8" />
          <line x1="7" y1="5.5" x2="7" y2="8" />
          <line x1="10" y1="5.5" x2="10" y2="8" />
          <path d="M4 2.5c-.6.6-.6 1.4 0 2M7 2.5c-.6.6-.6 1.4 0 2M10 2.5c-.6.6-.6 1.4 0 2" />
        </svg>
      )
    case 'anniversary':
      // Estrella
      return (
        <svg {...props}>
          <path d="M7 1.5 8.7 5l3.8.5-2.75 2.7.65 3.8L7 10.2l-3.4 1.8.65-3.8L1.5 5.5 5.3 5z" />
        </svg>
      )
    case 'probation_end':
      // Reloj de arena
      return (
        <svg {...props}>
          <path d="M3 1.5h8M3 12.5h8" />
          <path d="M3.5 1.5v2.2c0 1 .5 1.9 1.4 2.4L7 7l2.1-1c.9-.5 1.4-1.4 1.4-2.4V1.5" />
          <path d="M3.5 12.5v-2.2c0-1 .5-1.9 1.4-2.4L7 7l2.1 1c.9.5 1.4 1.4 1.4 2.4v2.2" />
        </svg>
      )
    case 'vacation_start':
      // Avión despegando
      return (
        <svg {...props}>
          <path d="M2 8.5 12 3.5c.8-.4 1.5.3 1.1 1.1L8.5 12 7 9.5 4.5 8z" />
          <path d="M7 9.5 2 8.5" />
        </svg>
      )
    case 'vacation_end':
      // Maletín (regreso a la oficina)
      return (
        <svg {...props}>
          <rect x="1.5" y="4.5" width="11" height="7.5" rx="1.2" />
          <path d="M5 4.5v-1a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v1" />
          <line x1="1.5" y1="8" x2="12.5" y2="8" />
        </svg>
      )
    default:
      return null
  }
}
