import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts'
import { supabase } from '../../supabase'
import { Avatar } from '../tareas/UserPickerSingle'
import UserPickerSingle from '../tareas/UserPickerSingle'
import {
  aggregateTaskMetrics,
  buildMonthlySeries,
  aggregateProjectParticipation,
} from '../../utils/aggregateTaskMetrics'
import { COL_META, parseD, monthIndex } from '../tareas/constants'

// ─── Sub-componentes locales ──────────────────────────────────────────────────

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
    <div
      className={`rounded-2xl border px-4 py-4 flex flex-col gap-1 ${
        accent ? 'bg-[#FFB800] border-[#e6a600]' : 'bg-white border-[#e0ddd4]'
      }`}
    >
      <p
        className={`text-[11px] font-mono font-bold tracking-[0.14em] uppercase ${
          accent ? 'text-[#7a5500]' : 'text-[#888]'
        }`}
      >
        {label}
      </p>
      <p className="text-[28px] font-bold leading-none text-[#111]">
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

/** Barra horizontal proporcional a un conteo sobre un máximo */
function StatusBar({ label, count, total, color }) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0
  return (
    <div className="flex items-center gap-3">
      <div className="flex items-center gap-1.5 w-32 flex-shrink-0">
        <span
          className="w-2.5 h-2.5 rounded-sm flex-shrink-0"
          style={{ background: color }}
        />
        <span className="text-[13px] font-mono text-[#888] truncate">{label}</span>
      </div>
      <div className="flex-1 bg-[#f0ede3] rounded-full h-2 relative overflow-hidden">
        <div
          className="absolute inset-y-0 left-0 rounded-full transition-all duration-500"
          style={{ width: `${pct}%`, background: color }}
        />
      </div>
      <span className="text-[13px] font-bold font-mono w-7 text-right text-[#555]">
        {count}
      </span>
    </div>
  )
}

/** Tarjeta compacta de métrica operativa (retrasadas/bloqueadas/arrastradas) */
function StatChip({ label, value, color = '#888', onClick }) {
  const base = 'flex flex-col items-center gap-0.5 bg-[#fafaf7] rounded-xl border border-[#e0ddd4] px-4 py-3 min-w-[90px]'
  const clickable = onClick ? 'cursor-pointer hover:border-[#bbb] hover:bg-[#f5f3eb] transition-colors' : ''
  return onClick ? (
    <button type="button" onClick={onClick} className={`${base} ${clickable}`}>
      <span className="text-[22px] font-bold leading-none" style={{ color }}>{value}</span>
      <span className="text-[11px] font-mono text-[#888] uppercase tracking-[0.1em] text-center leading-tight">{label}</span>
    </button>
  ) : (
    <div className={base}>
      <span className="text-[22px] font-bold leading-none" style={{ color }}>{value}</span>
      <span className="text-[11px] font-mono text-[#888] uppercase tracking-[0.1em] text-center leading-tight">{label}</span>
    </div>
  )
}

// ─── Constantes ───────────────────────────────────────────────────────────────

const STATUS_ORDER = ['En proceso', 'Por revisar', 'Pendiente', 'Bloqueado', 'Terminado']
const PROJECT_STATUS_META = {
  Pendiente:    { color: '#F0871F', bg: '#FEF3E2' },
  'En proceso': { color: '#b45309', bg: '#FEF9C3' },
  Completado:   { color: '#16A34A', bg: '#DCFCE7' },
}

// ─── Componente principal ─────────────────────────────────────────────────────

