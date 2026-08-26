/**
 * Card de KPI compartida entre los dashboards de Gestión de Tareas (PanoramaView,
 * TeamView) y CNP (CnpDashboardView). Cuando recibe onClick se renderiza como
 * <button> (navegación a Base con filtro); si no, como <div> de solo lectura.
 */
export default function KpiCard({ label, value, sub, color, onClick }) {
  const Tag = onClick ? 'button' : 'div'
  return (
    <Tag
      onClick={onClick}
      className={`bg-white rounded-xl border border-[#e0ddd4] px-4 py-3.5 text-left w-full ${
        onClick ? 'hover:border-[#FFB800] hover:shadow-md transition-all cursor-pointer' : ''
      }`}
    >
      <p className="text-[13px] font-mono font-bold tracking-[0.12em] uppercase text-[#888] mb-1">
        {label}
      </p>
      <p className="text-[26px] font-bold text-[#111] leading-none" style={color ? { color } : {}}>
        {value}
      </p>
      {sub && <p className="text-[13.5px] text-[#888] mt-1">{sub}</p>}
    </Tag>
  )
}
