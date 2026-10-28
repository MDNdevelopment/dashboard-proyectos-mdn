import Avatar from '../Avatar'
import ManagerRatingCard from './ManagerRatingCard'
import InfoTip from '../common/InfoTip'
import { resolveEmployeeNota, notaColor } from '../../utils/employeeCombinedScore'
import { INDICATOR_DESCRIPTIONS } from '../../utils/employeeScoreProfiles'
import { formatIndicatorDetail, explainNoData } from '../../utils/employeeScoreDetail'

// Etiqueta del estado de la medición (solo se muestra cuando no es 'ok', como texto plano).
const ESTADO_META = {
  ok: { label: 'Se puede medir' },
  parcial: { label: 'Medición parcial' },
  sin_datos: { label: 'No medible aún' },
}

// Mismos umbrales y colores de barra que IndicatorRow.
function barColor(pct) {
  return pct >= 0.8 ? '#16A34A' : pct >= 0.6 ? '#FFB800' : '#E14848'
}

/** Encabezado de bloque: mismo estilo que los encabezados de tabla/info del módulo. */
function BlockCaption({ children }) {
  return (
    <p className="text-[11.5px] font-mono font-bold uppercase tracking-[0.12em] text-[#aaa] mb-2.5">
      {children}
    </p>
  )
}

function AutoIndicatorRow({ item }) {
  const { key, label, aplica, pct, pesoBase, pesoEfectivo, unidades, detalle } = item
  const cifras = aplica
    ? formatIndicatorDetail(key, detalle)
    : explainNoData(key, { unidades, detalle })
  const peso = Math.round(pesoEfectivo)
  const pesoLinea = aplica
    ? pesoEfectivo > 0
      ? `${peso}% del total`
      : null
    : pesoBase > 0
      ? `Su ${Math.round(pesoBase)}% se reparte entre los demás ítems`
      : null
  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <span className="flex items-center gap-2 min-w-0">
          <span className="text-[14px] font-semibold text-[#111] truncate">{label}</span>
          <InfoTip text={INDICATOR_DESCRIPTIONS[key]} label={`Qué evalúa: ${label}`} />
        </span>
        <span className="text-[14px] font-mono font-bold text-[#111] flex-shrink-0">
          {aplica && pct != null ? `${Math.round(pct * 100)}%` : '—'}
        </span>
      </div>
      <div className="h-1.5 bg-[#f0ede3] rounded-full overflow-hidden mt-1.5">
        {aplica && pct != null && (
          <div
            className="h-full rounded-full transition-all"
            style={{
              width: `${Math.min(100, Math.max(0, pct * 100))}%`,
              background: barColor(pct),
            }}
          />
        )}
      </div>
      {cifras && <p className="text-[13px] text-[#555] mt-1.5">{cifras}</p>}
      {pesoLinea && <p className="text-[12px] font-mono text-[#999] mt-0.5">{pesoLinea}</p>}
    </div>
  )
}

/**
 * Ficha de desempeño de un empleado en un mes: avatar, nombre/cargo, nota /5 en
 * grande, estado de la medición, bloque "Lo mide Mappi solo" (indicadores automáticos que
 * aplican al cargo) y bloque "Lo evalúa el jefe" (criterios subjetivos, ver
 * ARQUITECTURA.md §2.7), cerrando con la lectura del mes. Tarjeta neutra con el lenguaje
 * visual del resto de MAPPI; el color queda solo en el estado y en las barras.
 *
 * @param {object} result          salida de computeEmployeeScore / fila de employee_score_snapshots
 * @param {object} [employee]      {first_name, last_name, avatar_url, user_id} para el avatar
 * @param {string} [cargoLabel]    nombre del cargo, mostrado bajo el nombre
 * @param {object} [managerRating] fila de manager_ratings del mes, si existe
 * @param {Array} [criteria]       criterios activos del cargo del empleado
 * @param {boolean} [canEvaluar]   true si el usuario actual puede evaluar a este empleado
 * @param {Function} [onEvaluar]   callback para abrir el modal de evaluación
 */
