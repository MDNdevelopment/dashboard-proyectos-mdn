import { isoWeek, lightOf, teamWeekStats } from './constants'

const TEAM_PALETTES = [
  { bg: '#e9e3f8', fg: '#6A5A9E' },
  { bg: '#def1dc', fg: '#3F7A52' },
  { bg: '#dce8f8', fg: '#3C6196' },
  { bg: '#f7e1e4', fg: '#9C5560' },
  { bg: '#fce6d2', fg: '#B26A3C' },
]
function teamPalette(idx) { return TEAM_PALETTES[idx % TEAM_PALETTES.length] }
function initial(name) { return (name ?? '?').trim().charAt(0).toUpperCase() }

function KpiCard({ label, value, sub, color }) {
  return (
    <div className="bg-white rounded-xl border border-[#e0ddd4] px-4 py-3.5">
      <p className="text-[11px] font-mono font-bold tracking-[0.12em] uppercase text-[#888] mb-1">{label}</p>
      <p className="text-[24px] font-bold text-[#111] leading-none" style={color ? { color } : {}}>
        {value}
      </p>
      {sub && <p className="text-[11.5px] text-[#888] mt-1">{sub}</p>}
    </div>
  )
}

function SemLight({ light }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[12px] font-semibold" style={{ color: light.color }}>
      <span style={{ width: 8, height: 8, borderRadius: '50%', background: light.color, display: 'inline-block' }} />
      {light.label}
    </span>
  )
}

export default function PanoramaView({ teams, tasks, onSelectTeam }) {
  const wk = isoWeek(new Date())
  const stats = teams.map((t, i) => ({ ...teamWeekStats(t.id, tasks, wk), team: t, palette: teamPalette(i) }))
  const gTotal = stats.reduce((a, s) => a + s.total, 0)
  const gCer = stats.reduce((a, s) => a + s.cerradas, 0)
  const gPct = gTotal ? Math.round((gCer / gTotal) * 100) : 0
  const gBloq = stats.reduce((a, s) => a + s.bloqueados, 0)
  const gRet = stats.reduce((a, s) => a + s.retrasados, 0)
  const ranked = [...stats].sort((a, b) => (b.total ? b.pct : -1) - (a.total ? a.pct : -1) || b.cerradas - a.cerradas)
  const withMov = stats.filter(s => s.total > 0)

  let mentorNote = null
  if (withMov.length >= 2) {
    const top = ranked.find(s => s.total > 0)
    const bottom = [...ranked].reverse().find(s => s.total > 0)
    if (top && bottom && top.teamId !== bottom.teamId && top.pct - bottom.pct >= 15) {
      mentorNote = `Team ${top.team.name} va liderando los cierres (${top.pct}%). Un briefing corto con Team ${bottom.team.name} sobre cómo estructuran sus cierres puede ayudar a emparejar el ritmo.`
    }
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <KpiCard label="Tareas semana" value={gTotal} sub={`Semana ${wk}`} />
        <KpiCard label="Cerradas" value={`${gCer} / ${gTotal}`} sub="Procesos completados" color="#16A34A" />
        <KpiCard label="Cumplimiento" value={`${gPct}%`} sub={gPct >= 90 ? 'Agencia al día' : gPct < 70 && gTotal ? 'Necesita foco' : 'En marcha'} color={gPct >= 90 ? '#16A34A' : gPct < 70 && gTotal ? '#E14848' : '#F0871F'} />
        <KpiCard label="Bloqueados" value={gBloq} sub={gBloq ? 'Cuellos de botella' : 'Sin bloqueos'} color={gBloq ? '#E14848' : undefined} />
        <KpiCard label="Retrasados" value={gRet} sub="Entregas vencidas" color={gRet ? '#E14848' : undefined} />
      </div>

      {teams.length === 0 ? (
        <div className="bg-white rounded-xl border border-[#e0ddd4] p-10 text-center">
          <p className="text-[14px] font-medium text-[#888] mb-1">Aún no hay teams</p>
          <p className="text-[13px] text-[#bbb]">Crea el primer team con el botón "Gestionar teams"</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {ranked.map((s, i) => {
            const lg = lightOf(s.pct, s.total)
            const isLead = withMov.length > 0 && i === 0 && s.total > 0
            return (
              <button
                key={s.team.id}
                onClick={() => onSelectTeam(s.team.id)}
                className="bg-white rounded-xl border border-[#e0ddd4] p-4 text-left hover:border-[#FFB800] hover:shadow-md transition-all group"
              >
                <div className="h-1.5 rounded-full mb-3" style={{ background: isLead ? '#FFB800' : s.palette.bg }} />
                <div className="flex items-center gap-2.5 mb-3">
                  <div
                    className="w-9 h-9 rounded-full flex items-center justify-center text-[14px] font-bold flex-shrink-0"
                    style={isLead ? { background: '#FFB800', color: '#111' } : { background: s.palette.bg, color: s.palette.fg }}
                  >
                    {initial(s.team.name)}
                  </div>
                  <div>
                    <p className="text-[13px] font-bold text-[#111] leading-tight">Team {s.team.name}</p>
                    <p className="text-[11px] text-[#888]">{isLead ? '⭐ Líder de la semana' : 'Línea operativa'}</p>
                  </div>
                  <span className="ml-auto text-[11px] font-mono text-[#888]">#{i + 1}</span>
                </div>
                <div className="mb-2">
                  <span className="text-[28px] font-bold leading-none" style={{ color: lg.color }}>
                    {s.total ? `${s.pct}%` : '—'}
                  </span>
                  <span className="text-[11.5px] text-[#888] ml-2">
                    {s.total ? `${s.cerradas}/${s.total} tareas` : 'sin movimiento'}
                  </span>
                </div>
                <div className="h-1.5 rounded-full bg-[#f0ede3] mb-3 overflow-hidden">
                  <div className="h-full rounded-full transition-all" style={{ width: `${s.pct}%`, background: lg.color }} />
                </div>
                <div className="flex items-center justify-between text-[11.5px] text-[#888]">
                  <span><b className="text-[#111]">{s.bloqueados}</b> bloq.</span>
                  <span><b className="text-[#111]">{s.retrasados}</b> atraso</span>
                  <SemLight light={lg} />
                </div>
              </button>
            )
          })}
        </div>
      )}

      {mentorNote && (
        <div className="bg-[#fffbeb] border border-[#fde68a] rounded-xl px-4 py-3 flex gap-3 items-start">
          <svg className="flex-shrink-0 mt-0.5 text-[#FFB800]" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 2l2.4 7.4H22l-6 4.5 2.3 7.1L12 16.6 5.7 21l2.3-7.1-6-4.5h7.6z" strokeLinejoin="round"/>
          </svg>
          <p className="text-[13px] text-[#7c6e00]"><b>Dupla de mentoría sugerida:</b> {mentorNote}</p>
        </div>
      )}
    </div>
  )
}
