import { useEffect, useState, useCallback } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { loadLines } from '../components/metricas/metricsApi'
import { visibleLinesForUser } from '../utils/lineMembers'
import { supabase } from '../supabase'
import UsoView from '../components/metricas/UsoView'

function pathToSection(pathname) {
  if (pathname.startsWith('/monitor-uso/graficas')) return 'graficas'
  return 'dashboard'
}

export default function MonitorUsoPage() {
  const { userProfile } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const activeSection = pathToSection(location.pathname)

  const [lines, setLines] = useState([])
  const [loadingLines, setLoadingLines] = useState(true)

  const fetchLines = useCallback(async () => {
    if (!userProfile?.company_id) return
    const { data } = await loadLines(userProfile.company_id)
    // Nivel 4+ y admin ven todas las líneas; nivel 3 solo ve las suyas.
    setLines(visibleLinesForUser(data ?? [], userProfile))
    setLoadingLines(false)
  }, [userProfile])

  useEffect(() => {
    fetchLines()
  }, [fetchLines])

  // Canal realtime: recarga líneas y clientes si cambian
  useEffect(() => {
    if (!userProfile?.company_id) return
    const channel = supabase
      .channel('monitor-uso-lines')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'metric_lines' }, fetchLines)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'metric_clients' }, fetchLines)
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [userProfile?.company_id, fetchLines])

  if (!userProfile) {
    return (
      <main className="flex-1 overflow-y-auto main-bg h-screen">
        <div className="flex items-center justify-center py-20">
          <div className="w-6 h-6 border-2 border-[#FFB800] border-t-transparent rounded-full animate-spin" />
        </div>
      </main>
    )
  }

  return (
    <main className="flex-1 overflow-y-auto main-bg h-screen">
      <div className="max-w-7xl mx-auto px-4 py-6 sm:px-6 sm:py-8">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-[26px] font-bold text-[#111] leading-tight">Monitor de uso</h1>
          <p className="text-[15px] text-[#888] mt-0.5">
            Auditoría de uso del sistema por línea operativa
          </p>
        </div>

        {/* Tab switcher */}
        <div className="flex flex-wrap gap-1 bg-white border border-[#e0ddd4] rounded-xl p-1 w-fit mb-6">
          <button
            onClick={() => navigate('/monitor-uso/graficas')}
            className={`px-4 py-1.5 rounded-lg text-[14.5px] font-semibold transition-all ${
              activeSection === 'graficas'
                ? 'bg-[#111] text-white'
                : 'text-[#666] hover:text-[#111] hover:bg-[#f5f3eb]'
            }`}
          >
            Gráficas
          </button>
          <button
            onClick={() => navigate('/monitor-uso')}
            className={`px-4 py-1.5 rounded-lg text-[14.5px] font-semibold transition-all ${
              activeSection === 'dashboard'
                ? 'bg-[#111] text-white'
                : 'text-[#666] hover:text-[#111] hover:bg-[#f5f3eb]'
            }`}
          >
            Dashboard
          </button>
        </div>

        {/* Contenido */}
        {loadingLines ? (
          <div className="flex items-center gap-2 text-[14px] text-[#888]">
            <div className="w-4 h-4 border-2 border-[#FFB800] border-t-transparent rounded-full animate-spin" />
            Preparando líneas...
          </div>
        ) : (
          <UsoView companyId={userProfile.company_id} lines={lines} section={activeSection} />
        )}
      </div>
    </main>
  )
}
