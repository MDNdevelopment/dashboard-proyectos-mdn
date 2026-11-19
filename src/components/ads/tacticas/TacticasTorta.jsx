import { useEffect, useMemo, useState } from 'react'
import { COVERAGE_GROUPS, brandCoverage, daysLabel, leadNameOf } from '../../../utils/tacticas'

// Clases literales: Tailwind no genera CSS para clases armadas por interpolación.
const GROUPS = {
  red: {
    label: 'Urgente',
    hint: 'Vencen en 3 días o menos',
    hex: '#e05252',
    pill: 'bg-[#fce4e4] text-[#8e1b1b]',
    ink: 'text-[#8e1b1b]',
  },
  yellow: {
    label: 'Por vencer',
    hint: 'Vencen en 10 días o menos',
    hex: '#FFB800',
    pill: 'bg-[#fff1c2] text-[#6e4a00]',
    ink: 'text-[#6e4a00]',
  },
  green: {
    label: 'Al día',
    hint: 'Les queda más de 10 días',
    hex: '#4caf63',
    pill: 'bg-[#e3f2e5] text-[#1e5e24]',
    ink: 'text-[#1e5e24]',
  },
  none: {
    label: 'Sin táctica',
    hint: 'No tienen táctica vigente',
    hex: '#9db4d6',
    pill: 'bg-[#e6eef9] text-[#1565c0]',
    ink: 'text-[#1565c0]',
  },
}

const SIZE = 280
const C = SIZE / 2
const R_OUT = 128
const R_IN = 78
const GAP = 0.025 // radianes entre porciones

/** Porción de anillo entre los ángulos a0 y a1 (radianes, 0 = derecha, sentido horario). */
function ringPath(a0, a1) {
  // Una porción de 360° no se puede dibujar con un solo arco: se parte en dos.
  if (a1 - a0 >= Math.PI * 2 - 1e-6) {
    const mid = a0 + Math.PI
    return `${ringPath(a0, mid)} ${ringPath(mid, a1)}`
  }
  const pt = (r, a) => `${(C + r * Math.cos(a)).toFixed(2)},${(C + r * Math.sin(a)).toFixed(2)}`
  const big = a1 - a0 > Math.PI ? 1 : 0
  return `M${pt(R_OUT, a0)}A${R_OUT},${R_OUT} 0 ${big} 1 ${pt(R_OUT, a1)}L${pt(R_IN, a1)}A${R_IN},${R_IN} 0 ${big} 0 ${pt(R_IN, a0)}Z`
}

