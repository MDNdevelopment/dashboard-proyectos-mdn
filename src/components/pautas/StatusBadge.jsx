import { LIFECYCLE_LABELS } from '../../utils/audiovisual'

/** Paleta única de estados de pauta (solicitada ámbar, programada azul, realizada verde). */
export const STATUS_STYLE = {
  solicitada: { bg: '#fdf4de', text: '#9a7400', dot: '#e0b23d' },
  programada: { bg: '#e6f0ff', text: '#2563eb', dot: '#3b6fd4' },
  realizada: { bg: '#e9f7ec', text: '#1f8a43', dot: '#1f8a43' },
  declinada: { bg: '#f2f0ea', text: '#888', dot: '#999' },
}

export default function StatusBadge({ pauta, size = 'md' }) {
  const deleted = Boolean(pauta.deleted_at)
  const style = deleted
    ? STATUS_STYLE.declinada
    : (STATUS_STYLE[pauta.status] ?? STATUS_STYLE.declinada)
  const label = deleted ? 'En papelera' : (LIFECYCLE_LABELS[pauta.status] ?? pauta.status)
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full font-mono font-semibold uppercase tracking-wide ${
        size === 'sm' ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-0.5 text-[11px]'
      }`}
      style={{ background: style.bg, color: style.text }}
    >
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: style.dot }} />
      {label}
    </span>
  )
}
