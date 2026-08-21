import { useState } from 'react'
import { createExternalResource, updateExternalResource } from '../pautas/externalResourcesApi'

export const ROLE_OPTIONS = [
  { key: 'grabacion', label: 'Grabación (foto/video)' },
  { key: 'edicion', label: 'Edición' },
  { key: 'ads', label: 'Ads' },
]

/**
 * Crear/editar un recurso externo (patrón ProjectModal/EmployeeModal: `resource` null =
 * crear, objeto = editar). A diferencia de un empleado, no tiene email/departamento/nivel
 * de acceso — solo nombre y los roles que determinan en qué pickers de Pautas aparece.
 */
export default function ExternalResourceModal({ companyId, resource, onClose, onSaved }) {
  const isEdit = resource != null
  const [fullName, setFullName] = useState(resource?.full_name ?? '')
  const [roles, setRoles] = useState(resource?.roles ?? [])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  function toggleRole(key) {
    setRoles((prev) => (prev.includes(key) ? prev.filter((r) => r !== key) : [...prev, key]))
  }

  async function handleSave() {
    if (!fullName.trim()) {
      setError('El nombre es obligatorio.')
      return
    }
    setSaving(true)
    setError(null)
    const fields = { full_name: fullName.trim(), roles }
    const { data, error: err } = isEdit
      ? await updateExternalResource(resource.id, fields)
      : await createExternalResource(companyId, fields)
    setSaving(false)
    if (err) {
      setError(err.message)
      return
    }
    onSaved(data)
    onClose()
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-sm bg-black/30"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="bg-white rounded-2xl border border-[#e8e5db] w-full max-w-md shadow-2xl">
        <div className="px-6 py-5 border-b border-[#eeebe0]">
          <h2 className="text-[18px] font-semibold text-[#111]">
            {isEdit ? 'Editar recurso externo' : 'Nuevo recurso externo'}
          </h2>
        </div>

        <div className="px-6 py-5 space-y-4">
          {error && (
            <div className="px-3 py-2 rounded-lg bg-red-50 text-red-700 text-[12.5px]">{error}</div>
          )}

          <div>
            <label className="block text-[11.5px] font-mono uppercase tracking-wide text-[#999] mb-1">
              Nombre completo
            </label>
            <input
              type="text"
              className="input-base w-full"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Ej. Alan Puentes"
              autoFocus
            />
          </div>

          <div>
            <label className="block text-[11.5px] font-mono uppercase tracking-wide text-[#999] mb-1.5">
              Roles
            </label>
            <p className="text-[12px] text-[#999] mb-2">
              Determina en qué selector de Pautas aparece. Sin roles, solo queda registrado aquí.
            </p>
            <div className="space-y-1.5">
              {ROLE_OPTIONS.map((opt) => (
                <label key={opt.key} className="flex items-center gap-2 text-[13.5px] text-[#333]">
                  <input
                    type="checkbox"
                    checked={roles.includes(opt.key)}
                    onChange={() => toggleRole(opt.key)}
                  />
                  {opt.label}
                </label>
              ))}
            </div>
          </div>
        </div>

        <div className="flex gap-3 px-6 py-4 border-t border-[#eeebe0]">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 px-4 py-2.5 border border-[#e0ddd4] text-[#666] rounded-xl text-[15px] font-semibold hover:bg-[#f5f3eb] transition-colors"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="flex-1 px-4 py-2.5 bg-[#FFB800] text-[#111] rounded-xl text-[15px] font-bold hover:bg-[#e6a600] transition-colors disabled:opacity-50"
          >
            {saving ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  )
}
