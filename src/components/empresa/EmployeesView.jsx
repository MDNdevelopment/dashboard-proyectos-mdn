import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../supabase'
import { Avatar } from '../tareas/UserPickerSingle'
import EmployeeModal from './EmployeeModal'
import VacationsDialog from './VacationsDialog'
import NewEmployeeDialog from './NewEmployeeDialog'
import EmployeeInfoModal from '../metricas/EmployeeInfoModal'

const VIEW_STORAGE_KEY = 'empresa.empleados.view'
const LEVELS = [1, 2, 3, 4]

// ── Toggle de vista (iconos discretos) ────────────────────────────────────────
function ViewToggle({ view, onChange }) {
  return (
    <div className="flex bg-[#f5f3eb] border border-[#e0ddd4] rounded-lg p-0.5">
      <button
        type="button"
        onClick={() => onChange('columnas')}
        aria-pressed={view === 'columnas'}
        aria-label="Vista por nivel"
        title="Vista por nivel"
        className={`p-1.5 rounded-md transition-all ${
          view === 'columnas' ? 'bg-white text-[#111] shadow-sm' : 'text-[#999] hover:text-[#555]'
        }`}
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6">
          <rect x="1" y="1" width="2.6" height="12" rx="0.5" />
          <rect x="5.7" y="1" width="2.6" height="12" rx="0.5" />
          <rect x="10.4" y="1" width="2.6" height="12" rx="0.5" />
        </svg>
      </button>
      <button
        type="button"
        onClick={() => onChange('lista')}
        aria-pressed={view === 'lista'}
        aria-label="Vista lista"
        title="Vista lista"
        className={`p-1.5 rounded-md transition-all ${
          view === 'lista' ? 'bg-white text-[#111] shadow-sm' : 'text-[#999] hover:text-[#555]'
        }`}
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
          <line x1="1" y1="2.5" x2="13" y2="2.5" />
          <line x1="1" y1="7" x2="13" y2="7" />
          <line x1="1" y1="11.5" x2="13" y2="11.5" />
        </svg>
      </button>
    </div>
  )
}

