import ClientCell from '../ClientCell'
import CampaignChecklist from '../CampaignChecklist'
import DaysPill from './DaysPill'
import { STATUS } from '../constants'
import { fmtDate } from '../campaignSpendApi'
import { updateCampaign } from './tacticasApi'
import {
  closeDateOf,
  completionPct,
  daysLeft,
  durationLabel,
  isProgramada,
  isVigente,
  latestByBrand,
  leadNameOf,
  periodProgress,
} from '../../../utils/tacticas'

/**
 * Ficha de una marca: sus tácticas vigentes arriba (con avance del período y checklist) y
 * el historial de las anteriores abajo, con el % de cumplimiento de cada una.
 * Es solo lectura salvo por tildar las acciones, que persiste en `campaigns.checklist`.
 * Se abre en una ventana emergente (`TacticasMarcaModal`) al hacer clic en una marca.
 *
 * @param {object}   props
 * @param {Array}    props.campaigns      — todas las tácticas visibles (de varias marcas)
 * @param {string}   props.clientId       — marca elegida
 * @param {Map}      props.clientsById
 * @param {Map}      props.linesById
 * @param {Map}      props.usersMap       — user_id → nombre
 * @param {string}   props.today          — hoy en Caracas (YYYY-MM-DD)
 * @param {boolean}  props.canManage
 * @param {Function} props.onSelect       — (campaign) => void, abre el detalle
 * @param {Array}    props.insumos        — insumos pendientes de ESTA marca: [{ handoff, source, content }]
 * @param {Function} props.onDiscardInsumo — (handoff) => void
 * @param {Function} props.onCreate       — (clientId) => void, abre el formulario con la marca
 * @param {Function} props.onUpdated      — (campaign) => void, tras persistir un cambio
 */
