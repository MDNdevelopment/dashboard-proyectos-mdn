import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { format, parseISO } from 'date-fns'
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts'
import { supabase } from '../../supabase'
import { Avatar } from '../tareas/UserPickerSingle'
import AiEvaluation from './AiEvaluation'

function fmtDate(dateStr) {
  try { return format(parseISO(dateStr), 'MM/yyyy') }
  catch { return dateStr }
}

function fmtDateFull(dateStr) {
  try { return format(parseISO(dateStr), 'dd/MM/yyyy') }
  catch { return dateStr }
}

export default function EmployeeProfileView({ employeeId }) {
  const navigate = useNavigate()

  const [employee, setEmployee] = useState(null)
  const [sessions, setSessions] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!employeeId) return
    async function load() {
      setLoading(true)
      setError(null)

      const [userRes, sessRes] = await Promise.all([
        supabase
          .from('users')
          .select('*, department:departments(department_name), position:positions(position_name)')
          .eq('user_id', employeeId)
          .single(),
        supabase
          .from('evaluation_sessions')
          .select('*, evaluation_responses(*), evaluation_comments(*)')
          .eq('employee_id', employeeId)
          .order('period', { ascending: false }),
      ])

      if (userRes.error) { setError(userRes.error.message); setLoading(false); return }
      setEmployee(userRes.data)
      setSessions(sessRes.data ?? [])
      setLoading(false)
    }
    load()
  }, [employeeId])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-6 h-6 border-2 border-[#FFB800] border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 text-red-700 text-[13px] rounded-xl px-4 py-3">
        {error}
      </div>
    )
  }

  if (!employee) return null

  // Datos de la gráfica en orden ascendente
  const chartData = [...sessions]
    .reverse()
    .map(s => ({
      period: fmtDate(s.period),
      score: parseFloat((s.total_score ?? 0).toFixed(2)),
    }))

  return (
    <div className="space-y-6">
      {/* Botón volver */}
      <button
        type="button"
        onClick={() => navigate('/evaluaciones')}
        className="flex items-center gap-1.5 text-[13px] font-semibold text-[#555] hover:text-[#111] transition-colors"
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2.2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 2L4 7l5 5" />
        </svg>
        Volver a la lista
      </button>

      {/* Cabecera del empleado */}
      <div className="bg-white rounded-xl border border-[#e0ddd4] px-5 py-4 flex items-center gap-4">
        <Avatar user={employee} size={52} />
        <div className="flex-1 min-w-0">
          <h2 className="text-[18px] font-bold text-[#111]">
            {employee.first_name} {employee.last_name}
          </h2>
          <p className="text-[13px] text-[#666] mt-0.5">
            {employee.position?.position_name ?? '—'}
            {employee.department?.department_name ? (
              <span className="text-[#bbb]"> · {employee.department.department_name}</span>
            ) : null}
          </p>
          <p className="text-[12px] text-[#aaa] mt-0.5">{employee.email}</p>
        </div>
        <div className="text-right flex-shrink-0">
          <p className="text-[11px] font-mono font-bold uppercase tracking-[0.1em] text-[#bbb]">
            Evaluaciones
          </p>
          <p className="text-[28px] font-bold text-[#111] leading-none mt-0.5">
            {sessions.length}
          </p>
        </div>
      </div>

      {sessions.length === 0 ? (
        <div className="bg-white rounded-xl border border-[#e0ddd4] p-10 text-center">
          <p className="text-[15px] font-semibold text-[#888] mb-1">Sin evaluaciones</p>
          <p className="text-[13px] text-[#bbb]">
            Este empleado aún no tiene evaluaciones registradas.
          </p>
        </div>
      ) : (
        <>
          {/* Gráfica de evolución */}
          <div className="bg-white rounded-2xl border border-[#e0ddd4] px-5 py-4">
            <p className="text-[11px] font-mono font-bold tracking-[0.14em] uppercase text-[#888] mb-4">
              Evolución de score
            </p>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={chartData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                <CartesianGrid stroke="#f0ede3" strokeDasharray="4 4" />
                <XAxis
                  dataKey="period"
                  tick={{ fontSize: 10, fontFamily: 'DM Mono, monospace', fill: '#888' }}
                />
                <YAxis
                  domain={[0, 5]}
                  ticks={[0, 1, 2, 3, 4, 5]}
                  tick={{ fontSize: 10, fontFamily: 'DM Mono, monospace', fill: '#888' }}
                />
                <Tooltip
                  contentStyle={{
                    fontSize: 12,
                    fontFamily: 'DM Mono, monospace',
                    borderRadius: 8,
                    border: '1px solid #e0ddd4',
                  }}
                  formatter={val => [`${val} / 5`, 'Score']}
                />
                <Line
                  type="monotone"
                  dataKey="score"
                  stroke="#FFB800"
                  strokeWidth={2.5}
                  dot={{ fill: '#FFB800', r: 4 }}
                  activeDot={{ r: 6 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Análisis IA */}
          <AiEvaluation employeeId={employeeId} />

          {/* Historial de evaluaciones */}
          <div className="space-y-3">
            <h3 className="text-[11px] font-mono font-bold tracking-[0.14em] uppercase text-[#888]">
              Historial
            </h3>
            {sessions.map(session => {
              const commentText = session.evaluation_comments?.[0]?.comment
              return (
                <div
                  key={session.id}
                  className="bg-white rounded-xl border border-[#e0ddd4] px-5 py-4"
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[12px] font-mono text-[#888]">
                      {fmtDateFull(session.period)}
                    </span>
                    <div className="flex items-baseline gap-1">
                      <span className="text-[22px] font-bold text-[#111]">
                        {session.total_score?.toFixed(1)}
                      </span>
                      <span className="text-[12px] text-[#bbb] font-mono">/5</span>
                    </div>
                  </div>

                  {/* Respuestas */}
                  {(session.evaluation_responses ?? []).length > 0 && (
                    <div className="space-y-1 mb-2">
                      {session.evaluation_responses.map(r => (
                        <div key={r.id} className="flex items-center gap-2">
                          <span className="flex gap-0.5">
                            {[1, 2, 3, 4, 5].map(n => (
                              <span
                                key={n}
                                className={`w-3 h-3 rounded-sm ${
                                  n <= r.response ? 'bg-[#FFB800]' : 'bg-[#e0ddd4]'
                                }`}
                              />
                            ))}
                          </span>
                          <span className="text-[11px] font-mono text-[#aaa]">{r.response}/5</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {commentText && (
                    <p className="text-[12px] text-[#555] italic border-t border-[#f0ede3] pt-2 mt-2">
                      &ldquo;{commentText}&rdquo;
                    </p>
                  )}
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
