import { useState } from 'react'
import AttendeePicker from '../reuniones/AttendeePicker'
import PautaCuandoDondeFields from './PautaCuandoDondeFields'
import { createPauta, updatePauta } from './avPautasApi'
import {
  FORMAT_KEYS,
  FORMAT_LABELS,
  FORMAT_ICONS,
  briefComplete,
  estudioConflicts,
  pautaErrorMessage,
} from '../../utils/audiovisual'

const FIELDS = [
  'client_id',
  'tema',
  'formats',
  'requirements',
  'link',
  'piezas_desc',
  'pauta_date',
  'salida',
  'llegada',
  'lugar_tipo',
  'place',
  'attendee_ids',
  'extra',
]

function initialValues(pauta) {
  return {
    client_id: pauta?.client_id ?? null,
    tema: pauta?.tema ?? '',
    formats: pauta?.formats ?? [],
    requirements: pauta?.requirements ?? '',
    link: pauta?.link ?? '',
    piezas_desc: pauta?.piezas_desc ?? '',
    pauta_date: pauta?.pauta_date ?? null,
    salida: pauta?.salida ?? null,
    llegada: pauta?.llegada ?? null,
    lugar_tipo: pauta?.lugar_tipo ?? 'locacion',
    place: pauta?.place ?? '',
    attendee_ids: pauta?.attendee_ids ?? [],
    extra: Boolean(pauta?.extra),
  }
}

function sameValue(a, b) {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null)
}

/**
 * Formulario de solicitud de pauta (crear) y de edición del brief (editar). Convención:
 * `pauta === null` crea; un objeto edita. Al crear se inserta ya enviada a coordinación
 * (`status: 'solicitada', submitted: true`). En una pauta ya programada/realizada la fecha,
 * hora y lugar no se tocan desde aquí — para eso está "Reagendar" en el detalle.
 */