export default function TacticasPorMarca({
  campaigns,
  clientId,
  clientsById,
  linesById,
  usersMap,
  today,
  canManage,
  onSelect,
  insumos = [],
  onDiscardInsumo,
  onCreate,
  onUpdated,
}) {
  const client = clientsById.get(clientId)
  // Más nueva primero; las sin fecha (por fechar) arriba de todo.
  const mine = campaigns
    .filter((c) => c.client_id === clientId)
    .sort((a, b) => `${b.start_date ?? '9999'}`.localeCompare(`${a.start_date ?? '9999'}`))
  // La carpeta de la marca es la misma en todas sus tácticas: se toma la de la más reciente.
  const folderUrl = mine.find((c) => c.drive_folder_url)?.drive_folder_url ?? null
  const vigentes = mine.filter((c) => isVigente(c, today))
  const historial = mine.filter((c) => !isVigente(c, today))
  const lastId = latestByBrand(mine).get(clientId)?.id
  const lead = leadNameOf(clientId, clientsById, linesById, usersMap)
  const line = linesById.get(client?.line_id)

  async function handleChecklist(campaign, checklist) {
    onUpdated({ ...campaign, checklist }) // optimista
    const { data, error } = await updateCampaign(campaign.id, { checklist })
    if (!error && data) onUpdated(data)
  }

  return (
    <div className="space-y-5">
      {!client ? (
        <div className="text-center py-14 bg-white border border-[#e0ddd4] rounded-2xl">
          <p className="text-[16px] font-medium text-[#888]">
            Esta marca no está dentro de las líneas que puedes ver
          </p>
        </div>
      ) : (
        <>
          <header className="flex flex-wrap items-center justify-between gap-3 bg-white border border-[#e0ddd4] rounded-2xl px-5 py-4">
            <div>
              <h2 className="text-[20px] font-bold text-[#111]">
                <ClientCell name={client.name} logoUrl={client.logo_url} />
              </h2>
              <p className="text-[14px] text-[#888] mt-1">
                {line?.name ?? 'Sin línea'}
                {lead ? ` · Jefa: ${lead}` : ''} · {mine.length}{' '}
                {mine.length === 1 ? 'táctica registrada' : 'tácticas registradas'}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {folderUrl && (
                <a
                  href={folderUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[14px] font-semibold px-3.5 py-2 rounded-xl border border-[#e0ddd4] bg-white text-[#111] hover:border-[#FFB800] transition-colors"
                >
                  Carpeta de la marca
                </a>
              )}
              {canManage && (
                <button
                  type="button"
                  onClick={() => onCreate(clientId)}
                  className="text-[14px] font-bold px-3.5 py-2 rounded-xl bg-[#111] text-white hover:bg-[#222] transition-colors"
                >
                  + Nueva táctica
                </button>
              )}
            </div>
          </header>

          {vigentes.length === 0 && (
            <div
              role="alert"
              className="flex flex-wrap items-center justify-between gap-3 bg-[#fff1c2] border border-[#f0d57a] rounded-2xl px-5 py-3.5"
            >
              <p className="text-[14.5px] font-semibold text-[#6e4a00]">
                Sin táctica vigente. Esta marca necesita la táctica del próximo período.
              </p>
              {canManage && (
                <button
                  type="button"
                  onClick={() => onCreate(clientId)}
                  className="text-[13.5px] font-bold px-3 py-1.5 rounded-lg bg-[#FFB800] text-[#111] hover:bg-[#e6a600] transition-colors"
                >
                  Cargar táctica
                </button>
              )}
            </div>
          )}

          {insumos.map(({ handoff, source, content }) => (
            <section
              key={handoff.id}
              aria-label={`Insumo de ${source.name}`}
              className="bg-[#eef6ff] border border-[#bcd7f5] rounded-2xl p-5 space-y-2"
            >
              <p className="text-[12px] font-mono font-bold tracking-[0.14em] uppercase text-[#1565c0]">
                Insumo para la siguiente táctica
              </p>
              <h3 className="text-[16px] font-bold text-[#111]">
                De «{source.name}» · cerrada el {fmtDate(closeDateOf(source))}
              </h3>
              <p className="text-[14px] text-[#444]">
                Cumplimiento: {content.pct}% ({content.done.length} de {content.total} acciones)
              </p>
              {content.pending.length > 0 ? (
                <div>
                  <p className="text-[13px] font-semibold text-[#111] mb-1">
                    Quedaron pendientes ({content.pending.length})
                  </p>
                  <ul className="list-disc pl-5 text-[14px] text-[#333] space-y-0.5">
                    {content.pending.map((it) => (
                      <li key={it.id}>{it.title || '—'}</li>
                    ))}
                  </ul>
                </div>
              ) : (
                <p className="text-[14px] text-[#555]">
                  Se cumplieron todas las acciones: no hay nada que arrastrar.
                </p>
              )}
              {canManage && (
                <div className="flex flex-wrap gap-2 pt-1">
                  {content.pending.length > 0 && (
                    <button
                      type="button"
                      onClick={() => onCreate(clientId)}
                      className="text-[13.5px] font-bold px-3 py-1.5 rounded-lg bg-[#111] text-white hover:bg-[#222] transition-colors"
                    >
                      Cargar la siguiente táctica
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => onDiscardInsumo(handoff)}
                    className="text-[13.5px] font-semibold px-3 py-1.5 rounded-lg border border-[#e0ddd4] bg-white text-[#555] hover:bg-[#f5f3eb] transition-colors"
                  >
                    Descartar insumo
                  </button>
                </div>
              )}
            </section>
          ))}

          {vigentes.map((c) => {
            const progress = periodProgress(c, today)
            return (
              <section
                key={c.id}
                aria-label={`Táctica vigente: ${c.name}`}
                className="bg-white border-2 border-[#111] rounded-2xl p-5 space-y-3"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-[12px] font-mono font-bold tracking-[0.14em] uppercase text-[#1e5e24]">
                      {isProgramada(c, today) ? 'Programada' : 'Vigente'}
                    </p>
                    <button
                      type="button"
                      onClick={() => onSelect(c)}
                      className="text-[20px] font-bold text-[#111] hover:underline text-left mt-0.5"
                    >
                      {c.name}
                    </button>
                    <p className="text-[14px] text-[#888] mt-0.5">
                      {fmtDate(c.start_date)} → {fmtDate(c.end_date)}
                      {durationLabel(c) && ` · Duración: ${durationLabel(c)}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <DaysPill days={daysLeft(c, today)} />
                    {c.drive_url ? (
                      <a
                        href={c.drive_url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[14px] font-semibold px-3 py-1.5 rounded-lg bg-[#FFB800] text-[#111] hover:bg-[#e6a600] transition-colors"
                      >
                        Abrir documento
                      </a>
                    ) : (
                      c.id === lastId &&
                      canManage && (
                        <span className="text-[12.5px] font-semibold text-[#c77700]">
                          Completa el link de Drive
                        </span>
                      )
                    )}
                  </div>
                </div>

                {c.objective && <p className="text-[14.5px] text-[#444]">{c.objective}</p>}

                <div
                  role="img"
                  aria-label={`Avance del período: ${progress}%`}
                  className="h-2 bg-[#f0ede3] rounded-full overflow-hidden"
                >
                  <div className="h-full bg-[#111]" style={{ width: `${progress}%` }} />
                </div>

                <CampaignChecklist
                  value={c.checklist ?? []}
                  onChange={(next) => handleChecklist(c, next)}
                  canManage={canManage}
                  editable={false}
                />
              </section>
            )
          })}

          <section aria-labelledby="tacticas-historial" className="space-y-2.5">
            <h3 id="tacticas-historial" className="text-[17px] font-bold text-[#111]">
              Historial de tácticas
            </h3>
            {historial.length === 0 ? (
              <p className="text-[14px] text-[#999]">Aún no hay tácticas anteriores.</p>
            ) : (
              historial.map((c) => {
                const pct = completionPct(c.checklist)
                return (
                  <article
                    key={c.id}
                    className="flex flex-wrap items-start gap-x-5 gap-y-2 bg-white border border-[#e0ddd4] rounded-2xl px-5 py-4"
                  >
                    <div className="flex-[0_0_170px] pt-1">
                      {c.start_date && c.end_date ? (
                        <p className="text-[12px] font-mono font-bold tracking-[0.08em] uppercase text-[#888]">
                          {fmtDate(c.start_date)} – {fmtDate(c.end_date)}
                        </p>
                      ) : (
                        <span className="inline-block text-[11.5px] font-mono font-bold uppercase tracking-wide px-2 py-0.5 rounded bg-[#f5f3eb] border border-[#e0ddd4] text-[#666]">
                          Sin fecha
                        </span>
                      )}
                      {durationLabel(c) && (
                        <p className="text-[12px] font-mono text-[#999] mt-0.5">
                          Duración: {durationLabel(c)}
                        </p>
                      )}
                    </div>
                    <div className="flex-1 min-w-[240px]">
                      <button
                        type="button"
                        onClick={() => onSelect(c)}
                        className="text-[16px] font-semibold text-[#111] hover:underline text-left"
                      >
                        {c.name}
                      </button>
                      {c.objective && <p className="text-[14px] text-[#555] mt-1">{c.objective}</p>}
                      <p className="text-[13.5px] text-[#888] mt-1.5">
                        <strong className="text-[#111]">Cumplimiento:</strong>{' '}
                        {pct == null ? 'sin acciones registradas' : `${pct}%`}
                      </p>
                    </div>
                    <div className="flex items-center gap-3 text-[13.5px]">
                      <span
                        className={`px-2 py-0.5 rounded-full font-semibold ${
                          STATUS[c.status]?.bg ?? 'bg-[#f5f3eb]'
                        } ${STATUS[c.status]?.text ?? 'text-[#555]'}`}
                      >
                        {c.status}
                      </span>
                      {c.drive_url ? (
                        <a
                          href={c.drive_url}
                          target="_blank"
                          rel="noreferrer"
                          className="font-semibold text-[#111] underline decoration-[#FFB800] underline-offset-2"
                        >
                          Documento
                        </a>
                      ) : (
                        c.id === lastId &&
                        canManage && (
                          <span className="text-[12.5px] font-semibold text-[#c77700]">
                            Falta el link
                          </span>
                        )
                      )}
                    </div>
                  </article>
                )
              })
            )}
          </section>
        </>
      )}
    </div>
  )
}
