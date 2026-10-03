import { useState } from 'react'
import CapturaRapida from './CapturaRapida'
import EdicionRapida from './EdicionRapida'
import { upsertLote, updatePieza } from './avPautasApi'
import {
  FORMAT_LABELS,
  FORMAT_ICONS,
  formatDayShort,
  formatTime12,
  isoDateKey,
  parseISODate,
  miTrabajo,
  disponiblesParaTomar,
  loteFor,
  planLoteChange,
  pautaErrorMessage,
} from '../../utils/audiovisual'

const DOW = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']

/**
 * Pantalla personal de un recurso (celular primero): qué tiene hoy y próximo con captura
 * de un toque, qué le falta por editar y qué cupo puede tomar. Todo escribe con los mismos
 * helpers que el detalle; solo cambia dónde se toca.
 */
export default function MiTrabajoView({
  pautas,
  piezas,
  piezasByPauta,
  usersById,
  userId,
  userName,
  today = new Date(),
  permsFor,
  companyId,
  onFields,
  onPiezaChanged,
  onPautaClick,
}) {
  const hoy = isoDateKey(today)
  const mio = miTrabajo(pautas, piezas, userId, hoy)
  const disponibles = disponiblesParaTomar(
    pautas,
    piezasByPauta,
    (p) => permsFor(p).canEditPiezas,
  ).filter(({ pauta, formato }) => {
    // Lo que ya tengo asignado aparece en "Por editar"; aquí solo lo que aún nadie tomó.
    const propio = loteFor(piezasByPauta?.get(pauta.id) ?? [], userId, formato)
    return !propio || (Number(propio.listas) || 0) >= (Number(propio.cantidad) || 0)
  })
  const d = parseISODate(hoy)

  return (
    <div className="max-w-[720px] mx-auto space-y-5">
      <header className="sticky top-0 z-10 -mx-1 px-1 py-2 bg-[#f2f0e8]/95 backdrop-blur">
        <h2 className="text-[17px] font-bold text-[#111]">
          Mi trabajo{userName ? ` · ${userName}` : ''}
        </h2>
        <p className="text-[12.5px] text-[#666]" aria-label="Resumen de la semana">
          esta semana: <strong className="text-[#111]">{mio.resumen.pautasSemana}</strong>{' '}
          {mio.resumen.pautasSemana === 1 ? 'pauta' : 'pautas'} ·{' '}
          <strong className="text-[#111]">{mio.resumen.pendientes}</strong> por editar
        </p>
      </header>

      <Seccion titulo={`Hoy, ${DOW[d.getDay()]} ${d.getDate()}`}>
        {mio.hoy.length === 0 ? (
          <Vacio>Nada para hoy.</Vacio>
        ) : (
          mio.hoy.map((p) => (
            <CapturaRapida
              key={p.id}
              pauta={p}
              userId={userId}
              usersById={usersById}
              canEdit={permsFor(p).canEditPiezas}
              canMarkRealizada={permsFor(p).canMarkRealizada}
              onFields={onFields}
              onPautaClick={onPautaClick}
            />
          ))
        )}
      </Seccion>

      {mio.pasadasSinCaptura.length > 0 && (
        <Seccion titulo="Pendiente de registrar" tono="alerta">
          <p className="text-[12.5px] text-[#c0392b] -mt-1 mb-2">
            Pautas que ya pasaron y no tienen captura registrada.
          </p>
          {mio.pasadasSinCaptura.map((p) => (
            <CapturaRapida
              key={p.id}
              pauta={p}
              userId={userId}
              usersById={usersById}
              canEdit={permsFor(p).canEditPiezas}
              canMarkRealizada={permsFor(p).canMarkRealizada}
              showDate
              onFields={onFields}
              onPautaClick={onPautaClick}
            />
          ))}
        </Seccion>
      )}

      <Seccion titulo="Próximas">
        {mio.proximas.length === 0 ? (
          <Vacio>Sin pautas próximas.</Vacio>
        ) : (
          <ul className="divide-y divide-[#f0ede4] rounded-2xl border border-[#e8e4d8] bg-white">
            {mio.proximas.map((p) => {
              const otros = (p.recurso_ids ?? [])
                .filter((id) => id !== userId)
                .map((id) => usersById?.get(id)?.first_name)
                .filter(Boolean)
              return (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => onPautaClick?.(p)}
                    className="w-full text-left px-4 py-3 min-h-[52px] flex items-center gap-3 hover:bg-[#faf9f5]"
                    aria-label={`Próxima ${p.client_name ?? ''}`}
                  >
                    <span className="font-mono text-[12px] text-[#666] w-[92px] flex-shrink-0">
                      {formatDayShort(p.pauta_date)}
                      {p.salida ? ` · ${formatTime12(p.salida).replace(' ', '')}` : ''}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[13.5px] font-semibold text-[#111] truncate">
                        {p.client_name ?? 'Sin cliente'}
                      </span>
                      <span className="block text-[11.5px] text-[#999] truncate">
                        {(p.formats ?? []).map((c) => FORMAT_ICONS[c]).join(' ')}
                        {p.lugar_tipo === 'estudio' ? ' · ◉ Estudio' : ''}
                        {otros.length ? ` · con ${otros.join(', ')}` : ''}
                      </span>
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </Seccion>

      <Seccion titulo={`Por editar (${mio.resumen.pendientes})`}>
        {mio.porEditar.length === 0 ? (
          <Vacio>No tienes piezas pendientes de edición. 🎉</Vacio>
        ) : (
          <ul className="space-y-2">
            {mio.porEditar.map(({ lote, pauta }) => (
              <EdicionRapida
                key={lote.id}
                lote={lote}
                pauta={pauta}
                onPiezaChanged={onPiezaChanged}
                onPautaClick={onPautaClick}
              />
            ))}
          </ul>
        )}
      </Seccion>

      {disponibles.length > 0 && (
        <Seccion titulo="Disponible para tomar">
          <ul className="space-y-2">
            {disponibles.map(({ pauta, formato, faltan }) => (
              <TomarRow
                key={`${pauta.id}-${formato}`}
                pauta={pauta}
                formato={formato}
                faltan={faltan}
                lote={loteFor(piezasByPauta?.get(pauta.id) ?? [], userId, formato)}
                userId={userId}
                companyId={companyId}
                onPiezaChanged={onPiezaChanged}
              />
            ))}
          </ul>
        </Seccion>
      )}
    </div>
  )
}

function TomarRow({ pauta, formato, faltan, lote, userId, companyId, onPiezaChanged }) {
  const [n, setN] = useState(faltan)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const cant = Math.max(1, Math.min(faltan, Math.round(Number(n)) || 0))

  async function tomar() {
    const plan = planLoteChange({ lote, key: 'cantidad', delta: cant, max: faltan })
    if (plan.action === 'noop') return
    setError(null)
    setBusy(true)
    const { data, error: err } =
      plan.action === 'insert'
        ? await upsertLote(companyId, pauta.id, userId, formato, plan.fields, null)
        : await updatePieza(lote.id, plan.fields)
    setBusy(false)
    if (err) setError(pautaErrorMessage(err))
    else if (data) onPiezaChanged(data)
  }

  return (
    <li className="rounded-2xl border border-dashed border-[#d9d4c4] bg-[#fcfbf7] px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[14px] font-bold text-[#111] truncate">
            {pauta.client_name ?? 'Sin cliente'}
            <span className="font-mono font-normal text-[12px] text-[#999]">
              {pauta.pauta_date ? ` · ${formatDayShort(pauta.pauta_date)}` : ''}
            </span>
          </p>
          <p className="text-[12.5px] text-[#666]">
            {FORMAT_ICONS[formato]} {FORMAT_LABELS[formato]} · faltan{' '}
            <strong className="text-[#111]">{faltan}</strong> por asignar
          </p>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <input
            type="number"
            min={1}
            max={faltan}
            value={n}
            onChange={(e) => setN(e.target.value)}
            aria-label={`Cuántas tomar de ${FORMAT_LABELS[formato]} de ${pauta.client_name ?? ''}`}
            className="input-base w-16 min-h-[44px] text-center font-mono"
          />
          <button
            type="button"
            disabled={busy}
            onClick={tomar}
            className="min-h-[44px] px-3 rounded-xl bg-[#111] text-[#FFB800] text-[13px] font-bold hover:bg-[#222] disabled:opacity-40"
          >
            Tomar {cant}
          </button>
        </div>
      </div>
      {error && (
        <div
          className="mt-2 px-3 py-2 rounded-lg bg-red-50 text-red-700 text-[12.5px]"
          role="alert"
        >
          {error}
        </div>
      )}
    </li>
  )
}

function Seccion({ titulo, tono, children }) {
  return (
    <section aria-label={titulo}>
      <h3
        className={`text-[11.5px] font-mono font-bold uppercase tracking-[0.12em] mb-2 ${
          tono === 'alerta' ? 'text-[#c0392b]' : 'text-[#999]'
        }`}
      >
        {titulo}
      </h3>
      <div className="space-y-2">{children}</div>
    </section>
  )
}

function Vacio({ children }) {
  return (
    <p className="text-[13px] text-[#bbb] rounded-2xl border border-dashed border-[#e0ddd4] px-4 py-4 text-center">
      {children}
    </p>
  )
}
