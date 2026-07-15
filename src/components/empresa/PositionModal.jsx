import { useState, useEffect } from 'react'
import { supabase } from '../../supabase'

/**
 * Modal de edición de un cargo (positions).
 * Permite modificar nombre, descripción y funciones (bullets).
 *
 * Props:
 *   position — objeto del cargo a editar
 *   onClose  — callback para cerrar
 *   onSaved  — callback con el cargo guardado (para actualizar la UI padre)
 */
export default function PositionModal({ position, onClose, onSaved }) {
  const [form, setForm] = useState({
    position_name:        position?.position_name        ?? '',
    position_description: position?.position_description ?? '',
    position_functions:   Array.isArray(position?.position_functions)
      ? position.position_functions
      : [],
  })
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState(null)

  // Cerrar con Escape
  useEffect(() => {
    const fn = e => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', fn)
    return () => document.removeEventListener('keydown', fn)
  }, [onClose])

  function set(field, value) {
    setForm(f => ({ ...f, [field]: value }))
  }

  // ── Funciones (bullets) ────────────────────────────────────────────────────
  function addFunction() {
    set('position_functions', [...form.position_functions, ''])
  }

  function updateFunction(index, value) {
    const updated = form.position_functions.map((fn, i) => i === index ? value : fn)
    set('position_functions', updated)
  }

  function removeFunction(index) {
    set('position_functions', form.position_functions.filter((_, i) => i !== index))
  }

  // ── Submit ─────────────────────────────────────────────────────────────────
  async function handleSubmit(e) {
    e.preventDefault()
    const position_name = form.position_name.trim()
    if (!position_name) { setError('El nombre del cargo es obligatorio.'); return }

    setSaving(true)
    setError(null)

    const payload = {
      position_name,
      position_description: form.position_description.trim() || null,
      position_functions:   form.position_functions.map(f => f.trim()).filter(Boolean),
    }

    const { data, error: err } = await supabase
      .from('positions')
      .update(payload)
      .eq('position_id', position.position_id)
      .select()
      .single()

    setSaving(false)
    if (err) { setError(err.message); return }
    onSaved(data)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/25 backdrop-blur-[3px]">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex-shrink-0 flex items-center justify-between px-6 pt-5 pb-4 border-b border-[#ece9df]">
          <h2 className="text-[18px] font-bold text-[#111]">Editar cargo</h2>
          <button
            type="button"
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-lg text-[#999] hover:text-[#111] hover:bg-[#f0ede3] transition-colors"
            aria-label="Cerrar"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M2 2l10 10M12 2L2 12" />
            </svg>
          </button>
        </div>

        {/* Form */}
        <form id="position-form" onSubmit={handleSubmit} className="px-6 py-5 space-y-5 overflow-y-auto flex-1">
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
              value={form.position_name}
              onChange={e => set('position_name', e.target.value)}
              placeholder="Ej. Diseñador gráfico"
              autoFocus
            />
          </div>

          {/* Descripción */}
          <div>
            <label className="block text-[13px] font-mono font-bold tracking-[0.12em] uppercase text-[#888] mb-1.5">
              Descripción del cargo
            </label>
            <textarea
              rows={3}
              className="input-base resize-none"
              value={form.position_description}
              onChange={e => set('position_description', e.target.value)}
              placeholder="Breve descripción del rol y su propósito en el equipo…"
            />
          </div>

          {/* Funciones (bullets) */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-[13px] font-mono font-bold tracking-[0.12em] uppercase text-[#888]">
                Funciones
              </label>
              <button
                type="button"
                onClick={addFunction}
                className="flex items-center gap-1 text-[13px] font-semibold text-[#FAB51A] hover:text-[#d49800] transition-colors"
              >
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M6 1v10M1 6h10" strokeLinecap="round"/>
                </svg>
                Agregar
              </button>
            </div>

            {form.position_functions.length === 0 ? (
              <p className="text-[13.5px] text-[#bbb] py-1">Sin funciones definidas.</p>
            ) : (
              <div className="space-y-2">
                {form.position_functions.map((fn, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#bbb] flex-shrink-0" />
                    <input
                      type="text"
                      className="input-base flex-1 text-[14px]"
                      value={fn}
                      onChange={e => updateFunction(i, e.target.value)}
                      placeholder="Describe la función…"
                    />
                    <button
                      type="button"
                      onClick={() => removeFunction(i)}
                      className="flex-shrink-0 text-[#ccc] hover:text-red-400 transition-colors p-1"
                      aria-label="Quitar función"
                    >
                      <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M2 2l9 9M11 2L2 11" strokeLinecap="round"/>
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

        </form>

        {/* Acciones */}
        <div className="flex-shrink-0 flex items-center justify-end gap-2 px-6 py-4 border-t border-[#ece9df]">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-[15px] font-semibold text-[#555] border border-[#e0ddd4] hover:bg-[#f5f3eb] transition-colors"
          >
            Cancelar
          </button>
          <button
            type="submit"
            form="position-form"
            disabled={saving}
            className="px-4 py-2 rounded-xl text-[15px] font-bold bg-[#111] text-white hover:bg-[#222] transition-colors disabled:opacity-50"
          >
            {saving ? 'Guardando…' : 'Guardar cambios'}
          </button>
        </div>
      </div>
    </div>
  )
}
