import { useState, useEffect, useRef } from 'react'
import { format, parseISO } from 'date-fns'
import { supabase } from '../../supabase'
import ConfirmDeleteDialog from '../common/ConfirmDeleteDialog'
import DateInput from '../common/DateInput'
import { useUnsavedChanges } from '../../hooks/useUnsavedChanges'

const STATUS_MAP = {
  pending: { label: 'Pendiente', cls: 'bg-yellow-100 text-yellow-800' },
  approved: { label: 'Aprobado', cls: 'bg-green-100 text-green-800' },
  rejected: { label: 'Rechazado', cls: 'bg-red-100 text-red-800' },
  completed: { label: 'Completado', cls: 'bg-[#f0ede3] text-[#666]' },
}

function fmtDate(dateStr) {
  try {
    return format(parseISO(dateStr), 'dd/MM/yyyy')
  } catch {
    return dateStr
  }
}

/**
 * Diálogo de gestión de vacaciones de un empleado.
 * Props: employee (objeto con user_id, first_name, last_name), onClose
 */
export default function VacationsDialog({ employee, onClose }) {
  const [vacations, setVacations] = useState([])
  const [loadingVac, setLoadingVac] = useState(true)

  // Form nueva vacación
  const [showForm, setShowForm] = useState(false)
  const [newVac, setNewVac] = useState({ start_date: '', end_date: '' })
  const [savingNew, setSavingNew] = useState(false)
  const [formError, setFormError] = useState(null)

  // Confirm delete
  const [deleteDialog, setDeleteDialog] = useState(null) // null | vacation
  const [deleting, setDeleting] = useState(false)

  // Status en proceso
  const [updatingId, setUpdatingId] = useState(null)

  const initialVac = useRef(newVac)
  const { requestClose } = useUnsavedChanges({
    value: newVac,
    baseline: initialVac.current,
    onClose,
  })

  // Escape para cerrar
  useEffect(() => {
    const fn = (e) => {
      if (e.key === 'Escape') requestClose()
    }
    document.addEventListener('keydown', fn)
    return () => document.removeEventListener('keydown', fn)
  }, [requestClose])

  // Carga inicial de vacaciones
  useEffect(() => {
    async function load() {
      setLoadingVac(true)
      const { data } = await supabase
        .from('vacations')
        .select('*')
        .eq('user_id', employee.user_id)
        .order('start_date', { ascending: false })
      setVacations(data ?? [])
      setLoadingVac(false)
    }
    load()
  }, [employee.user_id])

  // ── Crear vacación ──────────────────────────────────────────────────────────
  async function handleCreate(e) {
    e.preventDefault()
    if (!newVac.start_date || !newVac.end_date) {
      setFormError('Ambas fechas son obligatorias')
      return
    }
    if (newVac.end_date < newVac.start_date) {
      setFormError('La fecha de fin debe ser igual o posterior a la de inicio')
      return
    }
    setSavingNew(true)
    setFormError(null)
    const { data, error } = await supabase
      .from('vacations')
      .insert({
        user_id: employee.user_id,
        start_date: newVac.start_date,
        end_date: newVac.end_date,
        status: 'pending',
      })
      .select()
      .single()
    if (error) {
      setFormError(error.message)
      setSavingNew(false)
      return
    }
    setVacations((prev) => [data, ...prev])
    setNewVac({ start_date: '', end_date: '' })
    setShowForm(false)
    setSavingNew(false)
  }

  // ── Cambiar status ──────────────────────────────────────────────────────────
  async function handleStatusChange(vacId, newStatus) {
    setUpdatingId(vacId)
    const { data, error } = await supabase
      .from('vacations')
      .update({ status: newStatus })
      .eq('id', vacId)
      .select()
      .single()
    if (!error && data) {
      setVacations((prev) => prev.map((v) => (v.id === vacId ? data : v)))
    }
    setUpdatingId(null)
  }

  // ── Eliminar vacación ───────────────────────────────────────────────────────
  async function handleDeleteVacation() {
    if (!deleteDialog) return
    setDeleting(true)
    await supabase.from('vacations').delete().eq('id', deleteDialog.id)
    setVacations((prev) => prev.filter((v) => v.id !== deleteDialog.id))
    setDeleting(false)
    setDeleteDialog(null)
  }

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/25 backdrop-blur-[3px]">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] flex flex-col">
          {/* Header */}
          <div className="flex-shrink-0 flex items-center justify-between px-6 pt-5 pb-4 border-b border-[#ece9df]">
            <div>
              <h2 className="text-[18px] font-bold text-[#111]">Vacaciones</h2>
              <p className="text-[14px] text-[#888] mt-0.5">
                {employee.first_name} {employee.last_name}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setShowForm(true)
                  setFormError(null)
                }}
                className="px-3 py-1.5 rounded-lg text-[14px] font-bold bg-[#111] text-white hover:bg-[#222] transition-colors"
              >
                + Nueva
              </button>
              <button
                type="button"
                onClick={requestClose}
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
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
            {/* Formulario nueva vacación */}
            {showForm && (
              <form onSubmit={handleCreate} className="bg-[#f5f3eb] rounded-xl p-4 space-y-3">
                <p className="text-[14px] font-semibold text-[#555]">Nueva vacación</p>
                {formError && <p className="text-[14px] text-red-600">{formError}</p>}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[13px] font-mono font-bold tracking-[0.12em] uppercase text-[#888] mb-1">
                      Inicio *
                    </label>
                    <DateInput
                      value={newVac.start_date}
                      onChange={(v) => setNewVac((n) => ({ ...n, start_date: v }))}
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-[13px] font-mono font-bold tracking-[0.12em] uppercase text-[#888] mb-1">
                      Fin *
                    </label>
                    <DateInput
                      value={newVac.end_date}
                      min={newVac.start_date}
                      onChange={(v) => setNewVac((n) => ({ ...n, end_date: v }))}
                      required
                    />
                  </div>
                </div>
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setShowForm(false)
                      setFormError(null)
                    }}
                    className="px-3 py-1.5 rounded-lg text-[14px] font-semibold text-[#555] border border-[#e0ddd4] hover:bg-white transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={savingNew}
                    className="px-3 py-1.5 rounded-lg text-[14px] font-bold bg-[#111] text-white hover:bg-[#222] disabled:opacity-50 transition-colors"
                  >
                    {savingNew ? 'Guardando…' : 'Crear vacación'}
                  </button>
                </div>
              </form>
            )}

            {/* Lista de vacaciones */}
            {loadingVac ? (
              <div className="flex justify-center py-8">
                <div className="w-5 h-5 border-2 border-[#FFB800] border-t-transparent rounded-full animate-spin" />
              </div>
            ) : vacations.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-[16px] font-semibold text-[#888] mb-1">
                  Sin vacaciones registradas
                </p>
                <p className="text-[14px] text-[#bbb]">
                  Usa &ldquo;+ Nueva&rdquo; para agregar una.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {vacations.map((v) => {
                  const st = STATUS_MAP[v.status] ?? {
                    label: v.status,
                    cls: 'bg-gray-100 text-gray-600',
                  }
                  const isUpdating = updatingId === v.id
                  return (
                    <div
                      key={v.id}
                      className="bg-white border border-[#e0ddd4] rounded-xl px-4 py-3"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-[15px] font-semibold text-[#111]">
                            {fmtDate(v.start_date)} – {fmtDate(v.end_date)}
                          </p>
                          <span
                            className={`inline-block mt-1 text-[13px] font-semibold px-2 py-0.5 rounded-full ${st.cls}`}
                          >
                            {st.label}
                          </span>
                        </div>

                        {/* Acciones de status + eliminar */}
                        <div className="flex items-center gap-1 flex-shrink-0">
                          {v.status === 'pending' && (
                            <>
                              <button
                                type="button"
                                disabled={isUpdating}
                                onClick={() => handleStatusChange(v.id, 'approved')}
                                className="px-2 py-1 rounded-lg text-[13px] font-semibold bg-green-100 text-green-700 hover:bg-green-200 disabled:opacity-50 transition-colors"
                              >
                                Aprobar
                              </button>
                              <button
                                type="button"
                                disabled={isUpdating}
                                onClick={() => handleStatusChange(v.id, 'rejected')}
                                className="px-2 py-1 rounded-lg text-[13px] font-semibold bg-red-100 text-red-700 hover:bg-red-200 disabled:opacity-50 transition-colors"
                              >
                                Rechazar
                              </button>
                            </>
                          )}
                          {v.status === 'approved' && (
                            <>
                              <button
                                type="button"
                                disabled={isUpdating}
                                onClick={() => handleStatusChange(v.id, 'completed')}
                                className="px-2 py-1 rounded-lg text-[13px] font-semibold bg-[#f5f3eb] text-[#555] hover:bg-[#ece9df] disabled:opacity-50 transition-colors"
                              >
                                Completar
                              </button>
                              <button
                                type="button"
                                disabled={isUpdating}
                                onClick={() => handleStatusChange(v.id, 'rejected')}
                                className="px-2 py-1 rounded-lg text-[13px] font-semibold bg-red-100 text-red-700 hover:bg-red-200 disabled:opacity-50 transition-colors"
                              >
                                Rechazar
                              </button>
                            </>
                          )}
                          {v.status === 'rejected' && (
                            <button
                              type="button"
                              disabled={isUpdating}
                              onClick={() => handleStatusChange(v.id, 'approved')}
                              className="px-2 py-1 rounded-lg text-[13px] font-semibold bg-green-100 text-green-700 hover:bg-green-200 disabled:opacity-50 transition-colors"
                            >
                              Aprobar
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => setDeleteDialog(v)}
                            className="w-6 h-6 flex items-center justify-center rounded text-[#bbb] hover:text-red-500 hover:bg-red-50 transition-colors"
                            aria-label={`Eliminar vacación ${v.start_date}`}
                          >
                            <svg
                              width="11"
                              height="11"
                              viewBox="0 0 16 16"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="1.7"
                            >
                              <path d="M3 4h10M5 4V3a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v1M13 4l-1 9a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1L3 4" />
                            </svg>
                          </button>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Confirm delete (z-[60] para que quede sobre el diálogo de vacaciones) */}
      {deleteDialog !== null && (
        <ConfirmDeleteDialog
          itemName={deleteDialog.start_date}
          itemLabel="vacación"
          message={`Esta acción no se puede deshacer. Para confirmar, escribe la fecha de inicio de la vacación (${deleteDialog.start_date}).`}
          onConfirm={handleDeleteVacation}
          onCancel={() => setDeleteDialog(null)}
          confirming={deleting}
        />
      )}
    </>
  )
}
