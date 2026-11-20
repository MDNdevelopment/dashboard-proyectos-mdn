import { useEffect, useMemo, useState } from 'react'
import {
  COVERAGE_GROUPS,
  ESTADO_OF_GROUP,
  brandCoverage,
  brandsByLine,
} from '../../../utils/tacticas'

// Clases literales: Tailwind no genera CSS para clases armadas por interpolación.
const GROUPS = {
  green: { label: 'Al día', hint: 'Les quedan más de 10 días', hex: '#4caf63' },
  none: { label: 'Sin táctica', hint: 'No tienen táctica vigente', hex: '#cdc8bc' },
  yellow: { label: 'Por vencer', hint: 'Vencen en 10 días o menos', hex: '#FFB800' },
  red: { label: 'Urgente', hint: 'Vencen en 3 días o menos', hex: '#e05252' },
}

const GAP = 0.025 // radianes entre porciones

/** Porción de anillo centrada en (c, c) entre los ángulos a0 y a1 (radianes, sentido horario). */
function ringPath(c, rOut, rIn, a0, a1) {
  // Una porción de 360° no se puede dibujar con un solo arco: se parte en dos.
  if (a1 - a0 >= Math.PI * 2 - 1e-6) {
    const mid = a0 + Math.PI
    return `${ringPath(c, rOut, rIn, a0, mid)} ${ringPath(c, rOut, rIn, mid, a1)}`
  }
  const pt = (r, a) => `${(c + r * Math.cos(a)).toFixed(2)},${(c + r * Math.sin(a)).toFixed(2)}`
  const big = a1 - a0 > Math.PI ? 1 : 0
  return `M${pt(rOut, a0)}A${rOut},${rOut} 0 ${big} 1 ${pt(rOut, a1)}L${pt(rIn, a1)}A${rIn},${rIn} 0 ${big} 0 ${pt(rIn, a0)}Z`
}

/** Porciones de la torta para `groups` (salida de `brandCoverage`), escaladas por `t` (0..1). */
function slicesOf(groups, total, t, c, rOut, rIn) {
  const out = []
  let angle = -Math.PI / 2
  for (const key of COVERAGE_GROUPS) {
    const n = groups[key].length
    if (!n || !total) continue
    const span = (n / total) * Math.PI * 2 * t
    const gap = n === total ? 0 : GAP
    out.push({ key, n, d: ringPath(c, rOut, rIn, angle + gap / 2, angle + span - gap / 2) })
    angle += span
  }
  return out
}

