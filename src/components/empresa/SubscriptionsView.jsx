import { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from '../../supabase'
import { useAuth } from '../../context/AuthContext'
import { fetchSubscriptions, deleteSubscription } from '../../lib/subscriptions'
import { loadCompanyEmployees } from '../metricas/metricsApi'
import { activeEmployees } from '../../lib/employees'
import { CATEGORIAS_GASTO } from '../finanzas/constants'
import FilterBar, { FilterField } from '../common/FilterBar'
import StatusPill from '../common/StatusPill'
import ConfirmDeleteDialog from '../common/ConfirmDeleteDialog'
import SubscriptionModal from './SubscriptionModal'
import {
  FREQUENCIES,
  STATUS_META,
  nextBillingDate,
  daysUntil,
  totalsByCurrency,
  formatAmount,
  missingInfo,
} from '../../utils/subscriptions'

const CATEGORY_LABELS = Object.fromEntries(CATEGORIAS_GASTO.map((c) => [c.key, c.label]))

function todayKey() {
  const d = new Date()
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

function formatDate(key) {
  const [y, m, d] = key.split('-')
  return `${d}/${m}/${y}`
}

function whenLabel(days) {
  if (days === 0) return 'hoy'
  if (days === 1) return 'mañana'
  return `en ${days} días`
}

/**
 * Empresa → Suscripciones: servicios recurrentes que paga la agencia. Es solo registro:
 * NO alimenta Finanzas (aviso fijo arriba). El próximo cobro se deriva en el cliente.
 */
export default function SubscriptionsView({ companyId, canManage = false }) {
  const { userProfile } = useAuth()
  const [subs, setSubs] = useState([])
  const [employees, setEmployees] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [editModal, setEditModal] = useState(undefined) // undefined=cerrado, null=crear, obj=editar
  const [confirmDelete, setConfirmDelete] = useState(null)
  const [deleting, setDeleting] = useState(false)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [ownerFilter, setOwnerFilter] = useState('')

  const load = useCallback(async () => {
    if (!companyId) return
    try {
      const [list, { data: emps }] = await Promise.all([
        fetchSubscriptions(companyId),
        loadCompanyEmployees(companyId),
      ])
      setSubs(list)
      setEmployees(activeEmployees(emps ?? []))
      setError(null)
    } catch (err) {
      setError(err.message ?? 'No se pudieron cargar las suscripciones.')
    } finally {
      setLoading(false)
    }
  }, [companyId])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    const channel = supabase
      .channel('empresa-suscripciones-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'company_subscriptions' },
        () => {
          load()
        },
      )
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [load])

  const today = todayKey()
  const employeeName = useMemo(
    () =>
      Object.fromEntries(
        employees.map((e) => [e.user_id, [e.first_name, e.last_name].filter(Boolean).join(' ')]),
      ),
    [employees],
  )

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase()
    return subs
      .filter((s) => !q || s.name.toLowerCase().includes(q))
      .filter((s) => !statusFilter || s.status === statusFilter)
      .filter((s) => !categoryFilter || s.category === categoryFilter)
      .filter((s) => !ownerFilter || s.owner_user_id === ownerFilter)
      .map((s) => ({ sub: s, next: nextBillingDate(s, today) }))
      .sort((a, b) => {
        if (a.next && b.next) return a.next.localeCompare(b.next)
        if (a.next) return -1
        if (b.next) return 1
        return a.sub.name.localeCompare(b.sub.name)
      })
  }, [subs, search, statusFilter, categoryFilter, ownerFilter, today])

  const totals = totalsByCurrency(subs)
  const activeCount = subs.filter((s) => s.status === 'activa').length
  const dueSoon = subs.filter((s) => {
    const next = nextBillingDate(s, today)
    return next && daysUntil(next, today) <= 7
  }).length
  const hasFilters = search || statusFilter || categoryFilter || ownerFilter

  function handleSaved(saved) {
    setSubs((prev) =>
      prev.some((s) => s.id === saved.id)
        ? prev.map((s) => (s.id === saved.id ? saved : s))
        : [...prev, saved],
    )
  }

  async function handleDelete() {
    if (!confirmDelete) return
    setDeleting(true)
    try {
      await deleteSubscription(confirmDelete.id)
      setSubs((prev) => prev.filter((s) => s.id !== confirmDelete.id))
      setConfirmDelete(null)
    } catch (err) {
      setError(err.message ?? 'No se pudo eliminar la suscripción.')
    } finally {
      setDeleting(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="w-5 h-5 border-2 border-[#FFB800] border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <div className="px-4 py-3 rounded-xl bg-[#fff8e6] border border-[#f0dfae] text-[13.5px] text-[#8a6600]">
        <strong>Solo registro:</strong> estos cobros aún no se reflejan en Finanzas. Si un pago
        corresponde a un gasto del mes, regístralo allá por separado.
      </div>

      {error && (
        <div className="px-3 py-2 rounded-lg bg-red-50 text-red-700 text-[13px]">{error}</div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-white rounded-xl border border-[#e0ddd4] p-4 col-span-2">
          <p className="text-[11px] font-mono font-bold tracking-[0.08em] uppercase text-[#999]">
            Total mensual estimado
          </p>
          {Object.keys(totals).length === 0 ? (
            <p className="text-[20px] font-bold text-[#111] font-mono mt-1">—</p>
          ) : (
            <div className="flex flex-wrap gap-x-5 mt-1">
              {Object.entries(totals).map(([cur, total]) => (
                <p key={cur} className="text-[20px] font-bold text-[#111] font-mono">
                  {formatAmount(total, cur)}
                </p>
              ))}
            </div>
          )}
        </div>
        <div className="bg-white rounded-xl border border-[#e0ddd4] p-4">
          <p className="text-[11px] font-mono font-bold tracking-[0.08em] uppercase text-[#999]">
            Activas
          </p>
          <p className="text-[20px] font-bold text-[#111] font-mono mt-1">{activeCount}</p>
        </div>
        <div className="bg-white rounded-xl border border-[#e0ddd4] p-4">
          <p className="text-[11px] font-mono font-bold tracking-[0.08em] uppercase text-[#999]">
            Cobran en 7 días
          </p>
          <p className="text-[20px] font-bold text-[#111] font-mono mt-1">{dueSoon}</p>
        </div>
      </div>

      <div className="flex items-end justify-between gap-4">
        <div className="flex-1">
          <FilterBar
            cols={4}
            onClear={
              hasFilters
                ? () => {
                    setSearch('')
                    setStatusFilter('')
                    setCategoryFilter('')
                    setOwnerFilter('')
                  }
                : undefined
            }
          >
            <FilterField label="Buscar">
              <input
                className="input-base text-[14px] py-1.5 w-full"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Servicio…"
              />
            </FilterField>
            <FilterField label="Estado">
              <select
                className="input-base text-[14px] py-1.5 w-full"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <option value="">Todos</option>
                {Object.entries(STATUS_META).map(([key, s]) => (
                  <option key={key} value={key}>
                    {s.label}
                  </option>
                ))}
              </select>
            </FilterField>
            <FilterField label="Rubro">
              <select
                className="input-base text-[14px] py-1.5 w-full"
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
              >
                <option value="">Todos</option>
                {CATEGORIAS_GASTO.map((c) => (
                  <option key={c.key} value={c.key}>
                    {c.label}
                  </option>
                ))}
              </select>
            </FilterField>
            <FilterField label="Responsable">
              <select
                className="input-base text-[14px] py-1.5 w-full"
                value={ownerFilter}
                onChange={(e) => setOwnerFilter(e.target.value)}
              >
                <option value="">Todos</option>
                {employees.map((e) => (
                  <option key={e.user_id} value={e.user_id}>
                    {employeeName[e.user_id]}
                  </option>
                ))}
              </select>
            </FilterField>
          </FilterBar>
        </div>
        {canManage && (
          <button
            type="button"
            onClick={() => setEditModal(null)}
            className="shrink-0 px-4 py-2 bg-[#FFB800] text-[#111] rounded-xl text-[14px] font-bold hover:bg-[#e6a600] transition-colors"
          >
            + Nueva
          </button>
        )}
      </div>

      {rows.length === 0 ? (
        <div className="bg-white rounded-xl border border-[#e0ddd4] p-10 text-center">
          <p className="text-[15px] text-[#888]">
            {subs.length === 0
              ? 'Aún no hay suscripciones registradas.'
              : 'Ninguna suscripción coincide con los filtros.'}
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-[#e0ddd4] divide-y divide-[#eeebe0]">
          {rows.map(({ sub, next }) => {
            const days = next ? daysUntil(next, today) : null
            const missing = missingInfo(sub)
            return (
              <div
                key={sub.id}
                className={`flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 ${
                  missing.length > 0 ? 'bg-[#fff8e6] border-l-4 border-[#FFB800]' : ''
                }`}
              >
                <div className="min-w-[200px] flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-[15px] font-semibold text-[#111]">{sub.name}</p>
                    <StatusPill value={sub.status} meta={STATUS_META} size="sm" />
                  </div>
                  <p className="text-[12.5px] text-[#888]">
                    {CATEGORY_LABELS[sub.category] ?? sub.category}
                    {sub.owner_user_id && employeeName[sub.owner_user_id]
                      ? ` · ${employeeName[sub.owner_user_id]}`
                      : ''}
                  </p>
                  {sub.comment && <p className="text-[13px] text-[#555] mt-0.5">{sub.comment}</p>}
                </div>
                <div className="text-right min-w-[120px]">
                  <p className="text-[15px] font-bold font-mono text-[#111]">
                    {formatAmount(sub.amount, sub.currency)}
                  </p>
                  <p className="text-[12px] text-[#888]">
                    {FREQUENCIES[sub.frequency]?.label ?? sub.frequency}
                  </p>
                </div>
                <div className="min-w-[90px] text-[13px] font-mono text-[#555]">
                  {sub.card_last4 ? (
                    `•••• ${sub.card_last4}`
                  ) : sub.status === 'cancelada' ? (
                    '—'
                  ) : (
                    <span className="font-semibold text-[#8a6600]">Sin tarjeta</span>
                  )}
                </div>
                <div className="min-w-[130px] text-[13px]">
                  {next ? (
                    <>
                      <p className="font-mono text-[#111]">{formatDate(next)}</p>
                      <p className={days <= 7 ? 'text-[#e65100] font-semibold' : 'text-[#888]'}>
                        {whenLabel(days)}
                      </p>
                    </>
                  ) : sub.status === 'activa' && sub.billing_day == null ? (
                    <p className="font-semibold text-[#8a6600]">Fecha por confirmar</p>
                  ) : (
                    <p className="text-[#bbb]">Sin cobro</p>
                  )}
                </div>
                {canManage && (
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setEditModal(sub)}
                      className="text-[13px] font-semibold text-[#666] hover:text-[#111]"
                    >
                      Editar
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmDelete(sub)}
                      className="text-[13px] font-semibold text-red-600 hover:text-red-800"
                    >
                      Eliminar
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {editModal !== undefined && (
        <SubscriptionModal
          companyId={companyId}
          userId={userProfile?.user_id}
          employees={employees}
          subscription={editModal}
          onClose={() => setEditModal(undefined)}
          onSaved={handleSaved}
        />
      )}

      {confirmDelete && (
        <ConfirmDeleteDialog
          itemName={confirmDelete.name}
          itemLabel="suscripción"
          message={`Se eliminará "${confirmDelete.name}" y su registro. Si solo dejó de usarse, mejor márcala como cancelada para conservar el historial.`}
          onConfirm={handleDelete}
          onCancel={() => setConfirmDelete(null)}
          confirming={deleting}
        />
      )}
    </div>
  )
}
