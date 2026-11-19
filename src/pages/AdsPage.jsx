import { useState, useEffect, useMemo, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import { supabase } from '../supabase'
import { useAuth } from '../context/AuthContext'
import TacticasView from '../components/ads/tacticas/TacticasView'
import { loadPendingHandoffs, updateHandoff } from '../components/ads/tacticas/tacticasApi'
import { handoffContent } from '../utils/tacticas'
import AdsForm from '../components/ads/AdsForm'
import AdsDetail from '../components/ads/AdsDetail'
import AdsSpendView from '../components/ads/AdsSpendView'
import { loadClients, loadLines } from '../components/metricas/metricsApi'
import { MONTHS } from '../components/metricas/constants'

// Sentinela de "ver todas las líneas" (capability ads.ver_todo), igual que ALL_TEAMS en TareasPage.
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
  const [allLines, setAllLines] = useState([]) // todas: la jefa de una marca puede ser de otra línea
  const [createPrefill, setCreatePrefill] = useState(null) // marca precargada al crear una táctica
  const [handoffs, setHandoffs] = useState([]) // insumos pendientes (campaign_handoffs)
  // Línea activa: id de línea | ALL_LINES | null. Persistida en la URL (?line=), igual que Tareas.
  const [activeLineId, setActiveLineId] = useState(() => searchParams.get('line') ?? null)
  const adsSpendViewRef = useRef(null)

  // Control de acceso config-driven — sin reglas configuradas: abierto a todos.
  const canManage = can('ads.manage')

  // Quien tiene `ads.ver_todo` ve el botón "Todos" y arranca en él. Sin ella solo ve las líneas de las que es miembro.
  const canViewAll = can('ads.ver_todo')

  // Ámbito de línea para filtrar: null = sin filtro (Todos); '__none__' = nada
  // (quien no tiene ads.ver_todo ni línea no ve campañas de otras líneas ni las sin línea).
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

  // Tácticas dentro del alcance de línea. La línea se deriva del cliente (campaigns no guarda
  // line_id). La pestaña Tácticas ya no se filtra por período: es un historial por marca, y lo
  // vigente se decide por estado + fecha de fin.
  const filteredCampaigns = useMemo(
    () =>
      campaigns.filter(
        (c) => lineScope === null || clientsById.get(c.client_id)?.line_id === lineScope,
      ),
    [campaigns, clientsById, lineScope],
  )

  const linesById = useMemo(() => new Map(allLines.map((l) => [l.id, l])), [allLines])

  // Marcas activas dentro del alcance de línea (base de "sin táctica vigente" y del selector).
  const brands = useMemo(
    () =>
      [...clientsById.values()].filter(
        (c) => !c.deleted_at && (lineScope === null || c.line_id === lineScope),
      ),
    [clientsById, lineScope],
  )

  // Insumo = táctica cerrada que deja algo para la siguiente. Su contenido se lee EN VIVO del
  // checklist de la táctica de origen (no es una copia). Sin acciones registradas no hay insumo.
  const insumos = useMemo(
    () =>
      handoffs
        .map((handoff) => {
          const source = campaigns.find((c) => c.id === handoff.source_campaign_id)
          return source ? { handoff, source, content: handoffContent(source) } : null
        })
        .filter((i) => i && i.content.total > 0),
    [handoffs, campaigns],
  )

  useEffect(() => {
    fetchCampaigns()
    fetchHandoffs()
  }, [])

  // Deep-link desde una notificación (`/ads?campaignId=<id>`): abre el detalle y limpia el parámetro
  // para que no se vuelva a abrir al cerrarlo.
  const campaignIdParam = searchParams.get('campaignId')
  useEffect(() => {
    if (!campaignIdParam || loading) return
    const target = campaigns.find((c) => c.id === campaignIdParam)
    if (target) setSelectedCampaign(target)
    setSearchParams(
      (prev) => {
        const p = new URLSearchParams(prev)
        p.delete('campaignId')
        return p
      },
      { replace: true },
    )
  }, [campaignIdParam, loading, campaigns, setSearchParams])

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
      const all = data ?? []
      setAllLines(all)
      const visible = canViewAll
        ? all
        : all.filter((l) => l.member_user_ids?.includes(userProfile.user_id))
      setLines(visible)
      // Selección por defecto (una sola vez): ver_todo → Todos; el resto → su primera línea.
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

  async function fetchHandoffs() {
    const { data } = await loadPendingHandoffs()
    setHandoffs(data ?? [])
  }

  async function handleDiscardInsumo(handoff) {
    const { error } = await updateHandoff(handoff.id, { status: 'descartado' })
    if (!error) setHandoffs((prev) => prev.filter((h) => h.id !== handoff.id))
  }

  function handleInsumosUsed(ids) {
    setHandoffs((prev) => prev.filter((h) => !ids.includes(h.id)))
  }

  function openCreate(clientId) {
    const c = typeof clientId === 'string' ? clientsById.get(clientId) : null
    setCreatePrefill(c ? { client_id: c.id, client: c.name } : null)
    setShowCreateForm(true)
  }

  function handleCreated(campaign) {
    setCampaigns((prev) => [campaign, ...prev])
  }

  function handleUpdated(updated) {
    // Al cerrar una táctica, un trigger de la base crea su insumo: hay que volver a pedirlo.
    const before = campaigns.find((c) => c.id === updated.id)
    if (updated.status === 'Finalizado' && before?.status !== 'Finalizado') fetchHandoffs()
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
                  onClick={() => openCreate()}
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
                  Nueva táctica
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

            {/* Selector mes/año — solo la pestaña Ads (las Tácticas son un historial por marca) */}
            {tab === 'ads' && (
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
            )}
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
            <TacticasView
              campaigns={filteredCampaigns}
              brands={brands}
              clientsById={clientsById}
              linesById={linesById}
              usersMap={usersMap}
              loading={loading}
              canManage={canManage}
              onSelect={setSelectedCampaign}
              onEdit={(campaign) => setEditingCampaign(campaign)}
              onUpdated={handleUpdated}
              onDeleted={handleDeleted}
              insumos={insumos}
              onDiscardInsumo={handleDiscardInsumo}
              onCreate={openCreate}
            />
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
          prefill={createPrefill}
          insumos={insumos}
          onInsumosUsed={handleInsumosUsed}
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
