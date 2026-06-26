/**
 * Dial circular de cumplimiento (gauge SVG).
 * Portado del SVG <circle stroke-dasharray> del HTML original.
 */
export default function ScoreDial({ score = 0, color = "#FAB51A", size = 160 }) {
  const R = size * 0.4375; // radio del arco (equivale a r="70" cuando size=160)
  const cx = size / 2;
  const cy = size / 2;
  const C = 2 * Math.PI * R;
  const clampedScore = Math.min(100, Math.max(0, score));
  const fillRatio = clampedScore / 100;
  const dasharray = C;
  const dashoffset = C - fillRatio * C;

  const scoreColor =
    clampedScore >= 80 ? "#10B981" :
    clampedScore >= 60 ? "#FAB51A" :
    "#EF4444";

  return (
    <div className="relative flex items-center justify-center flex-shrink-0" style={{ width: size, height: size }}>
      <svg
        width={size} height={size}
        viewBox={`0 0 ${size} ${size}`}
        style={{ transform: "rotate(-90deg)", position: "absolute", top: 0, left: 0 }}
      >
        <circle cx={cx} cy={cy} r={R} fill="none" stroke="#f0ede3" strokeWidth={size * 0.075} />
        <circle
          cx={cx} cy={cy} r={R}
          fill="none"
          stroke={color}
          strokeWidth={size * 0.075}
          strokeLinecap="round"
          strokeDasharray={dasharray}
          strokeDashoffset={dashoffset}
          style={{ transition: "stroke-dashoffset 0.6s ease" }}
        />
      </svg>
      <div className="flex flex-col items-center">
        <span className="text-[28px] font-bold leading-none" style={{ color: scoreColor }}>
          {clampedScore.toFixed(1)}
        </span>
        <span className="text-[12px] font-mono text-[#aaa] mt-0.5">/100</span>
      </div>
    </div>
  );
}
