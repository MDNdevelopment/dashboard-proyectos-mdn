import { useState, useEffect, useRef, useMemo } from 'react'
import { format } from 'date-fns'
import { supabase } from '../../supabase'
import ConfirmDeleteDialog from '../common/ConfirmDeleteDialog'
import DateInput from '../common/DateInput'
import { useUnsavedChanges } from '../../hooks/useUnsavedChanges'
import { resolveVacationStatus, vacationDays } from '../../utils/employeeCalendar'
import { isoToDdmmyyyy } from '../../utils/formatDate'

/**
 * Sin flujo de aprobación: una vacación se crea con fecha tentativa ('tentative') y se
 * pasa a 'confirmed' cuando la fecha queda cerrada — nunca 'pending'/'approved'/'rejected'.
 * 'completed' no se guarda: `resolveVacationStatus` la deriva de `end_date` vs hoy, así
 * que la etiqueta se recalcula sola sin tocar la fila cuando la vacación ya pasó.
 */
const STATUS_MAP = {
  tentative: { label: 'Fecha tentativa', cls: 'bg-amber-100 text-amber-800' },
  confirmed: { label: 'Confirmada', cls: 'bg-green-100 text-green-800' },
  completed: { label: 'Completada', cls: 'bg-[#f0ede3] text-[#666]' },
}

const fmtDate = isoToDdmmyyyy

/**
 * Diálogo de gestión de vacaciones de un empleado.
 * Props: employee (objeto con user_id, first_name, last_name), onClose,
 * onChange (opcional — se llama tras cada mutación exitosa, para que el padre refresque
 * el calendario y los paneles sin depender solo del canal realtime).
 */
