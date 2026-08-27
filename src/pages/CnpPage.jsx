import { useState, useEffect, useCallback } from 'react'
import { useSearchParams, useNavigate, useLocation } from 'react-router-dom'
import { supabase } from '../supabase'
import { useAuth } from '../context/AuthContext'
import CnpDashboardView from '../components/cnp/CnpDashboardView'
import CnpBaseView from '../components/cnp/CnpBaseView'
import CnpModal from '../components/cnp/CnpModal'
import { loadLines, loadClients } from '../components/metricas/metricsApi'
import { currentMonthIndex } from '../components/tareas/constants'
import { MONTHS } from '../components/metricas/constants'
import { visibleLinesForUser, withDerivedGeneralMembers } from '../utils/lineMembers'

const ALL_TEAMS = '__all__'
const CURRENT_YEAR = Math.floor(currentMonthIndex() / 12)
const YEARS = [CURRENT_YEAR, CURRENT_YEAR - 1, CURRENT_YEAR - 2, CURRENT_YEAR - 3]

const VIEWS = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'base', label: 'Base' },
]

export default function CnpPage() {
  const { userProfile, can = () => true } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()
  const location = useLocation()
  const [teams, setTeams] = useState([])
  const [cnps, setCnps] = useState([])
  const [clients, setClients] = useState([])
  const [clientsById, setClientsById] = useState(new Map())
  const [usersMap, setUsersMap] = useState(new Map())
  const [allUsers, setAllUsers] = useState([])
  const [loading, setLoading] = useState(true)

  const visibleViews = VIEWS.filter((v) => can(`cnp.${v.key}`))
  const canManage = can('cnp.manage')
  const canViewAll = userProfile?.access_level >= 4 || userProfile?.admin === true

  const [activeView, setActiveView] = useState(() =>
    searchParams.get('view') === 'base' ? 'base' : 'dashboard',
  )
  // Filtro pendiente a aplicar al entrar a Base desde un KPI o fila del dashboard.
  // { status?: string, alert?: string, clientId?: string, print?: 'pending' } | null
  const [pendingBaseFilter, setPendingBaseFilter] = useState(null)

  // Sincroniza la vista activa con el historial del navegador: cuando el dashboard
  // navega a Base se empuja una entrada de historial (ver goToBaseWithFilter); al
  // presionar "atrás" el navegador dispara este efecto en vez de sacar al usuario del
  // módulo. Mismo patrón que TareasPage.jsx.
  useEffect(() => {
    const st = location.state
    if (st?.cnpView) {
      setActiveView(st.cnpView)
      setPendingBaseFilter(st.baseFilter ?? null)
    } else {
      setActiveView(searchParams.get('view') === 'base' ? 'base' : 'dashboard')
      setPendingBaseFilter(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.key])
  const [activeTeamId, setActiveTeamId] = useState(() => searchParams.get('team') ?? null)
  const [monthIdx, setMonthIdx] = useState(currentMonthIndex())
  // null = closed, undefined = new, object = edit
  const [cnpModal, setCnpModal] = useState(null)

  useEffect(() => {
    if (userProfile && visibleViews.length > 0 && !visibleViews.find((v) => v.key === activeView)) {
      setActiveView(visibleViews[0].key)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userProfile, activeView])

  const isAll = activeTeamId === ALL_TEAMS
  const activeTeam = isAll ? null : (teams.find((t) => t.id === activeTeamId) ?? null)

  const loadAll = useCallback(async () => {
    if (!userProfile?.company_id) return
    setLoading(true)
    const companyId = userProfile.company_id

    const [linesRes, cnpRes, usersRes, clientsRes] = await Promise.all([
      loadLines(companyId, { includeGeneral: true }),
      supabase
        .from('cnp_requests')
        .select('*')
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .order('created_at', { ascending: false }),
      supabase
        .from('users')
        .select(
          'user_id, first_name, last_name, avatar_url, access_level, deleted_at, position:positions(position_name)',
        )
        .eq('company_id', companyId)
        .order('first_name'),
      loadClients(companyId),
    ])

    const linesWithGeneral = withDerivedGeneralMembers(linesRes.data ?? [], usersRes.data ?? [])
    const fetchedTeams = visibleLinesForUser(linesWithGeneral, userProfile)
    setTeams(fetchedTeams)
    setCnps(cnpRes.data ?? [])

    const fetchedClients = clientsRes.data ?? []
    setClients(fetchedClients)
    setClientsById(new Map(fetchedClients.map((c) => [c.id, c])))

    const users = usersRes.data ?? []
    setAllUsers(users)
    setUsersMap(new Map(users.map((u) => [u.user_id, u])))

    setActiveTeamId((prev) => prev ?? (canViewAll ? ALL_TEAMS : (fetchedTeams[0]?.id ?? null)))
    setLoading(false)
  }, [userProfile?.company_id, canViewAll])

  useEffect(() => {
    loadAll()
  }, [loadAll])

  useEffect(() => {
    if (!userProfile?.company_id) return
    const channel = supabase
      .channel('cnp-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'cnp_requests' },
        (payload) => {
          setCnps((prev) => {
            if (payload.eventType === 'INSERT') {
              return prev.some((c) => c.id === payload.new.id) ? prev : [payload.new, ...prev]
            }
            if (payload.eventType === 'UPDATE') {
              return payload.new.deleted_at
                ? prev.filter((c) => c.id !== payload.new.id)
                : prev.map((c) => (c.id === payload.new.id ? payload.new : c))
            }
            if (payload.eventType === 'DELETE') {
              return prev.filter((c) => c.id !== payload.old.id)
            }
            return prev
          })
        },
      )
      .on('postgres_changes', { event: '*', schema: 'public', table: 'metric_lines' }, () =>
        loadAll(),
      )
      .on('postgres_changes', { event: '*', schema: 'public', table: 'metric_line_members' }, () =>
        loadAll(),
      )
      .on('postgres_changes', { event: '*', schema: 'public', table: 'metric_clients' }, () =>
        loadAll(),
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [userProfile?.company_id, loadAll])

  function handleCreated(cnp) {
    setCnps((prev) => [cnp, ...prev])
  }
  function handleUpdated(cnp) {
    if (cnp._deleted) {
      setCnps((prev) => prev.filter((c) => c.id !== cnp.id))
    } else {
      setCnps((prev) => prev.map((c) => (c.id === cnp.id ? cnp : c)))
    }
  }
  function openNewCnp() {
    setCnpModal(undefined)
  }
  function openEditCnp(cnp) {
    setCnpModal(cnp)
  }
  function closeCnpModal() {
    setCnpModal(null)
  }

  // Abrir el detalle de un CNP específico desde ?cnpId=uuid (deep-link desde la
  // campanita de notificaciones — mismo patrón que ?taskId= en TareasPage).
  useEffect(() => {
    const cnpId = searchParams.get('cnpId')
    if (!cnpId || cnps.length === 0) return
    const found = cnps.find((c) => c.id === cnpId)
    if (found) openEditCnp(found)
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        next.delete('cnpId')
        return next
      },
      { replace: true },
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, cnps])
  function selectTeam(teamId) {
    setActiveTeamId(teamId)
  }

  function goToBaseWithFilter(filter) {
    // Empuja una entrada de historial (misma URL, distinto state) para que el botón
    // "atrás" del navegador regrese al Dashboard en vez de salir de CNP.
    navigate(location.pathname + location.search, {
      state: { cnpView: 'base', baseFilter: filter ?? null },
    })
  }

  const visibleLineIds = new Set(teams.map((t) => t.id))
  const scopedCnps = isAll
    ? cnps.filter((c) => visibleLineIds.has(c.line_id))
    : cnps.filter((c) => c.line_id === activeTeamId)

  return (
    <>
      <main className="flex-1 overflow-y-auto main-bg">
        <div className="max-w-7xl mx-auto px-4 py-6 sm:px-6 sm:py-8">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-6">
            <div>
              <h1 className="text-[26px] font-bold text-[#111] leading-tight">CNP</h1>
              <p className="text-[15px] text-[#888] mt-0.5">
                Contenido No Planificado — solicitudes de clientes
              </p>
            </div>
            {canManage && (
              <div className="flex items-center gap-2 w-full sm:w-auto">
                <button
                  onClick={openNewCnp}
                  className="flex-1 sm:flex-none flex items-center justify-center gap-2 bg-[#111] text-white text-[15px] font-bold px-4 py-2.5 rounded-xl hover:bg-[#222] transition-colors"
                >
                  <svg
                    width="11"
                    height="11"
                    viewBox="0 0 12 12"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.8"
                  >
                    <path d="M6 1v10M1 6h10" strokeLinecap="round" />
                  </svg>
                  Nuevo CNP
                </button>
              </div>
            )}
          </div>

          <div className="flex flex-col gap-3 mb-6">
            {(teams.length > 0 || canViewAll) && (
              <div className="flex flex-wrap gap-1.5 items-center">
                {canViewAll && (
                  <button
                    onClick={() => setActiveTeamId(ALL_TEAMS)}
                    className={`px-3 py-1 rounded-full text-[14.5px] font-semibold transition-all ${
                      isAll
                        ? 'bg-[#FFB800] text-[#111]'
                        : 'bg-white border border-[#e0ddd4] text-[#555] hover:border-[#FFB800] hover:text-[#111]'
                    }`}
                  >
                    Todos
                  </button>
                )}
                {teams.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => selectTeam(t.id)}
                    className={`px-3 py-1 rounded-full text-[14.5px] font-semibold transition-all ${
                      activeTeamId === t.id
                        ? 'bg-[#FFB800] text-[#111]'
                        : 'bg-white border border-[#e0ddd4] text-[#555] hover:border-[#FFB800] hover:text-[#111]'
                    }`}
                  >
                    {t.name}
                  </button>
                ))}
              </div>
            )}
            <div className="flex flex-col sm:flex-row sm:items-center gap-2">
              <div className="flex bg-white border border-[#e0ddd4] rounded-xl p-1 w-full sm:w-fit">
                {visibleViews.map((v) => (
                  <button
                    key={v.key}
                    onClick={() => {
                      setActiveView(v.key)
                      if (v.key === 'base') setPendingBaseFilter(null)
                    }}
                    className={`flex-1 sm:flex-none px-2.5 sm:px-4 py-1.5 rounded-lg text-[14.5px] font-semibold transition-all ${
                      activeView === v.key
                        ? 'bg-[#111] text-white'
                        : 'text-[#666] hover:text-[#111] hover:bg-[#f5f3eb]'
                    }`}
                  >
                    {v.label}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-[12px] font-mono font-bold tracking-[0.14em] uppercase text-[#888] mr-1">
                  Período
                </span>
                <select
                  value={monthIdx % 12}
                  onChange={(e) =>
                    setMonthIdx(Math.floor(monthIdx / 12) * 12 + Number(e.target.value))
                  }
                  className="text-[13.5px] border border-[#e0ddd4] rounded-lg px-2 py-1.5 bg-white text-[#333] focus:outline-none focus:border-[#FFB800]"
                >
                  {MONTHS.map((name, i) => (
                    <option key={i} value={i}>
                      {name}
                    </option>
                  ))}
                </select>
                <select
                  value={Math.floor(monthIdx / 12)}
                  onChange={(e) => setMonthIdx(Number(e.target.value) * 12 + (monthIdx % 12))}
                  className="text-[13.5px] border border-[#e0ddd4] rounded-lg px-2 py-1.5 bg-white text-[#333] focus:outline-none focus:border-[#FFB800]"
                >
                  {YEARS.map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {!loading && teams.length === 0 && !canViewAll && (
            <div className="bg-white rounded-xl border border-[#e0ddd4] p-10 text-center mb-4">
              <p className="text-[17px] font-semibold text-[#888] mb-1">No hay líneas creadas</p>
              <p className="text-[15px] text-[#bbb]">
                Crea las líneas desde <strong>Empresa → Líneas</strong> para empezar a gestionar CNP
              </p>
            </div>
          )}

          {loading ? (
            <div className="flex items-center justify-center py-20">
              <div className="w-6 h-6 border-2 border-[#FFB800] border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <>
              {activeView === 'dashboard' && (
                <CnpDashboardView
                  cnps={scopedCnps}
                  clientsById={clientsById}
                  monthIdx={monthIdx}
                  teamName={isAll ? null : activeTeam?.name}
                  onNavigateToBase={goToBaseWithFilter}
                />
              )}
              {activeView === 'base' && (
                <CnpBaseView
                  key={location.key}
                  cnps={scopedCnps}
                  clientsById={clientsById}
                  usersMap={usersMap}
                  onOpenCnp={openEditCnp}
                  initialFilter={pendingBaseFilter}
                />
              )}
            </>
          )}
        </div>
      </main>

      {cnpModal !== null && (
        <CnpModal
          cnp={cnpModal === undefined ? null : cnpModal}
          teams={teams}
          defaultTeamId={isAll ? null : activeTeamId}
          clients={clients}
          users={allUsers}
          onClose={closeCnpModal}
          onCreated={handleCreated}
          onUpdated={handleUpdated}
        />
      )}
    </>
  )
}
