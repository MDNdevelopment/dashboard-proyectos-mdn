import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../supabase'
import {
  loadLines,
  loadClients,
  deleteClient,
  seedMetricsIfEmpty,
} from '../metricas/metricsApi'
import ClientModal from './ClientModal'
import ConfirmDeleteDialog from '../common/ConfirmDeleteDialog'

/**
 * Lista plana de todos los clientes/marcas de la empresa.
 * Cada cliente puede pertenecer a una línea (o ninguna).
 * La configuración de cada cliente (nombre, línea, día de pago, redes, web)
 * se gestiona desde ClientModal.
 */
export default function ClientsView({ companyId, canManage = true }) {
  const [lines, setLines]         = useState([])
  const [clients, setClients]     = useState([])
  const [loading, setLoading]     = useState(true)
  const [filterLine, setFilterLine] = useState('all')   // 'all' | 'none' | line.id
  const [modal, setModal]         = useState(undefined) // undefined=cerrado, null=crear, objeto=editar
  const [confirmDelete, setConfirmDelete] = useState(null)  // { id, name }
  const [deleting, setDeleting]   = useState(false)
  const [error, setError]         = useState(null)

  // ── Carga inicial ─────────────────────────────────────────────────────────────
  const fetchAll = useCallback(async () => {
    if (!companyId) return
    const [linesRes, clientsRes] = await Promise.all([
      loadLines(companyId),
      loadClients(companyId),
    ])
    setLines(linesRes.data ?? [])
    setClients((clientsRes.data ?? []).slice().sort((a, b) => a.name.localeCompare(b.name, 'es')))
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
    return () => { supabase.removeChannel(channel) }
  }, [companyId, fetchAll])

  // ── Estado optimista ──────────────────────────────────────────────────────────
  function handleSaved(row) {
    setClients(prev => {
      const idx = prev.findIndex(c => c.id === row.id)
      const next = idx >= 0
        ? prev.map(c => c.id === row.id ? row : c)
        : [...prev, row]
      return next.slice().sort((a, b) => a.name.localeCompare(b.name, 'es'))
    })
  }

  // ── Eliminar ──────────────────────────────────────────────────────────────────
  async function handleDelete() {
    if (!confirmDelete) return
    setDeleting(true)
    const { error: err } = await deleteClient(confirmDelete.id)
    setDeleting(false)
    if (err) { setError(err.message); setConfirmDelete(null); return }
    setClients(prev => prev.filter(c => c.id !== confirmDelete.id))
    setConfirmDelete(null)
  }

  // ── Filtrado de clientes ──────────────────────────────────────────────────────
  const visibleClients = clients.filter(c => {
    if (filterLine === 'all')  return true
    if (filterLine === 'none') return !c.line_id
    return c.line_id === filterLine
  })

  // ── Helper: línea de un cliente ───────────────────────────────────────────────
  function lineOf(client) {
    return lines.find(l => l.id === client.line_id) ?? null
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-6 h-6 border-2 border-[#FFB800] border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <p className="text-[15px] text-[#888]">
        Administrá la cartera de clientes y marcas de la empresa.
        Cada cliente puede asociarse a una línea operativa y tener su propia configuración.
      </p>

      {/* Controles superiores: filtro + botón nuevo */}
      <div className="flex items-center gap-2 flex-wrap">
        {/* Filtro por línea */}
        <div className="flex flex-wrap gap-1.5 flex-1">
          <button
            onClick={() => setFilterLine('all')}
            className={`px-3 py-1.5 rounded-lg text-[14px] font-semibold border transition-all ${
              filterLine === 'all'
                ? 'bg-[#111] text-white border-[#111]'
                : 'bg-white text-[#666] border-[#e0ddd4] hover:bg-[#f5f3eb]'
            }`}
          >
            Todas ({clients.length})
          </button>
          {lines.map(line => {
            const count = clients.filter(c => c.line_id === line.id).length
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
            Sin línea ({clients.filter(c => !c.line_id).length})
          </button>
        </div>

        {/* Botón nuevo cliente — solo si tiene permiso de modificar */}
        {canManage && (
          <button
            onClick={() => setModal(null)}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#FAB51A] text-[#111] font-bold text-[14.5px] hover:bg-[#e8a315] transition-colors flex-shrink-0"
          >
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="2.2">
              <path d="M6.5 1v11M1 6.5h11" strokeLinecap="round"/>
            </svg>
            Nuevo cliente
          </button>
        )}
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
            Clientes
          </span>
          <span className="text-[12px] font-mono text-[#bbb]">
            {visibleClients.length} {visibleClients.length !== 1 ? 'clientes' : 'cliente'}
          </span>
        </div>

        {visibleClients.length === 0 ? (
          <div className="px-5 py-10 text-center">
            <p className="text-[15px] text-[#aaa]">
              {filterLine === 'all' ? 'Sin clientes registrados.' : 'Sin clientes en este filtro.'}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-[#f0ede3]">
            {visibleClients.map(client => {
              const line = lineOf(client)
              return (
                <div
                  key={client.id}
                  className="flex items-center gap-3 px-5 py-3 hover:bg-[#fafaf7] transition-colors"
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

                  {/* Chip de línea */}
                  {line ? (
                    <span
                      className="px-2.5 py-0.5 rounded-full text-[12.5px] font-semibold flex-shrink-0"
                      style={{ background: line.color + '22', color: line.color }}
                    >
                      {line.name}
                    </span>
                  ) : (
                    <span className="px-2.5 py-0.5 rounded-full text-[12.5px] font-semibold flex-shrink-0 bg-[#f0ede3] text-[#aaa]">
                      Sin línea
                    </span>
                  )}

                  {/* Día de pago */}
                  {client.payment_day && (
                    <span className="text-[12px] font-mono text-[#aaa] flex-shrink-0" title="Día de pago mensual">
                      día {client.payment_day}
                    </span>
                  )}

                  {/* Ícono web */}
                  {client.website && (
                    <a
                      href={client.website}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[#ccc] hover:text-[#555] transition-colors flex-shrink-0"
                      title={client.website}
                      onClick={e => e.stopPropagation()}
                    >
                      <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7">
                        <circle cx="8" cy="8" r="6.5"/>
                        <path d="M8 1.5c-2 2-2 9 0 13M8 1.5c2 2 2 9 0 13M1.5 8h13" strokeLinecap="round"/>
                      </svg>
                    </a>
                  )}

                  {/* Íconos de redes (contador) */}
                  {client.social_links?.length > 0 && (
                    <span className="text-[12px] font-mono text-[#aaa] flex-shrink-0" title="Redes sociales">
                      {client.social_links.length} red{client.social_links.length !== 1 ? 'es' : ''}
                    </span>
                  )}

                  {/* Botones de edición — solo si tiene permiso de modificar */}
                  {canManage && (
                    <>
                      <button
                        onClick={() => setModal(client)}
                        className="text-[#aaa] hover:text-[#555] transition-colors flex-shrink-0"
                        title="Editar"
                        aria-label="Editar"
                      >
                        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7">
                          <path d="M11 2l3 3-8 8H3v-3L11 2Z" strokeLinejoin="round"/>
                        </svg>
                      </button>
                      <button
                        onClick={() => setConfirmDelete({ id: client.id, name: client.name })}
                        className="text-[#aaa] hover:text-red-400 transition-colors flex-shrink-0"
                        title="Eliminar"
                        aria-label="Eliminar"
                      >
                        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7">
                          <path d="M3 5h10M6 5V3h4v2M5 5l.5 8h5l.5-8" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      </button>
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
          client={modal}
          companyId={companyId}
          lines={lines}
          onClose={() => setModal(undefined)}
          onSaved={handleSaved}
        />
      )}

      {/* Diálogo de confirmación de borrado */}
      {confirmDelete && (
        <ConfirmDeleteDialog
          itemName={confirmDelete.name}
          itemLabel="cliente"
          onConfirm={handleDelete}
          onCancel={() => setConfirmDelete(null)}
          confirming={deleting}
        />
      )}
    </div>
  )
}