export default function VacationsDialog({ employee, onClose, onChange }) {
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
  const [deleteError, setDeleteError] = useState(null)

  // Historial agrupado por año: colapsado por defecto, salvo el año en curso (se abre solo).
  const [openYears, setOpenYears] = useState(() => new Set([new Date().getFullYear()]))

  // Status en proceso
  const [updatingId, setUpdatingId] = useState(null)

  // Confirmar fecha: al confirmar se puede ajustar la fecha tentativa, así que en vez de
  // un botón directo se abre un mini-form inline con las fechas actuales precargadas.
  const [confirmingId, setConfirmingId] = useState(null)
  const [confirmDates, setConfirmDates] = useState({ start_date: '', end_date: '' })
  const [confirmError, setConfirmError] = useState(null)

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
    const overlap = vacations.find(
      (v) => newVac.start_date <= v.end_date && newVac.end_date >= v.start_date,
    )
    if (overlap) {
      setFormError(
        `Ya hay una vacación registrada del ${fmtDate(overlap.start_date)} al ${fmtDate(overlap.end_date)}`,
      )
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
        status: 'tentative',
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
    onChange?.()
  }

  // ── Volver a tentativa (revertir una vacación confirmada) ────────────────────
  async function handleRevertToTentative(vacId) {
    setUpdatingId(vacId)
    const { data, error } = await supabase
      .from('vacations')
      .update({ status: 'tentative' })
      .eq('id', vacId)
      .select()
      .single()
    if (!error && data) {
      setVacations((prev) => prev.map((v) => (v.id === vacId ? data : v)))
      onChange?.()
    }
    setUpdatingId(null)
  }

  // ── Confirmar fecha: abre el mini-form con las fechas tentativas precargadas ─
  function openConfirm(v) {
    setConfirmingId(v.id)
    setConfirmDates({ start_date: v.start_date, end_date: v.end_date })
    setConfirmError(null)
  }
  function closeConfirm() {
    setConfirmingId(null)
    setConfirmError(null)
  }
  async function handleConfirm(e) {
    e.preventDefault()
    if (!confirmDates.start_date || !confirmDates.end_date) {
      setConfirmError('Ambas fechas son obligatorias')
      return
    }
    if (confirmDates.end_date < confirmDates.start_date) {
      setConfirmError('La fecha de fin debe ser igual o posterior a la de inicio')
      return
    }
    setUpdatingId(confirmingId)
    const { data, error } = await supabase
      .from('vacations')
      .update({
        status: 'confirmed',
        start_date: confirmDates.start_date,
        end_date: confirmDates.end_date,
      })
      .eq('id', confirmingId)
      .select()
      .single()
    if (error) {
      setConfirmError(error.message)
      setUpdatingId(null)
      return
    }
    setVacations((prev) => prev.map((v) => (v.id === data.id ? data : v)))
    setUpdatingId(null)
    closeConfirm()
    onChange?.()
  }

  // ── Eliminar vacación ───────────────────────────────────────────────────────
  async function handleDeleteVacation() {
    if (!deleteDialog) return
    setDeleting(true)
    const { error } = await supabase.from('vacations').delete().eq('id', deleteDialog.id)
    setDeleting(false)
    if (error) {
      setDeleteError(error.message)
      return
    }
    setVacations((prev) => prev.filter((v) => v.id !== deleteDialog.id))
    setDeleteDialog(null)
    setDeleteError(null)
    onChange?.()
  }

  function toggleYear(year) {
    setOpenYears((prev) => {
      const next = new Set(prev)
      if (next.has(year)) next.delete(year)
      else next.add(year)
      return next
    })
  }

  // ── Próximas/en curso vs. historial agrupado por año ─────────────────────────
  // 'end_date >= hoy' es próxima o en curso; el resto es historial. Separar por bloque
  // (en vez de solo mostrar el año en cada fila) es lo que evita confundir vacaciones
  // planificadas con historial de años anteriores.
  const todayKey = format(new Date(), 'yyyy-MM-dd')
  const { upcoming, historyByYear } = useMemo(() => {
    const upcomingList = vacations
      .filter((v) => v.end_date >= todayKey)
      .sort((a, b) => (a.start_date < b.start_date ? -1 : a.start_date > b.start_date ? 1 : 0))
    const pastList = vacations
      .filter((v) => v.end_date < todayKey)
      .sort((a, b) => (a.start_date < b.start_date ? 1 : a.start_date > b.start_date ? -1 : 0))
    const byYear = new Map()
    for (const v of pastList) {
      const year = Number(v.start_date.slice(0, 4))
      if (!byYear.has(year)) byYear.set(year, [])
      byYear.get(year).push(v)
    }
    const years = [...byYear.keys()].sort((a, b) => b - a)
    return { upcoming: upcomingList, historyByYear: years.map((year) => [year, byYear.get(year)]) }
  }, [vacations, todayKey])

  // ── Render de una fila de vacación (reusado por "próximas" e "historial") ────
  function renderVacationRow(v) {
    const displayStatus = resolveVacationStatus(v.status, v.end_date, todayKey)
    const st = STATUS_MAP[displayStatus] ?? {
      label: v.status,
      cls: 'bg-gray-100 text-gray-600',
    }
    const isUpdating = updatingId === v.id
    const isConfirming = confirmingId === v.id
    const days = vacationDays(v.start_date, v.end_date)
    return (
      <div key={v.id} className="bg-white border border-[#e0ddd4] rounded-xl px-4 py-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[15px] font-semibold text-[#111]">
              {fmtDate(v.start_date)} – {fmtDate(v.end_date)}
              <span className="text-[13px] font-normal text-[#999]">
                {' '}
                · {days} día{days === 1 ? '' : 's'}
              </span>
            </p>
            <span
              className={`inline-block mt-1 text-[13px] font-semibold px-2 py-0.5 rounded-full ${st.cls}`}
            >
              {st.label}
            </span>
          </div>

          {/* Acciones de status + eliminar */}
          <div className="flex items-center gap-1 flex-shrink-0">
            {displayStatus === 'tentative' && !isConfirming && (
              <button
                type="button"
                disabled={isUpdating}
                onClick={() => openConfirm(v)}
                className="px-2 py-1 rounded-lg text-[13px] font-semibold bg-green-100 text-green-700 hover:bg-green-200 disabled:opacity-50 transition-colors"
              >
                Confirmar fecha
              </button>
            )}
            {displayStatus === 'confirmed' && (
              <button
                type="button"
                disabled={isUpdating}
                onClick={() => handleRevertToTentative(v.id)}
                className="px-2 py-1 rounded-lg text-[13px] font-semibold bg-amber-100 text-amber-700 hover:bg-amber-200 disabled:opacity-50 transition-colors"
              >
                Volver a tentativa
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                setDeleteDialog(v)
                setDeleteError(null)
              }}
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

        {/* Mini-form de confirmación: permite ajustar la fecha tentativa
            al mismo tiempo que se confirma. */}
        {isConfirming && (
          <form onSubmit={handleConfirm} className="mt-3 bg-[#f5f3eb] rounded-lg p-3 space-y-2">
            {confirmError && <p className="text-[13px] text-red-600">{confirmError}</p>}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div>
                <label className="block text-[12px] font-mono font-bold tracking-[0.1em] uppercase text-[#888] mb-1">
                  Inicio *
                </label>
                <DateInput
                  value={confirmDates.start_date}
                  onChange={(val) => setConfirmDates((d) => ({ ...d, start_date: val }))}
                  required
                />
              </div>
              <div>
                <label className="block text-[12px] font-mono font-bold tracking-[0.1em] uppercase text-[#888] mb-1">
                  Fin *
                </label>
                <DateInput
                  value={confirmDates.end_date}
                  min={confirmDates.start_date}
                  onChange={(val) => setConfirmDates((d) => ({ ...d, end_date: val }))}
                  required
                />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={closeConfirm}
                className="px-2 py-1 rounded-lg text-[13px] font-semibold text-[#555] border border-[#e0ddd4] hover:bg-white transition-colors"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={isUpdating}
                className="px-2 py-1 rounded-lg text-[13px] font-bold bg-[#111] text-white hover:bg-[#222] disabled:opacity-50 transition-colors"
              >
                {isUpdating ? 'Confirmando…' : 'Confirmar'}
              </button>
            </div>
          </form>
        )}
      </div>
    )
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
              <>
                {upcoming.length > 0 && (
                  <div className="space-y-2 mb-4">
                    <p className="text-[13px] font-mono font-bold tracking-[0.1em] uppercase text-[#888]">
                      Próximas y en curso
                    </p>
                    {upcoming.map((v) => renderVacationRow(v))}
                  </div>
                )}

                {historyByYear.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-[13px] font-mono font-bold tracking-[0.1em] uppercase text-[#888]">
                      Historial
                    </p>
                    {historyByYear.map(([year, yearVacs]) => {
                      const isOpen = openYears.has(year)
                      const totalDays = yearVacs.reduce(
                        (sum, v) => sum + vacationDays(v.start_date, v.end_date),
                        0,
                      )
                      return (
                        <div key={year} className="border border-[#e0ddd4] rounded-xl">
                          <button
                            type="button"
                            onClick={() => toggleYear(year)}
                            className="w-full flex items-center justify-between px-4 py-2.5 text-left"
                          >
                            <span className="text-[14px] font-bold text-[#111]">{year}</span>
                            <span className="text-[13px] text-[#888]">
                              {yearVacs.length} período{yearVacs.length === 1 ? '' : 's'} ·{' '}
                              {totalDays} día{totalDays === 1 ? '' : 's'}
                              <svg
                                className={`inline-block ml-2 transition-transform ${isOpen ? 'rotate-180' : ''}`}
                                width="10"
                                height="10"
                                viewBox="0 0 10 10"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="1.6"
                              >
                                <path d="M2 3.5L5 6.5L8 3.5" strokeLinecap="round" />
                              </svg>
                            </span>
                          </button>
                          {isOpen && (
                            <div className="px-3 pb-3 space-y-2">
                              {yearVacs.map((v) => renderVacationRow(v))}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}

                {upcoming.length === 0 && historyByYear.length === 0 && (
                  <div className="text-center py-8">
                    <p className="text-[16px] font-semibold text-[#888] mb-1">
                      Sin vacaciones registradas
                    </p>
                    <p className="text-[14px] text-[#bbb]">
                      Usa &ldquo;+ Nueva&rdquo; para agregar una.
                    </p>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* Confirm delete (z-[60] para que quede sobre el diálogo de vacaciones) */}
      {deleteDialog !== null && (
        <ConfirmDeleteDialog
          itemName={fmtDate(deleteDialog.start_date)}
          itemLabel="vacación"
          fieldLabel="Fecha de inicio"
          message={
            <>
              Esta acción <strong>no se puede deshacer</strong>. Vas a eliminar la vacación del{' '}
              <strong>{fmtDate(deleteDialog.start_date)}</strong> al{' '}
              <strong>{fmtDate(deleteDialog.end_date)}</strong> (
              {vacationDays(deleteDialog.start_date, deleteDialog.end_date)} días), del año{' '}
              <strong>{deleteDialog.start_date.slice(0, 4)}</strong>.
              {deleteDialog.end_date < todayKey && (
                <>
                  {' '}
                  Es una vacación <strong>ya pasada</strong> — estás borrando historial, no una
                  vacación planificada.
                </>
              )}{' '}
              Para confirmar, escribe la fecha de inicio ({fmtDate(deleteDialog.start_date)}) a
              continuación.
            </>
          }
          onConfirm={handleDeleteVacation}
          onCancel={() => {
            setDeleteDialog(null)
            setDeleteError(null)
          }}
          confirming={deleting}
        >
          {deleteError && <p className="text-[14px] text-red-600">{deleteError}</p>}
        </ConfirmDeleteDialog>
      )}
    </>
  )
}