function prefersMotion() {
  if (typeof window === 'undefined' || !window.matchMedia) return false
  return !window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/** Torta chica de un team: sus 4 colores, "cubiertas/total" y un acceso a Base por color. */
function MiniTorta({ team, brands, campaigns, today, t, onGoToBase }) {
  const groups = useMemo(() => brandCoverage(brands, campaigns, today), [brands, campaigns, today])
  const total = brands.length
  const covered = total - groups.none.length
  const SIZE = 120
  const c = SIZE / 2
  const go = (estado) => onGoToBase(estado, team.lineId)

  return (
    <div
      role="group"
      aria-label={`Team ${team.name}`}
      className="flex flex-col items-center rounded-xl border border-[#f0ede3] p-3"
    >
      <button
        type="button"
        onClick={() => go('todas')}
        disabled={!team.lineId}
        className="text-[14px] font-bold text-[#111] hover:underline disabled:no-underline disabled:cursor-default mb-1 truncate max-w-full"
        aria-label={`Ver tácticas de ${team.name} en Base`}
      >
        {team.name}
      </button>
      <svg
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        className="w-[108px] h-[108px] overflow-visible"
        role="img"
        aria-label={`${team.name}: ${covered} de ${total} marcas con táctica vigente`}
      >
        {slicesOf(groups, total, t, c, 56, 36).map((s) => (
          <path
            key={s.key}
            d={s.d}
            fill={GROUPS[s.key].hex}
            onClick={() => go(ESTADO_OF_GROUP[s.key])}
            className="cursor-pointer hover:opacity-80 transition-opacity"
          >
            <title>{`${GROUPS[s.key].label}: ${s.n}`}</title>
          </path>
        ))}
        <text
          x={c}
          y={c + 6}
          textAnchor="middle"
          className="fill-[#111] font-bold"
          style={{ fontSize: 20 }}
        >
          {covered}/{total}
        </text>
      </svg>
      <div className="flex flex-wrap justify-center gap-1 mt-2">
        {COVERAGE_GROUPS.map((key) => (
          <button
            key={key}
            type="button"
            disabled={!groups[key].length}
            onClick={() => go(ESTADO_OF_GROUP[key])}
            aria-label={`${GROUPS[key].label} de ${team.name}: ${groups[key].length}`}
            title={GROUPS[key].label}
            className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[12px] font-mono font-semibold text-[#555] hover:bg-[#f5f3eb] disabled:opacity-35 disabled:cursor-default"
          >
            <span
              aria-hidden="true"
              className="w-2 h-2 rounded-sm"
              style={{ background: GROUPS[key].hex }}
            />
            {groups[key].length}
          </button>
        ))}
      </div>
    </div>
  )
}

/**
 * Resumen principal del Dashboard de Tácticas: una torta con las marcas agrupadas según su
 * táctica vigente (Al día · Sin táctica · Por vencer ≤ 10 días · Urgente ≤ 3) y, al lado, una
 * torta chica por team (línea). Cada color lleva a Base filtrada por ese estado (y por el team,
 * si se hace clic en una torta chica). La lista de marcas vive en Base.
 *
 * @param {object}   props
 * @param {Array}    props.brands      — marcas dentro del alcance de línea
 * @param {Array}    props.campaigns   — tácticas de esas marcas
 * @param {string}   props.today       — hoy en Caracas (YYYY-MM-DD)
 * @param {object}   props.stats       — { vigentes, avgPct }
 * @param {Map}      props.linesById
 * @param {Function} props.onGoToBase  — (estado, lineId?) => void, abre Base con ese filtro
 */
export default function TacticasTorta({ brands, campaigns, today, stats, linesById, onGoToBase }) {
  const groups = useMemo(() => brandCoverage(brands, campaigns, today), [brands, campaigns, today])
  const teams = useMemo(() => brandsByLine(brands, linesById), [brands, linesById])
  const total = brands.length
  const covered = total - groups.none.length
  const showTeams = teams.length > 1

  // Animación de entrada: las tortas "se dibujan" una vez al montar.
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

  const SIZE = 280
  const C = SIZE / 2

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
        <div
          className={`grid grid-cols-1 gap-6 ${
            showTeams
              ? 'lg:grid-cols-[320px_1fr] items-start'
              : 'lg:grid-cols-[300px_1fr] items-center'
          }`}
        >
          <div className="flex flex-col items-center">
            <svg
              viewBox={`0 0 ${SIZE} ${SIZE}`}
              className="w-[260px] h-[260px] overflow-visible"
              role="img"
              aria-label={`${covered} de ${total} marcas con táctica vigente`}
            >
              {slicesOf(groups, total, t, C, 128, 78).map((s) => (
                <path
                  key={s.key}
                  d={s.d}
                  fill={GROUPS[s.key].hex}
                  onClick={() => onGoToBase(ESTADO_OF_GROUP[s.key])}
                  className="cursor-pointer hover:opacity-80 transition-opacity"
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

            {showTeams && (
              <div className="flex flex-col gap-1.5 w-full mt-4" role="group" aria-label="Grupos">
                {COVERAGE_GROUPS.map((key) => (
                  <button
                    key={key}
                    type="button"
                    disabled={!groups[key].length}
                    onClick={() => onGoToBase(ESTADO_OF_GROUP[key])}
                    title={`${GROUPS[key].hint} · ver en Base`}
                    className="flex items-center gap-2 rounded-xl border border-[#e0ddd4] bg-white px-3 py-2 text-[14px] font-medium text-left transition-colors hover:border-[#FFB800] disabled:opacity-40 disabled:cursor-default disabled:hover:border-[#e0ddd4]"
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
            )}
          </div>

          {/* Un solo team (filtrado por línea): no hay tortas chicas, así que la leyenda se
              abre en tarjetas grandes al lado de la torta para ocupar el ancho. */}
          {!showTeams && (
            <div>
              {teams[0] && (
                <p className="text-[12px] font-mono font-bold tracking-[0.14em] uppercase text-[#888] mb-3">
                  Team {teams[0].name}
                </p>
              )}
              <div
                className="grid grid-cols-1 sm:grid-cols-2 gap-3"
                role="group"
                aria-label="Grupos"
              >
                {COVERAGE_GROUPS.map((key) => {
                  const n = groups[key].length
                  const pct = Math.round((n / total) * 100)
                  return (
                    <button
                      key={key}
                      type="button"
                      disabled={!n}
                      onClick={() => onGoToBase(ESTADO_OF_GROUP[key])}
                      className="group/card flex flex-col items-stretch gap-2 rounded-2xl border border-[#e0ddd4] bg-white p-4 text-left transition-colors hover:border-[#FFB800] disabled:opacity-45 disabled:cursor-default disabled:hover:border-[#e0ddd4]"
                    >
                      <span className="flex items-center gap-2 text-[14px] font-semibold text-[#333]">
                        <span
                          aria-hidden="true"
                          className="w-3 h-3 rounded flex-none"
                          style={{ background: GROUPS[key].hex }}
                        />
                        {GROUPS[key].label}
                      </span>
                      <span className="flex items-baseline gap-2">
                        <span className="text-[32px] leading-none font-bold font-mono text-[#111]">
                          {n}
                        </span>
                        <span className="text-[13px] text-[#888]">
                          {n === 1 ? 'marca' : 'marcas'} · {pct}%
                        </span>
                      </span>
                      <span
                        aria-hidden="true"
                        className="block h-1.5 bg-[#efece3] rounded-full overflow-hidden"
                      >
                        <span
                          className="block h-full rounded-full transition-[width] duration-700"
                          style={{ width: `${pct * t}%`, background: GROUPS[key].hex }}
                        />
                      </span>
                      <span className="flex items-center justify-between gap-2 text-[13px] text-[#888]">
                        {GROUPS[key].hint}
                        {n > 0 && (
                          <span className="font-semibold text-[#111] whitespace-nowrap opacity-60 group-hover/card:opacity-100 transition-opacity">
                            Ver en Base →
                          </span>
                        )}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {showTeams && (
            <div>
              <p className="text-[12px] font-mono font-bold tracking-[0.14em] uppercase text-[#888] mb-3">
                Por team
              </p>
              <div className="grid grid-cols-2 gap-3">
                {teams.map((team) => (
                  <MiniTorta
                    key={team.lineId ?? 'sin-linea'}
                    team={team}
                    brands={team.brands}
                    campaigns={campaigns}
                    today={today}
                    t={t}
                    onGoToBase={onGoToBase}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  )
}
