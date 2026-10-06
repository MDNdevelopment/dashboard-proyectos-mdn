import { useState } from 'react'
import WizardPasoQue from './WizardPasoQue'
import WizardPasoCuando from './WizardPasoCuando'
import WizardPasoDetalles from './WizardPasoDetalles'
import { createPauta } from './avPautasApi'
import { estudioConflicts, pautaErrorMessage } from '../../utils/audiovisual'

const PASOS = [
  { n: 1, label: 'Qué' },
  { n: 2, label: 'Cuándo' },
  { n: 3, label: 'Detalles' },
]

/**
 * Solicitar una pauta en tres pasos (qué · cuándo y dónde · detalles), pensado para el
 * celular: una cosa por pantalla, fichas grandes y los huecos libres a la vista. Al enviar
 * se crea ya enviada a coordinación (`status: 'solicitada', submitted: true`), igual que
 * el formulario anterior. Un solo cliente en la lista se preselecciona.
 */
export default function SolicitarWizard({
  clients,
  employees,
  recursoUsers,
  pautas,
  companyId,
  userId,
  defaultLineId = null,
  today = new Date(),
  onClose,
  onSaved,
}) {
  const unicos = (clients ?? []).filter((c) => !c.deleted_at)
  const [step, setStep] = useState(1)
  const [sinFecha, setSinFecha] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [values, setValues] = useState({
    client_id: unicos.length === 1 ? unicos[0].id : null,
    tema: '',
    formats: [],
    requirements: '',
    link: '',
    piezas_desc: '',
    pauta_date: null,
    salida: null,
    llegada: null,
    lugar_tipo: 'locacion',
    place: '',
    attendee_ids: [],
    extra: false,
  })
  const set = (field, v) => setValues((prev) => ({ ...prev, [field]: v }))

  const esEstudio = values.lugar_tipo === 'estudio'
  const conflicts =
    esEstudio && values.pauta_date && values.salida
      ? estudioConflicts(pautas ?? [], {
          date: values.pauta_date,
          salida: values.salida,
          clientId: values.client_id,
        })
      : { blocking: [], warnings: [] }

  const paso1Ok = Boolean(values.client_id && values.formats.length > 0 && values.tema.trim())
  const paso2Ok = sinFecha
    ? !esEstudio
    : Boolean(values.pauta_date && (!esEstudio || values.salida)) && conflicts.blocking.length === 0
  const puedeAvanzar = step === 1 ? paso1Ok : step === 2 ? paso2Ok : true

  const falta = (() => {
    if (step === 1) {
      if (!values.client_id) return 'elige el cliente'
      if (values.formats.length === 0) return 'marca al menos un formato'
      if (!values.tema.trim()) return 'escribe de qué trata'
      return null
    }
    if (step === 2 && !sinFecha) {
      if (!values.pauta_date) return 'elige un día'
      if (esEstudio && !values.salida) return 'el estudio necesita hora de salida'
      if (conflicts.blocking.length > 0) return 'el estudio está ocupado a esa hora'
    }
    return null
  })()

  async function enviar() {
    if (!paso1Ok || !paso2Ok || saving) return
    setSaving(true)
    setError(null)
    const fields = sinFecha ? { ...values, pauta_date: null, salida: null, llegada: null } : values
    const result = await createPauta(
      companyId,
      { ...fields, status: 'solicitada', submitted: true },
      userId,
      defaultLineId,
    )
    setSaving(false)
    if (result.error) {
      setError(pautaErrorMessage(result.error))
      return
    }
    onSaved(result.data)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 backdrop-blur-sm bg-black/30">
      <form
        onSubmit={(e) => {
          e.preventDefault()
          if (step < 3) {
            if (puedeAvanzar) setStep(step + 1)
          } else enviar()
        }}
        className="bg-white w-full sm:max-w-xl h-[92vh] sm:h-auto sm:max-h-[90vh] rounded-t-2xl sm:rounded-2xl shadow-xl flex flex-col"
        aria-label="Solicitar pauta"
      >
        <div className="flex-shrink-0 px-5 pt-4 pb-3 border-b border-[#ece9df]">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-[17px] font-bold text-[#111]">Solicitar pauta</h2>
            <button
              type="button"
              onClick={onClose}
              aria-label="Cerrar"
              className="w-9 h-9 flex items-center justify-center rounded-full text-[#888] hover:bg-[#f2f0e8] hover:text-[#111]"
            >
              ✕
            </button>
          </div>
          <ol className="flex items-center gap-2 mt-2" aria-label="Pasos">
            {PASOS.map((p) => {
              const done = p.n < step
              const on = p.n === step
              return (
                <li key={p.n} className="flex items-center gap-1.5 text-[12px] font-semibold">
                  <span
                    aria-current={on ? 'step' : undefined}
                    className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-[11px] font-mono ${
                      on
                        ? 'bg-[#FFB800] text-[#111]'
                        : done
                          ? 'bg-[#111] text-white'
                          : 'bg-[#ece9df] text-[#888]'
                    }`}
                  >
                    {done ? '✓' : p.n}
                  </span>
                  <span className={on ? 'text-[#111]' : 'text-[#999]'}>{p.label}</span>
                  {p.n < 3 && <span className="w-4 h-px bg-[#e0ddd4] ml-1" />}
                </li>
              )
            })}
          </ol>
        </div>

        <div className="px-5 py-4 overflow-y-auto flex-1">
          {error && (
            <div
              className="bg-red-50 text-red-700 text-[13px] px-3 py-2 rounded-lg mb-4"
              role="alert"
            >
              {error}
            </div>
          )}
          {step === 1 && <WizardPasoQue values={values} set={set} clients={clients} />}
          {step === 2 && (
            <WizardPasoCuando
              values={values}
              set={set}
              pautas={pautas ?? []}
              recursoIds={(recursoUsers ?? []).map((u) => u.user_id)}
              conflicts={conflicts}
              sinFecha={sinFecha}
              onSinFecha={setSinFecha}
              today={today}
            />
          )}
          {step === 3 && <WizardPasoDetalles values={values} set={set} employees={employees} />}
        </div>

        <div className="flex-shrink-0 px-5 py-3 border-t border-[#ece9df] flex items-center gap-2">
          <span className="text-[12px] text-[#a29b8c] flex-1 min-w-0 truncate">
            {falta ? `Para seguir: ${falta}.` : ' '}
          </span>
          {step > 1 && (
            <button
              type="button"
              onClick={() => setStep(step - 1)}
              className="min-h-[44px] text-[14px] font-semibold text-[#555] px-4 rounded-xl hover:bg-[#f2f0e8]"
            >
              Atrás
            </button>
          )}
          {step < 3 ? (
            <button
              type="submit"
              disabled={!puedeAvanzar}
              className="min-h-[44px] bg-[#111] text-white text-[14px] font-bold px-5 rounded-xl hover:bg-[#222] disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Siguiente
            </button>
          ) : (
            <button
              type="submit"
              disabled={saving || !paso1Ok || !paso2Ok}
              className="min-h-[44px] bg-[#FFB800] text-[#111] text-[14px] font-bold px-5 rounded-xl hover:brightness-95 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {saving ? 'Enviando…' : 'Enviar solicitud'}
            </button>
          )}
        </div>
      </form>
    </div>
  )
}
