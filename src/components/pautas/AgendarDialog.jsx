import { useState } from 'react'
import PautaCuandoDondeFields from './PautaCuandoDondeFields'
import ResourceWarningDialog from './ResourceWarningDialog'
import AttendeePicker from '../reuniones/AttendeePicker'
import {
  estudioConflicts,
  resourceConflicts,
  formatDayShort,
  formatTime12,
  pautaErrorMessage,
} from '../../utils/audiovisual'

/**
 * Diálogo de agenda de una pauta. Dos modos sobre el mismo formulario:
 *  - 'agendar'   (solicitada → programada): confirma fecha/hora/lugar, asigna recursos y
 *                 asistentes. Guarda `status: 'programada'`.
 *  - 'reagendar' (programada → programada): solo fecha/hora/lugar; el historial lo escribe
 *                 el trigger `av_pautas_track_reagendamiento` al cambiar fecha u hora.
 * Validación en vivo sobre las pautas en memoria: choque de estudio (bloquea) y de recursos
 * (`resourceConflicts`: bloquea si es seguro, pregunta vía ResourceWarningDialog si es
 * probable). `onConfirm(fields)` debe devolver `{ error }`.
 */
export default function AgendarDialog({
  mode = 'agendar',
  pauta,
  pautas,
  usersById,
  recursoUsers,
  allEmployees,
  onConfirm,
  onClose,
}) {
  const reagendar = mode === 'reagendar'
  const [values, setValues] = useState({
    pauta_date: pauta.pauta_date ?? null,
    salida: pauta.salida ?? null,
    llegada: pauta.llegada ?? null,
    lugar_tipo: pauta.lugar_tipo ?? 'locacion',
    place: pauta.place ?? '',
    recurso_ids: pauta.recurso_ids ?? [],
    attendee_ids: pauta.attendee_ids ?? [],
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [pendingWarnings, setPendingWarnings] = useState(null)
  const set = (field, v) => setValues((prev) => ({ ...prev, [field]: v }))

  const esEstudio = values.lugar_tipo === 'estudio'
  const estudio = esEstudio
    ? estudioConflicts(pautas ?? [], {
        date: values.pauta_date,
        salida: values.salida,
        clientId: pauta.client_id,
        excludeId: pauta.id,
      })
    : { blocking: [], warnings: [] }

  const sameDay = (pautas ?? []).filter(
    (p) =>
      p.id !== pauta.id &&
      !p.deleted_at &&
      ['programada', 'realizada'].includes(p.status) &&
      p.pauta_date &&
      p.pauta_date === values.pauta_date,
  )
  const recursos =
    values.pauta_date && values.recurso_ids.length
      ? resourceConflicts({ ...pauta, ...values }, sameDay, usersById, pauta.recurso_ids ?? [])
      : { blocking: [], warnings: [] }

  const missingDate = !values.pauta_date
  const missingStudioTime = esEstudio && !values.salida
  const blockers = []
  if (missingDate) blockers.push('elige la fecha')
  if (missingStudioTime) blockers.push('el estudio necesita hora de salida')
  if (estudio.blocking.length > 0) blockers.push('el estudio está ocupado a esa hora')
  recursos.blocking.forEach((b) => {
    const range =
      b.pauta.salida || b.pauta.llegada
        ? `${formatTime12(b.pauta.salida) || '—'} – ${formatTime12(b.pauta.llegada) || '—'}`
        : 'sin horario'
    blockers.push(
      `${b.name} ya está en la pauta de ${b.pauta.client_name || 'otro cliente'} (${range})`,
    )
  })
  const unchanged =
    reagendar &&
    values.pauta_date === pauta.pauta_date &&
    (values.salida ?? null) === (pauta.salida ?? null) &&
    (values.llegada ?? null) === (pauta.llegada ?? null) &&
    values.lugar_tipo === (pauta.lugar_tipo ?? 'locacion') &&
    (values.place ?? '') === (pauta.place ?? '')
  const canSave = blockers.length === 0 && !unchanged && !saving

  function fieldsToSave() {
    const base = {
      pauta_date: values.pauta_date,
      salida: values.salida,
      llegada: values.llegada,
      lugar_tipo: values.lugar_tipo,
      place: esEstudio ? null : values.place,
    }
    if (reagendar) return base
    return {
      ...base,
      recurso_ids: values.recurso_ids,
      attendee_ids: values.attendee_ids,
      status: 'programada',
      submitted: true,
    }
  }

  async function commit() {
    setSaving(true)
    setError(null)
    const { error: err } = (await onConfirm(fieldsToSave())) ?? {}
    setSaving(false)
    if (err) setError(pautaErrorMessage(err))
    else onClose()
  }

  function handleSubmit(e) {
    e.preventDefault()
    if (!canSave) return
    if (recursos.warnings.length) {
      setPendingWarnings(recursos.warnings)
      return
    }
    commit()
  }

  const title = reagendar ? 'Reagendar pauta' : 'Aprobar y agendar'
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 backdrop-blur-sm bg-black/30">
      <form
        onSubmit={handleSubmit}
        aria-label={title}
        className="bg-white rounded-2xl shadow-xl w-full max-w-xl max-h-[90vh] flex flex-col"
      >
        <div className="flex-shrink-0 px-6 pt-5 pb-4 border-b border-[#ece9df] flex items-center justify-between">
          <div>
            <h2 className="text-[17px] font-bold text-[#111]">{title}</h2>
            <p className="text-[12.5px] text-[#888] mt-0.5">
              {pauta.client_name || 'Sin cliente'}
              {reagendar && pauta.pauta_date && (
                <>
                  {' '}
                  · hoy {formatDayShort(pauta.pauta_date)}
                  {pauta.salida ? ` ${formatTime12(pauta.salida)}` : ''}
                </>
              )}
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

        <div className="px-6 py-5 space-y-5 overflow-y-auto flex-1">
          {error && (
            <div className="bg-red-50 text-red-700 text-[13px] px-3 py-2 rounded-lg" role="alert">
              {error}
            </div>
          )}

          <PautaCuandoDondeFields
            value={values}
            onChange={set}
            pautas={pautas ?? []}
            clientId={pauta.client_id}
            excludeId={pauta.id}
            dateRequired
          />

          {!reagendar && (
            <>
              <section>
                <h3 className="text-[11.5px] font-mono font-bold uppercase tracking-[0.1em] text-[#aaa] mb-2">
                  Recursos (quién graba / captura)
                </h3>
                <AttendeePicker
                  employees={recursoUsers ?? []}
                  selectedIds={values.recurso_ids}
                  onChange={(ids) => set('recurso_ids', ids)}
                  hideQuickGroups
                />
                {recursos.blocking.map((b) => (
                  <p key={b.resourceId} className="text-[12.5px] text-[#c0392b] mt-1" role="alert">
                    {b.name} ya está en la pauta de {b.pauta.client_name || 'otro cliente'} ese día.
                    Ajusta el horario o elige otro recurso.
                  </p>
                ))}
              </section>
              <section>
                <h3 className="text-[11.5px] font-mono font-bold uppercase tracking-[0.1em] text-[#aaa] mb-2">
                  Asistentes
                </h3>
                <AttendeePicker
                  employees={allEmployees ?? []}
                  selectedIds={values.attendee_ids}
                  onChange={(ids) => set('attendee_ids', ids)}
                  hideQuickGroups
                />
              </section>
            </>
          )}
        </div>

        <div className="flex-shrink-0 px-6 py-4 border-t border-[#ece9df] flex items-center justify-between gap-3">
          <span className="text-[12px] text-[#a29b8c]">
            {blockers.length > 0
              ? `Para guardar: ${blockers.join(' · ')}.`
              : unchanged
                ? 'Cambia la fecha, la hora o el lugar.'
                : ' '}
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
              {saving ? 'Guardando…' : reagendar ? 'Reagendar' : 'Agendar'}
            </button>
          </div>
        </div>
      </form>

      {pendingWarnings && (
        <ResourceWarningDialog
          warnings={pendingWarnings}
          dateLabel={formatDayShort(values.pauta_date)}
          onConfirm={() => {
            setPendingWarnings(null)
            commit()
          }}
          onCancel={() => setPendingWarnings(null)}
        />
      )}
    </div>
  )
}
