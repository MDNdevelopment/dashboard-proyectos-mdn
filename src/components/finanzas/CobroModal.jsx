import { useState } from 'react'
import { fmtUSD } from '../../utils/metricsFinance'
import { fmtDate } from '../../utils/formatDate'
import { cobradoDe, pendienteDe } from '../../utils/finanzas'
import { addPayment, deletePayment, deleteDistributionsForInvoice } from './finanzasApi'
import { METODOS_PAGO } from './constants'

function todayISO() {
  return new Date().toISOString().slice(0, 10)
}

/** Modal de registro de cobro y abonos de una factura, más "quitar cobro" (revierte todo). */
export default function CobroModal({ invoice, canManage, onClose, onSaved }) {
  const [amount, setAmount] = useState(() => pendienteDe(invoice))
  const [method, setMethod] = useState(METODOS_PAGO[0])
  const [date, setDate] = useState(todayISO())
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const cobrado = cobradoDe(invoice)
  const pendiente = pendienteDe(invoice)

  async function handleAddPayment() {
    const amt = Number(amount)
    if (!amt || amt <= 0) {
      setError('El monto debe ser mayor a 0')
      return
    }
    if (amt > pendiente + 0.5) {
      setError('No puedes cobrar más de lo pendiente')
      return
    }
    setSaving(true)
    setError(null)
    const { error: err } = await addPayment(invoice.id, { paidOn: date, amount: amt, method, note })
    setSaving(false)
    if (err) {
      setError(err.message)
      return
    }
    onSaved()
    onClose()
  }

  async function handleRemovePayment(paymentId) {
    setSaving(true)
    await deletePayment(paymentId)
    setSaving(false)
    onSaved()
  }

  async function handleQuitarCobro() {
    if (!window.confirm('Se quitarán todos los abonos y la distribución registrada. ¿Continuar?'))
      return
    setSaving(true)
    for (const p of invoice.payments) await deletePayment(p.id)
    await deleteDistributionsForInvoice(invoice.id)
    setSaving(false)
    onSaved()
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/25 backdrop-blur-[3px]">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="px-6 pt-5 pb-3 border-b border-[#ece9df]">
          <h2 className="text-[18px] font-bold text-[#111]">
            {cobrado > 0.5 ? 'Cobro y abonos' : 'Registrar cobro'}
          </h2>
          <p className="text-[13px] text-[#888] mt-0.5">
            {invoice.clientName} · {invoice.concept} · facturado {fmtUSD(invoice.amount)}
          </p>
        </div>

        <div className="px-6 py-5 space-y-4">
          {error && <p className="text-[13px] text-[#D6453F]">{error}</p>}

          <div className="flex gap-2">
            <div className="flex-1 bg-[#f5f3eb] rounded-lg px-3 py-2">
              <p className="text-[11px] text-[#999]">Cobrado</p>
              <p className="font-bold text-[#1F9D57]">{fmtUSD(cobrado)}</p>
            </div>
            <div className="flex-1 bg-[#f5f3eb] rounded-lg px-3 py-2">
              <p className="text-[11px] text-[#999]">Pendiente</p>
              <p className={`font-bold ${pendiente > 0.5 ? 'text-[#D6453F]' : 'text-[#999]'}`}>
                {fmtUSD(pendiente)}
              </p>
            </div>
          </div>

          {invoice.payments.length > 0 && (
            <div>
              <p className="text-[12px] text-[#888] mb-1.5">Abonos registrados</p>
              <div className="space-y-1.5">
                {invoice.payments.map((p) => (
                  <div
                    key={p.id}
                    className="flex items-center justify-between bg-[#faf9f5] rounded-lg px-3 py-2 text-[12.5px]"
                  >
                    <div>
                      <span className="font-bold text-[#111]">{fmtUSD(p.amount)}</span>{' '}
                      <span className="text-[#999]">
                        · {p.method || '—'} · {fmtDate(p.paidOn)}
                      </span>
                      {p.note && <span className="text-[#999]"> · {p.note}</span>}
                    </div>
                    {canManage && (
                      <button
                        type="button"
                        onClick={() => handleRemovePayment(p.id)}
                        disabled={saving}
                        className="text-[#D6453F] hover:underline"
                      >
                        Quitar
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {canManage && pendiente > 0.5 && (
            <>
              <div>
                <label className="block text-[12px] font-mono font-bold uppercase tracking-wide text-[#888] mb-1.5">
                  Monto cobrado (USD)
                </label>
                <input
                  type="number"
                  className="input-base"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[12px] font-mono font-bold uppercase tracking-wide text-[#888] mb-1.5">
                    Método de pago
                  </label>
                  <select
                    className="input-base"
                    value={method}
                    onChange={(e) => setMethod(e.target.value)}
                  >
                    {METODOS_PAGO.map((m) => (
                      <option key={m}>{m}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[12px] font-mono font-bold uppercase tracking-wide text-[#888] mb-1.5">
                    Fecha
                  </label>
                  <input
                    type="date"
                    className="input-base"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                  />
                </div>
              </div>
              <div>
                <label className="block text-[12px] font-mono font-bold uppercase tracking-wide text-[#888] mb-1.5">
                  Nota (opcional)
                </label>
                <input
                  type="text"
                  className="input-base"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Ej. referencia, banco, tasa Bs…"
                />
              </div>
            </>
          )}

          {canManage && pendiente <= 0.5 && (
            <div className="bg-[#e6f4ec] text-[#1F9D57] p-3 rounded-lg text-center text-[13px] font-semibold">
              Cobro completo ✓
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-[14px] font-semibold text-[#555] border border-[#e0ddd4] hover:bg-[#f5f3eb]"
            >
              Cerrar
            </button>
            {canManage && cobrado > 0.5 && (
              <button
                type="button"
                onClick={handleQuitarCobro}
                disabled={saving}
                className="px-4 py-2 rounded-xl text-[14px] font-semibold text-[#D6453F] border border-[#e0ddd4] hover:bg-[#fbe9e8] disabled:opacity-50"
              >
                Quitar cobro
              </button>
            )}
            {canManage && pendiente > 0.5 && (
              <button
                type="button"
                onClick={handleAddPayment}
                disabled={saving}
                className="px-4 py-2 rounded-xl text-[14px] font-bold bg-[#111] text-white hover:bg-[#333] disabled:opacity-50"
              >
                {saving ? 'Guardando…' : 'Registrar cobro'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
