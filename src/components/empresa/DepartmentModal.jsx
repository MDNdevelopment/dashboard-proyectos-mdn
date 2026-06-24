import { useState, useEffect } from 'react'
import { supabase } from '../../supabase'

/**
 * Modal crear/editar departamento.
 * Convención: department=null → crear, department=objeto → editar.
 */
export default function DepartmentModal({ department = null, companyId, onClose, onSaved }) {
  const isEdit = department != null

  const [form, setForm] = useState(() => ({
    department_name: department?.department_name ?? '',
    dashboard_visible: department?.dashboard_visible ?? false,
  }))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  function set(field, value) {
    setForm(f => ({ ...f, [field]: value }))
  }

  useEffect(() => {
    const fn = e => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', fn)
    return () => document.removeEventListener('keydown', fn)
  }, [onClose])

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.department_name.trim()) {
      setError('El nombre del departamento es obligatorio')
      return
    }
    setSaving(true)
    setError(null)

    if (isEdit) {
      const { data, error: err } = await supabase
        .from('departments')
        .update({ department_name: form.department_name.trim(), dashboard_visible: form.dashboard_visible })
        .eq('department_id', department.department_id)
        .select()
        .single()
      if (err) { setError(err.message); setSaving(false); return }
      onSaved(data)
    } else {
      const { data, error: err } = await supabase
        .from('departments')
        .insert({ department_name: form.department_name.trim(), company_id: companyId, dashboard_visible: false })
        .select()
        .single()
      if (err) { setError(err.message); setSaving(false); return }
      onSaved(data)
    }
    onClose()
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/25 backdrop-blur-[3px]"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-[#ece9df]">
          <h2 className="text-[18px] font-bold text-[#111]">
            {isEdit ? 'Editar departamento' : 'Nuevo departamento'}
          </h2>
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
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-[15px] rounded-lg px-3 py-2">
              {error}
            </div>
          )}

          <div>
            <label className="block text-[13px] font-mono font-bold tracking-[0.12em] uppercase text-[#888] mb-1.5">
              Nombre *
            </label>
            <input
              type="text"
              className="input-base"
              value={form.department_name}
              onChange={e => set('department_name', e.target.value)}
              placeholder="Nombre del departamento"
              autoFocus
            />
          </div>

          {isEdit && (
            <div className="flex items-center gap-3">
              <button
                type="button"
                role="switch"
                aria-checked={form.dashboard_visible}
                onClick={() => set('dashboard_visible', !form.dashboard_visible)}
                className={`relative w-9 h-5 rounded-full transition-colors flex-shrink-0 ${
                  form.dashboard_visible ? 'bg-[#FFB800]' : 'bg-[#d8d4c8]'
                }`}
              >
                <span
                  className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${
                    form.dashboard_visible ? 'translate-x-4' : ''
                  }`}
                />
              </button>
              <span className="text-[15px] text-[#555]">Visible en el dashboard</span>
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-[15px] font-semibold text-[#555] border border-[#e0ddd4] hover:bg-[#f5f3eb] transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 rounded-xl text-[15px] font-bold bg-[#111] text-white hover:bg-[#222] transition-colors disabled:opacity-50"
            >
              {saving ? 'Guardando…' : isEdit ? 'Guardar cambios' : 'Crear departamento'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
