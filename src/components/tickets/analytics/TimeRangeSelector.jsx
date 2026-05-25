const PRESETS = [
  { label: '7 dias',  days: 7  },
  { label: '30 dias', days: 30 },
  { label: '90 dias', days: 90 },
]

function toDateStr(date) {
  return date.toISOString().slice(0, 10)
}

export default function TimeRangeSelector({ startDate, endDate, onChange }) {
  function applyPreset(days) {
    const end = new Date()
    const start = new Date()
    start.setDate(start.getDate() - days + 1)
    onChange(toDateStr(start), toDateStr(end))
  }

  const today = toDateStr(new Date())

  return (
    <div className="flex items-center gap-3 flex-wrap">
      <div className="flex gap-1.5">
        {PRESETS.map(p => {
          const end = new Date()
          const start = new Date()
          start.setDate(start.getDate() - p.days + 1)
          const active = startDate === toDateStr(start) && endDate === toDateStr(end)
          return (
            <button
              key={p.days}
              onClick={() => applyPreset(p.days)}
              className={`px-3 py-1.5 rounded-lg text-[12px] font-mono font-bold transition-all ${
                active
                  ? 'bg-[#FFB800] text-[#111]'
                  : 'bg-white border border-[#e0ddd4] text-[#555] hover:border-[#bbb]'
              }`}
            >
              {p.label}
            </button>
          )
        })}
      </div>
      <div className="flex items-center gap-2">
        <input
          type="date"
          value={startDate}
          max={endDate || today}
          onChange={e => onChange(e.target.value, endDate)}
          className="input-base text-[12px] py-1.5"
        />
        <span className="text-[12px] text-[#888] font-mono">—</span>
        <input
          type="date"
          value={endDate}
          min={startDate}
          max={today}
          onChange={e => onChange(startDate, e.target.value)}
          className="input-base text-[12px] py-1.5"
        />
      </div>
    </div>
  )
}
