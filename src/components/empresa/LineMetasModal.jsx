import { useState, useRef } from 'react'
import { updateLine } from '../metricas/metricsApi'
import { DEFAULT_SUBTAREAS } from '../metricas/constants'
import { useUnsavedChanges } from '../../hooks/useUnsavedChanges'

/**
 * Modal para configurar las metas por defecto de una línea operativa.
 * Edita: meta de Reuniones y lista de Tareas Fijas (productividad).
 * Los valores aquí son los defaults que se usan al inicializar un nuevo periodo;
 * siguen siendo editables en el tab Operaciones de Métricas.
 */
export default function LineMetasModal({ line, onClose, onSaved }) {
  const existingMetas = line.metas ?? {}
  const [metaReuniones, setMetaReuniones] = useState(
    existingMetas.reuniones ?? 15
  )
  const [tareas, setTareas] = useState(
    (existingMetas.tareas && existingMetas.tareas.length > 0)
      ? existingMetas.tareas.map(t => ({ ...t }))
      : DEFAULT_SUBTAREAS.map(t => ({ ...t }))
  )
  const initialMetas = useRef({ metaReuniones, tareas })
  const { requestClose } = useUnsavedChanges({
    value: { metaReuniones, tareas },
    baseline: initialMetas.current,
    onClose,
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  function setTareaField(idx, field, value) {
    setTareas(prev => {
      const next = [...prev]
      next[idx] = {
        ...next[idx],
        [field]: field === 'nombre' ? value : Number(value) || 0,
      }
      return next
    })
  }

  function addTarea() {
    setTareas(prev => [...prev, { nombre: '', meta: 0 }])
  }

  function removeTarea(idx) {
    setTareas(prev => prev.filter((_, i) => i !== idx))
  }

  async function handleSave() {
    setSaving(true)
    setError(null)
    const metas = {
      reuniones: Number(metaReuniones) || 0,
      tareas: tareas.map(t => ({ nombre: t.nombre, meta: Number(t.meta) || 0 })),
    }
    const { data, error: err } = await updateLine(line.id, { metas })
    setSaving(false)
    if (err) { setError(err.message); return }
    onSaved({ ...line, metas, ...data })
    onClose()
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.35)' }}
      
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
        {/* Header */}
        <div
          className="px-6 py-4 flex items-center justify-between border-b border-[#f0ede3]"
          style={{ background: line.color + '14' }}
        >
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full" style={{ background: line.color }} />
            <h2 className="text-[16px] font-bold text-[#111]">
              Metas — {line.name}
            </h2>
          </div>
          <button
            onClick={requestClose}
            className="text-[#aaa] hover:text-[#555] transition-colors"
            aria-label="Cerrar"
          >
            <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M3 3l10 10M13 3L3 13" strokeLinecap="round"/>
            </svg>
          </button>
        </div>

        {/* Cuerpo */}
        <div className="px-6 py-5 space-y-5 max-h-[70vh] overflow-y-auto">
          <p className="text-[13px] text-[#888]">
            Estas metas se aplican a todos los periodos <strong>aún no guardados</strong> en Operaciones,
            con prioridad sobre el mes anterior. Los meses ya guardados no se modifican (se editan
            a mano si hace falta). Podés ajustar cualquier valor por periodo directamente en el tab Operaciones.
          </p>

          {/* Meta reuniones */}
          <div>
            <label className="block text-[12px] font-mono font-bold uppercase tracking-[0.1em] text-[#888] mb-1">
              Meta de reuniones mensuales
            </label>
            <input
              type="number"
              min="0"
              className="input-base w-32"
              value={metaReuniones}
              onChange={e => setMetaReuniones(e.target.value)}
            />
          </div>

          {/* Tareas fijas */}
          <div>
            <p className="text-[12px] font-mono font-bold uppercase tracking-[0.1em] text-[#888] mb-2">
              Tareas fijas (Productividad)
            </p>
            <div className="space-y-2">
              {tareas.map((tarea, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <input
                    type="text"
                    placeholder="Nombre de tarea"
                    className="input-base flex-1 text-[14px]"
                    value={tarea.nombre}
                    onChange={e => setTareaField(idx, 'nombre', e.target.value)}
                  />
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <span className="text-[11px] text-[#aaa]">Meta</span>
                    <input
                      type="number"
                      min="0"
                      className="input-base w-20 text-[14px]"
                      value={tarea.meta}
                      onChange={e => setTareaField(idx, 'meta', e.target.value)}
                    />
                  </div>
                  <button
                    onClick={() => removeTarea(idx)}
                    className="text-[#ccc] hover:text-red-400 transition-colors flex-shrink-0"
                    title="Eliminar tarea"
                  >
                    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7">
                      <path d="M4 4l8 8M12 4l-8 8" strokeLinecap="round"/>
                    </svg>
                  </button>
                </div>
              ))}
              <button
                onClick={addTarea}
                className="text-[13px] text-[#888] hover:text-[#111] font-medium flex items-center gap-1 mt-1"
              >
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <path d="M6 1v10M1 6h10" strokeLinecap="round"/>
                </svg>
                Agregar tarea
              </button>
            </div>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-[13px] rounded-xl px-3 py-2">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-[#f0ede3] flex items-center justify-end gap-3">
          <button
            onClick={requestClose}
            className="px-4 py-2 rounded-xl border border-[#e0ddd4] text-[14px] font-medium text-[#555] hover:bg-[#f5f3eb] transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-5 py-2 rounded-xl bg-[#FAB51A] text-[#111] font-bold text-[14px] hover:bg-[#e8a315] transition-colors disabled:opacity-60 flex items-center gap-2"
          >
            {saving && (
              <div className="w-4 h-4 border-2 border-[#111] border-t-transparent rounded-full animate-spin" />
            )}
            {saving ? 'Guardando…' : 'Guardar metas'}
          </button>
        </div>
      </div>
    </div>
  )
}
