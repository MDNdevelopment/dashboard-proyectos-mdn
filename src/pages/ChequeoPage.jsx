import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../supabase'
import { useAuth } from '../context/AuthContext'
import { loadLines, loadClients } from '../components/metricas/metricsApi'
import { visibleLinesForUser } from '../utils/lineMembers'
import { loadChecks } from '../components/chequeo/chequeoApi'
import ChequeoGrid from '../components/chequeo/ChequeoGrid'

const ALL_LINES = '__all__'

export default function ChequeoPage() {
  const { userProfile, can = () => true } = useAuth()
  const canManage = can('chequeo.manage')
  // "Todas las líneas" es exclusivo de nivel 4 / admin (mismo criterio que Tareas Fijas).
  const canViewAll = userProfile?.access_level >= 4 || userProfile?.admin === true

  const [lines, setLines] = useState([])
  const [clients, setClients] = useState([])
  const [checks, setChecks] = useState([])
  const [loading, setLoading] = useState(true)
  const [activeLineId, setActiveLineId] = useState(null)

  const loadAll = useCallback(async () => {
    if (!userProfile?.company_id) return
    setLoading(true)
    const companyId = userProfile.company_id

    const [linesRes, clientsRes, checksRes] = await Promise.all([
      loadLines(companyId, { includeGeneral: false }),
      loadClients(companyId),
      loadChecks(companyId),
    ])

    const visible = visibleLinesForUser(linesRes.data ?? [], userProfile)
    setLines(visible)
    setClients(clientsRes.data ?? [])
    setChecks(checksRes.data ?? [])
    setActiveLineId((prev) => prev ?? (canViewAll ? ALL_LINES : (visible[0]?.id ?? null)))
    setLoading(false)
  }, [userProfile, canViewAll])

  useEffect(() => {
    loadAll()
  }, [loadAll])

  // Realtime: cambios de otros usuarios en la grilla.
  useEffect(() => {
    if (!userProfile?.company_id) return
    const channel = supabase
      .channel('publication-checks-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'publication_checks' },
        (payload) => {
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
  }, [userProfile?.company_id, loadAll])

  function handleCheckChanged(check) {
    setChecks((prev) => {
      if (check._deleted) return prev.filter((c) => c.id !== check.id)
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
              Última publicación por red social — Publicaciones, Reels e Highlights
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

            <ChequeoGrid
              lines={scopedLines}
              clients={scopedClients}
              checks={checks}
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
