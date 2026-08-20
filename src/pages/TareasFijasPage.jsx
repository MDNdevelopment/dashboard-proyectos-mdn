import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../supabase'
import { useAuth } from '../context/AuthContext'
import { loadLines, loadClients } from '../components/metricas/metricsApi'
import { MONTHS } from '../components/metricas/constants'
import { visibleLinesForUser } from '../utils/lineMembers'
import { buildFixedWeeks } from '../utils/fixedTasks'
import FixedTasksGrid from '../components/tareas-fijas/FixedTasksGrid'
import FixedTasksReportPreview from '../components/tareas-fijas/FixedTasksReportPreview'

const ALL_LINES = '__all__'

function currentYearMonth() {
  const d = new Date()
  return { year: d.getFullYear(), month: d.getMonth() + 1 }
}

export default function TareasFijasPage() {
  const { userProfile, can = () => true } = useAuth()
  const canManage = can('tareas.fijas.manage')
  // "Todas las líneas" es exclusivo de nivel 4 / admin (mismo criterio que TareasPage).
  const canViewAll = userProfile?.access_level >= 4 || userProfile?.admin === true

  const [lines, setLines] = useState([])
  const [clients, setClients] = useState([])
  const [companyUsers, setCompanyUsers] = useState([])
  const [marks, setMarks] = useState([])
  const [checkEvents, setCheckEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [activeLineId, setActiveLineId] = useState(null)
  const [{ year, month }, setPeriod] = useState(currentYearMonth)
  const [weekN, setWeekN] = useState(1)

  const weeks = buildFixedWeeks(year, month)

  // Reinicia la semana activa si el mes cambia y esa semana ya no existe (meses de 4 semanas).
  useEffect(() => {
    if (!weeks.find((w) => w.n === weekN)) setWeekN(1)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, month])

  const loadAll = useCallback(async () => {
    if (!userProfile?.company_id) return
    setLoading(true)
    const companyId = userProfile.company_id

    const [linesRes, clientsRes, usersRes] = await Promise.all([
      loadLines(companyId, { includeGeneral: false }),
      loadClients(companyId),
      supabase
        .from('users')
        .select('user_id, first_name, last_name, avatar_url, deleted_at')
        .eq('company_id', companyId),
    ])

    const visible = visibleLinesForUser(linesRes.data ?? [], userProfile)
    setLines(visible)
    setClients(clientsRes.data ?? [])
    setCompanyUsers(usersRes.data ?? [])
    setActiveLineId((prev) => prev ?? (canViewAll ? ALL_LINES : (visible[0]?.id ?? null)))
    setLoading(false)
  }, [userProfile, canViewAll])

  useEffect(() => {
    loadAll()
  }, [loadAll])

  // Líneas en alcance según la selección (una línea concreta, o todas las visibles).
  const scopedLines =
    activeLineId === ALL_LINES ? lines : lines.filter((l) => l.id === activeLineId)
  const scopedLineIds = scopedLines.map((l) => l.id)

  const loadMarks = useCallback(async () => {
    if (scopedLineIds.length === 0) {
      setMarks([])
      return
    }
    const { data } = await supabase
      .from('fixed_task_marks')
      .select('*')
      .eq('period_year', year)
      .eq('period_month', month)
      .in('line_id', scopedLineIds)
    setMarks(data ?? [])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopedLineIds.join(','), year, month])

  useEffect(() => {
    loadMarks()
  }, [loadMarks])

  // Eventos de Chequeo del mes en alcance (para el preview de «Actualización de
  // Plataformas» dentro de Productividad — ver components/tareas-fijas/FixedTasksReportPreview.jsx
  // y utils/chequeo.js → computePlataformasProductividad).
  const loadCheckEventsForScope = useCallback(async () => {
    if (scopedLineIds.length === 0) {
      setCheckEvents([])
      return
    }
    const from = `${year}-${String(month).padStart(2, '0')}-01`
    const nextMonth = month === 12 ? 1 : month + 1
    const nextYear = month === 12 ? year + 1 : year
    const to = `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`
    const { data } = await supabase
      .from('publication_check_events')
      .select('*')
      .in('line_id', scopedLineIds)
      .gte('published_at', from)
      .lt('published_at', to)
    setCheckEvents(data ?? [])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopedLineIds.join(','), year, month])

  useEffect(() => {
    loadCheckEventsForScope()
  }, [loadCheckEventsForScope])

  // Realtime: cambios de otros usuarios en la grilla del mes activo.
  useEffect(() => {
    if (!userProfile?.company_id) return
    const channel = supabase
      .channel('fixed-task-marks-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'fixed_task_marks' },
        (payload) => {
          const row = payload.new ?? payload.old
          if (row.period_year !== year || row.period_month !== month) return
          setMarks((prev) => {
            if (payload.eventType === 'INSERT') {
              return prev.some((m) => m.id === payload.new.id) ? prev : [...prev, payload.new]
            }
            if (payload.eventType === 'UPDATE') {
              return prev.map((m) => (m.id === payload.new.id ? payload.new : m))
            }
            if (payload.eventType === 'DELETE') {
              return prev.filter((m) => m.id !== payload.old.id)
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

  function handleMarkChanged(mark) {
    setMarks((prev) => {
      if (mark._deleted) return prev.filter((m) => m.id !== mark.id)
      const exists = prev.some((m) => m.id === mark.id)
      return exists ? prev.map((m) => (m.id === mark.id ? mark : m)) : [...prev, mark]
    })
  }

  const activeLine =
    activeLineId === ALL_LINES ? null : (lines.find((l) => l.id === activeLineId) ?? null)
  const scopedClients = clients.filter((c) => scopedLineIds.includes(c.line_id))

  return (
    <main className="flex-1 overflow-y-auto main-bg">
      <div className="max-w-7xl mx-auto px-4 py-6 sm:px-6 sm:py-8">
        <div className="mb-1 text-[12px] font-mono uppercase tracking-wide text-[#a29b8c]">
          Gestión de Tareas <span className="text-[#ccc]">›</span> Tareas Fijas
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between mb-6">
          <div>
            <h1 className="text-[26px] font-bold text-[#111] leading-tight">Tareas Fijas</h1>
            <p className="text-[15px] text-[#888] mt-0.5">
              Grilla semanal de cumplimiento — Redes / Diseño
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
            </div>

            <FixedTasksGrid
              lines={scopedLines}
              clients={scopedClients}
              companyUsers={companyUsers}
              marks={marks}
              weeks={weeks}
              weekN={weekN}
              year={year}
              month={month}
              companyId={userProfile?.company_id}
              canManage={canManage}
              userId={userProfile?.user_id}
              onMarkChanged={handleMarkChanged}
              groupByLine={activeLineId === ALL_LINES}
            />

            <FixedTasksReportPreview
              lines={scopedLines}
              clients={clients}
              marks={marks}
              weeks={weeks}
              checkEvents={checkEvents}
              showMatrix={activeLineId === ALL_LINES}
              lineLabel={activeLine?.name}
            />
          </>
        )}
      </div>
    </main>
  )
}
