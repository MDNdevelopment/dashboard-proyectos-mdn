import { useState } from 'react'
import AgendarDialog from './AgendarDialog'
import {
  FORMAT_KEYS,
  FORMAT_ICONS,
  FORMAT_LABELS,
  formatDayShort,
  formatTime12,
  lugarLabel,
  requesterName,
  estudioConflicts,
  pautaErrorMessage,
} from '../../utils/audiovisual'

/**
 * Cola de solicitudes por aprobar (panel lateral de Semana): cada tarjeta resume el pedido y
 * permite agendar (abre `AgendarDialog`), declinar o abrir el detalle.
 */
export default function ColaAprobacion({
  solicitudes,
  pautas,
  usersById,
  recursoUsers,
  allEmployees,
  canApprove,
  onFields,
  onPautaClick,
}) {
  const [agendando, setAgendando] = useState(null)
  const [error, setError] = useState(null)

  async function declinar(p) {
    setError(null)
    const { error: err } = (await onFields(p, { status: 'declinada' })) ?? {}
    if (err) setError(pautaErrorMessage(err))
  }

  if (solicitudes.length === 0) {
    return (
      <p className="text-[13px] text-[#1f8a43] font-semibold">✓ No hay solicitudes pendientes.</p>
    )
  }

  return (
    <>
      {error && (
        <div className="bg-red-50 text-red-700 text-[13px] px-3 py-2 rounded-lg" role="alert">
          {error}
        </div>
      )}
      {solicitudes.map((p) => {
        const formats = FORMAT_KEYS.filter((c) => (p.formats ?? []).includes(c))
        const estudio =
          p.lugar_tipo === 'estudio' && p.pauta_date
            ? estudioConflicts(pautas, {
                date: p.pauta_date,
                salida: p.salida,
                clientId: p.client_id,
                excludeId: p.id,
              })
            : null
        return (
          <article
            key={p.id}
            className="rounded-xl border border-[#e8e4d8] bg-white px-4 py-3"
            aria-label={`Solicitud ${p.client_name ?? ''}`}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <h3 className="text-[14px] font-bold text-[#111] truncate">
                  {p.client_name ?? 'Sin cliente'}
                </h3>
                <p className="text-[12.5px] text-[#555] truncate">{p.tema || 'Sin tema'}</p>
              </div>
              <span className="text-[12px]">
                {formats.map((c) => (
                  <span key={c} title={FORMAT_LABELS[c]}>
                    {FORMAT_ICONS[c]}{' '}
                  </span>
                ))}
              </span>
            </div>
            <dl className="grid grid-cols-2 gap-x-3 gap-y-1 mt-2 text-[12px]">
              <div>
                <dt className="font-mono uppercase text-[10px] text-[#999]">Pide</dt>
                <dd className="text-[#333]">
                  {p.pauta_date
                    ? `${formatDayShort(p.pauta_date)}${p.salida ? ` · ${formatTime12(p.salida)}` : ''}`
                    : 'Sin fecha fija'}
                </dd>
              </div>
              <div>
                <dt className="font-mono uppercase text-[10px] text-[#999]">Dónde</dt>
                <dd className="text-[#333]">{lugarLabel(p)}</dd>
              </div>
              <div>
                <dt className="font-mono uppercase text-[10px] text-[#999]">Solicitó</dt>
                <dd className="text-[#333]">{requesterName(p, usersById) ?? '—'}</dd>
              </div>
              <div>
                <dt className="font-mono uppercase text-[10px] text-[#999]">Hace</dt>
                <dd className="text-[#333]">
                  {p.created_at ? formatDayShort(String(p.created_at).slice(0, 10)) : '—'}
                </dd>
              </div>
            </dl>
            {estudio?.blocking.length > 0 && (
              <p className="mt-2 text-[12px] text-[#c0392b]">
                ✗ El estudio está ocupado a esa hora ({estudio.blocking[0].pauta.client_name}).
                Cambia la hora al agendar.
              </p>
            )}
            {estudio?.blocking.length === 0 && estudio.warnings.length > 0 && (
              <p className="mt-2 text-[12px] text-[#9a7400]">
                ⚠ Otra solicitud también pide el estudio a esa hora.
              </p>
            )}
            <div className="flex items-center gap-2 mt-3">
              {canApprove && (
                <>
                  <button
                    type="button"
                    onClick={() => setAgendando(p)}
                    className="text-[13px] font-semibold px-3 py-1.5 rounded-lg bg-[#FFB800] text-[#111] hover:brightness-95"
                  >
                    Agendar
                  </button>
                  <button
                    type="button"
                    onClick={() => declinar(p)}
                    className="text-[13px] font-semibold px-3 py-1.5 rounded-lg border border-[#e0ddd4] text-[#555] hover:border-[#111]"
                  >
                    Declinar
                  </button>
                </>
              )}
              <button
                type="button"
                onClick={() => onPautaClick(p)}
                className="ml-auto text-[12.5px] font-semibold text-[#2563eb] hover:underline"
              >
                Ver detalle
              </button>
            </div>
          </article>
        )
      })}
      {agendando && (
        <AgendarDialog
          mode="agendar"
          pauta={agendando}
          pautas={pautas}
          usersById={usersById}
          recursoUsers={recursoUsers}
          allEmployees={allEmployees}
          onConfirm={(fields) => onFields(agendando, fields)}
          onClose={() => setAgendando(null)}
        />
      )}
    </>
  )
}
