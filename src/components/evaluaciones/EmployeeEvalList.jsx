import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../supabase'
import { Avatar } from '../tareas/UserPickerSingle'
import EvaluationModal from './EvaluationModal'
import getPastMonthRange from '../../utils/getPastMonthRange'

export default function EmployeeEvalList({ companyId, currentUserId }) {
  const navigate = useNavigate()
  const { firstDay } = getPastMonthRange()

  const [employees, setEmployees] = useState([])
  const [sessionsByEmployee, setSessionsByEmployee] = useState({}) // { employee_id: session }
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  // Modal: null=cerrado, objeto={ employee, evaluationId }
  const [modal, setModal] = useState(null)

  // ── Carga de datos ──────────────────────────────────────────────────────────
  const loadAll = useCallback(async () => {
    if (!companyId || !currentUserId) return
    setLoading(true)

    const [usersRes, sessionsRes] = await Promise.all([
      supabase
        .from('users')
        .select('*, department:departments(department_name), position:positions(position_name)')
        .eq('company_id', companyId)
        .neq('user_id', currentUserId)
        .is('deleted_at', null)
        .order('first_name'),
      supabase
        .from('evaluation_sessions')
        .select('*')
        .eq('manager_id', currentUserId)
        .eq('period', firstDay),
    ])

    setEmployees(usersRes.data ?? [])

    // Mapear sesiones por employee_id (una por período por evaluador)
    const map = {}
    ;(sessionsRes.data ?? []).forEach(s => { map[s.employee_id] = s })
    setSessionsByEmployee(map)

    setLoading(false)
  }, [companyId, currentUserId, firstDay])

  useEffect(() => { loadAll() }, [loadAll])

  // ── Realtime ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!companyId) return
    const channel = supabase
      .channel('evaluaciones-list-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'evaluation_sessions' }, () => loadAll())
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [companyId, loadAll])

  // ── Handlers ────────────────────────────────────────────────────────────────
  function handleSaved(session) {
    setSessionsByEmployee(prev => ({ ...prev, [session.employee_id]: session }))
  }

  function handleDeleted(evaluationId) {
    setSessionsByEmployee(prev => {
      const next = { ...prev }
      Object.keys(next).forEach(empId => {
        if (next[empId]?.id === evaluationId) delete next[empId]
      })
      return next
    })
  }

  // ── Filtro local ────────────────────────────────────────────────────────────
  const filtered = employees.filter(e => {
    const q = search.toLowerCase()
    if (!q) return true
    const fullName = `${e.first_name} ${e.last_name}`.toLowerCase()
    return fullName.includes(q) || (e.email ?? '').toLowerCase().includes(q)
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
        <span className="ml-auto text-[13px] font-mono text-[#aaa]">
          Período: {firstDay}
        </span>
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
              : 'No hay empleados registrados en esta empresa.'}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(emp => {
            const session = sessionsByEmployee[emp.user_id]
            const evaluated = session != null

            return (
              <div
                key={emp.user_id}
                className="bg-white rounded-xl border border-[#e0ddd4] px-4 py-3 flex items-center gap-3"
              >
                {/* Avatar */}
                <Avatar user={emp} size={38} />

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <button
                    type="button"
                    onClick={() => navigate(`/evaluaciones/empleado/${emp.user_id}`)}
                    className="text-[16px] font-semibold text-[#111] hover:text-[#FFB800] transition-colors text-left"
                  >
                    {emp.first_name} {emp.last_name}
                  </button>
                  <p className="text-[14px] text-[#666] mt-0.5">
                    {emp.position?.position_name ?? '—'}
                    {emp.department?.department_name ? (
                      <span className="text-[#bbb]"> · {emp.department.department_name}</span>
                    ) : null}
                  </p>
                </div>

                {/* Score del período si ya fue evaluado */}
                {evaluated && (
                  <div className="text-center flex-shrink-0">
                    <span className="text-[22px] font-bold text-[#111]">
                      {session.total_score?.toFixed(1)}
                    </span>
                    <span className="text-[13px] text-[#bbb] font-mono"> /5</span>
                  </div>
                )}

                {/* Botón Evaluar / Ver */}
                <div className="flex-shrink-0">
                  {evaluated ? (
                    <button
                      type="button"
                      onClick={() => setModal({ employee: emp, evaluationId: session.id })}
                      className="px-3 py-1.5 rounded-lg text-[14px] font-semibold text-[#555] border border-[#e0ddd4] hover:bg-[#f5f3eb] transition-colors"
                    >
                      Ver
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setModal({ employee: emp, evaluationId: undefined })}
                      className="px-3 py-1.5 rounded-lg text-[14px] font-bold bg-[#FFB800] text-[#111] hover:bg-[#e6a600] transition-colors"
                    >
                      Evaluar
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Modal de evaluación */}
      {modal !== null && (
        <EvaluationModal
          employee={modal.employee}
          evaluationId={modal.evaluationId}
          managerId={currentUserId}
          onClose={() => setModal(null)}
          onSaved={handleSaved}
          onDeleted={handleDeleted}
        />
      )}
    </>
  )
}
