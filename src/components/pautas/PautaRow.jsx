import ExtraBadge from './ExtraBadge'
import StatusBadge from './StatusBadge'
import {
  FORMAT_KEYS,
  FORMAT_ICONS,
  FORMAT_LABELS,
  formatDayShort,
  formatTime12,
  lugarLabel,
  resourceNames,
  requesterName,
  piezasPorFormato,
  piezaListas,
} from '../../utils/audiovisual'

/** Fila compacta de la vista Lista. Clic → detalle. */
export default function PautaRow({ pauta, piezas, lineName, usersById, onClick }) {
  const recursos = resourceNames(pauta, usersById)
  const formats = FORMAT_KEYS.filter((c) => (pauta.formats ?? []).includes(c))
  const breakdown = piezasPorFormato(pauta)
  const showProgress = ['programada', 'realizada'].includes(pauta.status) && !pauta.deleted_at
  const cuando = pauta.pauta_date
    ? `${formatDayShort(pauta.pauta_date)}${pauta.salida ? ` · ${formatTime12(pauta.salida)}` : ''}`
    : pauta.status === 'solicitada'
      ? 'Sin fecha'
      : 'Por agendar'

  return (
    <button
      type="button"
      onClick={() => onClick(pauta)}
      className="w-full text-left grid grid-cols-[150px_1fr_auto] md:grid-cols-[150px_1fr_220px_auto] gap-3 items-center px-4 py-3 border-b border-[#f2efe6] hover:bg-[#faf9f5] transition-colors"
    >
      <div>
        <div className="text-[13px] font-mono text-[#111]">{cuando}</div>
        <div className="text-[11.5px] text-[#999] truncate">{lugarLabel(pauta)}</div>
      </div>
      <div className="min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[14px] font-semibold text-[#111] truncate">
            {pauta.client_name ?? 'Sin cliente'}
          </span>
          <ExtraBadge pauta={pauta} />
          <StatusBadge pauta={pauta} size="sm" />
        </div>
        <div className="text-[12px] text-[#777] truncate mt-0.5">
          {lineName}
          {pauta.tema ? ` · ${pauta.tema}` : ''}
          {formats.length ? ` · ${formats.map((c) => FORMAT_ICONS[c]).join(' ')}` : ''}
        </div>
      </div>
      <div className="hidden md:block min-w-0">
        {showProgress ? (
          <div className="space-y-1">
            {formats.map((c) => {
              const salieron = breakdown[c]?.salieron ?? 0
              const listas = (piezas ?? [])
                .filter((pz) => pz.formato === c && pz.status !== 'cancelado')
                .reduce((s, pz) => s + piezaListas(pz), 0)
              const pct = salieron ? Math.min(100, Math.round((listas / salieron) * 100)) : 0
              return (
                <div
                  key={c}
                  className="flex items-center gap-2"
                  title={`${FORMAT_LABELS[c]}: ${listas} editadas de ${salieron}`}
                >
                  <span className="text-[11px] w-4">{FORMAT_ICONS[c]}</span>
                  <div className="flex-1 h-[6px] bg-[#f0ede4] rounded-full overflow-hidden">
                    <div
                      className="h-full bg-[#1f8a43] rounded-full"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="text-[11px] font-mono text-[#777] w-12 text-right">
                    {listas}/{salieron}
                  </span>
                </div>
              )
            })}
          </div>
        ) : (
          <div className="text-[12px] text-[#999] truncate">
            {requesterName(pauta, usersById) ? `Solicitó ${requesterName(pauta, usersById)}` : ''}
          </div>
        )}
      </div>
      <div className="text-[12px] text-[#555] text-right max-w-[160px] truncate">
        {recursos.length ? recursos.join(', ') : <span className="text-[#bbb]">Sin recursos</span>}
      </div>
    </button>
  )
}
