import { useState } from 'react'
import { supabase } from '../../supabase'
import AdsCard from './AdsCard'
import FilterBar, { FilterField } from '../common/FilterBar'
import { STATUSES } from './constants'
import { completionPct } from '../../utils/tacticas'

const COLUMNS = [
  { key: 'client', label: 'Cliente', sortable: true },
  { key: 'name', label: 'Táctica', sortable: true },
  { key: 'assignee', label: 'Responsable', sortable: true },
  { key: 'start_date', label: 'Inicio', sortable: true },
  { key: 'end_date', label: 'Fecha fin', sortable: true },
  { key: 'cumplimiento', label: 'Cumplimiento', sortable: true },
  { key: 'drive_url', label: 'Drive', sortable: false },
  { key: 'status', label: 'Estado', sortable: true },
  { key: 'actions', label: '', sortable: false },
]

/**
 * Vista "Historial" de Tácticas: todas las tácticas de las marcas en alcance, con búsqueda,
 * filtros por estado y cliente, orden por columna, edición inline del nombre y borrado.
 */
export default function AdsList({
  campaigns,
  loading,
  canManage,
  usersMap,
  clientsById,
  onSelect,
  onUpdated,
  onDeleted,
  onEdit,
}) {
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState('all')
  const [filterClient, setFilterClient] = useState('all')
  const [sortKey, setSortKey] = useState('start_date')
  const [sortAsc, setSortAsc] = useState(false)
  const [inlineEditId, setInlineEditId] = useState(null)
  const [inlineEditValue, setInlineEditValue] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(null)

  const clients = [...new Set(campaigns.map((c) => c.client))].sort()

  const filtered = campaigns.filter((c) => {
    if (filterStatus !== 'all' && c.status !== filterStatus) return false
    if (filterClient !== 'all' && c.client !== filterClient) return false
    if (search) {
      const q = search.toLowerCase()
      const resolvedName = usersMap?.get(c.assignee) ?? c.assignee ?? ''
      if (
        !c.name?.toLowerCase().includes(q) &&
        !c.client?.toLowerCase().includes(q) &&
        !resolvedName.toLowerCase().includes(q) &&
        !c.objective?.toLowerCase().includes(q) &&
        !c.notes?.toLowerCase().includes(q)
      )
        return false
    }
    return true
  })

  const sorted = [...filtered].sort((a, b) => {
    // Sin checklist (null) no es lo mismo que 0 %: se manda al final al ordenar de mayor a menor.
    let va = sortKey === 'cumplimiento' ? (completionPct(a.checklist) ?? -1) : (a[sortKey] ?? '')
    let vb = sortKey === 'cumplimiento' ? (completionPct(b.checklist) ?? -1) : (b[sortKey] ?? '')
    if (typeof va === 'string') va = va.toLowerCase()
    if (typeof vb === 'string') vb = vb.toLowerCase()
    if (va < vb) return sortAsc ? -1 : 1
    if (va > vb) return sortAsc ? 1 : -1
    return 0
  })

  function handleSort(key) {
    if (sortKey === key) setSortAsc((a) => !a)
    else {
      setSortKey(key)
      setSortAsc(true)
    }
  }

  const hasFilters = !!search || filterStatus !== 'all' || filterClient !== 'all'
  function clearFilters() {
    setSearch('')
    setFilterStatus('all')
    setFilterClient('all')
  }

  async function handleStatusChange(id, nextStatus) {
    const { data, error } = await supabase
      .from('campaigns')
      .update({ status: nextStatus, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single()
    if (!error && data) onUpdated(data)
  }

  async function handleInlineEditSave(id) {
    const val = inlineEditValue.trim()
    setInlineEditId(null)
    if (!val) return
    const { data, error } = await supabase
      .from('campaigns')
      .update({ name: val, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single()
    if (!error && data) onUpdated(data)
  }

  async function handleDeleteConfirm(campaign) {
    setConfirmDelete(null)
    const { error } = await supabase.from('campaigns').delete().eq('id', campaign.id)
    if (!error) onDeleted(campaign.id)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="w-6 h-6 border-2 border-[#FFB800] border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  const SortIcon = ({ col }) => {
    if (!col.sortable) return null
    const active = sortKey === col.key
    return (
      <svg
        width="8"
        height="8"
        viewBox="0 0 8 8"
        fill="none"
        className={`inline ml-1 flex-shrink-0 ${active ? 'opacity-100' : 'opacity-30'}`}
      >
        {sortAsc && active ? (
          <path d="M4 1L7 6H1L4 1Z" fill="currentColor" />
        ) : (
          <path d="M4 7L1 2H7L4 7Z" fill="currentColor" />
        )}
      </svg>
    )
  }

  return (
    <div>
      <div className="mb-3">
        <FilterBar cols={3} onClear={hasFilters ? clearFilters : undefined}>
          <FilterField label="Buscar">
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Táctica, cliente, responsable…"
              className="input-base text-[14px] py-1.5 w-full"
            />
          </FilterField>
          <FilterField label="Estado">
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="input-base text-[14px] py-1.5 w-full"
            >
              <option value="all">Todos los estados</option>
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </FilterField>
          <FilterField label="Cliente">
            <select
              value={filterClient}
              onChange={(e) => setFilterClient(e.target.value)}
              className="input-base text-[14px] py-1.5 w-full"
            >
              <option value="all">Todos los clientes</option>
              {clients.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </FilterField>
        </FilterBar>
      </div>

      {/* Count */}
      <p className="text-[13px] font-mono text-[#888] mb-2">
        {sorted.length} {sorted.length === 1 ? 'resultado' : 'resultados'}
        {filtered.length !== campaigns.length && ` de ${campaigns.length}`}
      </p>

      {sorted.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-[16px] font-medium text-[#888]">
            {campaigns.length === 0
              ? 'No hay tácticas aún'
              : 'Sin resultados para los filtros aplicados'}
          </p>
        </div>
      ) : (
        <div className="bg-white border border-[#e0ddd4] rounded-2xl overflow-hidden overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-[#ece9df] bg-[#fafaf7]">
                {COLUMNS.map((col) => (
                  <th
                    key={col.key}
                    onClick={col.sortable ? () => handleSort(col.key) : undefined}
                    className={`px-3 py-2.5 text-[12px] font-mono font-bold tracking-[0.14em] uppercase text-[#888] whitespace-nowrap ${
                      col.sortable ? 'cursor-pointer select-none hover:text-[#111]' : ''
                    }`}
                  >
                    {col.label}
                    <SortIcon col={col} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.map((c) => (
                <AdsCard
                  key={c.id}
                  campaign={c}
                  canManage={canManage}
                  usersMap={usersMap}
                  clientsById={clientsById}
                  onSelect={onSelect}
                  onStatusChange={handleStatusChange}
                  onEdit={onEdit}
                  onDelete={(campaign) => setConfirmDelete(campaign)}
                  inlineEditId={inlineEditId}
                  inlineEditValue={inlineEditValue}
                  onInlineEditStart={(id, val) => {
                    setInlineEditId(id)
                    setInlineEditValue(val)
                  }}
                  onInlineEditChange={setInlineEditValue}
                  onInlineEditSave={handleInlineEditSave}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Delete confirm modal */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-sm bg-black/30">
          <div className="bg-white rounded-2xl shadow-xl p-6 max-w-sm w-full">
            <p className="text-[17px] font-semibold text-[#111] mb-1">¿Eliminar táctica?</p>
            <p className="text-[15px] text-[#666] mb-5">
              Se eliminará <span className="font-semibold">&ldquo;{confirmDelete.name}&rdquo;</span>{' '}
              de forma permanente.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmDelete(null)}
                className="flex-1 py-2.5 rounded-xl border border-[#e0ddd4] text-[15px] font-semibold text-[#555] hover:bg-[#f5f3eb] transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={() => handleDeleteConfirm(confirmDelete)}
                className="flex-1 py-2.5 rounded-xl bg-red-600 text-white text-[15px] font-bold hover:bg-red-700 transition-colors"
              >
                Eliminar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
