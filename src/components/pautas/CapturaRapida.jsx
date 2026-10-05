import { useState } from 'react'
import Stepper from '../common/Stepper'
import {
  FORMAT_KEYS,
  FORMAT_LABELS,
  FORMAT_ICONS,
  FOTO_FORMAT,
  formatTime12,
  formatDayShort,
  lugarLabel,
  grabacionPorFormato,
  setGrabacionCount,
  syncRecursoIds,
  syncSalieronFromGrabacion,
  pautaErrorMessage,
} from '../../utils/audiovisual'

/**
 * Tarjeta de una pauta propia con un contador grande por formato: cuántas piezas capturó
 * ESTE recurso. Escribe exactamente igual que la sección Captura del detalle
 * (`setGrabacionCount` + `syncSalieronFromGrabacion` + `syncRecursoIds`), solo cambia dónde
 * se toca. Si la pauta sigue "programada" y ya pasó, ofrece marcarla realizada a quien puede.
 */
export default function CapturaRapida({
  pauta,
  userId,
  usersById,
  canEdit,
  canMarkRealizada,
  showDate = false,
  onFields,
  onPautaClick,
}) {
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const activeFormats = FORMAT_KEYS.filter((code) => (pauta.formats ?? []).includes(code))
  const reparto = grabacionPorFormato(pauta)
  const otros = (pauta.recurso_ids ?? [])
    .filter((id) => id !== userId)
    .map((id) => usersById?.get(id)?.first_name)
    .filter(Boolean)

  async function write(fields) {
    setError(null)
    setBusy(true)
    const { error: err } = (await onFields(pauta, fields)) ?? {}
    setBusy(false)
    if (err) setError(pautaErrorMessage(err))
  }

  function cambiar(code, delta) {
    const actual = reparto[code]?.[userId] ?? 0
    const nextGrabacion = setGrabacionCount(pauta, code, userId, actual + delta)
    const fields = {
      grabacion_por_formato: nextGrabacion,
      piezas_por_formato: syncSalieronFromGrabacion(pauta, nextGrabacion),
    }
    const nextRecursoIds = syncRecursoIds(pauta, nextGrabacion)
    if (nextRecursoIds) fields.recurso_ids = nextRecursoIds
    return write(fields)
  }

  return (
    <article
      className={`rounded-2xl border bg-white px-4 py-3 ${
        pauta.lugar_tipo === 'estudio' ? 'border-[#d6e4ff]' : 'border-[#e8e4d8]'
      }`}
      aria-label={`Pauta ${pauta.client_name ?? ''}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-mono text-[12px] text-[#666]">
            {showDate && pauta.pauta_date ? `${formatDayShort(pauta.pauta_date)} · ` : ''}
            {pauta.salida ? formatTime12(pauta.salida) : 'sin hora'} ·{' '}
            {pauta.lugar_tipo === 'estudio' ? '◉ ' : ''}
            {lugarLabel(pauta)}
          </p>
          <h3 className="text-[16px] font-bold text-[#111] truncate">
            {pauta.client_name ?? 'Sin cliente'}
          </h3>
          {(pauta.tema || otros.length > 0) && (
            <p className="text-[12.5px] text-[#888] truncate">
              {pauta.tema}
              {pauta.tema && otros.length > 0 ? ' · ' : ''}
              {otros.length > 0 ? `con ${otros.join(', ')}` : ''}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={() => onPautaClick?.(pauta)}
          className="flex-shrink-0 min-h-[44px] px-3 text-[12.5px] font-semibold text-[#2563eb] hover:underline"
        >
          ver pauta
        </button>
      </div>

      {error && (
        <div
          className="mt-2 px-3 py-2 rounded-lg bg-red-50 text-red-700 text-[12.5px]"
          role="alert"
        >
          {error}
        </div>
      )}

      {activeFormats.length === 0 ? (
        <p className="mt-2 text-[12.5px] text-[#999]">Esta pauta no tiene formatos marcados.</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {activeFormats.map((code) => {
            const esFoto = code === FOTO_FORMAT
            const mias = reparto[code]?.[userId] ?? 0
            const total = Object.values(reparto[code] ?? {}).reduce((s, n) => s + n, 0)
            const label = `${esFoto ? 'capturadas' : 'grabadas'} de ${FORMAT_LABELS[code]}`
            return (
              <li
                key={code}
                className="flex items-center justify-between gap-3 rounded-xl bg-[#faf9f5] px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="text-[13.5px] font-semibold text-[#111]">
                    {FORMAT_ICONS[code]} {FORMAT_LABELS[code]}
                  </p>
                  <p className="text-[11.5px] text-[#999]">
                    {esFoto ? 'capturadas' : 'grabadas'} por ti
                    {total > mias ? ` · ${total} en total` : ''}
                  </p>
                </div>
                {canEdit ? (
                  <BigStepper value={mias} label={label} onChange={(d) => cambiar(code, d)} />
                ) : (
                  <span className="font-mono text-[18px] font-bold text-[#111]">{mias}</span>
                )}
              </li>
            )
          })}
        </ul>
      )}

      {canMarkRealizada && pauta.status === 'programada' && (
        <button
          type="button"
          disabled={busy}
          onClick={() => write({ status: 'realizada' })}
          className="mt-3 w-full min-h-[44px] rounded-xl bg-[#111] text-[#FFB800] text-[13.5px] font-bold hover:bg-[#222] disabled:opacity-40"
        >
          ✓ Marcar realizada
        </button>
      )}
    </article>
  )
}

/**
 * −/valor/+ con botones de 44px para el celular. El valor se puede escribir (80 fotos sin
 * 80 toques); `onChange(delta)` es relativo y `Stepper` ya serializa las escrituras.
 */
export function BigStepper({ value, onChange, label, max }) {
  return (
    <span className="flex-shrink-0">
      <Stepper size="lg" value={value} max={max} label={label} onChange={onChange} />
    </span>
  )
}
