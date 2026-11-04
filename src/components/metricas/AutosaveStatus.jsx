const LABELS = {
  idle: 'Los cambios se guardan automáticamente',
  pending: 'Cambios sin guardar…',
  saving: 'Guardando…',
  saved: 'Guardado ✓',
  error: 'No se pudo guardar',
}

/**
 * Indicador fijo del autoguardado de un reporte (reemplaza al botón «Guardar»).
 * En solo lectura / reporte cerrado no hay nada que guardar.
 */
export default function AutosaveStatus({ status, onRetry, readOnly = false }) {
  const label = readOnly ? 'Solo lectura' : LABELS[status]
  const tone =
    status === 'error' && !readOnly
      ? 'border-[#e5b4b4] bg-[#fdecec] text-[#a33]'
      : status === 'saved' && !readOnly
        ? 'border-[#b7e0c0] bg-[#eaf7ee] text-[#2d7a45]'
        : 'border-[#e0ddd4] bg-white text-[#888]'
  return (
    <div
      data-testid="autosave-status"
      role="status"
      aria-live="polite"
      className={`fixed bottom-4 right-4 z-40 flex items-center gap-2 rounded-xl border px-3 py-1.5 font-mono text-[12px] shadow-sm ${tone}`}
    >
      <span>{label}</span>
      {status === 'error' && !readOnly && (
        <button type="button" onClick={onRetry} className="font-semibold underline">
          Reintentar
        </button>
      )}
    </div>
  )
}
