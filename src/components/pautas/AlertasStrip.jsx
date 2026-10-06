export const ALERTA_META = {
  porAprobar: {
    label: (n) => `${n} ${n === 1 ? 'solicitud' : 'solicitudes'} por aprobar`,
    tone: 'amber',
  },
  sinCaptura: {
    label: (n) => `${n} ${n === 1 ? 'pauta pasada' : 'pautas pasadas'} sin captura`,
    tone: 'red',
  },
  grillaIncumple: {
    label: (n) => `${n} ${n === 1 ? 'grilla vencida' : 'grillas vencidas'}`,
    tone: 'red',
  },
  piezasAtrasadas: {
    label: (n) => `${n} ${n === 1 ? 'pauta' : 'pautas'} con piezas atrasadas`,
    tone: 'amber',
  },
}

const TONE = {
  amber: 'bg-[#fdf4de] text-[#9a7400] border-[#f3e2ad] hover:bg-[#fbeec8]',
  red: 'bg-[#fdecec] text-[#c0392b] border-[#f5c6c6] hover:bg-[#fbdede]',
}

/** Chips de "cosas que necesitan acción"; cada uno abre su cola en el panel lateral. */
export default function AlertasStrip({ alertas, onOpen }) {
  const items = Object.keys(ALERTA_META)
    .map((kind) => ({ kind, count: alertas?.[kind]?.length ?? 0 }))
    .filter((i) => i.count > 0)
  if (items.length === 0) {
    return (
      <p
        className="text-[12.5px] text-[#1f8a43] font-semibold"
        data-testid="alertas-ok"
        data-tour="alertas"
      >
        ✓ Nada pendiente por tu parte.
      </p>
    )
  }
  return (
    <div className="flex flex-wrap items-center gap-2" aria-label="Alertas" data-tour="alertas">
      {items.map(({ kind, count }) => (
        <button
          key={kind}
          type="button"
          onClick={() => onOpen(kind)}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-[12.5px] font-semibold transition-colors ${TONE[ALERTA_META[kind].tone]}`}
        >
          ⚠ {ALERTA_META[kind].label(count)}
          <span className="text-[11px] opacity-70">ver ›</span>
        </button>
      ))}
    </div>
  )
}
