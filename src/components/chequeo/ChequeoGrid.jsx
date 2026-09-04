import { useState, Fragment } from 'react'
import { upsertCheck } from './chequeoApi'
import NetworkIcon from '../common/NetworkIcon'
import {
  CONTENT_TYPES,
  CONTENT_LABELS,
  mostRecentCheck,
  recentCheckStatus,
  formatCheckDate,
  contentTypeApplies,
  computeChequeoSummary,
  periodEndDate,
  checkReferenceDate,
  effectiveLineId,
  clientsForLine,
} from '../../utils/chequeo'

/**
 * Semáforo de ambas vistas: días transcurridos desde la fecha registrada hasta la fecha
 * de referencia del período activo (ver `recentCheckStatus`/`checkReferenceDate` en
 * utils/chequeo.js). La fecha de cada celda es libre (puede ser de otra semana o de otro
 * mes — es un registro histórico, no una validación), así que el color nunca depende de
 * en qué casilla quedó guardada, solo de cuántos días pasaron. Un período (semana o mes)
 * que ya cerró queda congelado en cómo se veía al cerrar — no se recalcula contra la
 * fecha real cada vez que alguien revisa el histórico después.
 */
const RECENT_STATUS_META = {
  vacio: {
    label: 'Sin registrar este mes',
    dot: '#d8d4c8',
    cls: 'bg-white border-[#e6e2d8] text-[#9a9488]',
  },
  normal: {
    label: 'Al día (0-6 días)',
    dot: '#1f8a43',
    cls: 'bg-[#e9f7ec] border-[#bfe6c8] text-[#1f8a43]',
  },
  naranja: {
    label: '7-12 días sin publicar',
    dot: '#e08a1e',
    cls: 'bg-[#fdf1e2] border-[#f2d6a8] text-[#b3690f]',
  },
  rojo: {
    label: '13+ días sin publicar',
    dot: '#c0392b',
    cls: 'bg-[#fdecec] border-[#f4c9c9] text-[#c0392b]',
  },
}

/**
 * Redes sociales de un cliente con su URL (metric_clients.social_links: [{red, link}]),
 * tolerante a datos faltantes o mal formados. Conserva el `link` para que el nombre de
 * la red sea clickeable y lleve directo al perfil.
 */
function clientSocialLinks(client) {
  if (!Array.isArray(client?.social_links)) return []
  return client.social_links.filter((s) => typeof s?.red === 'string' && s.red.length > 0)
}

/**
 * Editor de la celda de Mailchimp: a diferencia del resto de las redes (una sola
 * fecha, guardado instantáneo al elegirla), Mailchimp exige fecha + comentario juntos
 * — la fecha es decorativa (Mailchimp está exenta del semáforo semanal, ver
 * WEEKLY_EXEMPT_NETWORKS en utils/chequeo.js) y el comentario es el dato útil, así que
 * no hay nada que guardar hasta tener ambos.
 */
function MailchimpEditor({ defaultDate, defaultComment, disabled, onSave, onCancel }) {
  const [date, setDate] = useState(defaultDate)
  const [comment, setComment] = useState(defaultComment)
  const canSave = Boolean(date) && comment.trim().length > 0

  return (
    <div className="flex flex-col gap-1">
      <input
        type="date"
        autoFocus
        value={date}
        disabled={disabled}
        onChange={(e) => setDate(e.target.value)}
        className="input-base text-[12px] py-1 px-1.5 w-full"
      />
      <input
        type="text"
        placeholder="Comentario…"
        value={comment}
        disabled={disabled}
        onChange={(e) => setComment(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') onCancel()
          if (e.key === 'Enter' && canSave) onSave(date, comment.trim())
        }}
        className="input-base text-[12px] py-1 px-1.5 w-full"
      />
      <div className="flex gap-1">
        <button
          type="button"
          disabled={disabled || !canSave}
          onClick={() => onSave(date, comment.trim())}
          className="flex-1 h-[24px] rounded-md bg-[#111] text-white text-[11px] font-semibold disabled:opacity-40"
        >
          Guardar
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={onCancel}
          className="flex-1 h-[24px] rounded-md border border-[#e0ddd4] text-[#666] text-[11px] font-semibold"
        >
          Cancelar
        </button>
      </div>
    </div>
  )
}

