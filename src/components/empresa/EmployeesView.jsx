import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../supabase'
import { useAuth } from '../../context/AuthContext'
import { Avatar } from '../tareas/UserPickerSingle'
import EmployeeModal from './EmployeeModal'
import VacationsDialog from './VacationsDialog'
import NewEmployeeDialog from './NewEmployeeDialog'
import ConfirmDeleteDialog from '../common/ConfirmDeleteDialog'

export default function EmployeesView({ companyId }) {
  const { userProfile } = useAuth()
  const [employees, setEmployees] = useState([])
  const [departments, setDepartments] = useState([])
  const [positions, setPositions] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showArchived, setShowArchived] = useState(false)

  // Modal de edición: null=cerrado, objeto=editar
  const [editModal, setEditModal] = useState(null)
  // Diálogo de vacaciones: null=cerrado, objeto=empleado
  const [vacEmployee, setVacEmployee] = useState(null)
  // Dialog crear empleado
  const [createOpen, setCreateOpen] = useState(false)
  // Diálogo de confirmación de archivado: null=cerrado, objeto=empleado
  const [confirmArchive, setConfirmArchive] = useState(null)
  const [archiving, setArchiving] = useState(false)
  const [error, setError] = useState(null)

  // ── Carga de datos ──────────────────────────────────────────────────────────
  const loadAll = useCallback(async () => {
    if (!companyId) return
    setLoading(true)
    const [usersRes, deptsRes, posRes] = await Promise.all([
      supabase
        .from('users')
        .select('*, department:departments(department_name), position:positions(position_name)')
        .eq('company_id', companyId)
        .order('first_name'),
      supabase.from('departments').select('*').eq('company_id', companyId).order('department_name'),
      supabase.from('positions').select('*').eq('company_id', companyId).order('position_name'),
    ])
    setEmployees(usersRes.data ?? [])
    setDepartments(deptsRes.data ?? [])
    setPositions(posRes.data ?? [])
    setLoading(false)
  }, [companyId])

  useEffect(() => { loadAll() }, [loadAll])

  // ── Realtime ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!companyId) return
    const channel = supabase
      .channel('empresa-empleados-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'users' }, () => loadAll())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'vacations' }, () => loadAll())
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [companyId, loadAll])

  // ── Handlers ────────────────────────────────────────────────────────────────
  function handleEmployeeSaved(saved) {
    setEmployees(prev => {
      const exists = prev.some(e => e.user_id === saved.user_id)
      if (exists) return prev.map(e => e.user_id === saved.user_id ? saved : e)
      return [...prev, saved].sort((a, b) => a.first_name.localeCompare(b.first_name))
    })
  }

  // Archivar/restaurar van a la Netlify function (service role): banea/desbanea el
  // login en auth.users además de marcar/desmarcar deleted_at en el perfil.
  async function callManage(user_id, action) {
    const { data: { session } } = await supabase.auth.getSession()
    const res = await fetch('/api/employees/manage', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ user_id, action }),
    })
    const payload = await res.json()
    if (!res.ok) throw new Error(payload.error ?? 'Error al procesar el empleado')
    return payload
  }

  async function handleArchive() {
    if (!confirmArchive) return
    setArchiving(true)
    setError(null)
    try {
      const updated = await callManage(confirmArchive.user_id, 'archive')
      handleEmployeeSaved(updated)
      setConfirmArchive(null)
    } catch (err) {
      setError(err.message)
    } finally {
      setArchiving(false)
    }
  }

  async function handleRestore(employee) {
    setError(null)
    try {
      const updated = await callManage(employee.user_id, 'restore')
      handleEmployeeSaved(updated)
    } catch (err) {
      setError(err.message)
    }
  }

  // ── Split activos / archivados + filtro local ────────────────────────────────
  const activeEmployees = employees.filter(e => !e.deleted_at)
  const archivedEmployees = employees.filter(e => !!e.deleted_at)
  const visibleEmployees = showArchived ? archivedEmployees : activeEmployees

  const filtered = visibleEmployees.filter(e => {
    const q = search.toLowerCase()
    if (!q) return true
    const fullName = `${e.first_name} ${e.last_name}`.toLowerCase()
    return fullName.includes(q) || e.email.toLowerCase().includes(q)
  })

  // ── Render ──────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-6 h-6 border-2 border-[#FFB800] border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <>
      {/* Barra superior */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <p className="text-[15px] text-[#888] flex-shrink-0">
          {visibleEmployees.length} empleado{visibleEmployees.length !== 1 ? 's' : ''}
        </p>
        <input
          type="text"
          className="input-base max-w-xs"
          placeholder="Buscar por nombre o email…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <button
          type="button"
          onClick={() => setShowArchived(v => !v)}
          className={`px-3 py-1.5 rounded-lg text-[13.5px] font-semibold border transition-all ${
            showArchived
              ? 'bg-[#f5f0e0] text-[#888] border-[#d4c890]'
              : 'bg-white text-[#aaa] border-[#e0ddd4] hover:bg-[#f5f3eb]'
          }`}
        >
          {showArchived ? 'Ocultando activos' : `Ver eliminados (${archivedEmployees.length})`}
        </button>
        {!showArchived && (
          <div className="ml-auto">
            <button
              type="button"
              onClick={() => setCreateOpen(true)}
              className="px-3 py-1.5 rounded-lg text-[14px] font-bold bg-[#FFB800] text-[#111] hover:bg-[#e6a600] transition-colors"
            >
              + Nuevo empleado
            </button>
          </div>
        )}
      </div>

      {error && (
        <div className="mb-4 bg-red-50 border border-red-300 rounded-xl px-4 py-3 text-[14px] text-red-700 font-medium">
          {error}
        </div>
      )}

      {/* Estado vacío */}
      {filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-[#e0ddd4] p-10 text-center">
          <p className="text-[17px] font-semibold text-[#888] mb-1">
            {search ? 'Sin resultados' : showArchived ? 'Sin empleados eliminados' : 'Sin empleados'}
          </p>
          <p className="text-[15px] text-[#bbb]">
            {search
              ? 'Intenta con otro nombre o email.'
              : showArchived
                ? 'Los empleados que elimines aparecerán aquí.'
                : 'Aún no hay empleados registrados en esta empresa.'}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(emp => (
            <div
              key={emp.user_id}
              className="bg-white rounded-xl border border-[#e0ddd4] px-4 py-3 flex items-center gap-3"
            >
              {/* Avatar */}
              <Avatar user={emp} size={38} />

              {/* Info principal */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[16px] font-semibold text-[#111]">
                    {emp.first_name} {emp.last_name}
                  </span>
                  {emp.admin && (
                    <span className="text-[12px] font-mono font-bold tracking-wide uppercase bg-[#FFB800] text-[#111] px-1.5 py-0.5 rounded">
                      Admin
                    </span>
                  )}
                  {emp.access_level != null && (
                    <span className="text-[12px] font-mono font-bold tracking-wide uppercase bg-[#f0ede3] text-[#666] border border-[#e0ddd4] px-1.5 py-0.5 rounded">
                      Nivel {emp.access_level}
                    </span>
                  )}
                  {emp.deleted_at && (
                    <span className="text-[12px] font-mono font-bold tracking-wide uppercase bg-red-100 text-red-700 border border-red-200 px-1.5 py-0.5 rounded">
                      Eliminado
                    </span>
                  )}
                </div>
                <p className="text-[14px] text-[#888] mt-0.5 truncate">{emp.email}</p>
                <p className="text-[14px] text-[#666] mt-0.5">
                  {emp.position?.position_name ?? '—'}
                  {emp.department?.department_name ? (
                    <span className="text-[#bbb]"> · {emp.department.department_name}</span>
                  ) : null}
                </p>
              </div>

              {/* Acciones */}
              <div className="flex items-center gap-2 flex-shrink-0">
                {emp.deleted_at ? (
                  <button
                    type="button"
                    onClick={() => handleRestore(emp)}
                    className="px-3 py-1.5 rounded-lg text-[14px] font-semibold text-[#555] border border-[#e0ddd4] hover:bg-[#f5f3eb] transition-colors"
                  >
                    Restaurar
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => setVacEmployee(emp)}
                      className="px-3 py-1.5 rounded-lg text-[14px] font-semibold text-[#555] border border-[#e0ddd4] hover:bg-[#f5f3eb] transition-colors"
                    >
                      Vacaciones
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditModal(emp)}
                      className="px-3 py-1.5 rounded-lg text-[14px] font-bold bg-[#111] text-white hover:bg-[#222] transition-colors"
                    >
                      Editar
                    </button>
                    {emp.user_id !== userProfile?.user_id && (
                      <button
                        type="button"
                        onClick={() => setConfirmArchive(emp)}
                        className="px-3 py-1.5 rounded-lg text-[14px] font-semibold text-red-600 border border-red-200 hover:bg-red-50 transition-colors"
                      >
                        Eliminar
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal de edición */}
      {editModal !== null && (
        <EmployeeModal
          employee={editModal}
          departments={departments}
          positions={positions}
          onClose={() => setEditModal(null)}
          onSaved={handleEmployeeSaved}
        />
      )}

      {/* Diálogo de vacaciones */}
      {vacEmployee !== null && (
        <VacationsDialog
          employee={vacEmployee}
          onClose={() => setVacEmployee(null)}
        />
      )}

      {/* Dialog crear empleado */}
      {createOpen && (
        <NewEmployeeDialog
          departments={departments}
          positions={positions}
          onClose={() => setCreateOpen(false)}
          onCreated={handleEmployeeSaved}
        />
      )}

      {/* Diálogo de confirmación de eliminación (soft delete) */}
      {confirmArchive && (
        <ConfirmDeleteDialog
          itemName={`${confirmArchive.first_name} ${confirmArchive.last_name}`}
          itemLabel="empleado"
          message={
            <>
              <strong>{confirmArchive.first_name} {confirmArchive.last_name}</strong> dejará de
              aparecer en selectores y conteos, y no podrá iniciar sesión. Su historial (tareas,
              reuniones, evaluaciones, reportes) se conserva intacto. Esta acción se puede revertir
              restaurando al empleado. Para confirmar, escribe su nombre completo a continuación.
            </>
          }
          onConfirm={handleArchive}
          onCancel={() => setConfirmArchive(null)}
          confirming={archiving}
        />
      )}
    </>
  )
}
