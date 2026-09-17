import { useState } from 'react'

/**
 * Confirmación al quitar del picker a un editor que tiene piezas asignadas en esta pauta.
 * Antes (PautaDetailModal.jsx → handleEditorsChange) sus piezas se huerfanizaban en
 * silencio (`editor_user_id = null`) y volver a agregarlo no las recuperaba: aparecía un
 * recuadro "Sin asignar" fantasma junto al bloque vacío del editor recién re-agregado. Acá
 * se pregunta explícitamente qué hacer con ellas — nada se mueve sin que el coordinador
 * elija.
 *
 * Distinto de ConfirmDeleteDialog (que exige tipear el nombre): acá la acción es
 * reversible (se puede volver a repartir después), así que no hace falta esa fricción —
 * mismo criterio que ResourceWarningDialog.
 *
 * Props:
 *   editorName   — nombre a mostrar del editor que se está quitando
 *   unidades     — cantidad de piezas en UNIDADES (piezaUnidades ya sumado por el llamador:
 *                  un lote de 40 fotos cuenta 40, no 1 fila)
 *   otherEditors — [{id, name}] — editores restantes de la pauta, para el select "Pasar a…"
 *   onConfirm    — (targetEditorId | null) => void — null = dejar sin asignar
 *   onCancel     — cierra sin cambiar nada
 */
export default function RemoveEditorDialog({
  editorName,
  unidades,
  otherEditors,
  onConfirm,
  onCancel,
}) {
  const [target, setTarget] = useState('__sin_asignar__')

  function handleConfirm() {
    onConfirm(target === '__sin_asignar__' ? null : target)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/25 backdrop-blur-[3px]">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-[#ece9df] flex-shrink-0">
          <h2 className="text-[18px] font-bold text-[#111]">Quitar editor</h2>
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
        <div className="px-6 py-5 space-y-3">
          <p className="text-[13.5px] text-[#333]">
            <strong>{editorName}</strong> tiene {unidades} pieza{unidades === 1 ? '' : 's'} en esta
            pauta. ¿Qué hacemos con ellas?
          </p>

          <label className="flex items-center gap-2 text-[13.5px] text-[#333]">
            <input
              type="radio"
              name="remove-editor-target"
              value="__sin_asignar__"
              checked={target === '__sin_asignar__'}
              onChange={() => setTarget('__sin_asignar__')}
            />
            Dejarlas sin asignar
          </label>

          <label className="flex items-center gap-2 text-[13.5px] text-[#333]">
            <input
              type="radio"
              name="remove-editor-target"
              value="__pasar__"
              checked={target !== '__sin_asignar__'}
              disabled={otherEditors.length === 0}
              onChange={() => setTarget(otherEditors[0]?.id ?? '__sin_asignar__')}
            />
            Pasarlas a…
            <select
              className="input-base input-compact"
              disabled={otherEditors.length === 0}
              value={target === '__sin_asignar__' ? '' : target}
              onChange={(e) => setTarget(e.target.value)}
            >
              {otherEditors.length === 0 && (
                <option value="">Sin otros editores en la pauta</option>
              )}
              {otherEditors.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </select>
          </label>

          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2 rounded-xl text-[15px] font-semibold text-[#555] border border-[#e0ddd4] hover:bg-[#f5f3eb] transition-colors"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              className="px-4 py-2 rounded-xl text-[15px] font-bold bg-[#FFB800] text-[#111] hover:brightness-95 transition-colors"
            >
              Confirmar
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
