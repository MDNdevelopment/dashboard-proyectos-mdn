import { useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import { createBsAdjustment } from './finanzasApi'

function todayISO() {
  return new Date().toISOString().slice(0, 10)
}

/**
 * Ajuste de cuadre de la Caja Bs (§8.4 de la spec): la ÚNICA fila del libro que
 * se llena a mano, para conciliar contra el banco (intereses, comisiones,
 * diferencias de redondeo). El resto del libro lo generan los triggers de
 * cobros/compras/ventas/pagos — este modal es la excepción explícita.
 */
export default function AjusteCajaBsModal({ companyId, monthId, rateBcv, onClose, onSaved }) {
  const { userProfile } = useAuth()
  const [kind, setKind] = useState('in')
  const [date, setDate] = useState(todayISO())
  const [amountBs, setAmountBs] = useState('')
  const [rate, setRate] = useState(rateBcv?.rate ?? '')
  const [concept, setConcept] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  async function handleSubmit(e) {
    e.preventDefault()
    const bs = Number(amountBs)
    const r = Number(rate)
    if (!bs || bs <= 0) {
      setError('El monto debe ser mayor a 0')
      return
    }
    if (!r || r <= 0) {
      setError('La tasa debe ser mayor a 0 (para el equivalente en USD del ajuste)')
      return
    }
    if (!concept.trim()) {
      setError('Este campo es obligatorio')
      return
    }
    setSaving(true)
    setError(null)
    const { error: err } = await createBsAdjustment({
      companyId,
      monthId,
      movedOn: date,
      kind,
      amountBs: bs,
      rate: r,
      concept: concept.trim(),
      createdBy: userProfile?.user_id,
    })
    setSaving(false)
    if (err) {
      setError(err.message)
      return
    }
    onSaved()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/25 backdrop-blur-[3px]">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
        <div className="px-6 pt-5 pb-3 border-b border-[#ece9df]">
          <h2 className="text-[18px] font-bold text-[#111]">Ajuste de cuadre</h2>
          <p className="text-[13px] text-[#888] mt-0.5">
            Para conciliar la Caja Bs contra el estado de cuenta del banco.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          {error && <p className="text-[13px] text-[#D6453F]">{error}</p>}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setKind('in')}
              className={`flex-1 rounded-lg border px-3 py-2 text-[13px] font-semibold ${
                kind === 'in'
                  ? 'border-[#111] bg-[#111] text-white'
                  : 'border-[#e0ddd4] text-[#666] hover:bg-[#f5f3eb]'
              }`}
            >
              Entrada
            </button>
            <button
              type="button"
              onClick={() => setKind('out')}
              className={`flex-1 rounded-lg border px-3 py-2 text-[13px] font-semibold ${
                kind === 'out'
                  ? 'border-[#111] bg-[#111] text-white'
                  : 'border-[#e0ddd4] text-[#666] hover:bg-[#f5f3eb]'
              }`}
            >
              Salida
            </button>
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

          <div>
            <label className="block text-[12px] font-mono font-bold uppercase tracking-wide text-[#888] mb-1.5">
              Monto (Bs)
            </label>
            <input
              type="number"
              className="input-base"
              value={amountBs}
              onChange={(e) => setAmountBs(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-[12px] font-mono font-bold uppercase tracking-wide text-[#888] mb-1.5">
              Tasa usada para el equivalente en USD
            </label>
            <input
              type="number"
              step="0.0001"
              className="input-base"
              value={rate}
              onChange={(e) => setRate(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-[12px] font-mono font-bold uppercase tracking-wide text-[#888] mb-1.5">
              Motivo del ajuste
            </label>
            <input
              type="text"
              className="input-base"
              value={concept}
              onChange={(e) => setConcept(e.target.value)}
              placeholder="Ej. comisión bancaria, redondeo…"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-[14px] font-semibold text-[#555] border border-[#e0ddd4] hover:bg-[#f5f3eb]"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 rounded-xl text-[14px] font-bold bg-[#111] text-white hover:bg-[#333] disabled:opacity-50"
            >
              {saving ? 'Guardando…' : 'Registrar ajuste'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