export default function MiPerfilV2View({ userId, companyId, userProfile, canEval }) {
  const navigate = useNavigate()
  const [allTasks, setAllTasks] = useState([])
  const [projects, setProjects] = useState([])
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [targetId, setTargetId] = useState(userId)
  const [selectedMonth, setSelectedMonth] = useState('') // '' = histórico

  // Si cambia el userId (distinto empleado autenticado), resetear target
  useEffect(() => {
    setTargetId(userId)
  }, [userId])

  const load = useCallback(async () => {
    if (!companyId) return
    setLoading(true)
    setError(null)

    const queries = [
      supabase.from('tasks').select('*').eq('company_id', companyId),
      supabase.from('projects').select('id, name, status, members'),
    ]
    if (canEval) {
      queries.push(
        supabase
          .from('users')
          .select(
            'user_id, first_name, last_name, avatar_url, access_level, company_id,' +
            ' position:positions(position_name)',
          )
          .eq('company_id', companyId)
          .order('first_name'),
      )
    }

    const [tasksRes, projectsRes, usersRes] = await Promise.all(queries)

    if (tasksRes.error) {
      setError(tasksRes.error.message)
      setLoading(false)
      return
    }

    setAllTasks(tasksRes.data ?? [])
    setProjects(projectsRes.data ?? [])
    if (usersRes) setUsers(usersRes.data ?? [])
    setLoading(false)
  }, [companyId, canEval])

  useEffect(() => {
    load()
  }, [load])

  // ─── Derivados ──────────────────────────────────────────────────────────────

  const monthIdx = selectedMonth ? monthIndex(parseD(selectedMonth + '-01')) : null
  const isHistorico = monthIdx === null

  const metrics = aggregateTaskMetrics(allTasks, targetId, { monthIdx, role: 'assignee' })
  // Estado operativo SIEMPRE sobre el histórico (retrasadas/bloqueadas/arrastradas del estado actual)
  const liveMetrics =
    isHistorico ? metrics : aggregateTaskMetrics(allTasks, targetId, { monthIdx: null, role: 'assignee' })
  const supportMetrics = aggregateTaskMetrics(allTasks, targetId, { monthIdx, role: 'support' })
  const monthlySeries = buildMonthlySeries(allTasks, targetId, { role: 'assignee' })
  const projectMetrics = aggregateProjectParticipation(projects, targetId)

  // Resolver datos del empleado objetivo
  const targetUser =
    users.find(u => u.user_id === targetId) ??
    (targetId === userId ? userProfile : null)

  // ─── Render: loading / error ─────────────────────────────────────────────────

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

  const isEmpty = metrics.total === 0 && supportMetrics.total === 0 && projectMetrics.total === 0

  return (
    <div className="space-y-6">

      {/* ── Selector de empleado (solo managers/admins) ───────────────────── */}
      {canEval && users.length > 0 && (
        <div className="flex items-center gap-3">
          <span className="text-[12px] font-mono font-bold tracking-[0.14em] uppercase text-[#888] flex-shrink-0">
            Ver estadísticas de:
          </span>
          <div className="w-72">
            <UserPickerSingle
              users={users}
              selectedId={targetId}
              onChange={id => id && setTargetId(id)}
              clearable={false}
              placeholder="Seleccionar empleado"
            />
          </div>
        </div>
      )}

      {/* ── Cabecera de perfil ────────────────────────────────────────────── */}
      {targetUser && (
        <Card>
          <div className="flex items-center gap-4">
            <Avatar user={targetUser} size={56} />
            <div className="flex-1 min-w-0">
              <h2 className="text-[20px] font-bold text-[#111]">
                {targetUser.first_name} {targetUser.last_name}
              </h2>
              <p className="text-[15px] text-[#666] mt-0.5">
                {targetUser.position?.position_name ??
                  targetUser.position_name ??
                  userProfile?.position?.position_name ??
                  '—'}
                {userProfile?.department?.department_name && targetId === userId && (
                  <span className="text-[#bbb]"> · {userProfile.department.department_name}</span>
                )}
              </p>
              {targetUser.email && (
                <p className="text-[13px] text-[#aaa] mt-0.5">{targetUser.email}</p>
              )}
            </div>
            <div className="text-right flex-shrink-0">
              <p className="text-[11px] font-mono font-bold uppercase tracking-[0.14em] text-[#bbb]">
                Tareas asignadas
              </p>
              <p className="text-[32px] font-bold text-[#111] leading-none mt-0.5">
                {aggregateTaskMetrics(allTasks, targetId, { role: 'assignee' }).total}
              </p>
            </div>
          </div>
        </Card>
      )}

      {/* ── Selector de período ───────────────────────────────────────────── */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => setSelectedMonth('')}
          className={`px-4 py-1.5 rounded-lg text-[14px] font-semibold border transition-all ${
            isHistorico
              ? 'bg-[#111] text-white border-[#111]'
              : 'bg-white text-[#666] border-[#e0ddd4] hover:border-[#bbb]'
          }`}
        >
          Histórico
        </button>
        <label className="flex items-center gap-2">
          <span className="text-[13px] font-mono font-bold uppercase tracking-[0.1em] text-[#888]">
            Mes
          </span>
          <input
            type="month"
            className="input-base py-1 text-[15px]"
            value={selectedMonth}
            onChange={e => setSelectedMonth(e.target.value)}
          />
        </label>
      </div>

      {/* ── Estado vacío ─────────────────────────────────────────────────── */}
      {isEmpty ? (
        <Card className="py-16 text-center">
          <p className="text-[17px] font-semibold text-[#888] mb-1">Sin tareas registradas</p>
          <p className="text-[15px] text-[#bbb]">
            {isHistorico
              ? 'Este empleado no tiene tareas asignadas.'
              : 'No hay tareas activas en el período seleccionado.'}
          </p>
        </Card>
      ) : (
        <>
          {/* ── KPIs Responsable ───────────────────────────────────────────── */}
          {metrics.total > 0 && (
            <div>
              <SectionLabel>Como responsable{!isHistorico ? ` — ${selectedMonth}` : ''}</SectionLabel>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <KpiCard
                  label="% Completación"
                  value={`${metrics.completionPct}%`}
                  sub={`${metrics.terminadas} de ${metrics.total} tareas`}
                  accent
                />
                <KpiCard
                  label="Total asignadas"
                  value={metrics.total}
                />
                <KpiCard
                  label="Terminadas"
                  value={metrics.terminadas}
                />
                {metrics.onTimePct !== null ? (
                  <KpiCard
                    label="% A tiempo"
                    value={`${metrics.onTimePct}%`}
                    sub={`${metrics.aTiempo} a tiempo · ${metrics.tarde} tarde`}
                  />
                ) : (
                  <KpiCard
                    label="% A tiempo"
                    value="—"
                    sub="Sin fechas de entrega"
                  />
                )}
              </div>

              {/* Segunda fila de KPIs: tiempos */}
              {(metrics.avgDelayDays !== null || metrics.avgResolutionDays !== null) && (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 mt-3">
                  {metrics.avgResolutionDays !== null && (
                    <KpiCard
                      label="Días promedio resolución"
                      value={metrics.avgResolutionDays}
                      sub="solicitud → cierre"
                    />
                  )}
                  {metrics.avgDelayDays !== null && (
                    <KpiCard
                      label="Demora promedio"
                      value={`+${metrics.avgDelayDays}d`}
                      sub="en tareas entregadas tarde"
                    />
                  )}
                </div>
              )}
            </div>
          )}

          {/* ── Estado operativo actual ────────────────────────────────────── */}
          {metrics.total > 0 && (
            <Card>
              <SectionLabel>Estado operativo actual · click para ver en tareas</SectionLabel>
              <div className="flex flex-wrap gap-3">
                <StatChip
                  label="Retrasadas"
                  value={liveMetrics.retrasadas}
                  color={liveMetrics.retrasadas > 0 ? '#E14848' : '#bbb'}
                  onClick={liveMetrics.retrasadas > 0
                    ? () => navigate(`/tareas?view=base&assignee=${targetId}&fAlert=late`)
                    : undefined}
                />
                <StatChip
                  label="Bloqueadas"
                  value={liveMetrics.bloqueadas}
                  color={liveMetrics.bloqueadas > 0 ? '#E14848' : '#bbb'}
                  onClick={liveMetrics.bloqueadas > 0
                    ? () => navigate(`/tareas?view=base&assignee=${targetId}&status=Bloqueado`)
                    : undefined}
                />
                <StatChip
                  label="Atrasadas"
                  value={liveMetrics.arrastradas}
                  color={liveMetrics.arrastradas > 0 ? '#F0871F' : '#bbb'}
                  onClick={liveMetrics.arrastradas > 0
                    ? () => navigate(`/tareas?view=base&assignee=${targetId}&fAlert=drag`)
                    : undefined}
                />
              </div>
            </Card>
          )}

          {/* ── Distribución por estado ────────────────────────────────────── */}
          {metrics.total > 0 && Object.keys(metrics.byStatus).length > 0 && (
            <Card>
              <SectionLabel>Distribución por estado</SectionLabel>
              <div className="space-y-2.5">
                {STATUS_ORDER.filter(s => metrics.byStatus[s] > 0).map(s => (
                  <StatusBar
                    key={s}
                    label={s}
                    count={metrics.byStatus[s] ?? 0}
                    total={metrics.total}
                    color={COL_META[s]?.color ?? '#888'}
                  />
                ))}
              </div>
            </Card>
          )}

          {/* ── Evolución mensual (solo en histórico) ─────────────────────── */}
          {isHistorico && monthlySeries.length > 1 && (
            <Card>
              <SectionLabel>Evolución mensual — % completación</SectionLabel>
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={monthlySeries} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                  <CartesianGrid stroke="#f0ede3" strokeDasharray="4 4" />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 10, fontFamily: 'DM Mono, monospace', fill: '#888' }}
                    tickFormatter={v => {
                      // Abreviar "Junio 2026" → "Jun 26"
                      const parts = v.split(' ')
                      if (parts.length === 2) {
                        return `${parts[0].slice(0, 3)} ${parts[1].slice(2)}`
                      }
                      return v
                    }}
                  />
                  <YAxis
                    domain={[0, 100]}
                    ticks={[0, 25, 50, 75, 100]}
                    tick={{ fontSize: 10, fontFamily: 'DM Mono, monospace', fill: '#888' }}
                    tickFormatter={v => `${v}%`}
                  />
                  <Tooltip
                    contentStyle={{
                      fontSize: 12,
                      fontFamily: 'DM Mono, monospace',
                      borderRadius: 8,
                      border: '1px solid #e0ddd4',
                      background: '#fff',
                    }}
                    formatter={(val, _name, props) => [
                      `${val}% (${props.payload.terminadas}/${props.payload.total})`,
                      'Completación',
                    ]}
                  />
                  <Line
                    type="monotone"
                    dataKey="completionPct"
                    stroke="#FFB800"
                    strokeWidth={2.5}
                    dot={{ fill: '#FFB800', r: 4 }}
                    activeDot={{ r: 6 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </Card>
          )}

          {/* ── Apoyo de dirección ─────────────────────────────────────────── */}
          {supportMetrics.total > 0 && (
            <Card>
              <SectionLabel>Como apoyo de dirección</SectionLabel>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <KpiCard
                  label="Tareas de apoyo"
                  value={supportMetrics.total}
                />
                <KpiCard
                  label="Terminadas"
                  value={supportMetrics.terminadas}
                />
                <KpiCard
                  label="% Completación"
                  value={`${supportMetrics.completionPct}%`}
                />
                {supportMetrics.onTimePct !== null && (
                  <KpiCard
                    label="% A tiempo"
                    value={`${supportMetrics.onTimePct}%`}
                  />
                )}
              </div>
              {Object.keys(supportMetrics.byStatus).length > 0 && (
                <div className="mt-4 space-y-2.5">
                  {STATUS_ORDER.filter(s => supportMetrics.byStatus[s] > 0).map(s => (
                    <StatusBar
                      key={s}
                      label={s}
                      count={supportMetrics.byStatus[s] ?? 0}
                      total={supportMetrics.total}
                      color={COL_META[s]?.color ?? '#888'}
                    />
                  ))}
                </div>
              )}
            </Card>
          )}

          {/* ── Proyectos ──────────────────────────────────────────────────── */}
          {projectMetrics.total > 0 && (
            <Card>
              <SectionLabel>Proyectos</SectionLabel>
              <div className="flex items-center gap-4 mb-4">
                <div>
                  <p className="text-[28px] font-bold text-[#111] leading-none">
                    {projectMetrics.total}
                  </p>
                  <p className="text-[13px] text-[#888] mt-0.5">
                    proyecto{projectMetrics.total !== 1 ? 's' : ''} en los que participa
                  </p>
                </div>
                <div className="ml-auto text-right">
                  <p className="text-[22px] font-bold text-[#16A34A] leading-none">
                    {projectMetrics.completedPct}%
                  </p>
                  <p className="text-[13px] text-[#888] mt-0.5">completados</p>
                </div>
              </div>

              {/* Lista de proyectos con nombre y status, clickeables */}
              <div className="space-y-1.5">
                {projects
                  .filter(p => Array.isArray(p.members) && p.members.includes(targetId))
                  .map(p => {
                    const meta = PROJECT_STATUS_META[p.status] ?? { color: '#888', bg: '#f0ede3' }
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => navigate(`/?projectId=${p.id}`)}
                        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-[#fafaf7] transition-colors text-left group"
                      >
                        <svg
                          width="12" height="12" viewBox="0 0 12 12" fill="none"
                          stroke={meta.color} strokeWidth="2" className="flex-shrink-0"
                        >
                          <rect x="1" y="1" width="10" height="10" rx="2"/>
                        </svg>
                        <span className="flex-1 text-[15px] font-medium text-[#111] truncate group-hover:text-[#111]">
                          {p.name}
                        </span>
                        <span
                          className="text-[12px] font-bold px-2 py-0.5 rounded-full flex-shrink-0"
                          style={{ background: meta.bg, color: meta.color }}
                        >
                          {p.status}
                        </span>
                        <svg
                          width="12" height="12" viewBox="0 0 16 16" fill="none"
                          stroke="#bbb" strokeWidth="2" className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <path d="M6 3l5 5-5 5" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      </button>
                    )
                  })}
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  )
}
