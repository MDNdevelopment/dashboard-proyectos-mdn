import MonthPeriodPicker from '../common/MonthPeriodPicker'

const MESES = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
]

/**
 * Conclusiones del mes en una fila: cada indicador con su delta contra el mes anterior.
 * `mejorSi` dice hacia dónde es bueno moverse ('sube' | 'baja' | null = neutro) para
 * colorear la flecha sin que el lector tenga que pensarlo.
 */
export default function KpiMes({ year, month, actual, anterior, onMonthChange, onGoPendientes }) {
  const value = `${year}-${String(month).padStart(2, '0')}`
  const prev = month === 1 ? { y: year - 1, m: 12 } : { y: year, m: month - 1 }
  const kpis = [
    {
      key: 'pctEditado',
      label: '% editado',
      fmt: (v) => (v === null ? '—' : `${v}%`),
      unit: 'pts',
      mejorSi: 'sube',
      tone: 'text-[#1f8a43]',
    },
    { key: 'capturadas', label: 'piezas capturadas', mejorSi: 'sube', tone: 'text-[#111]' },
    { key: 'editadas', label: 'piezas editadas', mejorSi: 'sube', tone: 'text-[#111]' },
    {
      key: 'pendientes',
      label: 'por editar',
      mejorSi: 'baja',
      tone: 'text-[#9a7400]',
      onClick: onGoPendientes,
    },
    { key: 'realizadas', label: 'pautas realizadas', mejorSi: 'sube', tone: 'text-[#3b6fd4]' },
    { key: 'programadas', label: 'agendadas', mejorSi: null, tone: 'text-[#111]' },
    {
      key: 'ocupacionEstudio',
      label: 'estudio ocupado',
      fmt: (v) => `${v}%`,
      unit: 'pts',
      mejorSi: null,
      tone: 'text-[#111]',
    },
  ]

  return (
    <section
      className="bg-white border border-[#e0ddd4] rounded-xl p-5"
      aria-label="Resumen del mes"
      data-tour="datos-kpi"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <h2 className="text-[16px] font-semibold text-[#222] capitalize">
            {MESES[month - 1]} {year}
          </h2>
          <p className="text-[12px] text-[#999]">
            Comparado con {MESES[prev.m - 1]}
            {prev.y !== year ? ` ${prev.y}` : ''}.
          </p>
        </div>
        <MonthPeriodPicker value={value} onChange={onMonthChange} />
      </div>
      <dl className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
        {kpis.map((k) => {
          const cur = actual[k.key]
          const ant = anterior[k.key]
          const fmt = k.fmt ?? ((v) => (v === null || v === undefined ? '—' : String(v)))
          const Tag = k.onClick ? 'button' : 'div'
          return (
            <Tag
              key={k.key}
              type={k.onClick ? 'button' : undefined}
              onClick={k.onClick}
              className={`rounded-xl border border-[#ece9df] bg-[#fcfbf7] px-3 py-2.5 text-left ${
                k.onClick ? 'hover:border-[#111] transition-colors' : ''
              }`}
              aria-label={k.label}
            >
              <dt className="text-[10.5px] font-mono uppercase tracking-wide text-[#999]">
                {k.label}
              </dt>
              <dd className={`font-mono font-bold text-[22px] leading-tight ${k.tone}`}>
                {fmt(cur)}
              </dd>
              <dd className="text-[11px] mt-0.5">
                <Delta cur={cur} ant={ant} mejorSi={k.mejorSi} unit={k.unit} />
              </dd>
            </Tag>
          )
        })}
      </dl>
    </section>
  )
}

function Delta({ cur, ant, mejorSi, unit }) {
  if (cur === null || cur === undefined || ant === null || ant === undefined) {
    return <span className="text-[#bbb]">sin mes anterior</span>
  }
  const d = cur - ant
  if (d === 0) return <span className="text-[#bbb]">= igual que el mes pasado</span>
  const bueno = mejorSi === null ? null : mejorSi === 'sube' ? d > 0 : d < 0
  const color = bueno === null ? 'text-[#777]' : bueno ? 'text-[#1f8a43]' : 'text-[#c0392b]'
  return (
    <span
      className={`font-semibold ${color}`}
      aria-label={`${d > 0 ? 'sube' : 'baja'} ${Math.abs(d)}`}
    >
      {d > 0 ? '▲' : '▼'} {d > 0 ? '+' : ''}
      {d}
      {unit ? ` ${unit}` : ''} <span className="font-normal text-[#aaa]">vs. anterior</span>
    </span>
  )
}
