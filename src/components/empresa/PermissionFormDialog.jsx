import { useState, useEffect, useRef } from 'react'
import { useAuth } from '../../context/AuthContext'
import DateInput from '../common/DateInput'
import { useUnsavedChanges } from '../../hooks/useUnsavedChanges'
import { fetchPermissionsForEmployee, createPermission } from '../../lib/employeePermissions'
import { PERMISSION_TYPES } from '../../utils/employeePermissions'
import { vacationDays } from '../../utils/employeeCalendar'
import { isoToDdmmyyyy } from '../../utils/formatDate'

const EMPTY_FORM = {
  userId: '',
  type: 'permiso',
  start_date: '',
  end_date: '',
  event_time: '',
  reason: '',
}

/**
 * Diálogo de "Permisos" (RRHH): historial de un empleado + formulario de registro.
 * Dos modos de apertura (mismo componente, ver PermisosRrhhView):
 *  - `fixedEmployee` dado: se abre en el historial de esa persona (clic en su fila).
 *  - `fixedEmployee` ausente: se abre directo en el formulario, con selector de empleado
 *    ("+ Registrar novedad").
 * A diferencia de VacationsDialog, NO se bloquean solapamientos: un permiso y un reposo
 * pueden coincidir legítimamente (solo se advierte si hay otro registro del MISMO tipo).
 */
