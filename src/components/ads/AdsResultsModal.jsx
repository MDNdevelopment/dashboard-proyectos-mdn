import { useState } from 'react'
import { RESULT_FIELDS } from './constants'
import { updateAd } from './campaignSpendApi'

/**
 * Modal que exige los 4 resultados (Alcance, Interacciones, Seguidores,
 * Impresiones) al marcar un Ad como Finalizado. Se abre desde el pill de
 * estado (fila o detalle) en vez de persistir el estado directamente —
 * la guardia vive en AdsSpendView.requestStatusChange.
 * Pre-llena con los valores existentes por si se re-abre para corregirlos.
 */
export default function AdsResultsModal({ ad, onClose, onSaved }) {
  const [values, setValues] = useState(
    Object.fromEntries(RESULT_FIELDS.map(f => [f.key, ad?.[f.key] ?? '']))
  )
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  const allFilled = RESULT_FIELDS.every(f => values[f.key] !== '' && values[f.key] != null)

  function set(key, val) {
    setValues(prev => ({ ...prev, [key]: val }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!allFilled) return
    setSubmitting(true)
    setError(null)
    const payload = { status: 'Finalizado' }
    RESULT_FIELDS.forEach(f => { payload[f.key] = Number(values[f.key]) })
    const { data, error: err } = await updateAd(ad.id, payload)
    setSubmitting(false)
    if (err) { setError('Error al guardar los resultados.'); return }
    onSaved(data)
  }

  const labelClass = 'block text-[13px] font-mono font-bold tracking-widest uppercase text-[#888] mb-1.5'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-sm bg-black/30">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[90vh] flex flex-col">
        <div className="px-6 pt-6 pb-5 border-b border-[#ece9df] flex items-center justify-between">
          <div>
            <h2 className="text-[19px] font-bold text-[#111]">Resultados del ad</h2>
            <p className="text-[13px] text-[#888] mt-0.5">
              Estos datos son obligatorios para marcar "{ad.name}" como Finalizado.
            </p>
          </div>
          <button onClick={onClose} className="text-[#999] hover:text-[#111] transition-colors p-1">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M2 2l12 12M14 2L2 14" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 overflow-y-auto flex-1">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {RESULT_FIELDS.map(f => (
              <div key={f.key}>
                <label htmlFor={`ad-result-${f.key}`} className={labelClass}>{f.label}</label>
                <input
                  id={`ad-result-${f.key}`}
                  type="number"
                  min={0}
                  step="1"
                  className="input-base w-full"
                  value={values[f.key]}
                  onChange={e => set(f.key, e.target.value)}
                  required
                />
              </div>
            ))}
          </div>

          {error && <p className="text-[14px] text-red-600 mt-3">{error}</p>}

          <div className="flex gap-3 pt-4 mt-4 border-t border-[#ece9df]">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 rounded-xl border border-[#e0ddd4] text-[15px] font-semibold text-[#555] hover:bg-[#f5f3eb] transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={submitting || !allFilled}
              className="flex-1 py-2.5 rounded-xl bg-[#111] text-white text-[15px] font-bold hover:bg-[#222] transition-colors disabled:opacity-50"
            >
              {submitting ? 'Guardando...' : 'Guardar y finalizar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
