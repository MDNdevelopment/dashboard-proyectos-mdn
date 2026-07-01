import { useState, useEffect, useRef } from 'react'
import { createLine, updateLine } from '../metricas/metricsApi'
import { LINE_COLORS } from '../metricas/constants'
import { useUnsavedChanges } from '../../hooks/useUnsavedChanges'

/**
 * Modal crear/editar línea operativa.
 * Convención: line=null → crear, line=objeto → editar.
 * Props:
 *   line        — null = crear, objeto = editar
 *   companyId   — string
 *   sortOrder   — número para la nueva línea (siguiente índice)
 *   onClose()
 *   onSaved(row)
 */
export default function LineModal({ line = null, companyId, sortOrder = 0, onClose, onSaved }) {
  const isEdit = line != null

  const [form, setForm] = useState(() => ({
    name:  line?.name  ?? '',
    color: line?.color ?? (LINE_COLORS?.[0] ?? '#FAB51A'),
  }))
  const initialForm = useRef(form)
  const { requestClose } = useUnsavedChanges({ value: form, baseline: initialForm.current, onClose })
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState(null)

  function set(field, value) {
    setForm(f => ({ ...f, [field]: value }))
  }

  // Escape para cerrar
  useEffect(() => {
    const fn = e => { if (e.key === 'Escape') requestClose() }
    document.addEventListener('keydown', fn)
    return () => document.removeEventListener('keydown', fn)
  }, [requestClose])

  async function handleSubmit(e) {
    e.preventDefault()
    const name = form.name.trim()
    if (!name) { setError('El nombre de la línea es obligatorio.'); return }

    setSaving(true)
    setError(null)

    let data, err
    if (isEdit) {
      ;({ data, error: err } = await updateLine(line.id, { name, color: form.color }))
    } else {
      ;({ data, error: err } = await createLine(companyId, { name, color: form.color, sort_order: sortOrder }))
    }

    setSaving(false)
    if (err) { setError(err.message); return }
    onSaved(data)
    onClose()
  }

  // Paleta de colores rápidos (LINE_COLORS puede ser undefined si constantes no lo exponen todavía)
  const palette = [
    '#FAB51A', '#3B82F6', '#10B981', '#EC4899',
    '#8B5CF6', '#F97316', '#EF4444', '#6B7280',
  ]

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/25 backdrop-blur-[3px]"
      
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-[#ece9df]">
          <h2 className="text-[18px] font-bold text-[#111]">
            {isEdit ? 'Editar línea' : 'Nueva línea'}
          </h2>
          <button
            type="button"
            onClick={requestClose}
            className="w-7 h-7 flex items-center justify-center rounded-lg text-[#999] hover:text-[#111] hover:bg-[#f0ede3] transition-colors"
            aria-label="Cerrar"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M2 2l10 10M12 2L2 12" />
            </svg>
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-5">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-[14px] rounded-lg px-3 py-2">
              {error}
            </div>
          )}

          {/* Nombre */}
          <div>
            <label className="block text-[13px] font-mono font-bold tracking-[0.12em] uppercase text-[#888] mb-1.5">
              Nombre *
            </label>
            <input
              type="text"
              className="input-base"
              value={form.name}
              onChange={e => set('name', e.target.value)}
              placeholder="Nombre de la línea"
              autoFocus
            />
          </div>

          {/* Color */}
          <div>
            <label className="block text-[13px] font-mono font-bold tracking-[0.12em] uppercase text-[#888] mb-2">
              Color
            </label>
            <div className="flex items-center gap-2 flex-wrap">
              {palette.map(c => (
                <button
                  key={c}
                  type="button"
                  onClick={() => set('color', c)}
                  className={`w-7 h-7 rounded-full border-2 transition-all ${
                    form.color === c ? 'border-[#111] scale-110' : 'border-transparent hover:scale-105'
                  }`}
                  style={{ background: c }}
                  aria-label={c}
                />
              ))}
              {/* Color picker libre */}
              <label className="relative cursor-pointer" title="Color personalizado">
                <input
                  type="color"
                  value={form.color}
                  onChange={e => set('color', e.target.value)}
                  className="sr-only"
                />
                <div
                  className="w-7 h-7 rounded-full border-2 border-dashed border-[#ccc] flex items-center justify-center text-[#aaa] hover:border-[#888] transition-colors"
                >
                  <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M6 1v10M1 6h10" strokeLinecap="round"/>
                  </svg>
                </div>
              </label>

              {/* Vista previa del color activo */}
              <span
                className="w-7 h-7 rounded-full border border-[#e0ddd4] flex-shrink-0"
                style={{ background: form.color }}
                title={form.color}
              />
            </div>
          </div>

          {/* Acciones */}
          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={requestClose}
              className="px-4 py-2 rounded-xl text-[15px] font-semibold text-[#555] border border-[#e0ddd4] hover:bg-[#f5f3eb] transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 rounded-xl text-[15px] font-bold bg-[#111] text-white hover:bg-[#222] transition-colors disabled:opacity-50"
            >
              {saving ? 'Guardando…' : isEdit ? 'Guardar cambios' : 'Crear línea'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
