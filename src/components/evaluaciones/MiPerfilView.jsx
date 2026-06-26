import { useState, useEffect } from 'react'
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  BarChart, Bar, Cell,
} from 'recharts'
import { supabase } from '../../supabase'
import { Avatar } from '../tareas/UserPickerSingle'
import { aggregateProfileMetrics } from '../../utils/aggregateProfileMetrics'
import { aggregateGroupAverages } from '../../utils/aggregateGroupAverages'
import { representScore, formatScore, scoreColor } from '../../utils/scoreScale'

// --- Iconos locales ---
const IconTrend = ({ direction }) => {
  if (direction === 'up')
    return <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2.2"><path strokeLinecap="round" strokeLinejoin="round" d="M2 10l5-5 5 5"/></svg>
  if (direction === 'down')
    return <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2.2"><path strokeLinecap="round" strokeLinejoin="round" d="M2 4l5 5 5-5"/></svg>
  return <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2.2"><path strokeLinecap="round" strokeLinejoin="round" d="M3 7h8"/></svg>
}

const DIST_LABELS = {
  '0-1': '0–1',
  '1-2': '1–2',
  '2-3': '2–3',
  '3-4': '3–4',
  '4-5': '4–5',
}
const DIST_COLORS = {
  '0-1': '#ef4444',
  '1-2': '#f97316',
  '2-3': '#eab308',
  '3-4': '#84cc16',
  '4-5': '#22c55e',
}

function SectionLabel({ children }) {
  return (
    <p className="text-[12px] font-mono font-bold tracking-[0.16em] uppercase text-[#888] mb-3">
      {children}
    </p>
  )
}

function Card({ children, className = '' }) {
  return (
    <div className={`bg-white rounded-2xl border border-[#e0ddd4] px-5 py-4 ${className}`}>
      {children}
    </div>
  )
}

function KpiCard({ label, value, sub, accent = false }) {
  return (
    <div className={`rounded-2xl border px-4 py-4 flex flex-col gap-1 ${accent ? 'bg-[#FFB800] border-[#e6a600]' : 'bg-white border-[#e0ddd4]'}`}>
      <p className={`text-[11px] font-mono font-bold tracking-[0.14em] uppercase ${accent ? 'text-[#7a5500]' : 'text-[#888]'}`}>
        {label}
      </p>
      <p className={`text-[28px] font-bold leading-none ${accent ? 'text-[#111]' : 'text-[#111]'}`}>
        {value ?? '—'}
      </p>
      {sub && (
        <p className={`text-[13px] font-medium ${accent ? 'text-[#5a3d00]' : 'text-[#888]'}`}>
          {sub}
        </p>
      )}
    </div>
  )
}

function ComparisonBar({ label, value, max = 5 }) {
  const { bg, text } = scoreColor(value)
  const pct = value != null ? Math.min((value / max) * 100, 100) : 0
  return (
    <div className="flex items-center gap-3">
      <span className="text-[13px] font-mono text-[#888] w-28 flex-shrink-0">{label}</span>
      <div className="flex-1 bg-[#f0ede3] rounded-full h-2 relative overflow-hidden">
        <div
          className="absolute inset-y-0 left-0 rounded-full transition-all duration-500"
          style={{ width: `${pct}%`, backgroundColor: value != null && value >= 4 ? '#22c55e' : value != null && value >= 3 ? '#eab308' : '#ef4444' }}
        />
      </div>
      <span className={`text-[13px] font-bold font-mono w-10 text-right ${value != null ? text : 'text-[#aaa]'}`}>
        {value != null ? value.toFixed(2) : '—'}
      </span>
    </div>
  )
}

