import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../supabase'
import { useAuth } from '../context/AuthContext'
import { loadLines, loadClients, createClient } from '../components/metricas/metricsApi'
import { visibleLinesForUser } from '../utils/lineMembers'
import { clientsForLine, effectiveLineId } from '../utils/chequeo'
import {
  PIECE_STATUSES,
  USE_MAPPI,
  isDone,
  computeTemporadaSummary,
  slotsOf,
  statusLabel,
} from '../utils/temporada'
import {
  loadCampaigns,
  loadPieces,
  loadAssignments,
  upsertPiece,
  deletePiece,
  upsertAssignment,
  deleteAssignment,
} from '../components/chequeo/temporadaApi'
import FilterBar, { FilterField } from '../components/common/FilterBar'
import KpiCard from '../components/tareas/KpiCard'
import TemporadaGrid from '../components/chequeo/temporada/TemporadaGrid'
import AddClientModal from '../components/chequeo/temporada/AddClientModal'

const ALL_LINES = '__all__'

/**
 * Chequeo de temporada (p. ej. Navidad 2026): por cliente y por fecha/tarjeta, qué piezas
 * hay (diseño, foto, reel) y en qué estado está cada una. Reemplaza la hoja de seguimiento.
 */
export default function ChequeoTemporadaPage() {
  const { userProfile, can = () => true } = useAuth()
  const canManage = can('chequeo.manage')
  // Crear un cliente es de Empresa: lo exige la RLS de metric_clients, así que el botón solo
  // lo ve quien tiene ese permiso.
  const canCreateClients = can('empresa.clientes.manage')
  const canViewAll =
    userProfile?.access_level >= 4 || userProfile?.admin === true || can('chequeo.ver_todo')

  const [lines, setLines] = useState([])
  const [clients, setClients] = useState([])
  const [users, setUsers] = useState([])
  const [campaigns, setCampaigns] = useState([])
  const [campaignId, setCampaignId] = useState(null)
  const [pieces, setPieces] = useState([])
  const [assignments, setAssignments] = useState([])
  const [loading, setLoading] = useState(true)
  const [activeLineId, setActiveLineId] = useState(null)
  const [statusFilter, setStatusFilter] = useState('')
  const [onlyPending, setOnlyPending] = useState(false)
  const [error, setError] = useState(null)
  const [addingClient, setAddingClient] = useState(false)

  const loadAll = useCallback(async () => {
    if (!userProfile?.company_id) return
    const companyId = userProfile.company_id

    const [linesRes, clientsRes, usersRes, campaignsRes] = await Promise.all([
      loadLines(companyId, { includeGeneral: true }),
      loadClients(companyId),
      supabase
        .from('users')
        .select('user_id, first_name, last_name, avatar_url, deleted_at')
        .eq('company_id', companyId),
      loadCampaigns(companyId),
    ])

    // «Independientes» se agrega aparte y es visible para todos, igual que en Chequeo.
    const allLines = linesRes.data ?? []
    const generalLine = allLines.find((l) => l.is_general) ?? null
    const visible = visibleLinesForUser(
      allLines.filter((l) => !l.is_general),
      userProfile,
      { extraViewAll: can('chequeo.ver_todo') },
    )
    setLines(generalLine ? [...visible, generalLine] : visible)
    setClients(clientsRes.data ?? [])
    setUsers(usersRes.data ?? [])
    const list = campaignsRes.data ?? []
    setCampaigns(list)
    setCampaignId((prev) => prev ?? list[0]?.id ?? null)
    setActiveLineId((prev) => prev ?? (canViewAll ? ALL_LINES : (visible[0]?.id ?? null)))
  }, [userProfile, canViewAll, can])

  useEffect(() => {
    loadAll().finally(() => setLoading(false))
  }, [loadAll])

  // Piezas de la temporada activa (se recargan al cambiar de temporada).
  useEffect(() => {
    if (!campaignId) {
      setPieces([])
      setAssignments([])
      return
    }
    let cancelled = false
    loadPieces(campaignId).then(({ data }) => {
      if (!cancelled) setPieces(data ?? [])
    })
    loadAssignments(campaignId).then(({ data }) => {
      if (!cancelled) setAssignments(data ?? [])
    })
    return () => {
      cancelled = true
    }
  }, [campaignId])

  // Recarga al volver a la pestaña: si el socket se cayó en segundo plano, evita quedarse
  // con un snapshot viejo (mismo problema que ya tuvo ChequeoPage).
  useEffect(() => {
    function onVisibilityChange() {
      if (document.visibilityState === 'visible' && campaignId) {
        loadPieces(campaignId).then(({ data }) => setPieces(data ?? []))
        loadAssignments(campaignId).then(({ data }) => setAssignments(data ?? []))
      }
    }
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => document.removeEventListener('visibilitychange', onVisibilityChange)
  }, [campaignId])

  // Realtime: cambios de otros usuarios en las piezas de la temporada activa.
  useEffect(() => {
    if (!campaignId) return
    const channel = supabase
      .channel(`seasonal-pieces-${campaignId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'seasonal_pieces' },
        (payload) => {
          const row = payload.new?.id ? payload.new : payload.old
          if (payload.eventType !== 'DELETE' && row.campaign_id !== campaignId) return
          setPieces((prev) => {
            if (payload.eventType === 'DELETE') return prev.filter((p) => p.id !== payload.old.id)
            const exists = prev.some((p) => p.id === payload.new.id)
            return exists
              ? prev.map((p) => (p.id === payload.new.id ? payload.new : p))
              : [...prev, payload.new]
          })
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'seasonal_assignments' },
        (payload) => {
          if (payload.eventType !== 'DELETE' && payload.new.campaign_id !== campaignId) return
          setAssignments((prev) => {
            if (payload.eventType === 'DELETE') return prev.filter((a) => a.id !== payload.old.id)
            const exists = prev.some((a) => a.id === payload.new.id)
            return exists
              ? prev.map((a) => (a.id === payload.new.id ? payload.new : a))
              : [...prev, payload.new]
          })
        },
      )
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [campaignId])

  const campaign = campaigns.find((c) => c.id === campaignId) ?? null
  const slots = slotsOf(campaign)
  const usersById = new Map(users.map((u) => [u.user_id, u]))
  const generalLineId = lines.find((l) => l.is_general)?.id ?? null
  const scopedLines =
    activeLineId === ALL_LINES ? lines : lines.filter((l) => l.id === activeLineId)
  const scopedClients = scopedLines.flatMap((l) => clientsForLine(clients, l, generalLineId))

  // Filtros por estado / «solo pendientes»: se aplican a las cuentas, no a las piezas, para
  // que la fila siga mostrando todas sus piezas.
  const piecesByClient = new Map()
  for (const p of pieces) {
    if (!piecesByClient.has(p.client_id)) piecesByClient.set(p.client_id, [])
    piecesByClient.get(p.client_id).push(p)
  }
  const visibleClients = scopedClients.filter((c) => {
    const own = piecesByClient.get(c.id) ?? []
    if (statusFilter && !own.some((p) => p.status === statusFilter)) return false
    if (onlyPending && !own.some((p) => !isDone(p.status))) return false
    return true
  })
  const hasFilters = Boolean(statusFilter) || onlyPending
  const summary = computeTemporadaSummary(scopedClients, pieces, slots)

  function replacePiece(saved) {
    setPieces((prev) =>
      prev.some((p) => p.id === saved.id)
        ? prev.map((p) => (p.id === saved.id ? saved : p))
        : [...prev, saved],
    )
  }

  async function savePiece(client, slot, pieceType, status) {
    setError(null)
    const { data, error: err } = await upsertPiece({
      companyId: userProfile.company_id,
      campaignId,
      clientId: client.id,
      lineId: effectiveLineId(client, generalLineId),
      slotKey: slot.key,
      pieceType,
      status,
      userId: userProfile.user_id,
    })
    if (err) {
      setError('No se pudo guardar el cambio. Intenta de nuevo.')
      return
    }
    replacePiece(data)
  }

  const handleAdd = (client, slot, type) => savePiece(client, slot, type, null)

  const handleStatusChange = (piece, status) => {
    const client = clients.find((c) => c.id === piece.client_id)
    const slot = slots.find((s) => s.key === piece.slot_key)
    if (!client || !slot) return
    // El menú usa '' para «Sin estado» (celda en blanco de la hoja): se guarda como null.
    return savePiece(client, slot, piece.piece_type, status || null)
  }

  async function handleRemove(piece) {
    setError(null)
    const { error: err } = await deletePiece(piece.id)
    if (err) {
      setError('No se pudo quitar la pieza. Intenta de nuevo.')
      return
    }
    setPieces((prev) => prev.filter((p) => p.id !== piece.id))
  }

  // Personal: `value` es el id del empleado, '' = «Sin asignar» o USE_MAPPI = volver al valor
  // de MAPPI (borra la asignación manual de esta temporada).
  async function handleAssign(client, role, value) {
    setError(null)
    const existing = assignments.find((a) => a.client_id === client.id && a.role === role)
    if (value === USE_MAPPI) {
      if (!existing) return
      const { error: err } = await deleteAssignment(existing.id)
      if (err) {
        setError('No se pudo cambiar la asignación. Intenta de nuevo.')
        return
      }
      setAssignments((prev) => prev.filter((a) => a.id !== existing.id))
      return
    }
    const { data, error: err } = await upsertAssignment({
      companyId: userProfile.company_id,
      campaignId,
      clientId: client.id,
      lineId: effectiveLineId(client, generalLineId),
      role,
      userId: value || null,
      updatedBy: userProfile.user_id,
    })
    if (err) {
      setError('No se pudo cambiar la asignación. Intenta de nuevo.')
      return
    }
    setAssignments((prev) =>
      prev.some((a) => a.id === data.id)
        ? prev.map((a) => (a.id === data.id ? data : a))
        : [...prev, data],
    )
  }

  // Alta rápida: crea el cliente en MAPPI y lo muestra de una vez en la grilla.
  async function handleCreateClient({ name, lineId, socialManagerId }) {
    const { data, error: err } = await createClient(userProfile.company_id, {
      name,
      line_id: lineId,
      social_manager_id: socialManagerId,
    })
    if (err) return { error: err }
    setClients((prev) => [...prev, data].sort((a, b) => a.name.localeCompare(b.name, 'es')))
    // Si se está viendo otra línea, pasa a la del cliente nuevo para que se vea de inmediato.
    setActiveLineId((prev) => (prev === ALL_LINES ? prev : (data.line_id ?? prev)))
    setAddingClient(false)
    return { error: null }
  }

  function clearFilters() {
    setStatusFilter('')
    setOnlyPending(false)
  }

  return (
    <main className="flex-1 overflow-y-auto main-bg">
      <div className="max-w-7xl mx-auto px-4 py-6 sm:px-6 sm:py-8">
        <div className="mb-1 text-[12px] font-mono uppercase tracking-wide text-[#a29b8c]">
          Gestión de Tareas <span className="text-[#ccc]">›</span>{' '}
          <Link to="/tareas/chequeo" className="hover:text-[#111]">
            Chequeo
          </Link>{' '}
          <span className="text-[#ccc]">›</span> Temporada
        </div>
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-[26px] font-bold text-[#111] leading-tight">
              {campaign?.name ?? 'Chequeo de temporada'}
            </h1>
            <p className="text-[15px] text-[#888] mt-0.5">
              Piezas por fecha y su estado — diseño, foto y reel por cliente
            </p>
          </div>
          {campaign && canCreateClients && (
            <button
              type="button"
              onClick={() => setAddingClient(true)}
              className="self-start rounded-lg bg-[#FFB800] px-3 py-1.5 text-[14px] font-semibold text-[#111] hover:brightness-95"
            >
              + Agregar cliente
            </button>
          )}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-6 h-6 border-2 border-[#FFB800] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : !campaign ? (
          <div className="bg-white rounded-xl border border-[#e0ddd4] p-10 text-center">
            <p className="text-[17px] font-semibold text-[#888] mb-1">
              No hay temporadas configuradas
            </p>
            <p className="text-[15px] text-[#bbb]">Pídele al desarrollador que cree una.</p>
          </div>
        ) : lines.length === 0 ? (
          <div className="bg-white rounded-xl border border-[#e0ddd4] p-10 text-center">
            <p className="text-[17px] font-semibold text-[#888] mb-1">No hay líneas visibles</p>
            <p className="text-[15px] text-[#bbb]">
              Contacta a dirección si crees que deberías ver una línea aquí.
            </p>
          </div>
        ) : (
          <>
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

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
              <KpiCard label="Cuentas" value={scopedClients.length} />
              <KpiCard
                label="Terminadas"
                value={summary.pctAprobado === null ? '—' : `${summary.pctAprobado}%`}
                sub={`${summary.terminadas} de ${summary.totalPiezas} piezas`}
                color="#15803d"
              />
              <KpiCard label="Pendientes" value={summary.pendientes} />
              <KpiCard label="Piezas" value={summary.totalPiezas} />
            </div>

            {summary.totalPiezas > 0 && (
              <p className="mb-4 text-[13.5px] font-mono text-[#888]">
                {summary.bySlot
                  .filter((s) => s.pct !== null)
                  .map((s) => `${s.label} · ${s.pct}%`)
                  .join('   ')}
              </p>
            )}

            <FilterBar cols={4} onClear={hasFilters ? clearFilters : undefined}>
              {campaigns.length > 1 && (
                <FilterField label="Temporada">
                  <select
                    className="input-base text-[14px] py-1.5 w-full"
                    value={campaignId ?? ''}
                    onChange={(e) => setCampaignId(e.target.value)}
                  >
                    {campaigns.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </FilterField>
              )}
              <FilterField label="Estado">
                <select
                  className="input-base text-[14px] py-1.5 w-full"
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                >
                  <option value="">Todos</option>
                  {PIECE_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {statusLabel(s)}
                    </option>
                  ))}
                </select>
              </FilterField>
              <FilterField label="Solo pendientes">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-[#FFB800]"
                  checked={onlyPending}
                  onChange={(e) => setOnlyPending(e.target.checked)}
                />
              </FilterField>
            </FilterBar>

            {error && <p className="mb-3 text-[14px] text-[#c0392b]">{error}</p>}

            <TemporadaGrid
              lines={scopedLines}
              clients={visibleClients}
              pieces={pieces}
              assignments={assignments}
              slots={slots}
              users={users}
              usersById={usersById}
              generalLineId={generalLineId}
              groupByLine={activeLineId === ALL_LINES}
              canManage={canManage}
              onAdd={handleAdd}
              onStatusChange={handleStatusChange}
              onRemove={handleRemove}
              onAssign={handleAssign}
            />
          </>
        )}
      </div>
      {addingClient && (
        <AddClientModal
          lines={lines}
          users={users}
          existingNames={clients.map((c) => c.name)}
          defaultLineId={activeLineId !== ALL_LINES ? activeLineId : null}
          onCreate={handleCreateClient}
          onClose={() => setAddingClient(false)}
        />
      )}
    </main>
  )
}
