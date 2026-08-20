import {
  LIFECYCLE_LABELS,
  GRILLA_STATUS_LABELS,
  formatCodes,
  formatTime12,
  formatDayShort,
  resourceNames,
  grillaStatus,
} from '../../utils/audiovisual'

// Misma paleta de status que los puntos del calendario (AvCalendar.jsx → DOT_COLOR),
// pero como pill de texto+fondo para el header del modal.
const STATUS_BADGE = {
  solicitada: { bg: '#fdf4de', text: '#9a7400' },
  programada: { bg: '#e6f0ff', text: '#2563eb' },
  realizada: { bg: '#e9f7ec', text: '#1f8a43' },
  declinada: { bg: '#f2f0ea', text: '#888' },
}

/**
 * Tarjeta de detalle solo-lectura de una pauta — se abre al hacer clic en el calendario
 * (mismo patrón que la tarjeta del mockup: información completa, edición en la tabla).
 */
export default function PautaDetailCard({ pauta, usersById, onClose }) {
  if (!pauta) return null
  const codes = formatCodes(pauta) || '—'
  const recs = resourceNames(pauta, usersById)
  const rec = recs.length ? recs.join(', ') : 'sin asignar'
  const status = grillaStatus(pauta)
  const badge = STATUS_BADGE[pauta.status] ?? STATUS_BADGE.declinada
  const attendees = (pauta.attendee_ids ?? [])
    .map((id) => usersById.get(id))
    .filter(Boolean)
    .map((u) => `${u.first_name ?? ''} ${u.last_name ?? ''}`.trim())

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-20 backdrop-blur-sm bg-black/30"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-[400px] overflow-hidden">
        <div className="px-4 py-3.5 border-b border-[#ece9df] flex items-start justify-between bg-[#faf9f5]">
          <div>
            <div className="text-[17px] font-bold text-[#111] leading-tight">
              {pauta.client_name ?? '—'}
            </div>
            <span
              className="inline-block mt-1.5 px-2 py-0.5 rounded-full text-[11px] font-mono font-semibold uppercase tracking-wide"
              style={{ background: badge.bg, color: badge.text }}
            >
              {LIFECYCLE_LABELS[pauta.status]}
            </span>
          </div>
          <button
            onClick={onClose}
            className="text-[#999] hover:text-[#111] hover:bg-[#ece9df] w-7 h-7 rounded-full flex items-center justify-center transition-colors text-[20px] leading-none"
            aria-label="Cerrar"
          >
            &times;
          </button>
        </div>
        <div className="px-4 py-3.5 space-y-2.5">
          <DetailRow
            icon={<IconCamera />}
            text={`(${codes}: ${rec.toUpperCase()})${pauta.tema ? ` · ${pauta.tema}` : ''}`}
          />
          <DetailRow
            icon={<IconCalendar />}
            text={pauta.pauta_date ? formatDayShort(pauta.pauta_date) : 'Por agendar'}
          />
          {(pauta.salida || pauta.llegada) && (
            <DetailRow
              icon={<IconClock />}
              text={`Salida ${formatTime12(pauta.salida) || '—'} · Llegada ${formatTime12(pauta.llegada) || '—'}`}
            />
          )}
          <DetailRow icon={<IconMapPin />} text={pauta.place || 'Por definir'} />
          {attendees.length > 0 && (
            <DetailRow icon={<IconUsers />} text={`Asiste: ${attendees.join(', ')}`} />
          )}
          <DetailRow
            icon={<IconClipboardCheck />}
            text={`Grilla: ${GRILLA_STATUS_LABELS[status]}`}
          />
        </div>
        <div className="px-4 py-2.5 border-t border-[#ece9df] text-[11.5px] text-[#a29b8c] font-mono">
          Solo lectura — edítala en la tabla de seguimiento.
        </div>
      </div>
    </div>
  )
}

function DetailRow({ icon, text }) {
  return (
    <div className="flex items-center gap-2.5 text-[13.5px] text-[#333]">
      <span className="w-7 h-7 rounded-full bg-[#f5f3eb] text-[#777] flex items-center justify-center shrink-0">
        {icon}
      </span>
      <span className="leading-snug">{text}</span>
    </div>
  )
}

// ─── Iconos (SVG inline, mismo estilo que las flechas de AvCalendar.jsx) ───────────────

function IconCamera() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
    >
      <path
        d="M15 8l4.5-2.5A1 1 0 0 1 21 6.4v11.2a1 1 0 0 1-1.5.9L15 16"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <rect
        x="3"
        y="6"
        width="12"
        height="12"
        rx="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function IconCalendar() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
    >
      <rect
        x="3"
        y="5"
        width="18"
        height="16"
        rx="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M3 10h18M8 3v4M16 3v4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function IconClock() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
    >
      <circle cx="12" cy="12" r="9" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M12 7v5l3.5 2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function IconMapPin() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
    >
      <path
        d="M12 21s7-6.2 7-11.5a7 7 0 1 0-14 0C5 14.8 12 21 12 21z"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="9.5" r="2.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function IconUsers() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
    >
      <circle cx="9" cy="8" r="3" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M2.5 20a6.5 6.5 0 0 1 13 0" strokeLinecap="round" strokeLinejoin="round" />
      <path
        d="M16.5 5.5a3 3 0 0 1 0 5.9M20 20a5.7 5.7 0 0 0-4-5.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function IconClipboardCheck() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
    >
      <rect
        x="5"
        y="4"
        width="14"
        height="17"
        rx="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M9 4V3a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v1"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M9 13l2 2 4-4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
