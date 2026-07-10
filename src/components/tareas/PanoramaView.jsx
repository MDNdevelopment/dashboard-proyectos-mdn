import {
  fmtMonth,
  lightOf,
  teamMonthStats,
  ESTADOS,
  COL_META,
} from "./constants";

const TEAM_PALETTES = [
  { bg: "#e9e3f8", fg: "#6A5A9E" },
  { bg: "#def1dc", fg: "#3F7A52" },
  { bg: "#dce8f8", fg: "#3C6196" },
  { bg: "#f7e1e4", fg: "#9C5560" },
  { bg: "#fce6d2", fg: "#B26A3C" },
];
function teamPalette(idx) {
  return TEAM_PALETTES[idx % TEAM_PALETTES.length];
}
function initial(name) {
  return (name ?? "?").trim().charAt(0).toUpperCase();
}

function KpiCard({ label, value, sub, color, onClick }) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      onClick={onClick}
      className={`bg-white rounded-xl border border-[#e0ddd4] px-4 py-3.5 text-left w-full ${
        onClick
          ? "hover:border-[#FFB800] hover:shadow-md transition-all cursor-pointer"
          : ""
      }`}
    >
      <p className="text-[13px] font-mono font-bold tracking-[0.12em] uppercase text-[#888] mb-1">
        {label}
      </p>
      <p
        className="text-[26px] font-bold text-[#111] leading-none"
        style={color ? { color } : {}}
      >
        {value}
      </p>
      {sub && <p className="text-[13.5px] text-[#888] mt-1">{sub}</p>}
    </Tag>
  );
}

function SemLight({ light }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 text-[14px] font-semibold"
      style={{ color: light.color }}
    >
      <span
        style={{
          width: 8,
          height: 8,
          borderRadius: "50%",
          background: light.color,
          display: "inline-block",
        }}
      />
      {light.label}
    </span>
  );
}