// ── Card de empleado (lista completa / columnas compacta) ─────────────────────
function EmployeeCard({ emp, compact, onEdit, onVacations, onOpen }) {
  const fullName = `${emp.first_name} ${emp.last_name}`

  if (compact) {
    return (
      <div className="group bg-white rounded-lg border border-[#e0ddd4] px-2.5 py-2 flex items-center gap-2">
        <button
          type="button"
          onClick={() => onOpen(emp)}
          aria-label={`Ver ficha de ${fullName}`}
          className="flex-1 min-w-0 flex items-center gap-2 text-left"
        >
          <Avatar user={emp} size={28} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1">
              <span className="text-[13px] font-semibold text-[#111] truncate">
                {fullName}
              </span>
              {emp.admin && (
                <span className="text-[9px] font-mono font-bold tracking-wide uppercase bg-[#FFB800] text-[#111] px-1 py-0.5 rounded flex-shrink-0">
                  Admin
                </span>
              )}
            </div>
            <p className="text-[12px] text-[#888] truncate">
              {emp.position?.position_name ?? '—'}
            </p>
          </div>
        </button>
        <div className="flex items-center gap-1 flex-shrink-0 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus-within:opacity-100 transition-opacity">
          <button
            type="button"
            onClick={e => { e.stopPropagation(); onVacations(emp) }}
            aria-label={`Vacaciones de ${fullName}`}
            title="Vacaciones"
            className="p-1 rounded text-[#999] hover:text-[#555] hover:bg-[#f5f3eb] transition-colors"
          >
            <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4">
              <rect x="1.5" y="2.5" width="11" height="10" rx="1.5" />
              <line x1="1.5" y1="5.5" x2="12.5" y2="5.5" />
              <line x1="4" y1="1" x2="4" y2="3.5" strokeLinecap="round" />
              <line x1="10" y1="1" x2="10" y2="3.5" strokeLinecap="round" />
            </svg>
          </button>
          <button
            type="button"
            onClick={e => { e.stopPropagation(); onEdit(emp) }}
            aria-label={`Editar ${fullName}`}
            title="Editar"
            className="p-1 rounded text-[#999] hover:text-[#555] hover:bg-[#f5f3eb] transition-colors"
          >
            <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4">
              <path d="M9.5 1.8l2.7 2.7L4.6 12.1l-3.2.6.6-3.2z" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-xl border border-[#e0ddd4] px-4 py-3 flex items-center gap-3">
      {/* Info principal — clickeable, abre la ficha */}
      <button
        type="button"
        onClick={() => onOpen(emp)}
        aria-label={`Ver ficha de ${fullName}`}
        className="flex-1 min-w-0 flex items-center gap-3 text-left"
      >
        <Avatar user={emp} size={38} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[16px] font-semibold text-[#111]">
              {fullName}
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
          </div>
          <p className="text-[14px] text-[#888] mt-0.5 truncate">{emp.email}</p>
          <p className="text-[14px] text-[#666] mt-0.5">
            {emp.position?.position_name ?? '—'}
            {emp.department?.department_name ? (
              <span className="text-[#bbb]"> · {emp.department.department_name}</span>
            ) : null}
          </p>
        </div>
      </button>

      {/* Acciones */}
      <div className="flex items-center gap-2 flex-shrink-0">
        <button
          type="button"
          onClick={() => onVacations(emp)}
          className="px-3 py-1.5 rounded-lg text-[14px] font-semibold text-[#555] border border-[#e0ddd4] hover:bg-[#f5f3eb] transition-colors"
        >
          Vacaciones
        </button>
        <button
          type="button"
          onClick={() => onEdit(emp)}
          className="px-3 py-1.5 rounded-lg text-[14px] font-bold bg-[#111] text-white hover:bg-[#222] transition-colors"
        >
          Editar
        </button>
      </div>
    </div>
  )
}

export default function EmployeesView({ companyId }) {
  const [employees, setEmployees] = useState([])
  const [departments, setDepartments] = useState([])
  const [positions, setPositions] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  // Vista: 'columnas' (por defecto, agrupada por nivel) | 'lista'. Se recuerda en localStorage.
  const [view, setView] = useState(() => {
    try {
      return localStorage.getItem(VIEW_STORAGE_KEY) || 'columnas'
    } catch {
      return 'columnas'
    }
  })

  useEffect(() => {
    try {
      localStorage.setItem(VIEW_STORAGE_KEY, view)
    } catch {
      // localStorage no disponible (modo privado, etc.) — ignorar
    }
  }, [view])

  // Modal de edición: null=cerrado, objeto=editar
  const [editModal, setEditModal] = useState(null)
  // Diálogo de vacaciones: null=cerrado, objeto=empleado
  const [vacEmployee, setVacEmployee] = useState(null)
  // Ficha de detalle (solo lectura): null=cerrado, objeto=empleado
  const [infoEmployee, setInfoEmployee] = useState(null)
  // Dialog crear empleado
  const [createOpen, setCreateOpen] = useState(false)

  // ── Carga de datos ──────────────────────────────────────────────────────────
  const loadAll = useCallback(async () => {
    if (!companyId) return
    setLoading(true)
    const [usersRes, deptsRes, posRes] = await Promise.all([
      supabase
        .from('users')
        .select('*, department:departments(department_name), position:positions(position_name, position_description, position_functions)')
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
    const position = (e.position?.position_name ?? '').toLowerCase()
    const department = (e.department?.department_name ?? '').toLowerCase()
    return (
      fullName.includes(q) ||
      e.email.toLowerCase().includes(q) ||
      position.includes(q) ||
      department.includes(q)
    )
  })

  // ── Agrupación por nivel (solo para vista columnas) ─────────────────────────
  const byLevel = { 1: [], 2: [], 3: [], 4: [] }
  const sinNivel = []
  filtered.forEach(emp => {
    if (LEVELS.includes(emp.access_level)) byLevel[emp.access_level].push(emp)
    else sinNivel.push(emp)
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
          placeholder="Buscar por nombre, email, cargo o departamento…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <div className="ml-auto flex items-center gap-3">
          <ViewToggle view={view} onChange={setView} />
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
              ? 'Intenta con otro nombre, email, cargo o departamento.'
              : 'Aún no hay empleados registrados en esta empresa.'}
          </p>
        </div>
      ) : view === 'lista' ? (
        <div className="space-y-2">
          {filtered.map(emp => (
            <EmployeeCard
              key={emp.user_id}
              emp={emp}
              compact={false}
              onEdit={setEditModal}
              onVacations={setVacEmployee}
              onOpen={setInfoEmployee}
            />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {LEVELS.map(level => (
            <div key={level}>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-[12px] font-mono font-bold tracking-wide uppercase bg-[#f0ede3] text-[#666] border border-[#e0ddd4] px-1.5 py-0.5 rounded">
                  Nivel {level}
                </span>
                <span className="text-[12px] text-[#bbb]">Total: {byLevel[level].length}</span>
              </div>
              {byLevel[level].length === 0 ? (
                <p className="text-[13px] text-[#ccc] px-1">Sin empleados</p>
              ) : (
                <div className="space-y-1.5">
                  {byLevel[level].map(emp => (
                    <EmployeeCard
                      key={emp.user_id}
                      emp={emp}
                      compact
                      onEdit={setEditModal}
                      onVacations={setVacEmployee}
                      onOpen={setInfoEmployee}
                    />
                  ))}
                </div>
              )}
            </div>
          ))}
          {sinNivel.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-[12px] font-mono font-bold tracking-wide uppercase bg-[#f0ede3] text-[#666] border border-[#e0ddd4] px-1.5 py-0.5 rounded">
                  Sin nivel
                </span>
                <span className="text-[12px] text-[#bbb]">Total: {sinNivel.length}</span>
              </div>
              <div className="space-y-1.5">
                {sinNivel.map(emp => (
                  <EmployeeCard
                    key={emp.user_id}
                    emp={emp}
                    compact
                    onEdit={setEditModal}
                    onVacations={setVacEmployee}
                    onOpen={setInfoEmployee}
                  />
                ))}
              </div>
            </div>
          )}
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

      {/* Ficha de detalle (solo lectura) */}
      {infoEmployee !== null && (
        <EmployeeInfoModal
          employee={infoEmployee}
          onClose={() => setInfoEmployee(null)}
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
