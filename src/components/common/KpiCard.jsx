import { Link } from 'react-router-dom'

/**
 * Card KPI genérica: label + valor destacado + subtítulo + pista "Ver más", con un ícono
 * grande a modo de marca de agua decorativa, centrado verticalmente sobre el lado derecho
 * (no compite con el número ni se corta contra el borde).
 * Extraída del patrón repetido en AdsStats.jsx y tickets/analytics/SummaryCards.jsx.
 *
 * Paleta contenida a propósito: el texto (valor/label) es neutro (`#111`/gris) salvo que
 * `accent` marque una alerta real (p.ej. rojo para "atrasada"). La marca de agua usa
 * `iconColor` (por defecto el amarillo de marca) a muy baja opacidad.
 *
 * Cuando se pasa `to`, la card entera es clickeable (envuelta en un único <Link>);
 * el `linkLabel` es solo una pista visual, no un enlace anidado.
 *
 * @param {string} label     - título corto (uppercase, mono), ej. "Mis tareas"
 * @param {string|number} value - valor destacado, ej. 12 o "84%"
 * @param {string} [sub]     - subtítulo opcional
 * @param {string} [accent]  - color semántico del valor (hex), default `#111`
 * @param {ReactNode} [icon] - ícono SVG mostrado como marca de agua grande en la esquina
 * @param {string} [iconColor] - color de la marca de agua (hex), default `#FFB800` (amarillo de marca)
 * @param {string} [to]      - ruta destino; si se pasa, toda la card se vuelve un enlace
 * @param {string} [linkLabel] - texto de la pista, default "Ver más"
 */
export default function KpiCard({ label, value, sub, accent = '#111', icon, iconColor = '#FFB800', to, linkLabel = 'Ver más' }) {
  const content = (
    <>
      {icon && (
        <span
          className="absolute right-3 top-1/2 -translate-y-1/2 w-14 h-14 opacity-[0.16] pointer-events-none [&>svg]:w-full [&>svg]:h-full"
          style={{ color: iconColor }}
          aria-hidden="true"
        >
          {icon}
        </span>
      )}
      <div className="relative">
        <p className="text-[13px] font-mono font-bold tracking-[0.14em] uppercase text-[#888] leading-snug mb-3">
          {label}
        </p>
        <p className="text-[30px] font-bold leading-none tracking-tight" style={{ color: accent }}>
          {value}
        </p>
        {sub && <p className="text-[13px] text-[#999] mt-1.5">{sub}</p>}
        {to && (
          <span className="text-[13px] font-semibold text-[#555] mt-3 inline-flex items-center gap-1 w-fit">
            {linkLabel} <span aria-hidden="true">→</span>
          </span>
        )}
      </div>
    </>
  )

  if (to) {
    return (
      <Link
        to={to}
        className="relative overflow-hidden bg-white border border-[#e0ddd4] rounded-2xl p-4 flex flex-col transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_10px_30px_-8px_rgba(0,0,0,0.14)]"
      >
        {content}
      </Link>
    )
  }

  return (
    <div className="relative overflow-hidden bg-white border border-[#e0ddd4] rounded-2xl p-4 flex flex-col">
      {content}
    </div>
  )
}
