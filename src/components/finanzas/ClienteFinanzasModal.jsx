import { useState, useRef } from 'react'
import { useUnsavedChanges } from '../../hooks/useUnsavedChanges'
import { updateClient } from '../metricas/metricsApi'
import { clientInMonth } from '../../utils/clientInMonth'

/**
 * Panel FINANCIERO de un cliente, abierto desde Finanzas → Clientes.
 *
 * Deliberadamente NO es la ficha del cliente: nada de contactos, redes, equipo,
 * logo ni fechas — eso vive en Empresa → Clientes y en la ficha de Métricas.
 * Aquí solo está el dinero, que es lo único que Finanzas puede tocar (y lo
 * único que, desde la migración 20260929170000, SOLO Finanzas puede tocar).
 *
 * Los impuestos NO se configuran aquí: se marcan al registrar el cobro
 * (CobroModal), porque un mismo cliente varía el ISLR de un mes a otro y la
 * retención real se conoce cuando paga. Ver migración 20260929180000.
 *
 * Props:
 *   client     — fila de metric_clients
 *   lines      — metric_lines, para mostrar a qué línea pertenece
 *   canManage  — bool: sin esto el modal abre en solo lectura
 *   onClose()  — cierra
 *   onSaved()  — avisa al padre para que recargue la cartera
 */
export default function ClienteFinanzasModal({ client, lines = [], canManage, onClose, onSaved }) {
  const [form, setForm] = useState(() => ({
    es_intercambio: !!client.es_intercambio,
    monthly_fee: client.monthly_fee ?? '',
    payment_day: client.payment_day ?? '',
  }))
  const initialForm = useRef(form)
  const { requestClose } = useUnsavedChanges({
    value: form,
    baseline: initialForm.current,
    onClose,
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const now = new Date()
  const activo = clientInMonth(client, now.getFullYear(), now.getMonth() + 1)
  const line = lines.find((l) => l.id === client.line_id)

  const ro = !canManage

  function set(field, value) {
    setForm((f) => ({ ...f, [field]: value }))
  }

  function toggleIntercambio(checked) {
    // Intercambio y mensualidad son excluyentes: la base lo exige con un CHECK,
    // así que se limpia el monto al marcarlo en vez de dejar que el guardado
    // falle con un error de constraint.
    setForm((f) => ({ ...f, es_intercambio: checked, monthly_fee: checked ? '' : f.monthly_fee }))
  }

  async function handleSubmit(e) {
    e.preventDefault()

    const payment_day = form.payment_day !== '' ? parseInt(form.payment_day, 10) : null
    if (payment_day !== null && (payment_day < 1 || payment_day > 31)) {
      setError('El día de pago debe estar entre 1 y 31.')
      return
    }

    setSaving(true)
    setError(null)

    const { error: err } = await updateClient(client.id, {
      es_intercambio: form.es_intercambio,
      monthly_fee: form.es_intercambio
        ? null
        : form.monthly_fee !== ''
          ? Number(form.monthly_fee)
          : null,
      payment_day,
    })

    setSaving(false)
    if (err) {
      setError(err.message ?? 'No se pudo guardar.')
      return
    }
    onSaved?.()
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/25 backdrop-blur-[3px]">
      <form
        onSubmit={handleSubmit}
        className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col relative"
      >
        <button
          type="button"
          onClick={requestClose}
          className="absolute top-4 right-4 w-7 h-7 flex items-center justify-center rounded-lg text-[#999] hover:text-[#111] hover:bg-[#f0ede3] transition-colors"
          aria-label="Cerrar"
        >
          <svg
            width="14"
            height="14"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2.5}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        {/* Cabecera */}
        <div className="flex-shrink-0 px-6 pt-5 pb-4 pr-10 border-b border-[#ece9df]">
          <h2 className="text-[18px] font-bold text-[#111] truncate">{client.name}</h2>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-[12.5px] text-[#888]">{line?.name ?? 'Sin línea'}</span>
            <span
              className={`inline-block px-2 py-0.5 rounded-full text-[11.5px] font-semibold ${
                activo ? 'bg-[#e6f4ec] text-[#1f9d57]' : 'bg-[#f0ede3] text-[#888]'
              }`}
            >
              {activo ? 'Activo' : 'Retirado'}
            </span>
          </div>
        </div>

        <div className="px-6 py-5 space-y-5 overflow-y-auto flex-1">
          {/* Tipo de cobro */}
          <div>
            <label
              htmlFor="fin-intercambio"
              className="flex items-start gap-2.5 cursor-pointer select-none"
            >
              <input
                id="fin-intercambio"
                type="checkbox"
                className="mt-0.5 w-4 h-4 accent-[#FFB800]"
                checked={form.es_intercambio}
                onChange={(e) => toggleIntercambio(e.target.checked)}
                disabled={ro}
              />
              <span>
                <span className="block text-[14px] font-semibold text-[#222]">
                  Intercambio (canje)
                </span>
                <span className="block text-[12.5px] text-[#888]">
                  No se le cobra mensualidad: no entra en la facturación del mes ni suma a la
                  cartera.
                </span>
              </span>
            </label>
            {form.es_intercambio && (
              <p className="mt-2 text-[12px] text-[#7a5b00] bg-[#FFB80014] border border-[#FFB80055] rounded-lg px-3 py-2">
                Al guardar se quitan las facturas de esta marca en los meses abiertos que no tengan
                cobros. Las que ya tienen cobros, o están en un mes cerrado, se quedan: si
                corresponde, resuélvelas desde Facturación.
              </p>
            )}
          </div>

          {/* Mensualidad + día de pago */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label
                htmlFor="fin-monto"
                className="block text-[13px] font-mono font-bold tracking-[0.12em] uppercase text-[#888] mb-1.5"
              >
                Mensualidad (USD)
              </label>
              <input
                id="fin-monto"
                type="number"
                min={0}
                step="0.01"
                className="input-base"
                value={form.monthly_fee}
                onChange={(e) => set('monthly_fee', e.target.value)}
                placeholder={form.es_intercambio ? 'No aplica' : '0.00'}
                disabled={ro || form.es_intercambio}
              />
            </div>
            <div>
              <label
                htmlFor="fin-dia"
                className="block text-[13px] font-mono font-bold tracking-[0.12em] uppercase text-[#888] mb-1.5"
              >
                Día de pago
              </label>
              <input
                id="fin-dia"
                type="number"
                min={1}
                max={31}
                className="input-base"
                value={form.payment_day}
                onChange={(e) => set('payment_day', e.target.value)}
                placeholder="1–31"
                disabled={ro}
              />
            </div>
          </div>

          {error && (
            <p className="text-[13px] text-[#c0392b] bg-[#fdecea] border border-[#f5c6c2] rounded-lg px-3 py-2">
              {error}
            </p>
          )}
        </div>

        {/* Pie */}
        <div className="flex-shrink-0 flex items-center justify-end gap-2 px-6 py-4 border-t border-[#ece9df]">
          <button
            type="button"
            onClick={requestClose}
            className="px-4 py-2 rounded-xl text-[13.5px] font-semibold text-[#555] hover:bg-[#f5f3eb] transition-colors"
          >
            {ro ? 'Cerrar' : 'Cancelar'}
          </button>
          {!ro && (
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 rounded-xl text-[13.5px] font-bold text-[#111] bg-[#FFB800] hover:brightness-95 disabled:opacity-60 transition-all"
            >
              {saving ? 'Guardando…' : 'Guardar cambios'}
            </button>
          )}
        </div>
      </form>
    </div>
  )
}
