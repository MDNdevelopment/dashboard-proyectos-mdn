import { useState, useEffect, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import { supabase } from '../supabase'
import { useAuth } from '../context/AuthContext'
import AdsStats from '../components/ads/AdsStats'
import AdsList from '../components/ads/AdsList'
import AdsForm from '../components/ads/AdsForm'
import AdsDetail from '../components/ads/AdsDetail'
import AdsSpendView from '../components/ads/AdsSpendView'
import { loadClients, loadLines } from '../components/metricas/metricsApi'
import { spansPeriod } from '../components/ads/campaignSpendApi'
import { visibleLinesForUser, userViewsAllLines } from '../utils/lineMembers'
import { MONTHS } from '../components/metricas/constants'

// Sentinela de "ver todas las líneas" (solo nivel 4/admin), igual que ALL_TEAMS en TareasPage.
const ALL_LINES = '__all__'

const CURRENT_YEAR = new Date().getFullYear()
const YEARS = [CURRENT_YEAR, CURRENT_YEAR - 1, CURRENT_YEAR - 2, CURRENT_YEAR - 3]

const TABS = [
  { key: 'tacticas', label: 'Tácticas' },
  { key: 'ads', label: 'Ads' },
]

export default function AdsPage() {
  const { userProfile, can = () => true } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const [tab, setTab] = useState('tacticas')
  const [periodo, setPeriodo] = useState(() => ({
    month: new Date().getMonth() + 1,
    year: CURRENT_YEAR,
  }))
  const [campaigns, setCampaigns] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedCampaign, setSelectedCampaign] = useState(null)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [editingCampaign, setEditingCampaign] = useState(null)
  const [usersMap, setUsersMap] = useState(new Map())
  const [clientsById, setClientsById] = useState(new Map())
  const [lines, setLines] = useState([]) // solo las líneas visibles para el usuario
  // Línea activa: id de línea | ALL_LINES | null. Persistida en la URL (?line=), igual que Tareas.
  const [activeLineId, setActiveLineId] = useState(() => searchParams.get('line') ?? null)
  const adsSpendViewRef = useRef(null)
  const adsListRef = useRef(null)

  // Control de acceso config-driven — sin reglas configuradas: abierto a todos.
  const canManage = can('ads.manage')

  // Nivel 4/admin/tasks_view_all ven el botón "Todos" y arrancan en él (mismo criterio que visibleLinesForUser).
  const canViewAll = userViewsAllLines(userProfile)

  // Ámbito de línea para filtrar: null = sin filtro (Todos); '__none__' = nada
  // (una jefa sin línea no debe ver campañas de otras líneas ni las sin línea).
  const lineScope =
    activeLineId === ALL_LINES ? null : activeLineId ? activeLineId : canViewAll ? null : '__none__'

  function selectLine(id) {
    setActiveLineId(id)
    setSearchParams(
      (prev) => {
        const p = new URLSearchParams(prev)
        p.set('line', id)
        return p
      },
      { replace: true },
    )
  }

  // La línea se deriva del cliente (campaigns/paid_campaigns no guardan line_id).
  function matchesLine(clientId) {
    if (lineScope === null) return true
    return clientsById.get(clientId)?.line_id === lineScope
  }

  const filteredCampaigns = campaigns.filter(
    (c) => spansPeriod(c.start_date, c.end_date, periodo) && matchesLine(c.client_id),
  )

  useEffect(() => {
    fetchCampaigns()
  }, [])

  useEffect(() => {
    if (!userProfile?.company_id) return
    supabase
      .from('users')
      .select('user_id, first_name, last_name')
      .eq('company_id', userProfile.company_id)
      .order('first_name')
      .then(({ data }) => {
        if (data) {
          setUsersMap(new Map(data.map((u) => [u.user_id, `${u.first_name} ${u.last_name}`])))
        }
      })
  }, [userProfile?.company_id])

  useEffect(() => {
    if (!userProfile?.company_id) return
    loadClients(userProfile.company_id).then(({ data }) => {
      if (data) setClientsById(new Map(data.map((c) => [c.id, c])))
    })
  }, [userProfile?.company_id])

  useEffect(() => {
    if (!userProfile?.company_id) return
    loadLines(userProfile.company_id).then(({ data }) => {
      const visible = visibleLinesForUser(data ?? [], userProfile)
      setLines(visible)
      // Selección por defecto (una sola vez): nivel 4/admin → Todos; jefas → su primera línea.
      setActiveLineId((prev) => prev ?? (canViewAll ? ALL_LINES : (visible[0]?.id ?? null)))
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userProfile?.company_id, canViewAll])

  async function fetchCampaigns() {
    setLoading(true)
    const { data } = await supabase
      .from('campaigns')
      .select('*')
      .order('created_at', { ascending: false })
    setCampaigns(data ?? [])
    setLoading(false)
  }

  function handleCreated(campaign) {
    setCampaigns((prev) => [campaign, ...prev])
  }

  function handleUpdated(updated) {
    setCampaigns((prev) => prev.map((c) => (c.id === updated.id ? updated : c)))
    if (selectedCampaign?.id === updated.id) setSelectedCampaign(updated)
  }

  function handleDeleted(id) {
    setCampaigns((prev) => prev.filter((c) => c.id !== id))
    if (selectedCampaign?.id === id) setSelectedCampaign(null)
  }

  function handleEditFromDetail(campaign) {
    setSelectedCampaign(null)
    setEditingCampaign(campaign)
  }

  return (
    <>
      <main className="flex-1 overflow-y-auto main-bg h-screen">
        <div className="max-w-6xl mx-auto px-4 py-6 sm:px-6 sm:py-8">
          {/* Header */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-4">
            <div>
              <h1 className="text-[26px] font-bold text-[#111] leading-tight">
                Campañas & Tácticas
              </h1>
              <p className="text-[15px] text-[#888] mt-0.5">
                {canManage
                  ? 'Gestión de campañas, tácticas y pauta publicitaria'
                  : 'Vista de campañas, tácticas y pauta publicitaria'}
              </p>
            </div>
            {canManage &&
              (tab === 'tacticas' ? (
                <button
                  onClick={() => setShowCreateForm(true)}
                  className="w-full sm:w-auto flex items-center justify-center gap-2 bg-[#111] text-white text-[15px] font-bold px-4 py-2.5 rounded-xl hover:bg-[#222] transition-colors"
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
                  Nueva campaña
                </button>
              ) : (
                <button
                  onClick={() => adsSpendViewRef.current?.openCreate()}
                  className="w-full sm:w-auto flex items-center justify-center gap-2 bg-[#111] text-white text-[15px] font-bold px-4 py-2.5 rounded-xl hover:bg-[#222] transition-colors"
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
                  Nuevo Ad
                </button>
              ))}
          </div>

          {/* Tabs + selector de periodo */}
          <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
            <div className="flex flex-wrap gap-1 bg-white border border-[#e0ddd4] rounded-xl p-1 w-fit">
              {TABS.map((t) => (
                <button
                  key={t.key}
                  onClick={() => setTab(t.key)}
                  className={`px-4 py-1.5 rounded-lg text-[14px] font-semibold transition-colors ${
                    tab === t.key ? 'bg-[#111] text-white' : 'text-[#666] hover:bg-[#f5f3eb]'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {/* Selector mes/año — aplica a ambas tabs */}
            <div className="flex items-center gap-1.5">
              <span className="text-[12px] font-mono font-bold tracking-[0.14em] uppercase text-[#888] mr-1">
                Período
              </span>
              <select
                value={periodo.month}
                onChange={(e) => setPeriodo((p) => ({ ...p, month: Number(e.target.value) }))}
                className="text-[13.5px] border border-[#e0ddd4] rounded-lg px-2 py-1.5 bg-white text-[#333] focus:outline-none focus:border-[#FFB800]"
              >
                {MONTHS.map((name, i) => (
                  <option key={i + 1} value={i + 1}>
                    {name}
                  </option>
                ))}
              </select>
              <select
                value={periodo.year}
                onChange={(e) => setPeriodo((p) => ({ ...p, year: Number(e.target.value) }))}
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

          {/* Selector de línea (pills) — mismo patrón que Tareas. Nivel 4/admin ve "Todos";
              las jefas ven solo su(s) línea(s). Aplica a ambas tabs y a las tarjetas de resumen. */}
          {(lines.length > 0 || canViewAll) && (
            <div className="flex flex-wrap gap-1.5 items-center mb-5">
              {canViewAll && (
                <button
                  onClick={() => selectLine(ALL_LINES)}
                  className={`px-3 py-1 rounded-full text-[14.5px] font-semibold transition-all ${
                    activeLineId === ALL_LINES
                      ? 'bg-[#FFB800] text-[#111]'
                      : 'bg-white border border-[#e0ddd4] text-[#555] hover:border-[#FFB800] hover:text-[#111]'
                  }`}
                >
                  Todos
                </button>
              )}
              {lines.map((l) => (
                <button
                  key={l.id}
                  onClick={() => selectLine(l.id)}
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
          )}

          {tab === 'tacticas' ? (
            <>
              <AdsStats
                campaigns={filteredCampaigns}
                onResetFilters={() => adsListRef.current?.clearFilters()}
                onFilterStatus={(status) => adsListRef.current?.setFilterStatus(status)}
              />

              <AdsList
                ref={adsListRef}
                campaigns={filteredCampaigns}
                loading={loading}
                canManage={canManage}
                usersMap={usersMap}
                clientsById={clientsById}
                periodo={periodo}
                onSelect={setSelectedCampaign}
                onUpdated={handleUpdated}
                onDeleted={handleDeleted}
                onEdit={(campaign) => setEditingCampaign(campaign)}
              />
            </>
          ) : (
            <AdsSpendView
              ref={adsSpendViewRef}
              companyId={userProfile?.company_id}
              canManage={canManage}
              lineScope={lineScope}
              periodo={periodo}
            />
          )}
        </div>
      </main>

      {showCreateForm && (
        <AdsForm
          campaign={null}
          onClose={() => setShowCreateForm(false)}
          onCreated={handleCreated}
          onUpdated={handleUpdated}
        />
      )}

      {editingCampaign && (
        <AdsForm
          campaign={editingCampaign}
          onClose={() => setEditingCampaign(null)}
          onCreated={handleCreated}
          onUpdated={handleUpdated}
        />
      )}

      {selectedCampaign && (
        <AdsDetail
          campaign={selectedCampaign}
          usersMap={usersMap}
          onClose={() => setSelectedCampaign(null)}
          onUpdated={handleUpdated}
          onDeleted={handleDeleted}
          canManage={canManage}
          onEdit={() => handleEditFromDetail(selectedCampaign)}
        />
      )}
    </>
  )
}
