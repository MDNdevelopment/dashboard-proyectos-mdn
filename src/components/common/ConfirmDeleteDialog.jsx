import { useState, useEffect } from 'react'

/**
 * Diálogo de confirmación de borrado reutilizable.
 * El usuario debe escribir el nombre exacto del elemento para habilitar el botón.
 *
 * Props:
 *   itemName   — texto exacto que el usuario debe teclear para confirmar
 *   itemLabel  — "departamento", "cargo", "empleado", etc. (para el texto del diálogo)
 *   message    — mensaje alternativo (opcional; reemplaza el texto por defecto)
 *   onConfirm  — callback cuando el usuario confirma
 *   onCancel   — callback cuando cancela o cierra
 *   confirming — bool; muestra "Eliminando…" y deshabilita botones mientras se procesa
 *   children   — contenido opcional que se renderiza en el body, sobre el input de confirmación
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
  const [typed, setTyped] = useState('')
  const canDelete = typed.trim() === itemName

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
                Esta acción <strong>no se puede deshacer</strong>. Para confirmar, escribe el nombre
                exacto del {itemLabel} a continuación.
              </>
            )}
          </p>

          {children}

          <div>
            <label className="block text-[13px] font-mono font-bold tracking-[0.12em] uppercase text-[#888] mb-1.5">
              Nombre del {itemLabel}
            </label>
            <input
              type="text"
              className="input-base"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder={itemName}
              autoFocus
            />
          </div>

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
              disabled={!canDelete || confirming}
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
