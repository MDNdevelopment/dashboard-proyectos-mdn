import { useMemo, useState } from 'react'
import { supabase } from '../../../supabase'
import FilterBar, { FilterField } from '../../common/FilterBar'
import DescribedSelect from '../../common/DescribedSelect'
import TacticasBaseTable from './TacticasBaseTable'
import TacticasPorHacerTable from './TacticasPorHacerTable'
import { ESTADOS_BASE, isVigente, matchesEstado } from '../../../utils/tacticas'

/**
 * Vista "Base" de Tácticas: todas las tácticas (vigentes e historial) en una tabla, con
 * filtros por texto, marca y estado (los mismos grupos de la torta). El Estado "Sin táctica" cambia
 * la tabla a una fila por marca sin táctica vigente. Mismo patrón que la Base de Tareas.
 *
 * @param {object}   props
 * @param {Array}    props.campaigns       — tácticas dentro del alcance de línea
 * @param {Array}    props.brands          — marcas dentro de ese alcance
 * @param {Array}    props.sinVigente      — marcas sin táctica vigente ni programada
 * @param {Map}      props.latestByBrand   — client_id → última táctica
 * @param {Set}      props.insumoClientIds — marcas con insumo pendiente
 * @param {Function} props.leadOf          — (clientId) => nombre de la jefa | null
 * @param {Map}      props.clientsById
 * @param {Map}      props.linesById
 * @param {string}   props.today
 * @param {boolean}  props.canManage
 * @param {Function} props.onSelect        — (campaign) => void, abre el detalle
 * @param {Function} props.onEdit          — (campaign) => void
 * @param {Function} props.onUpdated       — (campaign) => void
 * @param {Function} props.onDeleted       — (id) => void
 * @param {Function} props.onCreate        — (clientId) => void
 * @param {Function} props.onOpenBrand     — (clientId) => void, abre la ficha de la marca
 * @param {string}   [props.initialEstado] — Estado con el que abre (lo elige el Dashboard)
 */
