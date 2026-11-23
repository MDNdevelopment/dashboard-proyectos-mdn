import { useEffect } from 'react'
import TacticasPorMarca from './TacticasPorMarca'

/**
 * Ventana emergente con la ficha de una marca (`TacticasPorMarca`), como el modal de una tarea.
 * La abre `TacticasView` cuando hay `?client=<id>` en la URL; cerrarla quita el parámetro.
 * El detalle o el formulario de una táctica se abren por encima (los monta `AdsPage` después).
 *
 * @param {object}   props
 * @param {Function} props.onClose — cierra la ventana
 * Resto de props: las de `TacticasPorMarca`.
 */
export default function TacticasMarcaModal({ onClose, ...fichaProps }) {
  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const name = fichaProps.clientsById.get(fichaProps.clientId)?.name ?? 'Marca'

  return (
    // Clic en el fondo cierra (el teclado ya tiene Escape); un clic dentro de la ficha no.
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
        aria-label={`Ficha de ${name}`}
        className="main-bg rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col"
      >
        <div className="flex items-center justify-between px-5 pt-4 pb-2 flex-shrink-0">
          <p className="text-[12px] font-mono font-bold tracking-[0.14em] uppercase text-[#888]">
            Ficha de la marca
          </p>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar ficha"
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
        <div className="overflow-y-auto px-5 pb-5">
          <TacticasPorMarca {...fichaProps} />
        </div>
      </div>
    </div>
  )
}
