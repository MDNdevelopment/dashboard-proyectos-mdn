import { useState } from 'react'
import Stepper from '../common/Stepper'
import {
  FORMAT_KEYS,
  FORMAT_LABELS,
  FORMAT_ICONS,
  FOTO_FORMAT,
  grabacionPorFormato,
  setGrabacionCount,
  syncRecursoIds,
  syncSalieronFromGrabacion,
  editorLabel,
  pautaErrorMessage,
} from '../../utils/audiovisual'

/**
 * Captura: cuántas piezas de cada formato registró cada recurso (`grabacion_por_formato`).
 * "Salieron" de cada formato ya no se escribe a mano: es la suma de esta matriz y se
 * persiste en `piezas_por_formato[c].salieron` en la misma llamada (ver
 * `syncSalieronFromGrabacion`) para que Reportes y los contadores de BD sigan leyéndolo.
 */
export default function CapturaSection({ pauta, recursoUsers, usersById, canEdit, onFields }) {
  const [error, setError] = useState(null)
  const [pickerFormat, setPickerFormat] = useState(null)
  const activeFormats = FORMAT_KEYS.filter((code) => (pauta.formats ?? []).includes(code))
  const reparto = grabacionPorFormato(pauta)

  async function save(code, resourceId, value) {
    setError(null)
    const nextGrabacion = setGrabacionCount(pauta, code, resourceId, value)
    const fields = {
      grabacion_por_formato: nextGrabacion,
      piezas_por_formato: syncSalieronFromGrabacion(pauta, nextGrabacion),
    }
    const nextRecursoIds = syncRecursoIds(pauta, nextGrabacion)
    if (nextRecursoIds) fields.recurso_ids = nextRecursoIds
    const { error: err } = (await onFields(pauta, fields)) ?? {}
    if (err) setError(pautaErrorMessage(err))
  }

  function addResource(code, resourceId) {
    setPickerFormat(null)
    if (!resourceId) return
    save(code, resourceId, (reparto[code]?.[resourceId] ?? 0) + 1)
  }

  if (activeFormats.length === 0) {
    return (
      <Block title="Captura">
        <p className="text-[12.5px] text-[#999]">
          Esta pauta no tiene formatos marcados. Edítala para indicar qué se graba.
        </p>
      </Block>
    )
  }

  return (
    <Block title="Captura" hint="quién capturó cuántas piezas">
      {error && (
        <div
          className="mb-3 px-3 py-2 rounded-lg bg-red-50 text-red-700 text-[12.5px]"
          role="alert"
        >
          {error}
        </div>
      )}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {activeFormats.map((code) => {
          const esFoto = code === FOTO_FORMAT
          const entries = Object.entries(reparto[code] ?? {})
          const salieron = entries.reduce((s, [, n]) => s + n, 0)
          const available = (recursoUsers ?? []).filter(
            (u) => !u.deleted_at && !(reparto[code] ?? {})[u.user_id],
          )
          return (
            <div key={code} className="rounded-xl border border-[#ece9df] bg-[#fcfbf7] p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[13px] font-semibold text-[#111]">
                  {FORMAT_ICONS[code]} {FORMAT_LABELS[code]}
                </span>
                <span className="text-[11px] font-mono text-[#999]">
                  salieron <strong className="text-[#111]">{salieron}</strong>
                </span>
              </div>
              {entries.length === 0 && (
                <p className="text-[12px] text-[#bbb] mb-1">
                  {esFoto ? 'Nadie ha registrado capturas.' : 'Nadie ha registrado grabación.'}
                </p>
              )}
              <ul className="space-y-1.5">
                {entries.map(([resourceId, count]) => (
                  <li key={resourceId} className="flex items-center gap-2">
                    <span className="text-[12.5px] text-[#333] flex-1 truncate">
                      {editorLabel(resourceId, usersById)}
                    </span>
                    {canEdit ? (
                      <Stepper
                        value={count}
                        onChange={(delta) => save(code, resourceId, count + delta)}
                        label={`${esFoto ? 'capturadas' : 'grabadas'} de ${FORMAT_LABELS[code]} por ${editorLabel(resourceId, usersById)}`}
                      />
                    ) : (
                      <span className="font-mono text-[13px] font-semibold">{count}</span>
                    )}
                  </li>
                ))}
              </ul>
              {canEdit &&
                (pickerFormat === code ? (
                  <select
                    autoFocus
                    className="input-base input-compact mt-2"
                    aria-label={`Agregar recurso de ${FORMAT_LABELS[code]}`}
                    onChange={(e) => addResource(code, e.target.value)}
                    onBlur={() => setPickerFormat(null)}
                    defaultValue=""
                  >
                    <option value="" disabled>
                      Elegir recurso…
                    </option>
                    {available.map((u) => (
                      <option key={u.user_id} value={u.user_id}>
                        {u.first_name} {u.last_name}
                      </option>
                    ))}
                  </select>
                ) : (
                  <button
                    type="button"
                    onClick={() => setPickerFormat(code)}
                    className="text-[11.5px] font-semibold text-[#2563eb] hover:underline mt-2"
                  >
                    + agregar recurso
                  </button>
                ))}
            </div>
          )
        })}
      </div>
    </Block>
  )
}

export function Block({ title, hint, children, right }) {
  return (
    <section className="border-t border-[#eeebe0] pt-4">
      <div className="flex items-center justify-between mb-3">
        <p className="text-[12px] font-mono font-bold tracking-[0.14em] uppercase text-[#777]">
          {title}
          {hint && (
            <span className="ml-2 font-normal normal-case tracking-normal text-[#aaa]">{hint}</span>
          )}
        </p>
        {right}
      </div>
      {children}
    </section>
  )
}
