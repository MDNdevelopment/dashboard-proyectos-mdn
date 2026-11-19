import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import FilterBar, { FilterField } from '../../common/FilterBar'
import DescribedSelect from '../../common/DescribedSelect'
import AdsList from '../AdsList'
import TacticasAlertCards from './TacticasAlertCards'
import TacticasGantt from './TacticasGantt'
import TacticasPorHacer from './TacticasPorHacer'
import TacticasVigentesTable from './TacticasVigentesTable'
import TacticasPorMarca from './TacticasPorMarca'
import {
  brandsWithoutVigente,
  completionPct,
  daysLeft,
  isProgramada,
  isVigente,
  latestByBrand,
  leadNameOf,
  monthLabel,
  todayCaracas,
} from '../../../utils/tacticas'

const VIEWS = [
  { key: 'vigentes', label: 'Vigentes' },
  { key: 'historial', label: 'Historial' },
]

const ESTADOS = [
  { key: 'vigentes', label: 'Todas las vigentes' },
  { key: 'vencen3', label: 'Vencen en 3 días' },
  { key: 'vencen_mes', label: 'Vencen este mes' },
  { key: 'programadas', label: 'Programadas' },
]

/**
 * Host de la pestaña Tácticas: historial de tácticas por marca con dos subvistas.
 * La subvista y la marca viven en la URL (`?view=vigentes|historial&client=<id>`), igual que
 * `?line=`, para poder enlazar a una ficha desde otro módulo. El viejo `?view=marca` se trata
 * como Vigentes (con la marca de `?client=` elegida).
 *
 * - Vigentes: tarjetas de resumen, filtros (incluido "Marca"), Gantt, marcas por hacer y tabla
 *   de tácticas en marcha. Con una marca elegida en el filtro, en lugar del Gantt y la tabla
 *   se muestra su ficha (vigentes con checklist, insumo e historial).
 * - Historial: todas las tácticas (tabla con filtros).
 *
 * @param {object}   props
 * @param {Array}    props.campaigns   — tácticas dentro del alcance de línea del usuario
 * @param {Array}    props.brands      — marcas (metric_clients activos) dentro de ese alcance
 * @param {Map}      props.clientsById
 * @param {Map}      props.linesById
 * @param {Map}      props.usersMap
 * @param {boolean}  props.loading
 * @param {boolean}  props.canManage
 * @param {Function} props.onSelect    — (campaign) => void, abre el detalle
 * @param {Function} props.onEdit      — (campaign) => void
 * @param {Function} props.onUpdated   — (campaign) => void
 * @param {Function} props.onDeleted   — (id) => void
 * @param {Array}    props.insumos     — [{ handoff, source, content }] insumos pendientes (ver AdsPage)
 * @param {Function} props.onDiscardInsumo — (handoff) => void
 * @param {Function} props.onCreate    — (clientId?) => void, abre el formulario
 */