/**
 * Grilla `cliente/red × tipo de contenido` de la semana activa (módulo Chequeo,
 * periodizado por mes y semana fija — mismo concepto de semana que Tareas Fijas). Cada
 * celda es una fecha (no un estado cíclico): un clic la vuelve editable
 * (`<input type="date">`, sin acotar — la fecha es libre, puede ser de otra semana o de
 * otro mes, es un registro histórico de cuándo se publicó, no una validación de "esta
 * semana"), y el color es días transcurridos hasta hoy (`recentCheckStatus`, misma
 * lógica que la vista "Más reciente"). Cualquier semana es editable, histórico incluido,
 * sin paso de confirmación extra.
 *
 * Props:
 *   lines, clients — roster ya acotado al alcance activo
 *   checks         — publication_checks del mes activo (ya filtradas por línea en la página)
 *   weeks          — buildFixedWeeks(year, month)
 *   weekN          — semana activa (1-indexado)
 *   year, month    — período activo, para calcular la fecha de cierre del semáforo
 *                    (`periodEndDate`/`checkReferenceDate`)
 *   viewMode       — 'week' (default, editable) | 'recent' (solo lectura, ver abajo)
 *   canManage      — si el usuario puede editar (capability chequeo.manage)
 *   onCheckChanged(check) — { ...row } al crear/actualizar
 *   groupByLine    — si true, agrupa las filas por línea
 *   generalLineId  — id de la línea general "Independientes" (metric_lines.is_general), si
 *                    existe; las cuentas sin línea (line_id=null) se agrupan y guardan ahí
 *                    (ver effectiveLineId/clientsForLine en utils/chequeo.js)
 *
 * `viewMode='recent'` reemplaza la grilla semanal por una vista de solo lectura: cada
 * celda muestra la fecha más reciente registrada en cualquier semana del mes activo
 * (`mostRecentCheck`, ignora `period_week`) en vez de la semana seleccionada — útil para
 * ver de un vistazo "cuándo publicó por última vez esta cuenta" sin tener que recorrer
 * S1…Sn una por una. Sin edición: es puramente informativa.
 */