export default function MiPerfilView({ userId, companyId, departmentId, userProfile }) {
  const [sessions, setSessions] = useState([])
  const [groupSessions, setGroupSessions] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!userId) return
    async function load() {
      setLoading(true)
      setError(null)

      const [myRes, groupRes] = await Promise.all([
        supabase
          .from('evaluation_sessions')
          .select(`
            id, total_score, period,
            evaluation_responses(id, question_id, response, question:questions(text)),
            evaluation_comments(id, comment),
            manager:users!manager_id(first_name, last_name, avatar_url)
          `)
          .eq('employee_id', userId)
          .order('period', { ascending: false }),
        supabase
          .from('evaluation_sessions')
          .select(`
            total_score,
            employee:users!evaluation_sessions_employee_id_fkey(user_id, company_id, department_id)
          `)
          .eq('employee.company_id', companyId),
      ])

      if (myRes.error) { setError(myRes.error.message); setLoading(false); return }
      setSessions(myRes.data ?? [])
      setGroupSessions(groupRes.data ?? [])
      setLoading(false)
    }
    load()
  }, [userId, companyId])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="w-6 h-6 border-2 border-[#FFB800] border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 text-red-700 text-[15px] rounded-xl px-4 py-3">
        {error}
      </div>
    )
  }

  const metrics = aggregateProfileMetrics(sessions)
  const { companyAvg, deptAvg } = aggregateGroupAverages(groupSessions, userId, departmentId)

  const {
    evaluationCount, avgAllTime, avgCurrentPeriod, trend,
    chartData, perQuestion, strengths, weaknesses,
    distribution, comments, summaryText,
  } = metrics

  const trendColor =
    trend.direction === 'up' ? 'text-green-600' :
    trend.direction === 'down' ? 'text-red-500' :
    'text-[#888]'

  const distData = Object.entries(DIST_LABELS).map(([key, label]) => ({
    name: label,
    value: distribution[key],
    color: DIST_COLORS[key],
  }))

  return (
    <div className="space-y-6">
      {/* Cabecera */}
      <Card>
        <div className="flex items-center gap-4">
          <Avatar user={userProfile} size={56} />
          <div className="flex-1 min-w-0">
            <h2 className="text-[20px] font-bold text-[#111]">
              {userProfile?.first_name} {userProfile?.last_name}
            </h2>
            <p className="text-[15px] text-[#666] mt-0.5">
              {userProfile?.position?.position_name ?? '—'}
              {userProfile?.department?.department_name && (
                <span className="text-[#bbb]"> · {userProfile.department.department_name}</span>
              )}
            </p>
            <p className="text-[13px] text-[#aaa] mt-0.5">{userProfile?.email}</p>
          </div>
          <div className="text-right flex-shrink-0">
            <p className="text-[11px] font-mono font-bold uppercase tracking-[0.14em] text-[#bbb]">Evaluaciones</p>
            <p className="text-[32px] font-bold text-[#111] leading-none mt-0.5">{evaluationCount}</p>
          </div>
        </div>
      </Card>

      {evaluationCount === 0 ? (
        <Card className="py-16 text-center">
          <p className="text-[17px] font-semibold text-[#888] mb-1">Sin evaluaciones</p>
          <p className="text-[15px] text-[#bbb]">Aún no tienes evaluaciones registradas.</p>
        </Card>
      ) : (
        <>
          {/* Resumen textual */}
          <div className="bg-[#fffbec] border border-[#ffe58a] rounded-2xl px-5 py-4">
            <p className="text-[12px] font-mono font-bold tracking-[0.16em] uppercase text-[#b8860b] mb-1">Resumen</p>
            <p className="text-[15px] text-[#5a3d00] leading-relaxed">{summaryText}</p>
          </div>

          {/* KPIs */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <KpiCard
              label="Promedio histórico"
              value={avgAllTime != null ? avgAllTime.toFixed(2) : '—'}
              sub={representScore(avgAllTime)}
              accent
            />
            <KpiCard
              label="Período actual"
              value={avgCurrentPeriod != null ? avgCurrentPeriod.toFixed(2) : '—'}
              sub={representScore(avgCurrentPeriod)}
            />
            <KpiCard
              label="Evaluaciones"
              value={evaluationCount}
            />
            <div className={`rounded-2xl border px-4 py-4 flex flex-col gap-1 bg-white border-[#e0ddd4]`}>
              <p className="text-[11px] font-mono font-bold tracking-[0.14em] uppercase text-[#888]">Tendencia</p>
              <div className={`flex items-center gap-1.5 text-[28px] font-bold leading-none ${trendColor}`}>
                <IconTrend direction={trend.direction} />
                <span className="text-[22px]">
                  {trend.delta != null
                    ? (trend.delta > 0 ? `+${trend.delta}` : trend.delta)
                    : '—'}
                </span>
              </div>
              <p className="text-[13px] text-[#888]">
                {trend.direction === 'up' ? 'Mejorando' : trend.direction === 'down' ? 'Bajando' : 'Sin cambio'}
              </p>
            </div>
          </div>

          {/* Comparación con el equipo */}
          {(companyAvg != null || deptAvg != null) && (
            <Card>
              <SectionLabel>Comparación con el equipo</SectionLabel>
              <div className="space-y-3">
                <ComparisonBar label="Mi promedio" value={avgAllTime} />
                {deptAvg != null && <ComparisonBar label="Mi departamento" value={deptAvg} />}
                {companyAvg != null && <ComparisonBar label="Empresa" value={companyAvg} />}
              </div>
            </Card>
          )}

          {/* Gráfica de evolución */}
          {chartData.length > 1 && (
            <Card>
              <SectionLabel>Evolución de score</SectionLabel>
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
                      background: '#fff',
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
            </Card>
          )}

          {/* Análisis sin IA: Fortalezas y Debilidades */}
          {(strengths.length > 0 || weaknesses.length > 0) && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {strengths.length > 0 && (
                <Card>
                  <SectionLabel>Fortalezas</SectionLabel>
                  <div className="space-y-2.5">
                    {strengths.map(q => {
                      const { bg, text } = scoreColor(q.avg)
                      return (
                        <div key={q.questionId} className="flex items-start gap-2.5">
                          <span className={`flex-shrink-0 rounded px-1.5 py-0.5 text-[12px] font-bold font-mono ${bg} ${text}`}>
                            {q.avg?.toFixed(1)}
                          </span>
                          <span className="text-[13px] text-[#444] leading-snug">{q.text}</span>
                        </div>
                      )
                    })}
                  </div>
                </Card>
              )}
              {weaknesses.length > 0 && (
                <Card>
                  <SectionLabel>Áreas de mejora</SectionLabel>
                  <div className="space-y-2.5">
                    {weaknesses.map(q => {
                      const { bg, text } = scoreColor(q.avg)
                      return (
                        <div key={q.questionId} className="flex items-start gap-2.5">
                          <span className={`flex-shrink-0 rounded px-1.5 py-0.5 text-[12px] font-bold font-mono ${bg} ${text}`}>
                            {q.avg?.toFixed(1)}
                          </span>
                          <span className="text-[13px] text-[#444] leading-snug">{q.text}</span>
                        </div>
                      )
                    })}
                  </div>
                </Card>
              )}
            </div>
          )}

          {/* Distribución de scores */}
          <Card>
            <SectionLabel>Distribución de scores</SectionLabel>
            <ResponsiveContainer width="100%" height={140}>
              <BarChart data={distData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                <CartesianGrid stroke="#f0ede3" strokeDasharray="4 4" vertical={false} />
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 10, fontFamily: 'DM Mono, monospace', fill: '#888' }}
                />
                <YAxis
                  allowDecimals={false}
                  tick={{ fontSize: 10, fontFamily: 'DM Mono, monospace', fill: '#888' }}
                />
                <Tooltip
                  contentStyle={{
                    fontSize: 12,
                    fontFamily: 'DM Mono, monospace',
                    borderRadius: 8,
                    border: '1px solid #e0ddd4',
                  }}
                  formatter={val => [val, 'Evaluaciones']}
                />
                <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                  {distData.map(entry => (
                    <Cell key={entry.name} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </Card>

          {/* Promedio por pregunta */}
          {perQuestion.length > 0 && (
            <Card>
              <SectionLabel>Promedio por pregunta</SectionLabel>
              <div className="space-y-2.5">
                {perQuestion.map(q => {
                  const { bg, text } = scoreColor(q.avg)
                  const pct = q.avg != null ? (q.avg / 5) * 100 : 0
                  return (
                    <div key={q.questionId}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[13px] text-[#444] leading-snug flex-1 pr-3">{q.text}</span>
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          <span className={`rounded px-1.5 py-0.5 text-[12px] font-bold font-mono ${bg} ${text}`}>
                            {q.avg?.toFixed(2)}
                          </span>
                          <span className="text-[11px] text-[#aaa] font-mono">{formatScore(q.avg)}</span>
                        </div>
                      </div>
                      <div className="bg-[#f0ede3] rounded-full h-1.5 overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-500"
                          style={{
                            width: `${pct}%`,
                            backgroundColor: q.avg != null && q.avg >= 4 ? '#22c55e' : q.avg != null && q.avg >= 3 ? '#eab308' : '#ef4444',
                          }}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
            </Card>
          )}

          {/* Comentarios recibidos */}
          {comments.length > 0 && (
            <Card>
              <SectionLabel>Comentarios recibidos</SectionLabel>
              <div className="space-y-3">
                {comments.map((c, i) => (
                  <div key={i} className="border-l-2 border-[#FFB800] pl-3">
                    <p className="text-[14px] text-[#333] italic leading-relaxed">&ldquo;{c.comment}&rdquo;</p>
                    <p className="text-[12px] font-mono text-[#aaa] mt-1">
                      {c.period} · {c.manager}
                    </p>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* Historial */}
          <div className="space-y-3">
            <SectionLabel>Historial de evaluaciones</SectionLabel>
            {sessions.map(session => {
              const mgr = session.manager
                ? `${session.manager.first_name} ${session.manager.last_name}`.trim()
                : null
              const commentText = session.evaluation_comments?.[0]?.comment
              const { bg, text } = scoreColor(session.total_score)
              return (
                <div key={session.id} className="bg-white rounded-xl border border-[#e0ddd4] px-5 py-4">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <span className="text-[13px] font-mono text-[#888]">
                        {(() => { try { return session.period?.slice(0, 7).split('-').reverse().join('/') } catch { return session.period } })()}
                      </span>
                      {mgr && (
                        <p className="text-[12px] text-[#bbb] mt-0.5">Evaluado por {mgr}</p>
                      )}
                    </div>
                    <div className="flex items-baseline gap-1">
                      <span className={`text-[11px] font-bold font-mono px-2 py-0.5 rounded ${bg} ${text}`}>
                        {session.total_score?.toFixed(2)} / 5
                      </span>
                    </div>
                  </div>

                  {(session.evaluation_responses ?? []).length > 0 && (
                    <div className="space-y-1.5 mb-3">
                      {session.evaluation_responses.map(r => (
                        <div key={r.id} className="flex items-center gap-2.5">
                          <span className="flex gap-0.5">
                            {[1, 2, 3, 4, 5].map(n => (
                              <span
                                key={n}
                                className={`w-3 h-3 rounded-sm ${n <= r.response ? 'bg-[#FFB800]' : 'bg-[#e0ddd4]'}`}
                              />
                            ))}
                          </span>
                          <span className="text-[12px] font-mono text-[#aaa]">{r.response}/5</span>
                          {r.question?.text && (
                            <span className="text-[12px] text-[#666] truncate">{r.question.text}</span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {commentText && (
                    <p className="text-[13px] text-[#555] italic border-t border-[#f0ede3] pt-2 mt-2">
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
