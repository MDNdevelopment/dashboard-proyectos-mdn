import { useEffect } from 'react'

/**
 * Diálogo de confirmación de borrado reutilizable: nombra lo que se va a eliminar y
 * se confirma con UN botón.
 *
 * Antes exigía teclear el nombre exacto del elemento para habilitar el botón. Se
 * quitó en todo el sistema: no protegía de nada real (quien abre el diálogo ya eligió
 * la fila y va a copiar el nombre que tiene delante) y cobraba fricción en cada
 * borrado. Lo que protege de verdad es que el diálogo diga con claridad QUÉ se
 * elimina y qué se puede deshacer — de ahí `itemName` en el mensaje por defecto y los
 * `message` propios de cada llamador.
 *
 * Props:
 *   itemName   — nombre de lo que se elimina; aparece en el mensaje por defecto
 *   itemLabel  — "departamento", "cargo", "empleado", etc. (para el título del diálogo)
 *   message    — mensaje alternativo (opcional; reemplaza el texto por defecto)
 *   onConfirm  — callback cuando el usuario confirma
 *   onCancel   — callback cuando cancela o cierra
 *   confirming — bool; muestra "Eliminando…" y deshabilita botones mientras se procesa
 *   children   — contenido opcional que se renderiza en el body, bajo el mensaje
 *                (p.ej. opciones extra específicas del elemento a eliminar)
 */
export default function ConfirmDeleteDialog({
  itemName,
  itemLabel = 'elemento',
  message,
  onConfirm,
  onCancel,
  confirming = false,
  children,
}) {
  useEffect(() => {
    const fn = (e) => {
      if (e.key === 'Escape') onCancel()
    }
    document.addEventListener('keydown', fn)
    return () => document.removeEventListener('keydown', fn)
  }, [onCancel])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/25 backdrop-blur-[3px]">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-[#ece9df]">
          <h2 className="text-[18px] font-bold text-[#111]">Eliminar {itemLabel}</h2>
          <button
            type="button"
            onClick={onCancel}
            className="w-7 h-7 flex items-center justify-center rounded-lg text-[#999] hover:text-[#111] hover:bg-[#f0ede3] transition-colors"
            aria-label="Cerrar"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 14 14"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
            >
              <path d="M2 2l10 10M12 2L2 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-4">
          <p className="text-[15px] text-[#555]">
            {message ?? (
              <>
                Se eliminará <strong>{itemName}</strong>. Esta acción{' '}
                <strong>no se puede deshacer</strong>.
              </>
            )}
          </p>

          {children}

          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onCancel}
              disabled={confirming}
              className="px-4 py-2 rounded-xl text-[15px] font-semibold text-[#555] border border-[#e0ddd4] hover:bg-[#f5f3eb] transition-colors disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={onConfirm}
              disabled={confirming}
              className="px-4 py-2 rounded-xl text-[15px] font-bold bg-red-600 text-white hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {confirming ? 'Eliminando…' : 'Eliminar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