export default function PermissionFormDialog({
  employees,
  companyId,
  fixedEmployee,
  canManage,
  onClose,
  onChange,
  onRequestDelete,
}) {
  const { userProfile } = useAuth()
  const [selectedId, setSelectedId] = useState(fixedEmployee?.user_id ?? '')
  const [history, setHistory] = useState([])
  const [loadingHistory, setLoadingHistory] = useState(false)
  const [showForm, setShowForm] = useState(!fixedEmployee)
  const [form, setForm] = useState({ ...EMPTY_FORM, userId: fixedEmployee?.user_id ?? '' })
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState(null)

  const initialForm = useRef(form)
  const { requestClose } = useUnsavedChanges({
    value: form,
    baseline: initialForm.current,
    onClose,
  })

  useEffect(() => {
    const fn = (e) => {
      if (e.key === 'Escape') requestClose()
    }
    document.addEventListener('keydown', fn)
    return () => document.removeEventListener('keydown', fn)
  }, [requestClose])

  useEffect(() => {
    if (!selectedId) {
      setHistory([])
      return
    }
    let cancelled = false
    setLoadingHistory(true)
    fetchPermissionsForEmployee(selectedId)
      .then((rows) => {
        if (!cancelled) setHistory(rows)
      })
      .finally(() => {
        if (!cancelled) setLoadingHistory(false)
      })
    return () => {
      cancelled = true
    }
  }, [selectedId])

  const selectedEmployee = fixedEmployee ?? employees.find((e) => e.user_id === selectedId)
  const typeMeta = PERMISSION_TYPES[form.type]
  const hasTime = !!typeMeta?.hasTime

  async function handleCreate(e) {
    e.preventDefault()
    if (!form.userId) {
      setFormError('Selecciona un empleado')
      return
    }
    if (!form.start_date) {
      setFormError('La fecha es obligatoria')
      return
    }
    // Llegada tarde / salida temprana: un solo día con hora puntual, no un rango.
    const endDate = hasTime ? form.start_date : form.end_date
    if (hasTime && !form.event_time) {
      setFormError('La hora es obligatoria')
      return
    }
    if (!hasTime) {
      if (!endDate) {
        setFormError('Ambas fechas son obligatorias')
        return
      }
      if (endDate < form.start_date) {
        setFormError('La fecha de fin debe ser igual o posterior a la de inicio')
        return
      }
    }
    const sameTypeOverlap = history.find(
      (r) => r.type === form.type && form.start_date <= r.end_date && endDate >= r.start_date,
    )
    if (sameTypeOverlap) {
      setFormError(
        `Ya hay un registro de "${PERMISSION_TYPES[form.type].label}" del ${isoToDdmmyyyy(sameTypeOverlap.start_date)} al ${isoToDdmmyyyy(sameTypeOverlap.end_date)}`,
      )
      return
    }
    setSaving(true)
    setFormError(null)
    try {
      await createPermission({
        userId: form.userId,
        companyId,
        type: form.type,
        startDate: form.start_date,
        endDate,
        eventTime: hasTime ? form.event_time : null,
        reason: form.reason || null,
        createdBy: userProfile?.user_id ?? null,
      })
      setForm((f) => ({ ...f, start_date: '', end_date: '', event_time: '', reason: '' }))
      setSelectedId(form.userId)
      if (fixedEmployee) setShowForm(false)
      onChange?.()
      // Refresca el historial local del empleado elegido
      const rows = await fetchPermissionsForEmployee(form.userId)
      setHistory(rows)
    } catch (err) {
      setFormError(err.message ?? 'No se pudo guardar el registro.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/25 backdrop-blur-[3px]">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex-shrink-0 flex items-center justify-between px-6 pt-5 pb-4 border-b border-[#ece9df]">
          <div>
            <h2 className="text-[18px] font-bold text-[#111]">Permisos</h2>
            {selectedEmployee && (
              <p className="text-[14px] text-[#888] mt-0.5">
                {selectedEmployee.first_name} {selectedEmployee.last_name}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            {canManage && !showForm && (
              <button
                type="button"
                onClick={() => setShowForm(true)}
                className="px-3 py-1.5 rounded-lg text-[14px] font-bold bg-[#111] text-white hover:bg-[#222] transition-colors"
              >
                + Nuevo
              </button>
            )}
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
          {canManage && showForm && (
            <form onSubmit={handleCreate} className="bg-[#f5f3eb] rounded-xl p-4 space-y-3">
              <p className="text-[14px] font-semibold text-[#555]">Nuevo registro</p>
              {formError && <p className="text-[14px] text-red-600">{formError}</p>}

              {!fixedEmployee && (
                <div>
                  <label className="block text-[13px] font-mono font-bold tracking-[0.12em] uppercase text-[#888] mb-1">
                    Empleado *
                  </label>
                  <select
                    className="input-base"
                    value={form.userId}
                    onChange={(e) => {
                      setForm((f) => ({ ...f, userId: e.target.value }))
                      setSelectedId(e.target.value)
                    }}
                    required
                  >
                    <option value="">Selecciona un empleado</option>
                    {employees.map((e) => (
                      <option key={e.user_id} value={e.user_id}>
                        {e.first_name} {e.last_name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="block text-[13px] font-mono font-bold tracking-[0.12em] uppercase text-[#888] mb-1">
                  Tipo *
                </label>
                <select
                  className="input-base"
                  value={form.type}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, type: e.target.value, end_date: '', event_time: '' }))
                  }
                >
                  {Object.entries(PERMISSION_TYPES).map(([key, meta]) => (
                    <option key={key} value={key}>
                      {meta.label}
                    </option>
                  ))}
                </select>
              </div>

              {hasTime ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[13px] font-mono font-bold tracking-[0.12em] uppercase text-[#888] mb-1">
                      Fecha *
                    </label>
                    <DateInput
                      value={form.start_date}
                      onChange={(v) => setForm((f) => ({ ...f, start_date: v }))}
                      required
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="permission-event-time"
                      className="block text-[13px] font-mono font-bold tracking-[0.12em] uppercase text-[#888] mb-1"
                    >
                      Hora *
                    </label>
                    <input
                      id="permission-event-time"
                      type="time"
                      className="input-base"
                      value={form.event_time}
                      onChange={(e) => setForm((f) => ({ ...f, event_time: e.target.value }))}
                    />
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[13px] font-mono font-bold tracking-[0.12em] uppercase text-[#888] mb-1">
                      Inicio *
                    </label>
                    <DateInput
                      value={form.start_date}
                      onChange={(v) => setForm((f) => ({ ...f, start_date: v }))}
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-[13px] font-mono font-bold tracking-[0.12em] uppercase text-[#888] mb-1">
                      Fin *
                    </label>
                    <DateInput
                      value={form.end_date}
                      min={form.start_date}
                      onChange={(v) => setForm((f) => ({ ...f, end_date: v }))}
                      required
                    />
                  </div>
                </div>
              )}

              <div>
                <label className="block text-[13px] font-mono font-bold tracking-[0.12em] uppercase text-[#888] mb-1">
                  Motivo
                </label>
                <textarea
                  className="input-base"
                  rows={2}
                  value={form.reason}
                  onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))}
                />
              </div>

              <div className="flex justify-end gap-2">
                {fixedEmployee && (
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
                )}
                <button
                  type="submit"
                  disabled={saving}
                  className="px-3 py-1.5 rounded-lg text-[14px] font-bold bg-[#111] text-white hover:bg-[#222] disabled:opacity-50 transition-colors"
                >
                  {saving ? 'Guardando…' : 'Registrar'}
                </button>
              </div>
            </form>
          )}

          {/* Historial de la persona seleccionada */}
          {selectedId && (
            <div className="space-y-2">
              <p className="text-[13px] font-mono font-bold tracking-[0.1em] uppercase text-[#888]">
                Historial
              </p>
              {loadingHistory ? (
                <div className="flex justify-center py-6">
                  <div className="w-5 h-5 border-2 border-[#FFB800] border-t-transparent rounded-full animate-spin" />
                </div>
              ) : history.length === 0 ? (
                <p className="text-[14px] text-[#bbb] text-center py-6">Sin registros.</p>
              ) : (
                history.map((r) => {
                  const meta = PERMISSION_TYPES[r.type] ?? {
                    label: r.type,
                    pill: 'bg-gray-100 text-gray-600',
                  }
                  const days = vacationDays(r.start_date, r.end_date)
                  return (
                    <div
                      key={r.id}
                      className="bg-white border border-[#e0ddd4] rounded-xl px-4 py-3"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-[15px] font-semibold text-[#111]">
                            {meta.hasTime ? (
                              <>
                                {isoToDdmmyyyy(r.start_date)}
                                {r.event_time && (
                                  <span className="text-[13px] font-normal text-[#999]">
                                    {' '}
                                    · {r.event_time.slice(0, 5)}
                                  </span>
                                )}
                              </>
                            ) : (
                              <>
                                {isoToDdmmyyyy(r.start_date)} – {isoToDdmmyyyy(r.end_date)}
                                <span className="text-[13px] font-normal text-[#999]">
                                  {' '}
                                  · {days} día{days === 1 ? '' : 's'}
                                </span>
                              </>
                            )}
                          </p>
                          <span
                            className={`inline-block mt-1 text-[13px] font-semibold px-2 py-0.5 rounded-full border ${meta.pill}`}
                          >
                            {meta.label}
                          </span>
                          {r.reason && <p className="text-[13.5px] text-[#888] mt-1">{r.reason}</p>}
                        </div>
                        {canManage && (
                          <button
                            type="button"
                            onClick={() => onRequestDelete?.(r)}
                            className="w-6 h-6 flex items-center justify-center rounded text-[#bbb] hover:text-red-500 hover:bg-red-50 transition-colors flex-shrink-0"
                            aria-label={`Eliminar registro ${r.start_date}`}
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
                        )}
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
