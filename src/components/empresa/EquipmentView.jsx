import { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from '../../supabase'
import { useAuth } from '../../context/AuthContext'
import { fetchEquipment, deleteEquipment } from '../../lib/equipment'
import { loadCompanyEmployees, loadLines } from '../metricas/metricsApi'
import { activeEmployees } from '../../lib/employees'
import FilterBar, { FilterField } from '../common/FilterBar'
import StatusPill from '../common/StatusPill'
import ConfirmDeleteDialog from '../common/ConfirmDeleteDialog'
import EquipmentModal from './EquipmentModal'
import { STATUS_META, filterEquipment, countsByStatus, groupByLine } from '../../utils/equipment'

/**
 * Empresa → Equipos: inventario de iPhones de la agencia, agrupado por team (línea) como la
 * hoja "Correos de equipos audiovisuales", con el responsable y el iCloud de cada uno.
 * Sin `empresa.equipos.manage` la vista es de solo lectura.
 */
export default function EquipmentView({ companyId, canManage = false }) {
  const { userProfile } = useAuth()
  const [items, setItems] = useState([])
  const [employees, setEmployees] = useState([])
  const [allEmployees, setAllEmployees] = useState([])
  const [lines, setLines] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [editModal, setEditModal] = useState(undefined) // undefined=cerrado, null=crear, obj=editar
  const [confirmDelete, setConfirmDelete] = useState(null)
  const [deleting, setDeleting] = useState(false)
  const [search, setSearch] = useState('')
  const [lineFilter, setLineFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [responsibleFilter, setResponsibleFilter] = useState('')
  const [showRetired, setShowRetired] = useState(false)

  const load = useCallback(async () => {
    if (!companyId) return
    try {
      const [list, { data: emps }, { data: lineList }] = await Promise.all([
        fetchEquipment(companyId),
        loadCompanyEmployees(companyId),
        loadLines(companyId),
      ])
      setItems(list)
      setLines(lineList ?? [])
      setAllEmployees(emps ?? [])
      setEmployees(activeEmployees(emps ?? []))
      setError(null)
    } catch (err) {
      setError(err.message ?? 'No se pudieron cargar los equipos.')
    } finally {
      setLoading(false)
    }
  }, [companyId])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    const channel = supabase
      .channel('empresa-equipos-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'company_equipment' }, () => {
        load()
      })
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [load])

  // Se resuelve contra TODOS los empleados (incl. archivados) para que un equipo que sigue
  // a nombre de alguien dado de baja muestre su nombre en vez de quedar anónimo.
  const employeeName = useMemo(
    () =>
      Object.fromEntries(
        allEmployees.map((e) => [e.user_id, [e.first_name, e.last_name].filter(Boolean).join(' ')]),
      ),
    [allEmployees],
  )
  const archivedIds = useMemo(
    () => new Set(allEmployees.filter((e) => e.deleted_at).map((e) => e.user_id)),
    [allEmployees],
  )

  const counts = useMemo(() => countsByStatus(items), [items])
  const rows = useMemo(
    () =>
      filterEquipment(
        items,
        {
          search,
          line: lineFilter,
          status: statusFilter,
          responsible: responsibleFilter,
          showRetired,
        },
        employeeName,
      ),
    [items, search, lineFilter, statusFilter, responsibleFilter, showRetired, employeeName],
  )
  const groups = useMemo(() => groupByLine(rows, lines), [rows, lines])
  const hasFilters = search || lineFilter || statusFilter || responsibleFilter

  const cardClass = (on) =>
    `text-left bg-white rounded-xl border p-4 transition-colors ${
      on ? 'border-[#FFB800]' : 'border-[#e0ddd4] hover:border-[#ccc]'
    }`

  function handleSaved(saved) {
    setItems((prev) =>
      prev.some((i) => i.id === saved.id)
        ? prev.map((i) => (i.id === saved.id ? saved : i))
        : [saved, ...prev],
    )
  }

  async function handleDelete() {
    if (!confirmDelete) return
    setDeleting(true)
    try {
      await deleteEquipment(confirmDelete.id)
      setItems((prev) => prev.filter((i) => i.id !== confirmDelete.id))
      setConfirmDelete(null)
    } catch (err) {
      setError(err.message ?? 'No se pudo eliminar el equipo.')
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

  const statCards = [
    { key: '', label: 'Total', value: counts.total },
    { key: 'en_uso', label: 'En uso', value: counts.en_uso },
    { key: 'disponible', label: 'Disponibles', value: counts.disponible },
    { key: 'en_reparacion', label: 'En reparación', value: counts.en_reparacion },
  ]

  return (
    <div className="space-y-5">
      {error && (
        <div className="px-3 py-2 rounded-lg bg-red-50 text-red-700 text-[13px]">{error}</div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {statCards.map((c) => (
          <button
            key={c.label}
            type="button"
            aria-pressed={statusFilter === c.key}
            onClick={() => setStatusFilter(statusFilter === c.key ? '' : c.key)}
            className={cardClass(statusFilter === c.key)}
          >
            <p className="text-[11px] font-mono font-bold tracking-[0.08em] uppercase text-[#999]">
              {c.label}
            </p>
            <p className="text-[20px] font-bold text-[#111] font-mono mt-1">{c.value}</p>
          </button>
        ))}
      </div>

      <div className="flex items-end justify-between gap-4">
        <div className="flex-1">
          <FilterBar
            cols={4}
            onClear={
              hasFilters
                ? () => {
                    setSearch('')
                    setLineFilter('')
                    setStatusFilter('')
                    setResponsibleFilter('')
                  }
                : undefined
            }
          >
            <FilterField label="Buscar">
              <input
                className="input-base text-[14px] py-1.5 w-full"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Modelo, serial, iCloud, responsable…"
              />
            </FilterField>
            <FilterField label="Línea / team">
              <select
                className="input-base text-[14px] py-1.5 w-full"
                value={lineFilter}
                onChange={(e) => setLineFilter(e.target.value)}
              >
                <option value="">Todas</option>
                {lines.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
            </FilterField>
            <FilterField label="Responsable">
              <select
                className="input-base text-[14px] py-1.5 w-full"
                value={responsibleFilter}
                onChange={(e) => setResponsibleFilter(e.target.value)}
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
            + Nuevo
          </button>
        )}
      </div>

      <label className="flex items-center gap-2 text-[13.5px] text-[#666] w-fit cursor-pointer">
        <input
          type="checkbox"
          checked={showRetired}
          onChange={(e) => setShowRetired(e.target.checked)}
        />
        Ver dados de baja ({counts.baja})
      </label>

      {rows.length === 0 ? (
        <div className="bg-white rounded-xl border border-[#e0ddd4] p-10 text-center">
          <p className="text-[15px] text-[#888]">
            {items.length === 0
              ? 'Aún no hay iPhones registrados.'
              : 'Ningún iPhone coincide con los filtros.'}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {groups.map((g) => (
            <section
              key={g.line?.id ?? 'sin-linea'}
              className="bg-white rounded-xl border border-[#e0ddd4] overflow-hidden"
            >
              <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-2.5 bg-[#faf9f5] border-b border-[#eeebe0]">
                <div className="flex items-center gap-2">
                  {g.line?.color && (
                    <span
                      className="w-2.5 h-2.5 rounded-full"
                      style={{ backgroundColor: g.line.color }}
                    />
                  )}
                  <h3 className="text-[14.5px] font-bold text-[#111]">
                    {g.line?.name ?? 'Sin línea'}
                  </h3>
                  <span className="text-[12px] font-mono text-[#999]">
                    {g.items.length} iPhone{g.items.length === 1 ? '' : 's'}
                  </span>
                </div>
                {g.icloudEmails.length > 0 && (
                  <p className="text-[12.5px] font-mono text-[#666]">
                    <span className="uppercase text-[#aaa]">iCloud: </span>
                    {g.icloudEmails.join(' · ')}
                  </p>
                )}
              </div>
              <div className="divide-y divide-[#eeebe0]">
                {g.items.map((eq) => {
                  const responsibleArchived = archivedIds.has(eq.responsible_user_id)
                  return (
                    <div
                      key={eq.id}
                      className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3"
                    >
                      <div className="min-w-[220px] flex-1">
                        <div className="flex items-center gap-2">
                          <p className="text-[15px] font-semibold text-[#111]">{eq.model}</p>
                          <StatusPill value={eq.status} meta={STATUS_META} size="sm" />
                        </div>
                        {(eq.serial || (eq.icloud_email && g.icloudEmails.length > 1)) && (
                          <p className="text-[12.5px] text-[#888] font-mono">
                            {eq.serial}
                            {eq.serial && eq.icloud_email && g.icloudEmails.length > 1 ? ' · ' : ''}
                            {g.icloudEmails.length > 1 ? eq.icloud_email : ''}
                          </p>
                        )}
                        {eq.notes && <p className="text-[13px] text-[#555] mt-0.5">{eq.notes}</p>}
                      </div>
                      <div className="min-w-[170px] text-[13.5px]">
                        {eq.responsible_user_id ? (
                          <>
                            <p className="text-[#111]">
                              {employeeName[eq.responsible_user_id] ?? 'Ex-empleado'}
                            </p>
                            {responsibleArchived && (
                              <p className="text-[12px] font-semibold text-[#e65100]">
                                Dado de baja · reasignar
                              </p>
                            )}
                          </>
                        ) : (
                          <p className="text-[#bbb]">Sin responsable</p>
                        )}
                      </div>
                      {canManage && (
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => setEditModal(eq)}
                            className="text-[13px] font-semibold text-[#666] hover:text-[#111]"
                          >
                            Editar
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDelete(eq)}
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
            </section>
          ))}
        </div>
      )}

      {editModal !== undefined && (
        <EquipmentModal
          companyId={companyId}
          userId={userProfile?.user_id}
          employees={employees}
          lines={lines}
          allEquipment={items}
          equipment={editModal}
          onClose={() => setEditModal(undefined)}
          onSaved={handleSaved}
        />
      )}

      {confirmDelete && (
        <ConfirmDeleteDialog
          itemName={confirmDelete.model}
          itemLabel="iPhone"
          message={`Se eliminará "${confirmDelete.model}" junto con su historial de responsables. Si solo dejó de usarse, mejor márcalo como "Dado de baja" para conservar el historial.`}
          onConfirm={handleDelete}
          onCancel={() => setConfirmDelete(null)}
          confirming={deleting}
        />
      )}
    </div>
  )
}
