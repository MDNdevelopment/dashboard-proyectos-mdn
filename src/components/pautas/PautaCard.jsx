import Avatar from '../Avatar'
import ExtraBadge from './ExtraBadge'
import {
  FORMAT_KEYS,
  FORMAT_ICONS,
  formatTime12,
  formatDayShort,
  lugarLabel,
  pautaEstadoResumen,
} from '../../utils/audiovisual'

const ESTADO_STYLE = {
  aprobar: 'text-[#9a7400]',
  sin_captura: 'text-[#c0392b]',
  capturada: 'text-[#3b6fd4]',
  editando: 'text-[#3b6fd4]',
  lista: 'text-[#1f8a43]',
  declinada: 'text-[#999]',
}

/**
 * Tarjeta compacta de una pauta (Semana, colas del panel lateral): hora, cliente, formatos,
 * lugar, recursos y una línea de estado contextual. Clic → detalle.
 */
export default function PautaCard({ pauta, piezas, usersById, onClick, showDate = false }) {
  const estado = pautaEstadoResumen(pauta, piezas)
  const formats = FORMAT_KEYS.filter((c) => (pauta.formats ?? []).includes(c))
  const recursos = (pauta.recurso_ids ?? []).map((id) => usersById?.get(id)).filter(Boolean)
  const solicitada = pauta.status === 'solicitada'
  const estudio = pauta.lugar_tipo === 'estudio'

  return (
    <button
      type="button"
      onClick={() => onClick?.(pauta)}
      aria-label={`${pauta.client_name ?? 'Sin cliente'} · ${estado.label}`}
      className={`w-full text-left rounded-xl border px-3 py-2.5 transition-colors hover:border-[#111] ${
        solicitada
          ? 'border-dashed border-[#e0b23d] bg-[#fffbea]'
          : estudio
            ? 'border-[#d6e4ff] bg-[#f5f8ff]'
            : 'border-[#e8e4d8] bg-white'
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-[12px] text-[#555]">
          {showDate && pauta.pauta_date ? `${formatDayShort(pauta.pauta_date)} · ` : ''}
          {pauta.salida ? formatTime12(pauta.salida) : 'sin hora'}
        </span>
        <span className="text-[11px] text-[#999] truncate">
          {estudio ? '◉ Estudio' : lugarLabel(pauta)}
        </span>
      </div>
      <div className="flex items-center gap-1.5 mt-0.5 min-w-0">
        <span className="text-[13.5px] font-semibold text-[#111] truncate">
          {pauta.client_name ?? 'Sin cliente'}
        </span>
        <ExtraBadge pauta={pauta} />
      </div>
      <div className="flex items-center justify-between gap-2 mt-1">
        <span className="text-[12px]">{formats.map((c) => FORMAT_ICONS[c]).join(' ') || '—'}</span>
        <span className="flex -space-x-1.5">
          {recursos.slice(0, 3).map((u) => (
            <span key={u.user_id} title={`${u.first_name} ${u.last_name}`.trim()}>
              <Avatar user={u} size={20} />
            </span>
          ))}
          {recursos.length > 3 && (
            <span className="text-[10px] text-[#999] pl-2">+{recursos.length - 3}</span>
          )}
        </span>
      </div>
      <div className={`mt-1.5 text-[11.5px] font-semibold ${ESTADO_STYLE[estado.kind]}`}>
        {estado.kind === 'aprobar' && '⏳ '}
        {estado.kind === 'sin_captura' && '○ '}
        {estado.kind === 'lista' && '✓ '}
        {estado.label}
        {estado.pct !== null && estado.kind !== 'lista' && (
          <span className="block h-[4px] mt-1 rounded-full bg-[#ece9df] overflow-hidden">
            <span className="block h-full bg-[#1f8a43]" style={{ width: `${estado.pct}%` }} />
          </span>
        )}
      </div>
    </button>
  )
}