export default function ChequeoGrid({
  lines,
  clients,
  checks,
  weeks,
  weekN,
  year,
  month,
  viewMode = 'week',
  companyId,
  canManage,
  userId,
  onCheckChanged,
  groupByLine,
  generalLineId = null,
}) {
  const [editingKey, setEditingKey] = useState(null)
  const [savingKey, setSavingKey] = useState(null)
  const [error, setError] = useState(null)

  const isRecentView = viewMode === 'recent'
  // Semáforo fijo por período: mientras la semana/mes activo no cierre, el color sigue en
  // vivo; una vez cerrado queda congelado en cómo se veía ese día (ver checkReferenceDate).
  const referenceDate = checkReferenceDate(
    periodEndDate(weeks, isRecentView ? null : weekN, year, month),
  )
  const week = weeks.find((w) => w.n === weekN)
  const canEditNow = !isRecentView && canManage && Boolean(week)

  function findCheck(clientId, network, contentType) {
    if (isRecentView) return mostRecentCheck(checks, clientId, network, contentType)
    return checks.find(
      (c) =>
        c.client_id === clientId &&
        c.network === network &&
        c.content_type === contentType &&
        c.period_week === weekN,
    )
  }

  async function saveDate(client, network, contentType, value, comment) {
    if (!canEditNow) return
    const key = `${client.id}:${network}:${contentType}`
    setSavingKey(key)
    setError(null)
    const { data, error: err } = await upsertCheck({
      companyId,
      clientId: client.id,
      lineId: effectiveLineId(client, generalLineId),
      network,
      contentType,
      lastPublishedAt: value || null,
      comment,
      periodYear: week.wed.getFullYear(),
      periodMonth: week.wed.getMonth() + 1,
      periodWeek: weekN,
      userId,
    })
    if (err) setError(err.message)
    else onCheckChanged(data)
    setSavingKey(null)
    setEditingKey(null)
  }

  const groups = groupByLine ? lines : [{ id: '__single__', name: null }]
  const colCount = 1 + CONTENT_TYPES.length

  return (
    <div className="bg-white border border-[#e0ddd4] rounded-xl overflow-hidden mb-4">
      {error && (
        <div className="bg-red-50 border-b border-red-200 text-red-700 text-[13px] px-4 py-2.5">
          {error}
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full border-collapse min-w-[560px] sm:min-w-[720px]">
          <thead>
            <tr className="bg-[#faf8f2] border-b border-[#eee9dd]">
              <th className="sticky left-0 z-[2] bg-[#faf8f2] text-left text-[12px] font-mono uppercase tracking-wide text-[#a29b8c] font-medium px-2 py-3 min-w-[150px] sm:px-4 sm:min-w-[260px]">
                Cuenta / Red
              </th>
              {CONTENT_TYPES.map((ct) => (
                <th
                  key={ct}
                  className="text-center px-1.5 py-2.5 min-w-[110px] sm:px-2 sm:min-w-[150px] bg-[#faf8f2] text-[13px] font-semibold text-[#333]"
                >
                  {CONTENT_LABELS[ct]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {groups.map((group) => {
              const rowsClients = (
                groupByLine ? clientsForLine(clients, group, generalLineId) : clients
              )
                .slice()
                .sort((a, b) => a.name.localeCompare(b.name, 'es'))
              if (groupByLine && rowsClients.length === 0) return null
              const lineSummary = groupByLine
                ? computeChequeoSummary(rowsClients, checks, {
                    weekN: isRecentView ? null : weekN,
                    today: referenceDate,
                  })
                : null
              return (
                <Fragment key={group.id}>
                  {groupByLine && (
                    <tr className="bg-[#faf8f2] border-b border-t border-[#eee9dd]">
                      <td colSpan={colCount} className="px-2 py-2 sm:px-4">
                        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
                          <span className="text-[14.5px] font-bold text-[#111]">{group.name}</span>
                          <span className="text-[12px] text-[#777]">
                            <b className="text-[#1f8a43]">{lineSummary.actualizadas}</b> al día ·{' '}
                            <b className="text-[#111]">{lineSummary.parciales}</b> parciales ·{' '}
                            <b className="text-[#888]">{lineSummary.sinRegistrar}</b> sin registrar
                            {lineSummary.enAlerta > 0 && (
                              <>
                                {' · '}
                                <b className="text-[#c0392b]">{lineSummary.enAlerta}</b> en alerta
                              </>
                            )}
                          </span>
                        </div>
                      </td>
                    </tr>
                  )}
                  {rowsClients.map((client) => {
                    const socials = clientSocialLinks(client)
                    return (
                      <Fragment key={client.id}>
                        {/* Fila de marca: ancho completo, fondo un poco más oscuro,
                            separada de las filas de redes sociales. */}
                        <tr className="bg-[#f2efe6]">
                          <td colSpan={colCount} className="px-2 py-2 sm:px-4">
                            <div className="flex items-center gap-2">
                              {client.logo_url ? (
                                <img
                                  src={client.logo_url}
                                  alt={client.name}
                                  className="w-6 h-6 rounded-full object-cover flex-shrink-0 border border-[#dcd8ca]"
                                />
                              ) : (
                                <span className="w-6 h-6 rounded-full bg-[#e6e2d3] flex items-center justify-center flex-shrink-0 text-[11px] font-bold text-[#8a8471] uppercase">
                                  {client.name[0]}
                                </span>
                              )}
                              <span className="text-[13.5px] font-semibold text-[#222] leading-tight">
                                {client.name}
                              </span>
                            </div>
                          </td>
                        </tr>

                        {socials.length === 0 ? (
                          <tr className="border-b border-[#f2efe6]">
                            <td
                              className="px-2 py-2.5 sm:px-4 text-[13px] text-[#888]"
                              colSpan={colCount}
                            >
                              Sin redes sociales cargadas en su ficha
                            </td>
                          </tr>
                        ) : (
                          socials.map(({ red: network, link }) => (
                            <tr
                              key={`${client.id}-${network}`}
                              className="border-b border-[#f2efe6] hover:bg-[#fcfbf6]"
                            >
                              <td className="sticky left-0 z-[1] bg-white px-2 py-2 sm:px-4 min-w-[150px] sm:min-w-[260px]">
                                <div className="text-[12.5px] text-[#777] flex items-center justify-end gap-1.5">
                                  <NetworkIcon network={network} size={20} />
                                  {link ? (
                                    <a
                                      href={link}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="hover:text-[#111] hover:underline"
                                    >
                                      {network}
                                    </a>
                                  ) : (
                                    network
                                  )}
                                </div>
                              </td>
                              {CONTENT_TYPES.map((contentType) => {
                                if (!contentTypeApplies(network, contentType)) {
                                  return (
                                    <td
                                      key={contentType}
                                      className="px-1.5 sm:px-2 py-2 text-center align-top"
                                    >
                                      <div
                                        className="w-full h-[34px] rounded-lg border border-dashed border-[#e0dccf] bg-[#f7f5ef] flex items-center justify-center text-[#c3bcac]"
                                        title="No aplica en esta red"
                                      >
                                        —
                                      </div>
                                    </td>
                                  )
                                }
                                const check = findCheck(client.id, network, contentType)
                                const meta =
                                  RECENT_STATUS_META[
                                    recentCheckStatus(
                                      check?.last_published_at,
                                      network,
                                      referenceDate,
                                    )
                                  ]
                                const key = `${client.id}:${network}:${contentType}`
                                const isEditing = !isRecentView && editingKey === key
                                const isMailchimp = network === 'Mailchimp'
                                const title = check?.comment
                                  ? `${meta.label} · ${check.comment}`
                                  : isRecentView
                                    ? check
                                      ? `${meta.label} (semana ${check.period_week})`
                                      : meta.label
                                    : canEditNow
                                      ? meta.label
                                      : `${meta.label} (solo lectura)`
                                return (
                                  <td
                                    key={contentType}
                                    className="px-1.5 sm:px-2 py-2 text-center align-top"
                                  >
                                    {isEditing ? (
                                      isMailchimp ? (
                                        <MailchimpEditor
                                          defaultDate={check?.last_published_at ?? ''}
                                          defaultComment={check?.comment ?? ''}
                                          disabled={savingKey === key}
                                          onSave={(date, comment) =>
                                            saveDate(client, network, contentType, date, comment)
                                          }
                                          onCancel={() => setEditingKey(null)}
                                        />
                                      ) : (
                                        <input
                                          type="date"
                                          autoFocus
                                          defaultValue={check?.last_published_at ?? ''}
                                          disabled={savingKey === key}
                                          onChange={(e) =>
                                            saveDate(client, network, contentType, e.target.value)
                                          }
                                          onKeyDown={(e) => {
                                            if (e.key === 'Escape') setEditingKey(null)
                                          }}
                                          className="input-base text-[12px] py-1 px-1.5 w-full"
                                        />
                                      )
                                    ) : (
                                      <button
                                        type="button"
                                        disabled={!canEditNow || savingKey === key}
                                        onClick={() => canEditNow && setEditingKey(key)}
                                        title={title}
                                        className={`w-full h-[34px] rounded-lg border flex items-center justify-center gap-1.5 text-[13px] font-semibold transition-all ${meta.cls} ${
                                          canEditNow
                                            ? 'cursor-pointer hover:opacity-80'
                                            : 'cursor-default'
                                        }`}
                                      >
                                        <span
                                          className="w-[7px] h-[7px] rounded-full"
                                          style={{ background: meta.dot }}
                                        />
                                        {formatCheckDate(check?.last_published_at) ?? '—'}
                                      </button>
                                    )}
                                  </td>
                                )
                              })}
                            </tr>
                          ))
                        )}
                      </Fragment>
                    )
                  })}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 px-4 py-3 border-t border-[#eee9dd] text-[12.5px] text-[#777]">
        <span className="font-mono uppercase tracking-wide text-[#a29b8c] text-[11px]">
          {isRecentView
            ? 'Solo lectura · días desde la última publicación'
            : canEditNow
              ? 'Clic en una fecha para registrarla · color por días desde hoy'
              : 'Solo lectura · color por días desde hoy'}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-[7px] h-[7px] rounded-full bg-[#1f8a43]" /> Al día (0-6 días)
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-[7px] h-[7px] rounded-full bg-[#e08a1e]" /> 7-12 días sin publicar
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-[7px] h-[7px] rounded-full bg-[#c0392b]" /> 13+ días sin publicar
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-[7px] h-[7px] rounded-full bg-[#d8d4c8]" /> Sin registrar
        </span>
      </div>
    </div>
  )
}
