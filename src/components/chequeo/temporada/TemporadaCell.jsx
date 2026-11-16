import StatusPill from '../../common/StatusPill'
import { PIECE_LABELS, PIECE_STATUSES, addableTypes, statusMetaFor } from '../../../utils/temporada'

/**
 * Una celda cliente × slot: las piezas que existen (cada una con su StatusPill) y, si se
 * puede editar, los botones para agregar los tipos que faltan. Una pieza que no aplica
 * simplemente no existe: se quita con la «×».
 */
export default function TemporadaCell({
  slot,
  pieces,
  canManage,
  onAdd,
  onStatusChange,
  onRemove,
}) {
  const addable = canManage ? addableTypes(slot, pieces) : []

  if (pieces.length === 0 && addable.length === 0) {
    return <span className="text-[13px] text-[#ccc]">—</span>
  }

  return (
    <div className="flex flex-col gap-1.5 min-w-[150px]">
      {pieces.map((piece) => (
        <div key={piece.id} className="flex items-center gap-1.5">
          <span className="w-[44px] flex-shrink-0 text-[11.5px] font-mono font-bold uppercase tracking-wide text-[#888]">
            {PIECE_LABELS[piece.piece_type]}
          </span>
          <StatusPill
            size="sm"
            value={piece.status}
            meta={statusMetaFor(piece.piece_type)}
            options={PIECE_STATUSES}
            editable={canManage}
            onChange={(next) => onStatusChange(piece, next)}
          />
          {canManage && (
            <button
              type="button"
              onClick={() => onRemove(piece)}
              aria-label={`Quitar ${PIECE_LABELS[piece.piece_type]}`}
              title="Quitar esta pieza (no aplica)"
              className="text-[15px] leading-none text-[#bbb] hover:text-[#c0392b]"
            >
              ×
            </button>
          )}
        </div>
      ))}
      {addable.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {addable.map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => onAdd(type)}
              className="px-1.5 py-0.5 rounded-md border border-dashed border-[#d6d2c4] text-[12px] font-semibold text-[#888] hover:border-[#FFB800] hover:text-[#111]"
            >
              + {PIECE_LABELS[type]}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
