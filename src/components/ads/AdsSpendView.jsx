import { useState, useEffect, useCallback, useMemo, forwardRef, useImperativeHandle } from 'react'
import { supabase } from '../../supabase'
import { loadClients } from '../metricas/metricsApi'
import {
  loadAds,
  deleteAd,
  updateAd,
  inPeriod,
  durationDays,
  spentByClientInPeriod,
  loadAdsResponsables,
  fmtDate,
  dateColor,
} from './campaignSpendApi'
import { fmtUSD } from '../../utils/metricsFinance'
import { STATUS, STATUSES } from './constants'
import { exportAdsToExcel } from '../../utils/exportAdsToExcel'
import ConfirmDeleteDialog from '../common/ConfirmDeleteDialog'
import AdsSpendForm from './AdsSpendForm'
import AdsSpendStats from './AdsSpendStats'
import AdsSpendDetail from './AdsSpendDetail'
import AdsBudgetOverview from './AdsBudgetOverview'
import AdsResultsModal from './AdsResultsModal'
import StatusPill from '../common/StatusPill'
import ClientCell from './ClientCell'

/**
 * Tab "Ads" del módulo Campañas: pauta pagada por cliente, con cards de
 * resumen, filtros (búsqueda, estado, cliente) igual que la tab Tácticas,
 * tracking de inversión vs. presupuesto mensual, y tabla de ads.
 *
 * El botón "Nuevo Ad" vive en el header de AdsPage (misma ubicación que
 * "Nueva campaña"), por eso este componente expone `openCreate()` vía ref
 * en lugar de renderizar su propio botón de creación.
 */
