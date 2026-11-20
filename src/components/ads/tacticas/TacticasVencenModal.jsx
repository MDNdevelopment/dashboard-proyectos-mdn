import { useEffect } from 'react'
import ClientCell from '../ClientCell'
import DaysPill from './DaysPill'
import { daysLeft, daysPillTone } from '../../../utils/tacticas'

/** Clave de sessionStorage: el aviso se muestra una vez por sesión. */
export const VENCEN_SEEN_KEY = 'mdn_tacticas_vencen_visto'

export function vencenSeen() {
  try {
    return window.sessionStorage.getItem(VENCEN_SEEN_KEY) === '1'
  } catch {
    return false
  }
}

export function markVencenSeen() {
  try {
    window.sessionStorage.setItem(VENCEN_SEEN_KEY, '1')
  } catch {
    // Storage bloqueado (Safari en privado): el aviso puede volver a salir; no es grave.
  }
}

/**
 * Ventana emergente del Dashboard de Tácticas con las vigentes que vencen en ≤ 10 días.
 * Lleva a Base filtrada por "Urgentes" o "Por vencer". `TacticasView` la abre una vez por sesión.
 *
 * @param {object}   props
 * @param {Array}    props.campaigns  — vigentes que vencen pronto (`vencenPronto`), ya ordenadas
 * @param {string}   props.today
 * @param {Map}      props.clientsById
 * @param {Function} props.onSelect   — (campaign) => void, abre el detalle
 * @param {Function} props.onGoToBase — (estado) => void
 * @param {Function} props.onClose
 */
export default function TacticasVencenModal({
  campaigns,
  today,
  clientsById,
  onSelect,
  onGoToBase,
  onClose,
}) {
  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const urgentes = campaigns.filter((c) => daysPillTone(daysLeft(c, today)) === 'red').length
  const porVencer = campaigns.length - urgentes

  return (
    // Clic en el fondo cierra (el teclado ya tiene Escape); un clic dentro de la ventana no.
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/25 backdrop-blur-[3px]"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="tacticas-vencen-titulo"
        className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[85vh] flex flex-col"
      >
        <div className="flex items-start justify-between gap-3 px-5 pt-5 pb-3">
          <div>
            <p className="text-[12px] font-mono font-bold tracking-[0.14em] uppercase text-[#c77700]">
              Vencen pronto
            </p>
            <h2 id="tacticas-vencen-titulo" className="text-[19px] font-bold text-[#111]">
              {campaigns.length}{' '}
              {campaigns.length === 1
                ? 'táctica vence en 10 días o menos'
                : 'tácticas vencen en 10 días o menos'}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar aviso"
            className="text-[#999] hover:text-[#111] transition-colors p-1"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M3 3l10 10M13 3L3 13" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <ul className="overflow-y-auto px-3 pb-2">
          {campaigns.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => onSelect(c)}
                className="w-full flex items-center justify-between gap-3 px-2 py-2 rounded-xl text-left hover:bg-[#f7f5ee] transition-colors"
              >
                <span className="min-w-0">
                  <span className="block text-[15px] font-semibold text-[#111] truncate">
                    <ClientCell name={c.client} logoUrl={clientsById?.get(c.client_id)?.logo_url} />
                  </span>
                  <span className="block text-[13px] text-[#888] truncate">{c.name}</span>
                </span>
                <DaysPill days={daysLeft(c, today)} />
              </button>
            </li>
          ))}
        </ul>

        <div className="flex flex-wrap gap-2 px-5 py-4 border-t border-[#f0ede3]">
          {urgentes > 0 && (
            <button
              type="button"
              onClick={() => onGoToBase('urgentes')}
              className="flex-1 text-[14px] font-bold px-3 py-2 rounded-xl bg-[#e05252] text-white hover:bg-[#c94444] transition-colors whitespace-nowrap"
            >
              Ver urgentes en Base ({urgentes})
            </button>
          )}
          {porVencer > 0 && (
            <button
              type="button"
              onClick={() => onGoToBase('por_vencer')}
              className="flex-1 text-[14px] font-bold px-3 py-2 rounded-xl bg-[#FFB800] text-[#111] hover:bg-[#e6a600] transition-colors whitespace-nowrap"
            >
              Ver por vencer en Base ({porVencer})
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