export default function TacticasBase({
  campaigns,
  brands,
  sinVigente,
  latestByBrand,
  insumoClientIds,
  leadOf,
  clientsById,
  linesById,
  today,
  canManage,
  onSelect,
  onEdit,
  onUpdated,
  onDeleted,
  onCreate,
  onOpenBrand,
  initialEstado = 'todas',
}) {
  const [search, setSearch] = useState('')
  const [marca, setMarca] = useState('')
  const [estado, setEstado] = useState(initialEstado)
  const [confirmDelete, setConfirmDelete] = useState(null)

  const porHacer = estado === 'sin_tactica'

  const brandOptions = useMemo(
    () => [
      { key: '', label: 'Todas las marcas', description: 'Tácticas de todas las marcas' },
      ...[...brands]
        .sort((a, b) => (a.name ?? '').localeCompare(b.name ?? '', 'es'))
        .map((b) => {
          const n = campaigns.filter((c) => c.client_id === b.id).length
          const hasVigente = campaigns.some((c) => c.client_id === b.id && isVigente(c, today))
          return {
            key: b.id,
            label: b.name,
            description: `${linesById.get(b.line_id)?.name ?? 'Sin línea'} · ${n} ${
              n === 1 ? 'táctica' : 'tácticas'
            } · ${hasVigente ? 'con táctica vigente' : 'sin táctica vigente'}`,
          }
        }),
    ],
    [brands, campaigns, linesById, today],
  )

  const q = search.toLowerCase()

  const filteredCampaigns = campaigns.filter((c) => {
    if (!matchesEstado(c, estado, today)) return false
    if (marca && c.client_id !== marca) return false
    if (!q) return true
    return [c.name, c.client, c.objective, c.notes, leadOf(c.client_id)]
      .filter(Boolean)
      .some((t) => t.toLowerCase().includes(q))
  })

  const filteredBrands = sinVigente.filter((b) => {
    if (marca && b.id !== marca) return false
    return !q || [b.name, leadOf(b.id)].some((t) => (t ?? '').toLowerCase().includes(q))
  })

  const total = porHacer ? sinVigente.length : campaigns.length
  const shown = porHacer ? filteredBrands.length : filteredCampaigns.length
  const noun = porHacer
    ? total === 1
      ? 'marca sin táctica'
      : 'marcas sin táctica'
    : total === 1
      ? 'táctica'
      : 'tácticas'

  const hasFilters = !!search || !!marca || estado !== 'todas'
  function clearFilters() {
    setSearch('')
    setMarca('')
    setEstado('todas')
  }

  async function handleStatusChange(campaign, status) {
    const { data, error } = await supabase
      .from('campaigns')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', campaign.id)
      .select()
      .single()
    if (!error && data) onUpdated(data)
  }

  async function handleDeleteConfirm(campaign) {
    setConfirmDelete(null)
    const { error } = await supabase.from('campaigns').delete().eq('id', campaign.id)
    if (!error) onDeleted(campaign.id)
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <FilterBar cols={3} onClear={hasFilters ? clearFilters : undefined}>
          <FilterField label="Buscar">
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Táctica, marca, jefa…"
              className="input-base text-[14px] py-1.5 w-full"
            />
          </FilterField>
          <FilterField label="Marca">
            <DescribedSelect
              value={marca}
              options={brandOptions}
              onChange={setMarca}
              placeholder="Todas las marcas"
              ariaLabel="Marca"
            />
          </FilterField>
          <FilterField label="Estado">
            <select
              value={estado}
              onChange={(e) => setEstado(e.target.value)}
              className="input-base text-[14px] py-1.5 w-full"
            >
              {ESTADOS_BASE.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.label}
                </option>
              ))}
            </select>
          </FilterField>
        </FilterBar>
        <p className="text-[14px] text-[#888]">
          {shown !== total ? `${shown} de ${total}` : total} {noun}
        </p>
      </div>

      {total === 0 ? (
        <div className="bg-white rounded-xl border border-[#e0ddd4] p-10 text-center">
          <p className="text-[16px] font-medium text-[#888] mb-1">
            {porHacer ? 'Todas las marcas tienen táctica vigente' : 'Sin tácticas'}
          </p>
          {!porHacer && canManage && (
            <p className="text-[14px] text-[#bbb]">
              Carga la primera con el botón &ldquo;Nueva táctica&rdquo;
            </p>
          )}
        </div>
      ) : shown === 0 ? (
        <div className="bg-white rounded-xl border border-[#e0ddd4] p-8 text-center">
          <p className="text-[15px] text-[#888]">
            {porHacer
              ? 'No hay marcas sin táctica con esos filtros'
              : 'No hay tácticas con esos filtros'}
          </p>
          <button
            type="button"
            onClick={clearFilters}
            className="mt-2 text-[14px] font-semibold text-[#FFB800] hover:underline"
          >
            Limpiar filtros
          </button>
        </div>
      ) : porHacer ? (
        <TacticasPorHacerTable
          brands={filteredBrands}
          latestByBrand={latestByBrand}
          insumoClientIds={insumoClientIds}
          leadOf={leadOf}
          linesById={linesById}
          canManage={canManage}
          onCreate={onCreate}
          onOpenBrand={onOpenBrand}
        />
      ) : (
        <TacticasBaseTable
          campaigns={filteredCampaigns}
          today={today}
          clientsById={clientsById}
          latestByBrand={latestByBrand}
          leadOf={leadOf}
          canManage={canManage}
          onSelect={onSelect}
          onOpenBrand={onOpenBrand}
          onStatusChange={handleStatusChange}
          onEdit={onEdit}
          onDelete={setConfirmDelete}
        />
      )}

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
                type="button"
                onClick={() => setConfirmDelete(null)}
                className="flex-1 py-2.5 rounded-xl border border-[#e0ddd4] text-[15px] font-semibold text-[#555] hover:bg-[#f5f3eb] transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
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