export default function PanoramaView({
  teams,
  tasks,
  monthIdx,
  onSelectTeam,
  onNavigateToBase,
}) {
  const stats = teams.map((t, i) => ({
    ...teamMonthStats(t.id, tasks, monthIdx),
    team: t,
    palette: teamPalette(i),
  }));
  const gTotal = stats.reduce((a, s) => a + s.total, 0);
  const gCer = stats.reduce((a, s) => a + s.cerradas, 0);
  const gPct = gTotal ? Math.round((gCer / gTotal) * 100) : 0;
  const gBloq = stats.reduce((a, s) => a + s.bloqueados, 0);
  const gRet = stats.reduce((a, s) => a + s.retrasados, 0);
  const ranked = [...stats].sort(
    (a, b) =>
      (b.total ? b.pct : -1) - (a.total ? a.pct : -1) ||
      b.cerradas - a.cerradas,
  );
  const withMov = stats.filter((s) => s.total > 0);

  let mentorNote = null;
  if (withMov.length >= 2) {
    const top = ranked.find((s) => s.total > 0);
    const bottom = [...ranked].reverse().find((s) => s.total > 0);
    if (
      top &&
      bottom &&
      top.teamId !== bottom.teamId &&
      top.pct - bottom.pct >= 15
    ) {
      mentorNote = `${top.team.name} va liderando los cierres (${top.pct}%). Un briefing corto con ${bottom.team.name} sobre cómo estructuran sus cierres puede ayudar a emparejar el ritmo.`;
    }
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <KpiCard
          label="Tareas del mes"
          value={gTotal}
          sub={fmtMonth(monthIdx)}
          onClick={() => onNavigateToBase(null)}
        />
        <KpiCard
          label="Cerradas"
          value={`${gCer} / ${gTotal}`}
          sub="Procesos completados"
          color="#16A34A"
          onClick={() => onNavigateToBase({ status: "Terminado" })}
        />
        <KpiCard
          label="Cumplimiento"
          value={`${gPct}%`}
          sub={
            gPct >= 90
              ? "Agencia al día"
              : gPct < 70 && gTotal
                ? "Necesita foco"
                : "En marcha"
          }
          color={
            gPct >= 90 ? "#16A34A" : gPct < 70 && gTotal ? "#E14848" : "#F0871F"
          }
          onClick={() => onNavigateToBase(null)}
        />
        <KpiCard
          label="Paralizados"
          value={gBloq}
          sub={gBloq ? "Cuellos de botella" : "Sin paralizaciones"}
          color={gBloq ? "#E14848" : undefined}
          onClick={() => onNavigateToBase({ status: "Paralizado" })}
        />
        <KpiCard
          label="Retrasados"
          value={gRet}
          sub="Entregas vencidas"
          color={gRet ? "#E14848" : undefined}
          onClick={() => onNavigateToBase({ alert: "late" })}
        />
      </div>

      {teams.length === 0 ? (
        <div className="bg-white rounded-xl border border-[#e0ddd4] p-10 text-center">
          <p className="text-[16px] font-medium text-[#888] mb-1">
            Aún no hay teams
          </p>
          <p className="text-[15px] text-[#bbb]">
            Crea el primer team con el botón "Gestionar teams"
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {ranked.map((s, i) => {
            const lg = lightOf(s.pct, s.total);
            const isLead = withMov.length > 0 && i === 0 && s.total > 0;
            const teamTasks = tasks.filter((t) => t.team_id === s.team.id);
            const tot = teamTasks.length;
            const counts = ESTADOS.map((e) => ({
              e,
              n: teamTasks.filter((t) => t.status === e).length,
            }));
            return (
              <button
                key={s.team.id}
                onClick={() => onSelectTeam(s.team.id)}
                className="bg-white rounded-xl border border-[#e0ddd4] p-4 text-left hover:border-[#FFB800] hover:shadow-md transition-all group"
              >
                <div className="flex items-center gap-2.5 mb-3">
                  <div
                    className="w-9 h-9 rounded-full flex items-center justify-center text-[16px] font-bold flex-shrink-0"
                    style={
                      isLead
                        ? { background: "#FFB800", color: "#111" }
                        : { background: s.palette.bg, color: s.palette.fg }
                    }
                  >
                    {initial(s.team.name)}
                  </div>
                  <div>
                    <p className="text-[15px] font-bold text-[#111] leading-tight">
                      {s.team.name}
                    </p>
                    <p className="text-[13px] text-[#888]">
                      {isLead ? "⭐ Líder del mes" : "Línea operativa"}
                    </p>
                  </div>
                </div>
                <div className="mb-2">
                  <span
                    className="text-[30px] font-bold leading-none"
                    style={{ color: lg.color }}
                  >
                    {s.total ? `${s.cerradas}/${s.total}` : "—"}
                  </span>
                  <span className="text-[13.5px] ml-2">
                    {s.total ? (
                      <>
                        <span style={{ color: lg.color }}>tareas</span>
                        <span className="text-[#888]">{` · ${s.pct}% completadas`}</span>
                      </>
                    ) : (
                      <span className="text-[#888]">sin movimiento</span>
                    )}
                  </span>
                </div>
                {tot > 0 && (
                  <>
                    <div className="flex rounded-full overflow-hidden h-1.5 mb-2">
                      {counts
                        .filter((c) => c.n > 0)
                        .map((c) => (
                          <div
                            key={c.e}
                            style={{
                              width: `${(c.n / tot) * 100}%`,
                              background: COL_META[c.e]?.color ?? "#ccc",
                            }}
                            title={`${c.e}: ${c.n}`}
                          />
                        ))}
                    </div>
                    <div className="flex flex-wrap gap-x-2 gap-y-1 mb-3">
                      {counts
                        .filter((c) => c.n > 0)
                        .map((c) => (
                          <span
                            key={c.e}
                            className="flex items-center gap-1 text-[12px] text-[#555]"
                          >
                            <span
                              style={{
                                width: 7,
                                height: 7,
                                borderRadius: "50%",
                                background: COL_META[c.e]?.color ?? "#ccc",
                                display: "inline-block",
                                flexShrink: 0,
                              }}
                            />
                            <b className="text-[#111]">{c.n}</b> {c.e}
                          </span>
                        ))}
                    </div>
                  </>
                )}
              </button>
            );
          })}
        </div>
      )}

      {mentorNote && (
        <div className="bg-[#fffbeb] border border-[#fde68a] rounded-xl px-4 py-3 flex gap-3 items-start">
          <svg
            className="flex-shrink-0 mt-0.5 text-[#FFB800]"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path
              d="M12 2l2.4 7.4H22l-6 4.5 2.3 7.1L12 16.6 5.7 21l2.3-7.1-6-4.5h7.6z"
              strokeLinejoin="round"
            />
          </svg>
          <p className="text-[15px] text-[#7c6e00]">
            <b>Dupla de mentoría sugerida:</b> {mentorNote}
          </p>
        </div>
      )}
    </div>
  );
}
