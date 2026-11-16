import StatusPill from '../../common/StatusPill'
import {
  NO_STATUS,
  PIECE_LABELS,
  addableTypes,
  statusMetaFor,
  statusOptionsFor,
} from '../../../utils/temporada'

/**
 * Una celda cliente × slot: las piezas que existen (cada una con su StatusPill, con los
 * estados de la hoja para ese formato) y, si se puede editar, los botones para agregar los
 * formatos que faltan. «N/A» de la hoja = la pieza no existe: se quita con la «×».
 *
 * Las tarjetas son un solo estado (como en la hoja): sin chip de formato.
 */
export default function TemporadaCell({
  slot,
  pieces,
  canManage,
  onAdd,
  onStatusChange,
  onRemove,
}) {
  const isTarjeta = slot?.kind === 'tarjeta'
  const addable = canManage ? addableTypes(slot, pieces) : []

  if (pieces.length === 0 && addable.length === 0) {
    return <span className="text-[13px] text-[#ccc]">—</span>
  }

  return (
    <div className="flex flex-col gap-1.5 min-w-[150px]">
      {pieces.map((piece) => (
        <div key={piece.id} className="flex flex-col items-start gap-1">
          {!isTarjeta && (
            <span className="text-[11.5px] font-mono font-bold uppercase tracking-wide text-[#888]">
              {PIECE_LABELS[piece.piece_type]}
            </span>
          )}
          <div className="flex items-center gap-1.5">
            <StatusPill
              size="sm"
              value={piece.status ?? NO_STATUS}
              meta={statusMetaFor(piece.piece_type)}
              options={statusOptionsFor(piece.piece_type)}
              editable={canManage}
              onChange={(next) => onStatusChange(piece, next)}
            />
            {canManage && (
              <button
                type="button"
                onClick={() => onRemove(piece)}
                aria-label={`Quitar ${isTarjeta ? 'tarjeta' : PIECE_LABELS[piece.piece_type]}`}
                title="Quitar (N/A: no aplica)"
                className="text-[15px] leading-none text-[#bbb] hover:text-[#c0392b]"
              >
                ×
              </button>
            )}
          </div>
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
              + {isTarjeta ? 'Tarjeta' : PIECE_LABELS[type]}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