function prefersMotion() {
  if (typeof window === 'undefined' || !window.matchMedia) return false
  return !window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/**
 * Resumen principal de la vista Vigentes: una torta con las marcas agrupadas según su táctica
 * vigente (Urgente ≤ 3 días · Por vencer ≤ 10 · Al día · Sin táctica) y, al lado, la lista de
 * marcas del grupo elegido. Clic en una porción o en la leyenda elige el grupo; clic en una marca
 * abre su táctica (o, sin táctica, el formulario para cargarla si `canManage`, si no su ficha).
 *
 * @param {object}   props
 * @param {Array}    props.brands      — marcas dentro del alcance de línea
 * @param {Array}    props.campaigns   — tácticas de esas marcas
 * @param {string}   props.today       — hoy en Caracas (YYYY-MM-DD)
 * @param {object}   props.stats       — { vigentes, avgPct }
 * @param {Map}      props.clientsById
 * @param {Map}      props.linesById
 * @param {Map}      props.usersMap
 * @param {boolean}  props.canManage
 * @param {Function} props.onSelect    — (campaign) => void, abre el detalle
 * @param {Function} props.onCreate    — (clientId) => void, abre el formulario con la marca
 * @param {Function} props.onOpenBrand — (clientId) => void, abre la ficha de la marca
 */
export default function TacticasTorta({
  brands,
  campaigns,
  today,
  stats,
  clientsById,
  linesById,
  usersMap,
  canManage,
  onSelect,
  onCreate,
  onOpenBrand,
}) {
  const groups = useMemo(() => brandCoverage(brands, campaigns, today), [brands, campaigns, today])
  const total = brands.length
  const covered = total - groups.none.length
  const firstWithData = COVERAGE_GROUPS.find((k) => groups[k].length) ?? 'none'
  const [picked, setPicked] = useState(null)
  const sel = picked && groups[picked]?.length ? picked : firstWithData

  // Animación de entrada: la torta "se dibuja" una vez al montar.
  const [t, setT] = useState(() => (prefersMotion() ? 0 : 1))
  useEffect(() => {
    if (t >= 1) return undefined
    let raf
    const start = performance.now()
    const step = (now) => {
      const k = Math.min(1, (now - start) / 700)
      setT(1 - Math.pow(1 - k, 3))
      if (k < 1) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const slices = []
  let angle = -Math.PI / 2
  for (const key of COVERAGE_GROUPS) {
    const n = groups[key].length
    if (!n || !total) continue
    const span = (n / total) * Math.PI * 2 * t
    const gap = n === total ? 0 : GAP
    slices.push({ key, n, d: ringPath(angle + gap / 2, angle + span - gap / 2) })
    angle += span
  }

  const meta = GROUPS[sel]
  const list = groups[sel]

  function openRow(row) {
    if (row.campaign) onSelect(row.campaign)
    else if (canManage) onCreate(row.brand.id)
    else onOpenBrand(row.brand.id)
  }

  return (
    <section
      aria-label="Resumen de tácticas"
      className="bg-white border border-[#e0ddd4] rounded-2xl p-5 mb-5"
    >
      <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1 mb-4">
        <h3 className="text-[17px] font-bold text-[#111]">Cobertura de marcas</h3>
        <p className="text-[14px] text-[#666]">
          <strong className="font-mono text-[#111]">{total}</strong>{' '}
          {total === 1 ? 'marca' : 'marcas'} ·{' '}
          <strong className="font-mono text-[#111]">{stats.vigentes}</strong>{' '}
          {stats.vigentes === 1 ? 'táctica vigente' : 'tácticas vigentes'}
          {stats.avgPct != null && (
            <>
              {' '}
              · cumplimiento promedio{' '}
              <strong className="font-mono text-[#111]">{stats.avgPct}%</strong>
            </>
          )}
        </p>
      </div>

      {total === 0 ? (
        <p className="text-center py-10 text-[15px] text-[#888]">No hay marcas en esta línea</p>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-6 items-start">
          <div className="flex flex-col items-center">
            <svg
              viewBox={`0 0 ${SIZE} ${SIZE}`}
              className="w-[260px] h-[260px] overflow-visible"
              role="img"
              aria-label={`${covered} de ${total} marcas con táctica vigente`}
            >
              {slices.map((s) => (
                <path
                  key={s.key}
                  d={s.d}
                  fill={GROUPS[s.key].hex}
                  onClick={() => setPicked(s.key)}
                  className={`cursor-pointer transition-[transform,opacity] duration-300 ${
                    s.key === sel ? 'opacity-100 scale-[1.05]' : 'opacity-40 hover:opacity-70'
                  }`}
                  style={{ transformOrigin: `${C}px ${C}px` }}
                >
                  <title>{`${GROUPS[s.key].label}: ${s.n}`}</title>
                </path>
              ))}
              <text
                x={C}
                y={C - 4}
                textAnchor="middle"
                className="fill-[#111] font-bold"
                style={{ fontSize: 40 }}
              >
                {covered}/{total}
              </text>
              <text
                x={C}
                y={C + 22}
                textAnchor="middle"
                className="fill-[#888]"
                style={{ fontSize: 13 }}
              >
                marcas con táctica
              </text>
            </svg>

            <div className="grid grid-cols-2 gap-2 w-full mt-4" role="group" aria-label="Grupos">
              {COVERAGE_GROUPS.map((key) => (
                <button
                  key={key}
                  type="button"
                  aria-pressed={key === sel}
                  disabled={!groups[key].length}
                  onClick={() => setPicked(key)}
                  className={`flex items-center gap-2 rounded-xl border bg-white px-2.5 py-2 text-[14px] font-medium text-left transition-colors disabled:opacity-40 disabled:cursor-default ${
                    key === sel
                      ? 'border-[#111] shadow-[inset_0_0_0_1px_#111]'
                      : 'border-[#e0ddd4] hover:border-[#FFB800]'
                  }`}
                >
                  <span
                    aria-hidden="true"
                    className="w-3 h-3 rounded flex-none"
                    style={{ background: GROUPS[key].hex }}
                  />
                  {GROUPS[key].label}
                  <span className="ml-auto font-mono">{groups[key].length}</span>
                </button>
              ))}
            </div>
          </div>

          <div aria-live="polite">
            <p
              className={`text-[12px] font-mono font-bold tracking-[0.14em] uppercase ${meta.ink}`}
            >
              {meta.label}
            </p>
            <h4 className="text-[20px] font-bold text-[#111] mt-0.5">
              {list.length} {list.length === 1 ? 'marca' : 'marcas'}
            </h4>
            <p className="text-[14px] text-[#777] mb-3">
              {meta.hint} ·{' '}
              {sel === 'none'
                ? canManage
                  ? 'clic para cargar su táctica'
                  : 'clic para ver la marca'
                : 'clic para ver la táctica'}
            </p>

            <ul className="max-h-[340px] overflow-y-auto -mx-2 pr-1">
              {list.map((row) => {
                const lead = leadNameOf(row.brand.id, clientsById, linesById, usersMap)
                const line = linesById.get(row.brand.line_id)?.name
                const sub = [row.campaign?.name, line, lead && `Jefa: ${lead}`]
                  .filter(Boolean)
                  .join(' · ')
                return (
                  <li key={row.brand.id}>
                    <button
                      type="button"
                      onClick={() => openRow(row)}
                      className="w-full grid grid-cols-[1fr_auto] sm:grid-cols-[1fr_150px_auto] gap-3 items-center px-2 py-2.5 rounded-xl text-left hover:bg-[#f7f5ee] transition-colors"
                    >
                      <span className="min-w-0">
                        <span className="block text-[15px] font-semibold text-[#111] truncate">
                          {row.brand.name}
                        </span>
                        {sub && (
                          <span className="block text-[13px] text-[#888] truncate">{sub}</span>
                        )}
                      </span>
                      {row.campaign ? (
                        <span className="hidden sm:block">
                          <span className="block h-2 bg-[#efece3] rounded-full overflow-hidden">
                            <span
                              className="block h-full rounded-full transition-[width] duration-700"
                              style={{
                                width: `${row.progress * t}%`,
                                background: GROUPS[sel].hex,
                              }}
                            />
                          </span>
                          <span className="block text-[12px] text-[#999] mt-1">
                            {row.programada ? 'Aún no empieza' : `${row.progress}% del período`}
                          </span>
                        </span>
                      ) : (
                        <span className="hidden sm:block text-[13px] text-[#999]">
                          Sin táctica vigente
                        </span>
                      )}
                      <span
                        className={`justify-self-end px-2.5 py-0.5 rounded-full text-[13px] font-semibold whitespace-nowrap ${meta.pill}`}
                      >
                        {row.campaign
                          ? row.programada
                            ? 'Programada'
                            : daysLabel(row.days)
                          : canManage
                            ? 'Cargar'
                            : 'Ver'}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          </div>
        </div>
      )}
    </section>
  )
}
