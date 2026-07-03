/**
 * Dial circular de cumplimiento (gauge SVG).
 * Portado del SVG <circle stroke-dasharray> del HTML original.
 *
 * Props:
 *   score     — número 0–100 (default 0)
 *   color     — color del arco (default "#FAB51A")
 *   size      — tamaño en px del cuadrado contenedor (default 160)
 *   showScale — si es false oculta el "/100" interior (default true)
 */

/** Devuelve el color hex correspondiente al score (0–100). */
export function scoreDialColor(score) {
  const s = Math.min(100, Math.max(0, score));
  return s >= 80 ? "#10B981" : s >= 60 ? "#FAB51A" : "#EF4444";
}

export default function ScoreDial({ score = 0, color = "#FAB51A", size = 160, showScale = true }) {
  const R = size * 0.4375; // radio del arco (equivale a r="70" cuando size=160)
  const cx = size / 2;
  const cy = size / 2;
  const C = 2 * Math.PI * R;
  const clampedScore = Math.min(100, Math.max(0, score));
  const fillRatio = clampedScore / 100;
  const dasharray = C;
  const dashoffset = C - fillRatio * C;

  const textColor = scoreDialColor(clampedScore);

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
        <span
          className="font-bold leading-none"
          style={{ fontSize: size * 0.175, color: textColor }}
        >
          {clampedScore.toFixed(1)}
        </span>
        {showScale && (
          <span
            className="font-mono text-[#aaa] mt-0.5"
            style={{ fontSize: size * 0.075 }}
          >
            /100
          </span>
        )}
      </div>
    </div>
  );
}
