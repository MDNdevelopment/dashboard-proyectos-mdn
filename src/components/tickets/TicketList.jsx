import { useState } from 'react'
import TicketCard from './TicketCard'
import { STATUSES, PRIORITIES, CATEGORIES, STATUS, PRIORITY, CATEGORY } from './constants'

export default function TicketList({ tickets, loading, onSelect, isIT }) {
  const [filterStatus, setFilterStatus] = useState('all')
  const [filterPriority, setFilterPriority] = useState('all')
  const [filterCategory, setFilterCategory] = useState('all')

  const filtered = tickets.filter(t => {
    if (filterStatus !== 'all' && t.status !== filterStatus) return false
    if (filterPriority !== 'all' && t.priority !== filterPriority) return false
    if (filterCategory !== 'all' && t.category !== filterCategory) return false
    return true
  })

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="w-6 h-6 border-2 border-[#FFB800] border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div>
      {/* Filters */}
      <div className="flex gap-2 flex-wrap mb-4">
        <select
          value={filterStatus}
          onChange={e => setFilterStatus(e.target.value)}
          className="input-base text-[12px] py-1.5 pr-8"
        >
          <option value="all">Todos los estados</option>
          {STATUSES.map(s => <option key={s} value={s}>{STATUS[s].label}</option>)}
        </select>
        <select
          value={filterPriority}
          onChange={e => setFilterPriority(e.target.value)}
          className="input-base text-[12px] py-1.5 pr-8"
        >
          <option value="all">Todas las prioridades</option>
          {PRIORITIES.map(p => <option key={p} value={p}>{PRIORITY[p].label}</option>)}
        </select>
        <select
          value={filterCategory}
          onChange={e => setFilterCategory(e.target.value)}
          className="input-base text-[12px] py-1.5 pr-8"
        >
          <option value="all">Todas las categorias</option>
          {CATEGORIES.map(c => <option key={c} value={c}>{CATEGORY[c].label}</option>)}
        </select>
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-[14px] font-medium text-[#888]">
            {tickets.length === 0 ? 'No hay tickets aun' : 'Sin resultados para los filtros aplicados'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(ticket => (
            <TicketCard key={ticket.id} ticket={ticket} onClick={onSelect} isIT={isIT} />
          ))}
        </div>
      )}
    </div>
  )
}
