// Indicador "escribiendo…": 3 puntos que rebotan en cascada, como en un chat normal.
export default function TypingDots() {
  return (
    <div className="flex items-center gap-1 py-1" aria-label="MAPPI está escribiendo">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="w-1.5 h-1.5 rounded-full bg-[#999] animate-bounce"
          style={{ animationDelay: `${i * 150}ms` }}
        />
      ))}
    </div>
  )
}
