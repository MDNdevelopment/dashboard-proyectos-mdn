import { useState, useEffect, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { supabase } from '../../supabase'
import {
  loadLines,
  loadClients,
  loadCompanyEmployees,
  deleteClient,
  restoreClient,
  seedMetricsIfEmpty,
} from '../metricas/metricsApi'
import { MONTHS } from '../metricas/constants'
import { clientInMonth } from '../../utils/clientInMonth'
import { exportClientsToPdf } from '../../utils/exportClientsToPdf'
import ClientModal from './ClientModal'
import ConfirmDeleteDialog from '../common/ConfirmDeleteDialog'

const CURRENT_YEAR = new Date().getFullYear()
const YEARS = [CURRENT_YEAR, CURRENT_YEAR - 1, CURRENT_YEAR - 2, CURRENT_YEAR - 3]

export default function ClientsView({ companyId, canManage = true }) {
  // Deep-link desde Inicio ("Clientes de mi línea"): ?line=<lineId> preselecciona el filtro.
  const [searchParams] = useSearchParams()
  const [lines, setLines] = useState([])
  const [clients, setClients] = useState([])
  const [employees, setEmployees] = useState([])
  const [loading, setLoading] = useState(true)
  const [filterLine, setFilterLine] = useState(() => searchParams.get('line') ?? 'all')
  const [modal, setModal] = useState(undefined)
  const [readOnly, setReadOnly] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(null)
  // Al eliminar: ¿el cliente cuenta en el reporte del mes de baja? (facturó/trabajó parte del mes)
  const [incluyeMes, setIncluyeMes] = useState(true)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState(null)
  const [generatingPdf, setGeneratingPdf] = useState(false)

  // Período: null = "Actual" (roster vigente), o { month, year } para vista histórica
  const [periodo, setPeriodo] = useState(null)
  const [showArchived, setShowArchived] = useState(false)

  const handleModalClose = useCallback(() => {
    setModal(undefined)
    setReadOnly(false)
  }, [])
  const handleModalRequestEdit = useCallback(() => setReadOnly(false), [])

  // ── Carga inicial ─────────────────────────────────────────────────────────────
  const fetchAll = useCallback(async () => {
    if (!companyId) return
    const [linesRes, clientsRes, employeesRes] = await Promise.all([
      loadLines(companyId),
      loadClients(companyId, null, { includeArchived: true }),
      loadCompanyEmployees(companyId),
    ])
    setLines(linesRes.data ?? [])
    setClients((clientsRes.data ?? []).slice().sort((a, b) => a.name.localeCompare(b.name, 'es')))
    setEmployees(employeesRes.data ?? [])
  }, [companyId])

  useEffect(() => {
    if (!companyId) return
    setLoading(true)
    ;(async () => {
      await seedMetricsIfEmpty(companyId)
      await fetchAll()
      setLoading(false)
    })()
  }, [companyId, fetchAll])

  // ── Canal realtime ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!companyId) return
    const channel = supabase
      .channel('empresa-clientes-v2')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'metric_lines' }, fetchAll)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'metric_clients' }, fetchAll)
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [companyId, fetchAll])

  // ── Estado optimista ──────────────────────────────────────────────────────────
  function handleSaved(row) {
    setClients((prev) => {
      const idx = prev.findIndex((c) => c.id === row.id)
      const next = idx >= 0 ? prev.map((c) => (c.id === row.id ? row : c)) : [...prev, row]
      return next.slice().sort((a, b) => a.name.localeCompare(b.name, 'es'))
    })
  }

  // ── Archivar (soft delete) ────────────────────────────────────────────────────
  async function handleDelete() {
    if (!confirmDelete) return
    setDeleting(true)
    const { error: err } = await deleteClient(confirmDelete.id, { incluyeMes })
    setDeleting(false)
    if (err) {
      setError(err.message)
      setConfirmDelete(null)
      return
    }
    const now = new Date().toISOString()
    setClients((prev) =>
      prev.map((c) =>
        c.id === confirmDelete.id ? { ...c, deleted_at: now, baja_incluye_mes: incluyeMes } : c,
      ),
    )
    setConfirmDelete(null)
  }

  // ── Export PDF (clientes activos agrupados por social) ───────────────────────
  async function handleExportPdf() {
    setGeneratingPdf(true)
    try {
      await exportClientsToPdf({ clients, employees, lines })
    } finally {
      setGeneratingPdf(false)
    }
  }

  // ── Restaurar ─────────────────────────────────────────────────────────────────
  async function handleRestore(client) {
    const { error: err } = await restoreClient(client.id)
    if (err) {
      setError(err.message)
      return
    }
    setClients((prev) => prev.map((c) => (c.id === client.id ? { ...c, deleted_at: null } : c)))
  }

  // ── Filtrado de clientes ──────────────────────────────────────────────────────
  const activeClients = clients.filter((c) => !c.deleted_at)
  const archivedClients = clients.filter((c) => !!c.deleted_at)

  function applyLineFilter(list) {
    if (filterLine === 'all') return list
    if (filterLine === 'none') return list.filter((c) => !c.line_id)
    return list.filter((c) => c.line_id === filterLine)
  }

  let visibleClients
  if (periodo) {
    // Vista histórica: clientes activos en ese mes
    visibleClients = applyLineFilter(
      clients.filter((c) => clientInMonth(c, periodo.year, periodo.month)),
    )
  } else if (showArchived) {
    visibleClients = applyLineFilter(archivedClients)
  } else {
    visibleClients = applyLineFilter(activeClients)
  }

  // ── Helper: línea de un cliente ───────────────────────────────────────────────
  function lineOf(client) {
    return lines.find((l) => l.id === client.line_id) ?? null
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-6 h-6 border-2 border-[#FFB800] border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  const modoActual = !periodo

  return (
    <div className="space-y-5">
      <p className="text-[15px] text-[#888]">
        Administrá la cartera de clientes y marcas de la empresa. Cada cliente puede asociarse a una
        línea operativa y tener su propia configuración.
      </p>

      {/* Controles superiores: período + filtro por línea + botón nuevo */}
      <div className="flex flex-col gap-3">
        {/* Selector de período */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[13px] font-mono font-semibold text-[#888] uppercase tracking-[0.08em]">
            Período
          </span>
          <button
            onClick={() => {
              setPeriodo(null)
              setShowArchived(false)
            }}
            className={`px-3 py-1.5 rounded-lg text-[13.5px] font-semibold border transition-all ${
              modoActual
                ? 'bg-[#111] text-white border-[#111]'
                : 'bg-white text-[#666] border-[#e0ddd4] hover:bg-[#f5f3eb]'
            }`}
          >
            Actual
          </button>

          {/* Selector mes/año */}
          <div className="flex items-center gap-1.5">
            <select
              value={periodo?.month ?? ''}
              onChange={(e) => {
                const m = Number(e.target.value)
                if (!m) {
                  setPeriodo(null)
                  return
                }
                setPeriodo((prev) => ({
                  year: prev?.year ?? CURRENT_YEAR,
                  month: m,
                }))
              }}
              className="text-[13.5px] border border-[#e0ddd4] rounded-lg px-2 py-1.5 bg-white text-[#333] focus:outline-none focus:border-[#FFB800]"
            >
              <option value="">-- mes --</option>
              {MONTHS.map((name, i) => (
                <option key={i + 1} value={i + 1}>
                  {name}
                </option>
              ))}
            </select>
            <select
              value={periodo?.year ?? CURRENT_YEAR}
              onChange={(e) => {
                const y = Number(e.target.value)
                setPeriodo((prev) =>
                  prev ? { ...prev, year: y } : { year: y, month: new Date().getMonth() + 1 },
                )
              }}
              className="text-[13.5px] border border-[#e0ddd4] rounded-lg px-2 py-1.5 bg-white text-[#333] focus:outline-none focus:border-[#FFB800]"
            >
              {YEARS.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </div>

          {/* Toggle archivados — solo en modo Actual */}
          {modoActual && (
            <button
              onClick={() => setShowArchived((v) => !v)}
              className={`px-3 py-1.5 rounded-lg text-[13.5px] font-semibold border transition-all ${
                showArchived
                  ? 'bg-[#f5f0e0] text-[#888] border-[#d4c890]'
                  : 'bg-white text-[#aaa] border-[#e0ddd4] hover:bg-[#f5f3eb]'
              }`}
            >
              {showArchived ? 'Ocultando activos' : `Ver archivados (${archivedClients.length})`}
            </button>
          )}

          {/* Descargar PDF — clientes activos agrupados por social */}
          <button
            onClick={handleExportPdf}
            disabled={generatingPdf}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#e0ddd4] text-[14px] font-medium text-[#555] hover:bg-[#f5f3eb] transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {generatingPdf ? (
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
            {generatingPdf ? 'Generando…' : 'PDF'}
          </button>

          {/* Botón nuevo cliente — solo en modo Actual con permiso */}
          {modoActual && !showArchived && canManage && (
            <button
              onClick={() => {
                setModal(null)
                setReadOnly(false)
              }}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#FAB51A] text-[#111] font-bold text-[14.5px] hover:bg-[#e8a315] transition-colors ml-auto"
            >
              <svg
                width="13"
                height="13"
                viewBox="0 0 13 13"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
              >
                <path d="M6.5 1v11M1 6.5h11" strokeLinecap="round" />
              </svg>
              Nuevo cliente
            </button>
          )}
        </div>

        {/* Filtro por línea */}
        <div className="flex flex-wrap gap-1.5">
          <button
            onClick={() => setFilterLine('all')}
            className={`px-3 py-1.5 rounded-lg text-[14px] font-semibold border transition-all ${
              filterLine === 'all'
                ? 'bg-[#111] text-white border-[#111]'
                : 'bg-white text-[#666] border-[#e0ddd4] hover:bg-[#f5f3eb]'
            }`}
          >
            {periodo
              ? `Todas (${clients.filter((c) => clientInMonth(c, periodo.year, periodo.month)).length})`
              : showArchived
                ? `Todas (${archivedClients.length})`
                : `Todas (${activeClients.length})`}
          </button>
          {lines.map((line) => {
            let count
            if (periodo) {
              count = clients.filter(
                (c) => c.line_id === line.id && clientInMonth(c, periodo.year, periodo.month),
              ).length
            } else if (showArchived) {
              count = archivedClients.filter((c) => c.line_id === line.id).length
            } else {
              count = activeClients.filter((c) => c.line_id === line.id).length
            }
            return (
              <button
                key={line.id}
                onClick={() => setFilterLine(line.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[14px] font-semibold border transition-all ${
                  filterLine === line.id
                    ? 'text-[#111] border-transparent shadow-sm'
                    : 'bg-white text-[#666] border-[#e0ddd4] hover:bg-[#f5f3eb]'
                }`}
                style={
                  filterLine === line.id
                    ? { background: line.color + '22', borderColor: line.color }
                    : {}
                }
              >
                <span
                  className="w-2 h-2 rounded-full flex-shrink-0"
                  style={{ background: line.color }}
                />
                {line.name} ({count})
              </button>
            )
          })}
          <button
            onClick={() => setFilterLine('none')}
            className={`px-3 py-1.5 rounded-lg text-[14px] font-semibold border transition-all ${
              filterLine === 'none'
                ? 'bg-[#111] text-white border-[#111]'
                : 'bg-white text-[#666] border-[#e0ddd4] hover:bg-[#f5f3eb]'
            }`}
          >
            Sin línea (
            {periodo
              ? clients.filter((c) => !c.line_id && clientInMonth(c, periodo.year, periodo.month))
                  .length
              : showArchived
                ? archivedClients.filter((c) => !c.line_id).length
                : activeClients.filter((c) => !c.line_id).length}
            )
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-[14px] rounded-xl px-4 py-3">
          {error}
        </div>
      )}

      {/* Lista de clientes */}
      <div className="bg-white rounded-2xl border border-[#e0ddd4] overflow-hidden">
        {/* Header */}
        <div className="px-5 py-3 bg-[#fafaf7] border-b border-[#f0ede3] flex items-center justify-between">
          <span className="text-[13px] font-mono font-bold uppercase tracking-[0.12em] text-[#888]">
            {periodo
              ? `Cartera · ${MONTHS[periodo.month - 1]} ${periodo.year}`
              : showArchived
                ? 'Archivados'
                : 'Clientes'}
          </span>
          <span className="text-[12px] font-mono text-[#bbb]">
            {visibleClients.length} {visibleClients.length !== 1 ? 'clientes' : 'cliente'}
          </span>
        </div>

        {visibleClients.length === 0 ? (
          <div className="px-5 py-10 text-center">
            <p className="text-[15px] text-[#aaa]">
              {periodo
                ? `Sin clientes activos en ${MONTHS[periodo.month - 1]} ${periodo.year}.`
                : filterLine === 'all'
                  ? showArchived
                    ? 'Sin clientes archivados.'
                    : 'Sin clientes registrados.'
                  : 'Sin clientes en este filtro.'}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-[#f0ede3]">
            {visibleClients.map((client) => {
              const line = lineOf(client)
              const archived = !!client.deleted_at
              const isHistory = !!periodo
              return (
                <div
                  key={client.id}
                  className={`flex items-center gap-3 px-5 py-3 transition-colors cursor-pointer ${
                    archived ? 'opacity-60' : 'hover:bg-[#fafaf7]'
                  }`}
                  onClick={() => {
                    setModal(client)
                    setReadOnly(true)
                  }}
                >
                  {/* Logo + Nombre */}
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    {client.logo_url ? (
                      <img
                        src={client.logo_url}
                        alt={client.name}
                        className="w-7 h-7 rounded-full object-cover flex-shrink-0 border border-[#e0ddd4]"
                      />
                    ) : (
                      <span className="w-7 h-7 rounded-full bg-[#f0ede3] flex items-center justify-center flex-shrink-0 text-[12px] font-bold text-[#aaa] uppercase">
                        {client.name[0]}
                      </span>
                    )}
                    <span className="text-[15px] text-[#222] font-medium truncate">
                      {client.name}
                    </span>
                  </div>

                  {/* Chip "archivado" en vista histórica */}
                  {isHistory && archived && (
                    <span className="px-2.5 py-0.5 rounded-full text-[11.5px] font-semibold flex-shrink-0 bg-[#f5f0e0] text-[#999]">
                      archivado
                    </span>
                  )}

                  {/* Día de pago */}
                  {client.payment_day && (
                    <span
                      className="hidden sm:inline text-[12px] font-mono text-[#aaa] flex-shrink-0"
                      title="Día de pago mensual"
                    >
                      fecha de pago: {client.payment_day}
                    </span>
                  )}

                  {/* Chip de línea */}

                  {line ? (
                    <span
                      className="px-2.5 py-0.5 rounded-full text-[12.5px] font-semibold flex-shrink-0"
                      style={{
                        background: line.color + '22',
                        color: line.color,
                      }}
                    >
                      {line.name}
                    </span>
                  ) : (
                    <span className="px-2.5 py-0.5 rounded-full text-[12.5px] font-semibold flex-shrink-0 bg-[#f0ede3] text-[#aaa]">
                      Sin línea
                    </span>
                  )}

                  {/* Ícono web */}
                  {client.website && (
                    <a
                      href={client.website}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="hidden sm:inline-flex text-[#ccc] hover:text-[#555] transition-colors flex-shrink-0"
                      title={client.website}
                      onClick={(e) => {
                        e.stopPropagation()
                      }}
                    >
                      <svg
                        width="13"
                        height="13"
                        viewBox="0 0 16 16"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.7"
                      >
                        <circle cx="8" cy="8" r="6.5" />
                        <path
                          d="M8 1.5c-2 2-2 9 0 13M8 1.5c2 2 2 9 0 13M1.5 8h13"
                          strokeLinecap="round"
                        />
                      </svg>
                    </a>
                  )}

                  {/* Contador de redes */}
                  {client.social_links?.length > 0 && (
                    <span
                      className="hidden sm:inline text-[12px] font-mono text-[#aaa] flex-shrink-0"
                      title="Redes sociales"
                    >
                      {client.social_links.length} red
                      {client.social_links.length !== 1 ? 'es' : ''}
                    </span>
                  )}

                  {/* Acciones — solo en modo Actual con permiso */}
                  {modoActual && canManage && (
                    <>
                      {archived ? (
                        /* Restaurar */
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            handleRestore(client)
                          }}
                          className="text-[#aaa] hover:text-[#FFB800] transition-colors flex-shrink-0 text-[12px] font-semibold"
                          title="Restaurar cliente"
                          aria-label="Restaurar"
                        >
                          Restaurar
                        </button>
                      ) : (
                        <>
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              setModal(client)
                              setReadOnly(false)
                            }}
                            className="text-[#aaa] hover:text-[#555] transition-colors flex-shrink-0"
                            title="Editar"
                            aria-label="Editar"
                          >
                            <svg
                              width="14"
                              height="14"
                              viewBox="0 0 16 16"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="1.7"
                            >
                              <path d="M11 2l3 3-8 8H3v-3L11 2Z" strokeLinejoin="round" />
                            </svg>
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              setIncluyeMes(true)
                              setConfirmDelete({
                                id: client.id,
                                name: client.name,
                              })
                            }}
                            className="text-[#aaa] hover:text-red-400 transition-colors flex-shrink-0"
                            title="Archivar"
                            aria-label="Archivar"
                          >
                            <svg
                              width="14"
                              height="14"
                              viewBox="0 0 16 16"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="1.7"
                            >
                              <path
                                d="M3 5h10M6 5V3h4v2M5 5l.5 8h5l.5-8"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              />
                            </svg>
                          </button>
                        </>
                      )}
                    </>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Modal cliente */}
      {modal !== undefined && (
        <ClientModal
          key={readOnly ? `ro-${modal?.id ?? 'new'}` : `edit-${modal?.id ?? 'new'}`}
          client={modal}
          companyId={companyId}
          lines={lines}
          employees={employees}
          readOnly={readOnly}
          canManage={canManage}
          onRequestEdit={handleModalRequestEdit}
          onClose={handleModalClose}
          onSaved={handleSaved}
        />
      )}

      {/* Diálogo de confirmación de archivado */}
      {confirmDelete && (
        <ConfirmDeleteDialog
          itemName={confirmDelete.name}
          itemLabel="cliente"
          onConfirm={handleDelete}
          onCancel={() => setConfirmDelete(null)}
          confirming={deleting}
        >
          <fieldset className="rounded-xl border border-[#ece9df] bg-[#faf9f4] p-3">
            <legend className="px-1 text-[13px] font-mono font-bold tracking-[0.08em] uppercase text-[#888]">
              Reporte del mes en curso
            </legend>
            <label className="flex items-start gap-2.5 py-1 cursor-pointer">
              <input
                type="radio"
                name="incluyeMes"
                className="mt-1 accent-[#FFB800]"
                checked={incluyeMes === true}
                onChange={() => setIncluyeMes(true)}
              />
              <span className="text-[14px] text-[#333]">
                <strong>Sí, facturó o trabajó este mes.</strong> Se mantiene en el reporte del mes
                actual y desaparece a partir del próximo.
              </span>
            </label>
            <label className="flex items-start gap-2.5 py-1 cursor-pointer">
              <input
                type="radio"
                name="incluyeMes"
                className="mt-1 accent-[#FFB800]"
                checked={incluyeMes === false}
                onChange={() => setIncluyeMes(false)}
              />
              <span className="text-[14px] text-[#333]">
                <strong>No, sacarlo también de este mes.</strong> Se retira de inmediato del reporte
                del mes actual (se pierden sus ingresos y métricas cargados este mes).
              </span>
            </label>
          </fieldset>
        </ConfirmDeleteDialog>
      )}
    </div>
  )
}
