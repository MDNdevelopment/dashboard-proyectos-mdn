import { useState, useRef } from 'react'
import { useAuth } from '../../context/AuthContext'
import { useUnsavedChanges } from '../../hooks/useUnsavedChanges'
import { createInvoice, updateInvoice } from './finanzasApi'
import { CONCEPTOS_SUGERIDOS, CONCEPTO_RECURRENTE } from './constants'

const OTHER = '__other__'

/** Modal crear/editar facturación. Convención: invoice=null → crear, invoice=objeto → editar. */
export default function InvoiceModal({ invoice, monthId, clients, onClose, onSaved }) {
  const { userProfile } = useAuth()
  const isEdit = invoice != null
  const activeClients = (clients ?? []).filter((c) => !c.deleted_at && !c.contract_end)

  const [form, setForm] = useState(() => ({
    clientId: invoice?.clientId ?? '',
    clientName: invoice?.clientId ? '' : (invoice?.clientName ?? ''),
    concept: invoice?.concept ?? '',
    amount: invoice?.amount ?? '',
    currency: invoice?.currency ?? 'USD',
    recurring: invoice ? invoice.recurring : true,
  }))
  const initialForm = useRef(form)
  const { requestClose } = useUnsavedChanges({
    value: form,
    baseline: initialForm.current,
    onClose,
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  function set(field, value) {
    setForm((f) => ({ ...f, [field]: value }))
  }

  function onClientPick(id) {
    if (id === OTHER) {
      set('clientId', OTHER)
      return
    }
    const client = activeClients.find((c) => c.id === id)
    setForm((f) => ({
      ...f,
      clientId: id,
      clientName: client?.name ?? '',
      amount: client?.monthly_fee ?? f.amount,
      concept: CONCEPTO_RECURRENTE,
      recurring: true,
    }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    const isOther = form.clientId === OTHER || form.clientId === ''
    const clientName = isOther
      ? form.clientName.trim()
      : activeClients.find((c) => c.id === form.clientId)?.name
    if (isOther && !clientName) {
      setError('Indica el nombre del cliente o proyecto')
      return
    }
    if (!form.concept.trim()) {
      setError('El concepto es obligatorio')
      return
    }
    const amount = Number(form.amount)
    if (!amount || amount <= 0) {
      setError('El monto debe ser mayor a 0')
      return
    }

    setSaving(true)
    setError(null)
    const fields = {
      clientId: isOther ? null : form.clientId,
      clientName,
      concept: form.concept.trim(),
      amount,
      currency: form.currency,
      recurring: form.recurring,
      createdBy: userProfile?.user_id,
    }
    const { error: err } = isEdit
      ? await updateInvoice(invoice.id, fields)
      : await createInvoice(monthId, fields)
    setSaving(false)
    if (err) {
      setError(err.message)
      return
    }
    onSaved()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/25 backdrop-blur-[3px]">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-[#ece9df]">
          <h2 className="text-[18px] font-bold text-[#111]">
            {isEdit ? 'Editar facturación' : 'Agregar facturación'}
          </h2>
          <button
            type="button"
            onClick={requestClose}
            className="w-7 h-7 flex items-center justify-center rounded-lg text-[#999] hover:text-[#111] hover:bg-[#f0ede3]"
            aria-label="Cerrar"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 14 14"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
            >
              <path d="M2 2l10 10M12 2L2 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          {error && <p className="text-[13px] text-[#D6453F]">{error}</p>}

          <div>
            <label className="block text-[12px] font-mono font-bold uppercase tracking-wide text-[#888] mb-1.5">
              Cliente
            </label>
            <select
              className="input-base"
              value={form.clientId || OTHER}
              onChange={(e) => onClientPick(e.target.value)}
            >
              <option value="" disabled>
                Selecciona un cliente…
              </option>
              {activeClients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
              <option value={OTHER}>— Otro / cliente externo —</option>
            </select>
          </div>

          {(form.clientId === OTHER || form.clientId === '') && (
            <div>
              <label className="block text-[12px] font-mono font-bold uppercase tracking-wide text-[#888] mb-1.5">
                Nombre del cliente / proyecto
              </label>
              <input
                type="text"
                className="input-base"
                value={form.clientName}
                onChange={(e) => set('clientName', e.target.value)}
                placeholder="Ej. Café del Lago (página web)"
              />
            </div>
          )}

          <div>
            <label className="block text-[12px] font-mono font-bold uppercase tracking-wide text-[#888] mb-1.5">
              Concepto
            </label>
            <input
              type="text"
              className="input-base"
              list="fin-concepts"
              value={form.concept}
              onChange={(e) => set('concept', e.target.value)}
              placeholder="Gestión de redes, Página web, Branding…"
            />
            <datalist id="fin-concepts">
              {CONCEPTOS_SUGERIDOS.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[12px] font-mono font-bold uppercase tracking-wide text-[#888] mb-1.5">
                Monto (USD)
              </label>
              <input
                type="number"
                className="input-base"
                value={form.amount}
                onChange={(e) => set('amount', e.target.value)}
                placeholder="0"
              />
            </div>
            <div>
              <label className="block text-[12px] font-mono font-bold uppercase tracking-wide text-[#888] mb-1.5">
                Moneda de pago
              </label>
              <div className="flex rounded-lg border border-[#e0ddd4] overflow-hidden">
                {['USD', 'Bs'].map((cur) => (
                  <button
                    key={cur}
                    type="button"
                    onClick={() => set('currency', cur)}
                    className={`flex-1 py-2 text-[13px] font-semibold ${
                      form.currency === cur
                        ? 'bg-[#111] text-white'
                        : 'text-[#666] hover:bg-[#f5f3eb]'
                    }`}
                  >
                    {cur}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <label className="flex items-center gap-2 text-[13px] text-[#555]">
            <input
              type="checkbox"
              checked={form.recurring}
              onChange={(e) => set('recurring', e.target.checked)}
            />
            Cargo recurrente (se repite al cerrar el mes)
          </label>

          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={requestClose}
              className="px-4 py-2 rounded-xl text-[14px] font-semibold text-[#555] border border-[#e0ddd4] hover:bg-[#f5f3eb]"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 rounded-xl text-[14px] font-bold bg-[#111] text-white hover:bg-[#333] disabled:opacity-50"
            >
              {saving ? 'Guardando…' : isEdit ? 'Guardar cambios' : 'Agregar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
