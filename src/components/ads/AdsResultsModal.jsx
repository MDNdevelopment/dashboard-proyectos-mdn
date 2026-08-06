import { useState } from 'react'
import { RESULT_FIELDS } from './constants'
import { updateAd } from './campaignSpendApi'

/**
 * Modal que exige elegir y capturar al menos 1 de los 6 indicadores posibles
 * (Alcance, Interacciones, Seguidores, Impresiones, Visualizaciones, Visitas al
 * perfil) al marcar un Ad como Finalizado. Se abre desde el pill de estado (fila
 * o detalle) en vez de persistir el estado directamente — la guardia vive en
 * AdsSpendView.requestStatusChange.
 * Pre-selecciona los indicadores que ya tengan valor por si se re-abre para
 * corregirlos; al deseleccionar uno se limpia (se guarda null).
 */
export default function AdsResultsModal({ ad, onClose, onSaved }) {
  const [selected, setSelected] = useState(
    () => new Set(RESULT_FIELDS.filter((f) => ad?.[f.key] != null).map((f) => f.key)),
  )
  const [values, setValues] = useState(
    Object.fromEntries(RESULT_FIELDS.map((f) => [f.key, ad?.[f.key] ?? ''])),
  )
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  const canSave =
    selected.size > 0 &&
    RESULT_FIELDS.every(
      (f) => !selected.has(f.key) || (values[f.key] !== '' && values[f.key] != null),
    )

  function toggle(key) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  function set(key, val) {
    setValues((prev) => ({ ...prev, [key]: val }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!canSave) return
    setSubmitting(true)
    setError(null)
    // results_pending: false limpia el marcador "faltan resultados" que el cron
    // pone al auto-finalizar un ad (ver enqueue_campaign_closures). Al cargar los
    // resultados manualmente, el aviso desaparece.
    const payload = { status: 'Finalizado', results_pending: false }
    RESULT_FIELDS.forEach((f) => {
      payload[f.key] = selected.has(f.key) ? Number(values[f.key]) : null
    })
    const { data, error: err } = await updateAd(ad.id, payload)
    setSubmitting(false)
    if (err) {
      setError('Error al guardar los resultados.')
      return
    }
    onSaved(data)
  }

  const labelClass =
    'block text-[13px] font-mono font-bold tracking-widest uppercase text-[#888] mb-1.5'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-sm bg-black/30">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[90vh] flex flex-col">
        <div className="flex-shrink-0 px-6 pt-6 pb-5 border-b border-[#ece9df] flex items-center justify-between">
          <div>
            <h2 className="text-[19px] font-bold text-[#111]">Resultados del ad</h2>
            <p className="text-[13px] text-[#888] mt-0.5">
              Elige al menos un indicador para marcar &ldquo;{ad.name}&rdquo; como Finalizado.
            </p>
          </div>
          <button onClick={onClose} className="text-[#999] hover:text-[#111] transition-colors p-1">
            <svg
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M2 2l12 12M14 2L2 14" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <form
          id="ads-results-form"
          onSubmit={handleSubmit}
          className="px-6 py-5 overflow-y-auto flex-1"
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {RESULT_FIELDS.map((f) => {
              const isSelected = selected.has(f.key)
              return (
                <div key={f.key}>
                  {/* No se envuelve en <label> junto al nombre del indicador: si ambos
                      compartieran el mismo texto, quedaría ambiguo para lookup por label
                      (checkbox vs. input numérico). El checkbox usa aria-label propio. */}
                  <div
                    className="flex items-center gap-2 cursor-pointer mb-1.5"
                    onClick={() => toggle(f.key)}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggle(f.key)}
                      onClick={(e) => e.stopPropagation()}
                      aria-label={`Incluir ${f.label}`}
                      className="h-4 w-4 rounded border-[#e0ddd4] accent-[#FFB800]"
                    />
                    <span className={labelClass.replace('mb-1.5', '')}>{f.label}</span>
                  </div>
                  {isSelected && (
                    <>
                      <label htmlFor={`ad-result-${f.key}`} className="sr-only">
                        {f.label}
                      </label>
                      <input
                        id={`ad-result-${f.key}`}
                        type="number"
                        min={0}
                        step="1"
                        className="input-base w-full"
                        value={values[f.key]}
                        onChange={(e) => set(f.key, e.target.value)}
                        required
                      />
                    </>
                  )}
                </div>
              )
            })}
          </div>

          {error && <p className="text-[14px] text-red-600 mt-3">{error}</p>}
        </form>

        <div className="flex-shrink-0 flex gap-3 px-6 py-4 border-t border-[#ece9df]">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl border border-[#e0ddd4] text-[15px] font-semibold text-[#555] hover:bg-[#f5f3eb] transition-colors"
          >
            Cancelar
          </button>
          <button
            type="submit"
            form="ads-results-form"
            disabled={submitting || !canSave}
            className="flex-1 py-2.5 rounded-xl bg-[#111] text-white text-[15px] font-bold hover:bg-[#222] transition-colors disabled:opacity-50"
          >
            {submitting ? 'Guardando...' : 'Guardar y finalizar'}
          </button>
        </div>
      </div>
    </div>
  )
}