export default function PautaFormModal({
  pauta = null,
  clients,
  employees,
  pautas,
  companyId,
  userId,
  defaultLineId = null,
  onClose,
  onSaved,
}) {
  const isEdit = pauta != null
  const [values, setValues] = useState(() => initialValues(pauta))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const lockSchedule = isEdit && pauta.status !== 'solicitada'

  const set = (field, v) => setValues((prev) => ({ ...prev, [field]: v }))

  const esEstudio = values.lugar_tipo === 'estudio'
  const conflicts = esEstudio
    ? estudioConflicts(pautas ?? [], {
        date: values.pauta_date,
        salida: values.salida,
        clientId: values.client_id,
        excludeId: pauta?.id ?? null,
      })
    : { blocking: [], warnings: [] }
  const missingStudioTime = esEstudio && !lockSchedule && (!values.pauta_date || !values.salida)
  const complete = briefComplete(values)
  const canSave = complete && !missingStudioTime && conflicts.blocking.length === 0 && !saving

  const blockers = []
  if (!values.client_id) blockers.push('elige el cliente')
  if (complete === false && values.client_id) blockers.push('escribe de qué trata la pauta')
  if (missingStudioTime) blockers.push('el estudio necesita fecha y hora de salida')
  if (conflicts.blocking.length > 0) blockers.push('el estudio está ocupado a esa hora')

  async function handleSubmit(e) {
    e.preventDefault()
    if (!canSave) return
    setSaving(true)
    setError(null)
    let result
    if (isEdit) {
      const changed = {}
      FIELDS.forEach((f) => {
        if (lockSchedule && ['pauta_date', 'salida', 'llegada', 'lugar_tipo', 'place'].includes(f))
          return
        if (!sameValue(values[f], initialValues(pauta)[f])) changed[f] = values[f]
      })
      if (Object.keys(changed).length === 0) {
        setSaving(false)
        onClose()
        return
      }
      result = await updatePauta(pauta.id, changed)
    } else {
      result = await createPauta(
        companyId,
        { ...values, status: 'solicitada', submitted: true },
        userId,
        defaultLineId,
      )
    }
    setSaving(false)
    if (result.error) {
      setError(pautaErrorMessage(result.error))
      return
    }
    onSaved(result.data)
  }

  const sortedClients = [...(clients ?? [])]
    .filter((c) => !c.deleted_at || c.id === values.client_id)
    .sort((a, b) => (a.name ?? '').localeCompare(b.name ?? '', 'es', { sensitivity: 'base' }))

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-sm bg-black/30">
      <form
        onSubmit={handleSubmit}
        className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col"
        aria-label={isEdit ? 'Editar pauta' : 'Solicitar pauta'}
      >
        <div className="flex-shrink-0 px-6 pt-5 pb-4 border-b border-[#ece9df] flex items-center justify-between">
          <div>
            <h2 className="text-[17px] font-bold text-[#111]">
              {isEdit ? 'Editar pauta' : 'Solicitar pauta'}
            </h2>
            <p className="text-[12.5px] text-[#888] mt-0.5">
              {isEdit
                ? 'Corrige el brief. Fecha y hora de una pauta ya agendada se cambian con "Reagendar".'
                : 'Coordinación recibirá la solicitud y la agendará con los recursos disponibles.'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="w-8 h-8 flex items-center justify-center rounded-full text-[#888] hover:bg-[#f2f0e8] hover:text-[#111]"
          >
            ✕
          </button>
        </div>

        <div className="px-6 py-5 space-y-6 overflow-y-auto flex-1">
          {error && (
            <div className="bg-red-50 text-red-700 text-[13px] px-3 py-2 rounded-lg" role="alert">
              {error}
            </div>
          )}

          <Section title="Cliente">
            <select
              className="input-base"
              aria-label="Cliente"
              value={values.client_id ?? ''}
              onChange={(e) => set('client_id', e.target.value || null)}
            >
              <option value="">Elige el cliente…</option>
              {sortedClients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Section>

          <Section title="Qué se graba">
            <div className="flex gap-1.5 mb-3" role="group" aria-label="Formatos">
              {FORMAT_KEYS.map((code) => {
                const on = values.formats.includes(code)
                return (
                  <button
                    key={code}
                    type="button"
                    aria-pressed={on}
                    onClick={() =>
                      set(
                        'formats',
                        on ? values.formats.filter((c) => c !== code) : [...values.formats, code],
                      )
                    }
                    className={`px-3 py-1.5 rounded-lg text-[13px] font-semibold border transition-colors ${
                      on
                        ? 'bg-[#111] border-[#111] text-[#FFB800]'
                        : 'bg-white border-[#e0ddd4] text-[#555] hover:border-[#111]'
                    }`}
                  >
                    {FORMAT_ICONS[code]} {FORMAT_LABELS[code]}
                  </button>
                )
              })}
            </div>
            <input
              className="input-base"
              aria-label="De qué trata"
              value={values.tema}
              onChange={(e) => set('tema', e.target.value)}
              placeholder="De qué trata (tema / concepto) *"
            />
            <textarea
              className="input-base mt-2"
              rows={2}
              aria-label="Requerimientos"
              value={values.requirements}
              onChange={(e) => set('requirements', e.target.value)}
              placeholder="Requerimientos: herramientas, ropa, modelo, props…"
            />
            <input
              className="input-base mt-2"
              aria-label="Enlace de la grilla"
              value={values.link}
              onChange={(e) => set('link', e.target.value)}
              placeholder="Enlace de la grilla (Drive) — debe estar 2 días antes de la pauta"
            />
            <textarea
              className="input-base mt-2"
              rows={2}
              aria-label="Descripción de piezas"
              value={values.piezas_desc}
              onChange={(e) => set('piezas_desc', e.target.value)}
              placeholder="Piezas esperadas, si no hay grilla. Ej: 3 reels — promo, testimonio, producto"
            />
            <label className="flex items-center gap-2 mt-2 text-[12.5px] text-[#555] cursor-pointer select-none">
              <input
                type="checkbox"
                checked={values.extra}
                onChange={(e) => set('extra', e.target.checked)}
              />
              Pauta extra (fuera del plan mensual)
            </label>
          </Section>

          <Section title="Cuándo y dónde">
            {lockSchedule ? (
              <p className="text-[12.5px] text-[#888]">
                Esta pauta ya está agendada. Usa <b>Reagendar</b> en el detalle para cambiar la
                fecha, la hora o el lugar.
              </p>
            ) : (
              <PautaCuandoDondeFields
                value={values}
                onChange={set}
                pautas={pautas ?? []}
                clientId={values.client_id}
                excludeId={pauta?.id ?? null}
                dateLabel={isEdit ? 'Fecha' : 'Fecha deseada'}
              />
            )}
          </Section>

          <Section title="Asistentes">
            <AttendeePicker
              employees={employees ?? []}
              selectedIds={values.attendee_ids}
              onChange={(ids) => set('attendee_ids', ids)}
              hideQuickGroups
            />
          </Section>
        </div>

        <div className="flex-shrink-0 px-6 py-4 border-t border-[#ece9df] flex items-center justify-between gap-3">
          <span className="text-[12px] text-[#a29b8c]">
            {blockers.length > 0 ? `Para guardar: ${blockers.join(' · ')}.` : ' '}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="text-[14px] font-semibold text-[#555] px-4 py-2 rounded-xl hover:bg-[#f2f0e8]"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={!canSave}
              className="bg-[#111] text-white text-[14px] font-bold px-5 py-2 rounded-xl hover:bg-[#222] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {saving ? 'Guardando…' : isEdit ? 'Guardar cambios' : 'Enviar solicitud'}
            </button>
          </div>
        </div>
      </form>
    </div>
  )
}

function Section({ title, children }) {
  return (
    <section>
      <h3 className="text-[11.5px] font-mono font-bold uppercase tracking-[0.1em] text-[#aaa] mb-2">
        {title}
      </h3>
      {children}
    </section>
  )
}
