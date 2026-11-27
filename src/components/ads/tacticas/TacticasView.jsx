import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import TacticasTorta from './TacticasTorta'
import TacticasPorHacer from './TacticasPorHacer'
import TacticasBase from './TacticasBase'
import TacticasMarcaModal from './TacticasMarcaModal'
import TacticasVencen from './TacticasVencen'
import {
  brandsWithoutVigente,
  completionPct,
  isVigente,
  latestByBrand,
  leadNameOf,
  todayCaracas,
  vencenPronto,
} from '../../../utils/tacticas'

const VIEWS = [
  {
    key: 'dashboard',
    label: 'Dashboard',
    desc: 'Esta sección es la foto de cómo están cubiertas las marcas. Aquí ves cuáles tienen táctica al día, cuáles vencen pronto y cuáles se quedaron sin táctica. Úsala para saber qué táctica hay que preparar primero.',
  },
  {
    key: 'base',
    label: 'Base',
    desc: 'Esta sección es la base de tácticas, donde vive cada plan de cada marca: las vigentes y todo el historial. Aquí lo filtras o buscas por marca o estado.',
  },
]

/** `?view=base` (o el viejo `?view=historial`) abre Base; cualquier otro valor, el Dashboard. */
function viewFromParam(value) {
  return value === 'base' || value === 'historial' ? 'base' : 'dashboard'
}

/**
 * Host de la pestaña Tácticas, con el mismo patrón que Tareas: Dashboard y Base.
 * La subvista y la ficha abierta viven en la URL (`?view=base&client=<id>`), igual que
 * `?line=`, para poder enlazar desde otro módulo.
 *
 * - Dashboard: torta de cobertura con una torta chica por team (`TacticasTorta`), tarjeta de
 *   tarjeta "Vencen pronto" debajo de las tortas y tarjeta de marcas por hacer. Cada color lleva a
 *   Base con su filtro.
 * - Base: todas las tácticas con filtros (`TacticasBase`); el Estado "Sin táctica" lista marcas.
 * - Ficha de una marca: ventana emergente (`TacticasMarcaModal`) abierta por `?client=`, desde
 *   cualquier clic en el nombre de una marca.
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
 * @param {Function} [props.onSelectLine] — (lineId, extraParams) => void, elige el team en las
 *   pills de `AdsPage` y escribe `extraParams` en la misma actualización de la URL
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
  onSelectLine,
}) {
  const [searchParams, setSearchParams] = useSearchParams()
  const view = viewFromParam(searchParams.get('view'))
  const clientId = searchParams.get('client') ?? ''
  // Filtro con el que abre Base al llegar desde el Dashboard. `n` cambia en cada navegación
  // para remontar Base aunque se repita el mismo estado.
  const [baseNav, setBaseNav] = useState({ estado: 'vigentes', n: 0 })

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

  function setView(key) {
    setBaseNav((prev) => ({ estado: 'vigentes', n: prev.n + 1 }))
    patchParams({ view: key === 'dashboard' ? null : key })
  }

  /** Abre Base con un Estado y, si se pasa, con el team (línea) elegido en las pills. */
  function goToBase(estado, lineId) {
    setBaseNav((prev) => ({ estado, n: prev.n + 1 }))
    // Una sola escritura de la URL: dos setSearchParams seguidos se pisan.
    if (lineId && onSelectLine) onSelectLine(lineId, { view: 'base' })
    else patchParams({ view: 'base' })
  }
  const openBrand = (id) => patchParams({ client: id })
  const closeBrand = () => patchParams({ client: null })

  const latestMap = useMemo(() => latestByBrand(campaigns), [campaigns])
  const leadOf = (id) => leadNameOf(id, clientsById, linesById, usersMap)
  const insumoClientIds = useMemo(() => new Set(insumos.map((i) => i.handoff.client_id)), [insumos])

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

  const proximas = useMemo(() => vencenPronto(campaigns, today), [campaigns, today])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="w-6 h-6 border-2 border-[#FFB800] border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  const desc = VIEWS.find((v) => v.key === view)?.desc

  return (
    <div>
      <div
        className="flex bg-white border border-[#e0ddd4] rounded-xl p-1 w-full sm:w-fit mb-3"
        role="group"
        aria-label="Vista de tácticas"
      >
        {VIEWS.map((v) => (
          <button
            key={v.key}
            type="button"
            aria-pressed={view === v.key}
            onClick={() => setView(v.key)}
            className={`flex-1 sm:flex-none px-2.5 sm:px-4 py-1.5 rounded-lg text-[14.5px] font-semibold transition-all ${
              view === v.key
                ? 'bg-[#111] text-white'
                : 'text-[#666] hover:text-[#111] hover:bg-[#f5f3eb]'
            }`}
          >
            {v.label}
          </button>
        ))}
      </div>

      {desc && <p className="text-[14.5px] text-[#888] leading-relaxed mb-4 max-w-2xl">{desc}</p>}

      {view === 'dashboard' && (
        <>
          <TacticasTorta
            brands={brands}
            campaigns={campaigns}
            today={today}
            stats={stats}
            linesById={linesById}
            onGoToBase={goToBase}
          />

          {proximas.length > 0 && (
            <TacticasVencen
              campaigns={proximas}
              today={today}
              clientsById={clientsById}
              onSelect={onSelect}
              onGoToBase={goToBase}
            />
          )}

          <TacticasPorHacer
            brands={sinVigente}
            insumoClientIds={insumoClientIds}
            onOpenBrand={openBrand}
            onViewInBase={() => goToBase('sin_tactica')}
          />
        </>
      )}

      {view === 'base' && (
        <TacticasBase
          key={baseNav.n}
          initialEstado={baseNav.estado}
          campaigns={campaigns}
          brands={brands}
          sinVigente={sinVigente}
          latestByBrand={latestMap}
          insumoClientIds={insumoClientIds}
          leadOf={leadOf}
          clientsById={clientsById}
          linesById={linesById}
          today={today}
          canManage={canManage}
          onSelect={onSelect}
          onEdit={onEdit}
          onUpdated={onUpdated}
          onDeleted={onDeleted}
          onCreate={onCreate}
          onOpenBrand={openBrand}
        />
      )}

      {clientId && (
        <TacticasMarcaModal
          onClose={closeBrand}
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
      )}
    </div>
  )
}
