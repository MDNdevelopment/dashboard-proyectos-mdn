import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../supabase'
import { Avatar } from '../tareas/UserPickerSingle'
import EmployeeModal from './EmployeeModal'
import VacationsDialog from './VacationsDialog'
import NewEmployeeDialog from './NewEmployeeDialog'

export default function EmployeesView({ companyId }) {
  const [employees, setEmployees] = useState([])
  const [departments, setDepartments] = useState([])
  const [positions, setPositions] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  // Modal de edición: null=cerrado, objeto=editar
  const [editModal, setEditModal] = useState(null)
  // Diálogo de vacaciones: null=cerrado, objeto=empleado
  const [vacEmployee, setVacEmployee] = useState(null)
  // Dialog crear empleado
  const [createOpen, setCreateOpen] = useState(false)

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

  // ── Filtro local ────────────────────────────────────────────────────────────
  const filtered = employees.filter(e => {
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
      <div className="flex items-center gap-3 mb-4">
        <p className="text-[15px] text-[#888] flex-shrink-0">
          {employees.length} empleado{employees.length !== 1 ? 's' : ''}
        </p>
        <input
          type="text"
          className="input-base max-w-xs"
          placeholder="Buscar por nombre o email…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <div className="ml-auto">
          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            className="px-3 py-1.5 rounded-lg text-[14px] font-bold bg-[#FFB800] text-[#111] hover:bg-[#e6a600] transition-colors"
          >
            + Nuevo empleado
          </button>
        </div>
      </div>

      {/* Estado vacío */}
      {filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-[#e0ddd4] p-10 text-center">
          <p className="text-[17px] font-semibold text-[#888] mb-1">
            {search ? 'Sin resultados' : 'Sin empleados'}
          </p>
          <p className="text-[15px] text-[#bbb]">
            {search
              ? 'Intenta con otro nombre o email.'
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
                  <span className="text-[13px] font-mono text-[#999] bg-[#f5f3eb] px-2 py-0.5 rounded-full">
                    Nivel {emp.access_level}
                  </span>
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
    </>
  )
}
