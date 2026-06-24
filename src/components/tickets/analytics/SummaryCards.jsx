function Card({ label, value, sub }) {
  return (
    <div className="bg-white rounded-2xl border border-[#e0ddd4] px-5 py-4">
      <p className="text-[12px] font-mono font-bold tracking-[0.14em] uppercase text-[#888] mb-1">{label}</p>
      <p className="text-[30px] font-bold text-[#111] leading-none">{value}</p>
      {sub && <p className="text-[13px] text-[#888] mt-1">{sub}</p>}
    </div>
  )
}

export default function SummaryCards({ metrics }) {
  const { total, open, inProgress, resolved, overdue, avgResolutionHours } = metrics
  const avgHoursStr = avgResolutionHours > 0
    ? avgResolutionHours < 24
      ? `${avgResolutionHours.toFixed(1)}h`
      : `${(avgResolutionHours / 24).toFixed(1)}d`
    : '—'

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
      <Card label="Total"       value={total}      />
      <Card label="Abiertos"    value={open}        />
      <Card label="En progreso" value={inProgress}  />
      <Card label="Resueltos"   value={resolved}    />
      <Card label="Vencidos"    value={overdue}     sub={overdue > 0 ? 'SLA superado' : undefined} />
      <Card label="Tiempo prom" value={avgHoursStr} sub="resolución" />
    </div>
  )
}