export default function ScoreBreakdownCard({
  result,
  employeeName,
  employee,
  cargoLabel,
  managerRating,
  criteria,
  canEvaluar,
  onEvaluar,
}) {
  if (!result) return null

  const { estado, breakdown, narrativa } = result
  const meta = ESTADO_META[estado] ?? ESTADO_META.sin_datos
  const { nota, hasCriteria } = resolveEmployeeNota({ result, managerRating, criteria })

  // Solo los indicadores que aplican al cargo (peso > 0 en el perfil resuelto) —
  // los que no aplican (ej. Tickets IT para un cargo de back-office) no se listan.
  const applicableBreakdown = (breakdown ?? []).filter((b) => Number(b.pesoBase) > 0)

  const name =
    employeeName ??
    (employee ? `${employee.first_name ?? ''} ${employee.last_name ?? ''}`.trim() : null)

  const noteText =
    estado === 'ok'
      ? (narrativa ?? 'Al día con los indicadores que le aplican este mes.')
      : estado === 'parcial'
        ? (narrativa ?? 'Puntaje provisional — no compite en el ranking este mes.')
        : (narrativa ??
          (hasCriteria
            ? 'Sin indicadores automáticos suficientes este mes. Se evalúa con el jefe.'
            : 'Sin datos automáticos suficientes este mes.'))

  return (
    <div className="bg-white rounded-2xl border border-[#e0ddd4] p-5 sm:p-6">
      {/* Cabecera: avatar + nombre/cargo + nota */}
      <div className="flex items-center gap-3.5">
        {employee ? (
          <Avatar user={employee} size={48} />
        ) : (
          <div
            className="rounded-full flex items-center justify-center font-bold text-white bg-[#111] flex-shrink-0"
            style={{ width: 48, height: 48, fontSize: 18 }}
          >
            {name?.[0]?.toUpperCase() ?? '—'}
          </div>
        )}
        <div className="flex-1 min-w-0">
          {name && <p className="text-[15.5px] font-bold text-[#111] truncate">{name}</p>}
          {cargoLabel && <p className="text-[13px] text-[#888] mt-0.5 truncate">{cargoLabel}</p>}
          {estado !== 'ok' && (
            <p className="text-[12px] font-mono text-[#999] mt-0.5">{meta.label}</p>
          )}
        </div>
        <div className="text-right flex-shrink-0">
          <div
            className="font-bold leading-none font-mono"
            style={{ fontSize: 28, color: notaColor(nota) }}
          >
            {nota == null ? '—' : nota.toFixed(1)}
          </div>
          <div className="text-[11px] font-mono font-bold uppercase tracking-[0.08em] text-[#bbb] mt-1">
            {nota == null ? 'sin datos' : 'sobre 10'}
          </div>
        </div>
      </div>

      {/* Lo mide Mappi solo */}
      {applicableBreakdown.length > 0 && (
        <div className="mt-5 pt-4 border-t border-[#ece9df]">
          <BlockCaption>Lo mide Mappi solo</BlockCaption>
          <div className="space-y-3.5">
            {applicableBreakdown.map((b) => (
              <AutoIndicatorRow key={b.key} item={b} />
            ))}
          </div>
        </div>
      )}

      {/* Lo evalúa el jefe */}
      <ManagerRatingCard
        rating={managerRating}
        criteria={criteria}
        canEvaluar={canEvaluar}
        onEvaluar={onEvaluar}
        caption={
          applicableBreakdown.length > 0
            ? 'Lo evalúa el jefe, una vez al mes'
            : 'Lo evalúa el jefe — único criterio hoy'
        }
      />

      {/* Lectura del mes */}
      <div className="mt-5 p-3 rounded-xl bg-[#faf9f5] border border-[#ece9df]">
        <p className="text-[11.5px] font-mono font-bold uppercase tracking-[0.12em] text-[#aaa] mb-1.5">
          {estado === 'ok'
            ? 'Al día'
            : estado === 'parcial'
              ? 'Nota provisional'
              : 'Sin datos automáticos'}
        </p>
        <p className="text-[14px] text-[#444] leading-relaxed">{noteText}</p>
      </div>
    </div>
  )
}
