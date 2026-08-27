import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../supabase'
import { useAuth } from '../context/AuthContext'
import { loadLines, loadClients } from '../components/metricas/metricsApi'
import { MONTHS } from '../components/metricas/constants'
import { visibleLinesForUser } from '../utils/lineMembers'
import { buildFixedWeeks } from '../utils/fixedTasks'
import { currentFixedWeekN } from '../utils/chequeo'
import { loadChecks } from '../components/chequeo/chequeoApi'
import ChequeoGrid from '../components/chequeo/ChequeoGrid'

const ALL_LINES = '__all__'

function currentYearMonth() {
  const d = new Date()
  return { year: d.getFullYear(), month: d.getMonth() + 1 }
}

export default function ChequeoPage() {
  const { userProfile, can = () => true } = useAuth()
  const canManage = can('chequeo.manage')
  // "Todas las líneas" es de dirección (nivel≥4), admin, o quien tenga explícitamente
  // chequeo.ver_todo (configurable en Empresa → Permisos, mismo patrón que
  // audiovisual.ver_todo en AudiovisualView.jsx).
  const canViewAll =
    userProfile?.access_level >= 4 || userProfile?.admin === true || can('chequeo.ver_todo')

  const [lines, setLines] = useState([])
  const [clients, setClients] = useState([])
  const [checks, setChecks] = useState([])
  const [loading, setLoading] = useState(true)
  const [activeLineId, setActiveLineId] = useState(null)
  const [{ year, month }, setPeriod] = useState(currentYearMonth)
  const [weekN, setWeekN] = useState(1)
  const [viewMode, setViewMode] = useState('week')

  const weeks = buildFixedWeeks(year, month)
  const todayWeekN = currentFixedWeekN(weeks)

  // Reinicia la semana activa si el mes cambia y esa semana ya no existe (meses de 4/5 semanas).
  useEffect(() => {
    if (!weeks.find((w) => w.n === weekN)) setWeekN(1)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, month])

  // Al entrar, arranca en la semana en curso (si el mes inicial es el actual).
  useEffect(() => {
    if (todayWeekN) setWeekN(todayWeekN)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const loadAll = useCallback(async () => {
    if (!userProfile?.company_id) return
    setLoading(true)
    const companyId = userProfile.company_id

    const [linesRes, clientsRes, checksRes] = await Promise.all([
      loadLines(companyId, { includeGeneral: false }),
      loadClients(companyId),
      loadChecks(companyId, year, month),
    ])

    const visible = visibleLinesForUser(linesRes.data ?? [], userProfile, {
      extraViewAll: can('chequeo.ver_todo'),
    })
    setLines(visible)
    setClients(clientsRes.data ?? [])
    setChecks(checksRes.data ?? [])
    setActiveLineId((prev) => prev ?? (canViewAll ? ALL_LINES : (visible[0]?.id ?? null)))
    setLoading(false)
  }, [userProfile, canViewAll, can, year, month])

  useEffect(() => {
    loadAll()
  }, [loadAll])

  // Realtime: cambios de otros usuarios en la grilla del mes activo.
  useEffect(() => {
    if (!userProfile?.company_id) return
    const channel = supabase
      .channel('publication-checks-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'publication_checks' },
        (payload) => {
          const row = payload.new ?? payload.old
          if (row.period_year !== year || row.period_month !== month) return
          setChecks((prev) => {
            if (payload.eventType === 'INSERT') {
              return prev.some((c) => c.id === payload.new.id) ? prev : [...prev, payload.new]
            }
            if (payload.eventType === 'UPDATE') {
              return prev.map((c) => (c.id === payload.new.id ? payload.new : c))
            }
            if (payload.eventType === 'DELETE') {
              return prev.filter((c) => c.id !== payload.old.id)
            }
            return prev
          })
        },
      )
      .on('postgres_changes', { event: '*', schema: 'public', table: 'metric_clients' }, () =>
        loadAll(),
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [userProfile?.company_id, year, month, loadAll])

  function handleCheckChanged(check) {
    setChecks((prev) => {
      const exists = prev.some((c) => c.id === check.id)
      return exists ? prev.map((c) => (c.id === check.id ? check : c)) : [...prev, check]
    })
  }

  // Líneas en alcance según la selección (una línea concreta, o todas las visibles).
  const scopedLines =
    activeLineId === ALL_LINES ? lines : lines.filter((l) => l.id === activeLineId)
  const scopedLineIds = scopedLines.map((l) => l.id)
  const scopedClients = clients.filter((c) => scopedLineIds.includes(c.line_id))

  return (
    <main className="flex-1 overflow-y-auto main-bg">
      <div className="max-w-7xl mx-auto px-4 py-6 sm:px-6 sm:py-8">
        <div className="mb-1 text-[12px] font-mono uppercase tracking-wide text-[#a29b8c]">
          Gestión de Tareas <span className="text-[#ccc]">›</span> Chequeo
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between mb-6">
          <div>
            <h1 className="text-[26px] font-bold text-[#111] leading-tight">Chequeo</h1>
            <p className="text-[15px] text-[#888] mt-0.5">
              Publicaciones por semana — Publicaciones, Reels e Highlights
            </p>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-6 h-6 border-2 border-[#FFB800] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : lines.length === 0 ? (
          <div className="bg-white rounded-xl border border-[#e0ddd4] p-10 text-center mb-4">
            <p className="text-[17px] font-semibold text-[#888] mb-1">No hay líneas visibles</p>
            <p className="text-[15px] text-[#bbb]">
              Contacta a dirección si crees que deberías ver una línea aquí.
            </p>
          </div>
        ) : (
          <>
            {/* Selector de línea */}
            <div className="flex flex-wrap gap-1.5 items-center mb-4">
              {canViewAll && (
                <button
                  onClick={() => setActiveLineId(ALL_LINES)}
                  className={`px-3 py-1 rounded-full text-[14.5px] font-semibold transition-all ${
                    activeLineId === ALL_LINES
                      ? 'bg-[#FFB800] text-[#111]'
                      : 'bg-white border border-[#e0ddd4] text-[#555] hover:border-[#FFB800] hover:text-[#111]'
                  }`}
                >
                  Todas
                </button>
              )}
              {lines.map((l) => (
                <button
                  key={l.id}
                  onClick={() => setActiveLineId(l.id)}
                  className={`px-3 py-1 rounded-full text-[14.5px] font-semibold transition-all ${
                    activeLineId === l.id
                      ? 'bg-[#FFB800] text-[#111]'
                      : 'bg-white border border-[#e0ddd4] text-[#555] hover:border-[#FFB800] hover:text-[#111]'
                  }`}
                >
                  {l.name}
                </button>
              ))}
            </div>

            {/* Selector de período + semana */}
            <div className="flex flex-wrap items-center gap-3 mb-4">
              <div className="flex items-center gap-1.5">
                <span className="text-[12px] font-mono font-bold tracking-[0.14em] uppercase text-[#888] mr-1">
                  Mes
                </span>
                <select
                  value={month}
                  onChange={(e) => setPeriod({ year, month: Number(e.target.value) })}
                  className="text-[13.5px] border border-[#e0ddd4] rounded-lg px-2 py-1.5 bg-white text-[#333] focus:outline-none focus:border-[#FFB800]"
                >
                  {MONTHS.map((name, i) => (
                    <option key={i} value={i + 1}>
                      {name}
                    </option>
                  ))}
                </select>
                <select
                  value={year}
                  onChange={(e) => setPeriod({ year: Number(e.target.value), month })}
                  className="text-[13.5px] border border-[#e0ddd4] rounded-lg px-2 py-1.5 bg-white text-[#333] focus:outline-none focus:border-[#FFB800]"
                >
                  {[year - 1, year, year + 1].map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </select>
              </div>
              <div className="h-4 w-px bg-[#e0ddd4]" />
              {viewMode === 'week' && (
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[12px] font-mono font-bold tracking-[0.14em] uppercase text-[#888] mr-1">
                    Semana
                  </span>
                  {weeks.map((w) => (
                    <button
                      key={w.n}
                      onClick={() => setWeekN(w.n)}
                      className={`px-2.5 py-1 rounded-lg text-[13px] font-semibold transition-all ${
                        weekN === w.n
                          ? 'bg-[#111] text-white'
                          : 'bg-white border border-[#e0ddd4] text-[#666] hover:bg-[#f5f3eb]'
                      }`}
                    >
                      S{w.n}
                    </button>
                  ))}
                </div>
              )}
              <div className="h-4 w-px bg-[#e0ddd4]" />
              <button
                onClick={() => setViewMode((m) => (m === 'week' ? 'recent' : 'week'))}
                className={`px-2.5 py-1 rounded-lg text-[13px] font-semibold transition-all ${
                  viewMode === 'recent'
                    ? 'bg-[#111] text-white'
                    : 'bg-white border border-[#e0ddd4] text-[#666] hover:bg-[#f5f3eb]'
                }`}
              >
                {viewMode === 'recent' ? '← Ver por semana' : 'Ver fecha más reciente'}
              </button>
            </div>

            <ChequeoGrid
              lines={scopedLines}
              clients={scopedClients}
              checks={checks}
              weeks={weeks}
              weekN={weekN}
              viewMode={viewMode}
              companyId={userProfile?.company_id}
              canManage={canManage}
              userId={userProfile?.user_id}
              onCheckChanged={handleCheckChanged}
              groupByLine={activeLineId === ALL_LINES}
            />
          </>
        )}
      </div>
    </main>
  )
}
