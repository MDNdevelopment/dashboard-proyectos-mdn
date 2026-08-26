import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ESTADOS, COL_META } from './constants'
import { fmtShort, isLate } from '../tareas/constants'
import { Avatar } from '../tareas/UserPickerSingle'

/**
 * Tabla base de CNP: la lista completa, filtrable por estado/cliente/impreso/alerta
 * y buscable por título. Modelada sobre BaseView.jsx de Gestión de Tareas, sin la
 * complejidad de arrastre/continuidad entre meses (los CNP no tienen ese concepto).
 */
export default function CnpBaseView({
  cnps = [],
  clientsById = new Map(),
  usersMap = new Map(),
  onOpenCnp,
  initialFilter = null,
}) {
  const [searchParams] = useSearchParams()

  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState(
    () => initialFilter?.status ?? searchParams.get('status') ?? '',
  )
  const [clientFilter, setClientFilter] = useState(
    () => initialFilter?.clientId ?? searchParams.get('client') ?? '',
  )
  const [printFilter, setPrintFilter] = useState(() => initialFilter?.print ?? 'all')
  const [alertFilter, setAlertFilter] = useState(() => initialFilter?.alert ?? '')

  const clientOptions = [...new Set(cnps.map((c) => c.client_id).filter(Boolean))]
    .map((id) => ({ id, name: clientsById.get(id)?.name ?? 'Sin cliente' }))
    .sort((a, b) => a.name.localeCompare(b.name))

  const filtered = cnps.filter((c) => {
    if (statusFilter !== 'all' && statusFilter && c.status !== statusFilter) return false
    if (clientFilter && c.client_id !== clientFilter) return false
    if (printFilter === 'print' && !c.is_print) return false
    if (printFilter === 'noprint' && c.is_print) return false
    if (printFilter === 'pending' && !(c.is_print && !c.print_approved_at)) return false
    if (alertFilter === 'late' && !isLate(c)) return false
    if (search) {
      const q = search.toLowerCase()
      const clientName = clientsById.get(c.client_id)?.name ?? ''
      if (!c.title.toLowerCase().includes(q) && !clientName.toLowerCase().includes(q)) return false
    }
    return true
  })

  const hasFilters = search || statusFilter || clientFilter || printFilter !== 'all' || alertFilter
  const activeClientName = clientFilter ? (clientsById.get(clientFilter)?.name ?? null) : null

  function clearFilters() {
    setSearch('')
    setStatusFilter('')
    setClientFilter('')
    setPrintFilter('all')
    setAlertFilter('')
  }

  return (
    <div className="space-y-1.5">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
        <div className="relative col-span-2 sm:col-span-1">
          <svg
            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#999] pointer-events-none"
            width="12"
            height="12"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <circle cx="6.5" cy="6.5" r="5" />
            <path d="M10.5 10.5L14 14" strokeLinecap="round" />
          </svg>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por título o cliente..."
            className="w-full pl-8 pr-3 py-[10px] text-[14.5px] bg-white border border-[#e0ddd4] rounded-lg outline-none focus:border-[#bbb] transition-colors"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="input-base text-[14.5px] py-2"
        >
          <option value="">Estatus: todos</option>
          {ESTADOS.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <select
          value={clientFilter}
          onChange={(e) => setClientFilter(e.target.value)}
          className="input-base text-[14.5px] py-2"
        >
          <option value="">Cliente: todos</option>
          {clientOptions.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <select
          value={printFilter}
          onChange={(e) => setPrintFilter(e.target.value)}
          className="input-base text-[14.5px] py-2"
        >
          <option value="all">Impreso: todos</option>
          <option value="print">Solo impresos</option>
          <option value="noprint">Solo no impresos</option>
          <option value="pending">Impresos sin aprobar</option>
        </select>
        <select
          value={alertFilter}
          onChange={(e) => setAlertFilter(e.target.value)}
          className="input-base text-[14.5px] py-2"
        >
          <option value="">Alerta: todas</option>
          <option value="late">Retrasados</option>
        </select>
      </div>

      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[14px] text-[#888]">
            {hasFilters ? `${filtered.length} de ${cnps.length}` : cnps.length} CNP
          </span>
          {activeClientName && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 bg-[#fff6e0] border border-[#e8c96a] rounded-full text-[12.5px] font-semibold text-[#a06a00]">
              {activeClientName}
              <button
                onClick={() => setClientFilter('')}
                className="text-[#b58a00] hover:text-[#7a5c00] leading-none"
                title="Quitar filtro de cliente"
              >
                ×
              </button>
            </span>
          )}
        </div>
        {hasFilters && (
          <button
            onClick={clearFilters}
            className="text-[14px] font-semibold text-[#888] hover:text-[#111] transition-colors"
          >
            Limpiar filtros
          </button>
        )}
      </div>

      <div className="bg-white rounded-xl border border-[#e0ddd4] overflow-hidden">
        {filtered.length === 0 ? (
          <p className="text-[15px] text-[#bbb] text-center py-10">No hay CNP que coincidan.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[14.5px]">
              <thead>
                <tr className="border-b border-[#ece9df] text-left bg-[#faf9f5] text-[12.5px] font-mono font-bold tracking-[0.12em] uppercase text-[#888]">
                  <th className="px-4 py-2.5">Cliente</th>
                  <th className="px-4 py-2.5">Título</th>
                  <th className="px-4 py-2.5">Responsable</th>
                  <th className="px-4 py-2.5">Impreso</th>
                  <th className="px-4 py-2.5">Solicitado</th>
                  <th className="px-4 py-2.5">Estado</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((c) => {
                  const meta = COL_META[c.status]
                  const assignee = usersMap.get(c.assignee_id)
                  const printPending = c.is_print && !c.print_approved_at
                  const late = isLate(c)
                  return (
                    <tr
                      key={c.id}
                      onClick={() => onOpenCnp?.(c)}
                      className={`border-b border-[#f5f3ec] last:border-0 hover:bg-[#faf9f5] cursor-pointer transition-colors ${late ? 'bg-red-50/50' : ''}`}
                    >
                      <td className="px-4 py-2.5 font-medium text-[#111] max-w-[160px]">
                        {(() => {
                          const client = clientsById.get(c.client_id)
                          const name = client?.name
                          if (!name) return <span className="text-[#bbb]">Sin cliente</span>
                          return (
                            <div className="flex items-center gap-1.5 min-w-0">
                              {client.logo_url ? (
                                <img
                                  src={client.logo_url}
                                  alt={name}
                                  className="w-7 h-7 rounded-full object-cover flex-shrink-0 border border-[#e0ddd4]"
                                />
                              ) : (
                                <span className="w-7 h-7 rounded-full bg-[#f0ede3] flex items-center justify-center flex-shrink-0 text-[12px] font-bold text-[#aaa] uppercase">
                                  {name[0]}
                                </span>
                              )}
                              <span className="truncate">{name}</span>
                            </div>
                          )
                        })()}
                      </td>
                      <td className="px-4 py-2.5 text-[#444] max-w-[260px] truncate">
                        {c.title}
                        {late && (
                          <span className="block text-[13px] text-[#E14848] font-semibold mt-0.5">
                            atrasado
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2.5">
                        {assignee ? (
                          <div className="flex items-center gap-1.5 min-w-0">
                            <Avatar user={assignee} size={26} />
                            <span className="text-[#555] truncate">
                              {`${assignee.first_name ?? ''} ${assignee.last_name ?? ''}`.trim()}
                            </span>
                          </div>
                        ) : (
                          <span className="text-[#bbb]">—</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5">
                        {c.is_print ? (
                          <span
                            className={`text-[12.5px] font-semibold ${printPending ? 'text-[#F0871F]' : 'text-[#16A34A]'}`}
                          >
                            {printPending ? 'Pendiente' : 'Aprobado'}
                          </span>
                        ) : (
                          <span className="text-[#bbb]">—</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-[#888] font-mono text-[13px]">
                        {c.created_at ? fmtShort(c.created_at.slice(0, 10)) : '—'}
                      </td>
                      <td className="px-4 py-2.5">
                        <span
                          className="inline-block px-2 py-0.5 rounded-full text-[12.5px] font-semibold"
                          style={{ background: meta.color, color: meta.textColor }}
                        >
                          {c.status}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