const AdsSpendView = forwardRef(function AdsSpendView({ companyId, canManage, periodo }, ref) {
  const [ads, setAds] = useState([])
  const [clients, setClients] = useState([])
  const [responsables, setResponsables] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [clientFilter, setClientFilter] = useState('all')
  const [modal, setModal] = useState(undefined) // undefined=cerrado, null=crear, objeto=editar
  const [detail, setDetail] = useState(null) // ad en modo visualización, o null=cerrado
  const [confirmDelete, setConfirmDelete] = useState(null)
  const [deleting, setDeleting] = useState(false)
  const [showBudgetOverview, setShowBudgetOverview] = useState(false)
  const [resultsFor, setResultsFor] = useState(null) // ad pendiente de resultados para poder finalizar, o null
  const [generatingExcel, setGeneratingExcel] = useState(false)

  const fetchAll = useCallback(async () => {
    if (!companyId) return
    const [adsRes, clientsRes, responsablesRes] = await Promise.all([
      loadAds(companyId),
      loadClients(companyId),
      loadAdsResponsables(companyId),
    ])
    setAds(adsRes.data ?? [])
    setClients(clientsRes.data ?? [])
    setResponsables(responsablesRes.data ?? [])
    setLoading(false)
  }, [companyId])

  useEffect(() => {
    fetchAll()
  }, [fetchAll])

  useEffect(() => {
    if (!companyId) return
    const channel = supabase
      .channel('paid-campaigns-view')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'paid_campaigns' }, fetchAll)
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [companyId, fetchAll])

  function handleSaved(row) {
    setAds((prev) => {
      const exists = prev.some((a) => a.id === row.id)
      const next = exists ? prev.map((a) => (a.id === row.id ? row : a)) : [row, ...prev]
      return next.sort((a, b) => (a.start_date < b.start_date ? 1 : -1))
    })
    setDetail((prev) => (prev?.id === row.id ? row : prev))
  }

  async function handleAdStatusChange(id, next) {
    const { data, error } = await updateAd(id, { status: next })
    if (!error && data) handleSaved(data)
  }

  // Guardia central: finalizar exige capturar resultados primero (vía AdsResultsModal),
  // cualquier otro cambio de estado se persiste directo. Única fuente de esta regla —
  // la usan tanto el pill de la fila como el pill del detalle.
  function requestStatusChange(ad, next) {
    if (next === 'Finalizado') {
      setResultsFor(ad)
      return
    }
    handleAdStatusChange(ad.id, next)
  }

  function handleRequestDeleteFromDetail(ad) {
    setDetail(null)
    setConfirmDelete(ad)
  }

  function handleEditFromDetail(ad) {
    setDetail(null)
    setModal(ad)
  }

  async function handleDeleteConfirm() {
    setDeleting(true)
    const { error } = await deleteAd(confirmDelete.id)
    setDeleting(false)
    if (!error) {
      setAds((prev) => prev.filter((a) => a.id !== confirmDelete.id))
      setConfirmDelete(null)
    }
  }

  // Mapas de resolución — mismo patrón que clientsById/usersMap en AdsPage.jsx.
  const clientsById = useMemo(() => new Map(clients.map((c) => [c.id, c])), [clients])
  const responsablesById = useMemo(
    () => new Map(responsables.map((r) => [r.user_id, `${r.first_name} ${r.last_name}`])),
    [responsables],
  )

  // Ads del periodo — pool base para las cards de resumen (igual que Tácticas).
  const periodAds = ads.filter((a) => inPeriod(a.start_date, periodo))

  const filtered = periodAds.filter((a) => {
    if (clientFilter !== 'all' && a.client_id !== clientFilter) return false
    if (statusFilter !== 'all' && a.status !== statusFilter) return false
    if (search) {
      const q = search.toLowerCase()
      const responsableName = responsablesById.get(a.responsable_id) ?? ''
      if (
        !a.name?.toLowerCase().includes(q) &&
        !a.client?.toLowerCase().includes(q) &&
        !a.objective?.toLowerCase().includes(q) &&
        !responsableName.toLowerCase().includes(q)
      )
        return false
    }
    return true
  })

  function clearFilters() {
    setSearch('')
    setStatusFilter('all')
    setClientFilter('all')
  }

  async function handleExportExcel() {
    setGeneratingExcel(true)
    try {
      await exportAdsToExcel({ ads: filtered, periodo })
    } finally {
      setGeneratingExcel(false)
    }
  }

  useImperativeHandle(ref, () => ({
    openCreate: () => setModal(null),
  }))

  // Tracking: invertido vs. presupuesto para el cliente seleccionado en el periodo actual.
  const trackingClient = clientFilter !== 'all' ? clients.find((c) => c.id === clientFilter) : null
  const spent = trackingClient ? spentByClientInPeriod(ads, trackingClient.id, periodo) : null
  const budget =
    trackingClient?.campaign_budget != null ? Number(trackingClient.campaign_budget) : null
  const overBudget = budget != null && spent != null && spent > budget

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="w-6 h-6 border-2 border-[#FFB800] border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div>
      <AdsSpendStats
        ads={periodAds}
        onResetFilters={clearFilters}
        onOpenBudget={() => setShowBudgetOverview(true)}
        onFilterStatus={(status) => setStatusFilter(status)}
      />

      {/* Toolbar: búsqueda + filtros (igual que la tab Tácticas) + nuevo ad */}
      <div className="flex flex-wrap gap-2 mb-4">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar ad, cliente, objetivo..."
          className="input-base text-[14px] py-1.5 flex-1 min-w-[160px] sm:min-w-[200px]"
        />
        <div className="flex gap-2">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="input-base text-[14px] py-1.5"
          >
            <option value="all">Todos los estados</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <select
            value={clientFilter}
            onChange={(e) => setClientFilter(e.target.value)}
            className="input-base text-[14px] py-1.5"
          >
            <option value="all">Todos los clientes</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        {(search || statusFilter !== 'all' || clientFilter !== 'all') && (
          <button
            onClick={clearFilters}
            className="px-3 py-1.5 rounded-lg border border-[#e0ddd4] text-[14px] font-medium text-[#555] hover:bg-[#f5f3eb] transition-colors"
          >
            Limpiar
          </button>
        )}
        <button
          onClick={handleExportExcel}
          disabled={generatingExcel}
          className="px-3 py-1.5 rounded-lg border border-[#e0ddd4] text-[14px] font-medium text-[#555] hover:bg-[#f5f3eb] transition-colors flex items-center gap-1.5 disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {generatingExcel ? (
            <span className="w-3 h-3 border-2 border-[#999] border-t-transparent rounded-full animate-spin" />
          ) : (
            <svg
              width="12"
              height="12"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
            >
              <path d="M8 1v9M5 7l3 3 3-3" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M2 12v2h12v-2" strokeLinecap="round" />
            </svg>
          )}
          {generatingExcel ? 'Generando…' : 'Excel'}
        </button>
        <button
          onClick={() => setShowBudgetOverview(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#FFB800] text-[#111] text-[14px] font-bold hover:bg-[#e6a600] transition-colors"
        >
          <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor" stroke="none">
            <rect x="2" y="9" width="2.6" height="5" rx="0.5" />
            <rect x="6.7" y="5" width="2.6" height="9" rx="0.5" />
            <rect x="11.4" y="2" width="2.6" height="12" rx="0.5" />
          </svg>
          Presupuestos por cliente
        </button>
      </div>

      {/* Count */}
      <p className="text-[13px] font-mono text-[#888] mb-2">
        {filtered.length} {filtered.length === 1 ? 'resultado' : 'resultados'}
        {filtered.length !== periodAds.length && ` de ${periodAds.length}`}
      </p>

      {/* Tracking de inversión vs. presupuesto — solo con un cliente seleccionado */}
      {trackingClient && (
        <div className="bg-white border border-[#e0ddd4] rounded-2xl p-4 mb-4">
          <p className="text-[12px] font-mono font-bold tracking-[0.14em] uppercase text-[#888] mb-1.5">
            Invertido en {trackingClient.name} este periodo
          </p>
          <div className="flex items-baseline gap-2">
            <span
              className={`text-[24px] font-bold ${overBudget ? 'text-red-600' : 'text-[#111]'}`}
            >
              {fmtUSD(spent)}
            </span>
            {budget != null && (
              <span className="text-[14px] text-[#999]">de {fmtUSD(budget)} presupuestados</span>
            )}
          </div>
          {budget != null && (
            <div className="mt-2 h-1.5 bg-[#f0ede3] rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${overBudget ? 'bg-red-600' : 'bg-[#FFB800]'}`}
                style={{ width: `${Math.min(100, (spent / budget) * 100)}%` }}
              />
            </div>
          )}
          {overBudget && (
            <p className="text-[13px] text-red-600 font-medium mt-1.5">
              Sobrepasando el presupuesto aprobado.
            </p>
          )}
        </div>
      )}

      {/* Tabla de ads */}
      {filtered.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-[16px] font-medium text-[#888]">
            {periodAds.length === 0
              ? 'No hay ads en este periodo'
              : 'Sin resultados para los filtros aplicados'}
          </p>
        </div>
      ) : (
        <div className="bg-white border border-[#e0ddd4] rounded-2xl overflow-hidden overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-[#ece9df] bg-[#fafaf7]">
                {[
                  'Cliente',
                  'Nombre de campaña',
                  'Responsable',
                  'Inicio',
                  'Fecha fin',
                  'Duración',
                  'Objetivo',
                  'Pieza',
                  'Monto',
                  'Estado',
                  '',
                ].map((h) => (
                  <th
                    key={h}
                    className="px-3 py-2.5 text-[12px] font-mono font-bold tracking-[0.14em] uppercase text-[#888] whitespace-nowrap"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((a) => {
                const duration = durationDays(a.start_date, a.end_date)
                return (
                  <tr
                    key={a.id}
                    onClick={() => setDetail(a)}
                    className="border-b border-[#f0ede3] last:border-0 hover:bg-[#fafaf7] transition-colors group cursor-pointer"
                  >
                    <td className="px-3 py-2.5 text-[14px] text-[#444] whitespace-nowrap">
                      <ClientCell
                        name={a.client}
                        logoUrl={a.client_id ? clientsById.get(a.client_id)?.logo_url : null}
                      />
                    </td>
                    <td className="px-3 py-2.5 max-w-[180px] text-[15px] font-semibold text-[#111] leading-snug">
                      {a.name}
                    </td>
                    <td className="px-3 py-2.5 text-[14px] text-[#555] whitespace-nowrap">
                      {responsablesById.get(a.responsable_id) ?? '—'}
                    </td>
                    <td className="px-3 py-2.5 text-[14px] text-[#555] whitespace-nowrap">
                      {fmtDate(a.start_date)}
                    </td>
                    <td
                      className={`px-3 py-2.5 text-[14px] whitespace-nowrap ${dateColor(a.end_date)}`}
                    >
                      {fmtDate(a.end_date)}
                    </td>
                    <td className="px-3 py-2.5 text-[14px] text-[#666] whitespace-nowrap">
                      {duration != null ? `${duration} día${duration !== 1 ? 's' : ''}` : '—'}
                    </td>
                    <td className="px-3 py-2.5 text-[14px] text-[#666]">{a.objective || '—'}</td>
                    <td className="px-3 py-2.5 text-[14px]">
                      {a.piece_url ? (
                        <a
                          href={a.piece_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="text-[#3B6FE0] hover:underline"
                        >
                          Ver pieza
                        </a>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-[14px] font-semibold text-[#111] whitespace-nowrap">
                      {fmtUSD(a.amount)}
                    </td>
                    <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                      <div className="flex flex-col items-start gap-1">
                        <StatusPill
                          value={a.status}
                          meta={STATUS}
                          options={STATUSES}
                          editable={canManage}
                          onChange={(next) => requestStatusChange(a, next)}
                          size="sm"
                        />
                        {a.results_pending && (
                          <button
                            type="button"
                            disabled={!canManage}
                            onClick={() => canManage && setResultsFor(a)}
                            title={
                              canManage
                                ? 'Cargar los resultados de este ad'
                                : 'Faltan resultados por cargar'
                            }
                            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-[#fff3e0] text-[#8a4a0a] text-[11px] font-semibold whitespace-nowrap enabled:hover:bg-[#ffe6c7] transition-colors disabled:cursor-default"
                          >
                            ⚠ Faltan resultados
                          </button>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            setDetail(a)
                          }}
                          className="p-1.5 rounded-lg text-[#999] hover:text-[#111] hover:bg-[#f0ede3] transition-all"
                          title="Ver detalle"
                        >
                          <svg
                            width="13"
                            height="13"
                            viewBox="0 0 16 16"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.8"
                          >
                            <circle cx="8" cy="8" r="6.5" />
                            <circle cx="8" cy="8" r="2.5" fill="currentColor" stroke="none" />
                          </svg>
                        </button>
                        {canManage && (
                          <>
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                setModal(a)
                              }}
                              className="p-1.5 rounded-lg text-[#999] hover:text-[#111] hover:bg-[#f0ede3] transition-all"
                              title="Editar"
                            >
                              <svg
                                width="13"
                                height="13"
                                viewBox="0 0 16 16"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="1.8"
                              >
                                <path
                                  d="M11 2l3 3-8 8H3v-3l8-8z"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                />
                              </svg>
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                setConfirmDelete(a)
                              }}
                              className="p-1.5 rounded-lg text-[#999] hover:text-red-600 hover:bg-red-50 transition-all"
                              title="Eliminar"
                            >
                              <svg
                                width="13"
                                height="13"
                                viewBox="0 0 16 16"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="1.8"
                              >
                                <path
                                  d="M3 4h10M6 4V2.5h4V4M5 4v8.5h6V4"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                />
                              </svg>
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {modal !== undefined && (
        <AdsSpendForm
          ad={modal}
          ads={ads}
          companyId={companyId}
          onClose={() => setModal(undefined)}
          onCreated={handleSaved}
          onUpdated={handleSaved}
        />
      )}

      {detail && (
        <AdsSpendDetail
          ad={detail}
          ads={ads}
          client={clients.find((c) => c.id === detail.client_id)}
          responsables={responsables}
          canManage={canManage}
          onClose={() => setDetail(null)}
          onStatusChange={(next) => requestStatusChange(detail, next)}
          onEdit={() => handleEditFromDetail(detail)}
          onRequestDelete={() => handleRequestDeleteFromDetail(detail)}
        />
      )}

      {resultsFor && (
        <AdsResultsModal
          ad={resultsFor}
          onClose={() => setResultsFor(null)}
          onSaved={(row) => {
            handleSaved(row)
            setResultsFor(null)
          }}
        />
      )}

      {confirmDelete && (
        <ConfirmDeleteDialog
          itemName={confirmDelete.name}
          itemLabel="ad"
          onConfirm={handleDeleteConfirm}
          onCancel={() => setConfirmDelete(null)}
          confirming={deleting}
        />
      )}

      {showBudgetOverview && (
        <AdsBudgetOverview
          companyId={companyId}
          periodo={periodo}
          ads={ads}
          clients={clients}
          onClose={() => setShowBudgetOverview(false)}
        />
      )}
    </div>
  )
})

export default AdsSpendView
