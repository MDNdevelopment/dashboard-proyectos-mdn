import { useState, useEffect, useCallback } from 'react'
import {
  loadExternalResources,
  deleteExternalResource,
  restoreExternalResource,
} from '../pautas/externalResourcesApi'
import ExternalResourceModal, { ROLE_OPTIONS } from './ExternalResourceModal'
import ConfirmDeleteDialog from '../common/ConfirmDeleteDialog'

const ROLE_LABELS = Object.fromEntries(ROLE_OPTIONS.map((r) => [r.key, r.label]))

/**
 * Recursos externos (grabación/edición/ads): gente que la agencia contrata pero que NO es
 * empleado. Se gestionan aquí, dentro de Empresa → Empleados, pero viven en su propia
 * tabla (`external_resources`) — nunca aparecen en Tareas, Líneas ni Evaluaciones. Solo se
 * consumen en Pautas, como recurso (quién graba) y/o editor, según sus roles.
 */
export default function ExternalResourcesView({ companyId }) {
  const [resources, setResources] = useState([])
  const [loading, setLoading] = useState(true)
  const [showArchived, setShowArchived] = useState(false)
  const [editModal, setEditModal] = useState(undefined) // undefined=cerrado, null=crear, obj=editar
  const [confirmDelete, setConfirmDelete] = useState(null)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState(null)

  const loadAll = useCallback(async () => {
    if (!companyId) return
    setLoading(true)
    const { data } = await loadExternalResources(companyId)
    setResources(data ?? [])
    setLoading(false)
  }, [companyId])

  useEffect(() => {
    loadAll()
  }, [loadAll])

  function handleSaved(saved) {
    setResources((prev) => {
      const exists = prev.some((r) => r.id === saved.id)
      return exists ? prev.map((r) => (r.id === saved.id ? saved : r)) : [...prev, saved]
    })
  }

  async function handleDelete() {
    if (!confirmDelete) return
    setDeleting(true)
    setError(null)
    const { data, error: err } = await deleteExternalResource(confirmDelete.id)
    setDeleting(false)
    if (err) {
      setError(err.message)
      return
    }
    handleSaved(data)
    setConfirmDelete(null)
  }

  async function handleRestore(resource) {
    setError(null)
    const { data, error: err } = await restoreExternalResource(resource.id)
    if (err) {
      setError(err.message)
      return
    }
    handleSaved(data)
  }

  const active = resources.filter((r) => !r.deleted_at)
  const archived = resources.filter((r) => r.deleted_at)
  const visible = showArchived ? archived : active

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="w-5 h-5 border-2 border-[#FFB800] border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="mt-8 pt-6 border-t border-[#e0ddd4]">
      <div className="flex items-center justify-between gap-3 mb-1.5 flex-wrap">
        <h2 className="text-[18px] font-bold text-[#111]">Recursos externos</h2>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowArchived((v) => !v)}
            className={`px-2.5 py-1 rounded-lg text-[12.5px] font-semibold border transition-all ${
              showArchived
                ? 'bg-[#f5f0e0] text-[#888] border-[#d4c890]'
                : 'bg-white text-[#aaa] border-[#e0ddd4] hover:bg-[#f5f3eb]'
            }`}
          >
            {showArchived ? 'Ocultando activos' : `Ver recursos eliminados (${archived.length})`}
          </button>
          {!showArchived && (
            <button
              type="button"
              onClick={() => setEditModal(null)}
              className="px-3 py-1.5 rounded-lg text-[13.5px] font-bold bg-[#FFB800] text-[#111] hover:bg-[#e6a600] transition-colors"
            >
              + Agregar recurso externo
            </button>
          )}
        </div>
      </div>
      <p className="text-[13px] text-[#999] mb-4">
        Grabación, edición y ads que se contratan afuera. No aparecen en tareas, líneas ni
        evaluaciones — solo se pueden seleccionar en Pautas según su rol.
      </p>

      {error && (
        <div className="mb-3 px-3 py-2 rounded-lg bg-red-50 text-red-700 text-[12.5px]">
          {error}
        </div>
      )}

      {visible.length === 0 ? (
        <p className="text-[13.5px] text-[#bbb]">
          {showArchived
            ? 'Sin recursos externos eliminados.'
            : 'Sin recursos externos registrados.'}
        </p>
      ) : (
        <div className="space-y-2">
          {visible.map((r) => (
            <div
              key={r.id}
              className="bg-white rounded-xl border border-[#e0ddd4] px-4 py-3 flex items-center gap-3"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[14.5px] font-semibold text-[#111]">{r.full_name}</span>
                  {r.deleted_at && (
                    <span className="text-[11px] font-mono font-bold tracking-wide uppercase bg-red-100 text-red-700 border border-red-200 px-1.5 py-0.5 rounded">
                      Eliminado
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {(r.roles ?? []).length === 0 ? (
                    <span className="text-[12px] text-[#bbb]">Sin roles asignados</span>
                  ) : (
                    r.roles.map((role) => (
                      <span
                        key={role}
                        className="text-[11.5px] font-mono uppercase tracking-wide bg-[#f0ede3] text-[#666] border border-[#e0ddd4] px-1.5 py-0.5 rounded"
                      >
                        {ROLE_LABELS[role] ?? role}
                      </span>
                    ))
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {r.deleted_at ? (
                  <button
                    type="button"
                    onClick={() => handleRestore(r)}
                    className="px-3 py-1.5 rounded-lg text-[13.5px] font-semibold text-[#555] border border-[#e0ddd4] hover:bg-[#f5f3eb] transition-colors"
                  >
                    Restaurar
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => setEditModal(r)}
                      className="px-3 py-1.5 rounded-lg text-[13.5px] font-bold bg-[#111] text-white hover:bg-[#222] transition-colors"
                    >
                      Editar
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmDelete(r)}
                      aria-label={`Eliminar ${r.full_name}`}
                      title="Eliminar"
                      className="p-1.5 rounded-lg text-[#999] hover:text-red-600 hover:bg-red-50 transition-colors"
                    >
                      ✕
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {editModal !== undefined && (
        <ExternalResourceModal
          companyId={companyId}
          resource={editModal}
          onClose={() => setEditModal(undefined)}
          onSaved={handleSaved}
        />
      )}

      {confirmDelete && (
        <ConfirmDeleteDialog
          itemName={confirmDelete.full_name}
          itemLabel="recurso externo"
          message={
            <>
              <strong>{confirmDelete.full_name}</strong> dejará de aparecer en los selectores de
              Pautas. Su historial en pautas pasadas se conserva. Esta acción se puede revertir
              restaurando el recurso. Para confirmar, escribe su nombre completo a continuación.
            </>
          }
          onConfirm={handleDelete}
          onCancel={() => setConfirmDelete(null)}
          confirming={deleting}
        />
      )}
    </div>
  )
}