export default function TacticasView({
  campaigns,
  brands,
  clientsById,
  linesById,
  usersMap,
  loading,
  canManage,
  onSelect,
  onEdit,
  onUpdated,
  onDeleted,
  insumos = [],
  onDiscardInsumo,
  onCreate,
}) {
  const [searchParams, setSearchParams] = useSearchParams()
  const view = searchParams.get('view') === 'historial' ? 'historial' : 'vigentes'
  const clientId = searchParams.get('client') ?? ''

  const [search, setSearch] = useState('')
  const [jefa, setJefa] = useState('all')
  const [mes, setMes] = useState('all')
  const [estado, setEstado] = useState('vigentes')

  const today = todayCaracas()

  function patchParams(patch) {
    setSearchParams(
      (prev) => {
        const p = new URLSearchParams(prev)
        for (const [k, v] of Object.entries(patch)) {
          if (v) p.set(k, v)
          else p.delete(k)
        }
        return p
      },
      { replace: true },
    )
  }

  const setView = (key) => patchParams({ view: key === 'vigentes' ? null : key })
  const openBrand = (id) => patchParams({ view: null, client: id })

  const latestMap = useMemo(() => latestByBrand(campaigns), [campaigns])
  const leadOf = (id) => leadNameOf(id, clientsById, linesById, usersMap)

  const vigentes = useMemo(() => campaigns.filter((c) => isVigente(c, today)), [campaigns, today])
  const sinVigente = useMemo(
    () => brandsWithoutVigente(brands, campaigns, today),
    [brands, campaigns, today],
  )

  const stats = useMemo(() => {
    const pcts = vigentes.map((c) => completionPct(c.checklist)).filter((p) => p != null)
    return {
      brandsTotal: brands.length,
      brandsConVigente: brands.length - sinVigente.length,
      vigentes: vigentes.length,
      sinTactica: sinVigente.length,
      avgPct: pcts.length ? Math.round(pcts.reduce((a, b) => a + b, 0) / pcts.length) : null,
    }
  }, [vigentes, brands, sinVigente])

  const brandOptions = useMemo(
    () => [
      { key: '', label: 'Todas las marcas', description: 'Tablero con todas las marcas' },
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

  const jefas = useMemo(
    () => [...new Set(vigentes.map((c) => leadOf(c.client_id)).filter(Boolean))].sort(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [vigentes, clientsById, linesById, usersMap],
  )
  const meses = useMemo(
    () => [...new Set(vigentes.map((c) => c.end_date.slice(0, 7)))].sort(),
    [vigentes],
  )

  const q = search.toLowerCase()
  const matchesSearch = (c) =>
    !q ||
    [c.name, c.client, c.objective, c.notes]
      .filter(Boolean)
      .some((t) => t.toLowerCase().includes(q))

  // Gantt: marcas de la jefa elegida; con búsqueda, las que coinciden por nombre o por alguna
  // de sus tácticas. Los filtros de estado y mes son de la tabla.
  const ganttBrands = brands.filter((b) => {
    if (jefa !== 'all' && leadOf(b.id) !== jefa) return false
    if (!q || (b.name ?? '').toLowerCase().includes(q)) return true
    return campaigns.some((c) => c.client_id === b.id && matchesSearch(c))
  })

  const filtered = vigentes.filter((c) => {
    if (estado === 'vencen3' && daysLeft(c, today) > 3) return false
    if (estado === 'vencen_mes' && c.end_date.slice(0, 7) !== today.slice(0, 7)) return false
    if (estado === 'programadas' && !isProgramada(c, today)) return false
    if (jefa !== 'all' && leadOf(c.client_id) !== jefa) return false
    if (mes !== 'all' && c.end_date.slice(0, 7) !== mes) return false
    return matchesSearch(c)
  })

  const hasFilters =
    !!search || !!clientId || jefa !== 'all' || mes !== 'all' || estado !== 'vigentes'
  function clearFilters() {
    setSearch('')
    setJefa('all')
    setMes('all')
    setEstado('vigentes')
    if (clientId) patchParams({ client: null })
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="w-6 h-6 border-2 border-[#FFB800] border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div>
      <div className="flex flex-wrap gap-1.5 mb-5" role="group" aria-label="Vista de tácticas">
        {VIEWS.map((v) => (
          <button
            key={v.key}
            type="button"
            aria-pressed={view === v.key}
            onClick={() => setView(v.key)}
            className={`px-3.5 py-1.5 rounded-full text-[14.5px] font-semibold transition-all ${
              view === v.key
                ? 'bg-[#FFB800] text-[#111]'
                : 'bg-white border border-[#e0ddd4] text-[#555] hover:border-[#FFB800] hover:text-[#111]'
            }`}
          >
            {v.label}
          </button>
        ))}
      </div>

      {view === 'vigentes' && (
        <>
          <TacticasAlertCards stats={stats} estado={estado} onFilter={setEstado} />

          <div className="mb-4">
            <FilterBar cols={5} onClear={hasFilters ? clearFilters : undefined}>
              <FilterField label="Buscar">
                <input
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Táctica, marca, objetivo…"
                  className="input-base text-[14px] py-1.5 w-full"
                />
              </FilterField>
              <FilterField label="Marca">
                <DescribedSelect
                  value={clientId}
                  options={brandOptions}
                  onChange={(id) => patchParams({ client: id })}
                  placeholder="Todas las marcas"
                  ariaLabel="Marca"
                />
              </FilterField>
              <FilterField label="Jefa">
                <select
                  value={jefa}
                  onChange={(e) => setJefa(e.target.value)}
                  className="input-base text-[14px] py-1.5 w-full"
                >
                  <option value="all">Todas</option>
                  {jefas.map((j) => (
                    <option key={j} value={j}>
                      {j}
                    </option>
                  ))}
                </select>
              </FilterField>
              <FilterField label="Vence en">
                <select
                  value={mes}
                  onChange={(e) => setMes(e.target.value)}
                  className="input-base text-[14px] py-1.5 w-full"
                >
                  <option value="all">Cualquier mes</option>
                  {meses.map((m) => (
                    <option key={m} value={m}>
                      {monthLabel(m)}
                    </option>
                  ))}
                </select>
              </FilterField>
              <FilterField label="Estado">
                <select
                  value={estado}
                  onChange={(e) => setEstado(e.target.value)}
                  className="input-base text-[14px] py-1.5 w-full"
                >
                  {ESTADOS.map((s) => (
                    <option key={s.key} value={s.key}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </FilterField>
            </FilterBar>
          </div>

          {clientId ? (
            <TacticasPorMarca
              campaigns={campaigns}
              clientId={clientId}
              clientsById={clientsById}
              linesById={linesById}
              usersMap={usersMap}
              today={today}
              canManage={canManage}
              onSelect={onSelect}
              insumos={insumos.filter((i) => i.handoff.client_id === clientId)}
              onDiscardInsumo={onDiscardInsumo}
              onCreate={onCreate}
              onUpdated={onUpdated}
            />
          ) : (
            <>
              <TacticasGantt
                brands={ganttBrands}
                campaigns={campaigns}
                today={today}
                onSelect={onSelect}
                onOpenBrand={openBrand}
              />

              <TacticasPorHacer
                brands={sinVigente}
                latestByBrand={latestMap}
                insumoClientIds={new Set(insumos.map((i) => i.handoff.client_id))}
                canManage={canManage}
                onCreate={onCreate}
                onOpenBrand={openBrand}
              />

              <p className="text-[13px] font-mono text-[#888] mb-2">
                {filtered.length} {filtered.length === 1 ? 'táctica' : 'tácticas'}
                {filtered.length !== vigentes.length && ` de ${vigentes.length}`}
              </p>

              <TacticasVigentesTable
                campaigns={filtered}
                today={today}
                clientsById={clientsById}
                latestByBrand={latestMap}
                leadOf={leadOf}
                canManage={canManage}
                onSelect={onSelect}
                onOpenBrand={openBrand}
              />
            </>
          )}
        </>
      )}

      {view === 'historial' && (
        <AdsList
          campaigns={campaigns}
          loading={false}
          canManage={canManage}
          usersMap={usersMap}
          clientsById={clientsById}
          onSelect={onSelect}
          onUpdated={onUpdated}
          onDeleted={onDeleted}
          onEdit={onEdit}
        />
      )}
    </div>
  )
}
