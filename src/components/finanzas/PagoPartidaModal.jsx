import { useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import { fmtUSD } from '../../utils/metricsFinance'
import { createDistribution } from './finanzasApi'
import { PARTIDAS } from './constants'

function todayISO() {
  return new Date().toISOString().slice(0, 10)
}

const LABEL_BY_PARTIDA = {
  gastos: '¿En qué? (nómina, alquiler, pauta…)',
  socios: '¿A qué socio?',
  ganancia: 'Destino / detalle',
}

const PLACEHOLDER_BY_PARTIDA = {
  gastos: 'Ej. nómina de septiembre',
  socios: 'Ej. Marlon, Paola…',
  ganancia: 'Ej. reserva, reinversión…',
}

/** Modal de registro de un pago (egreso) contra el saldo de una partida. */
export default function PagoPartidaModal({ monthId, partida, saldoDisponible, onClose, onSaved }) {
  const { userProfile } = useAuth()
  const [concept, setConcept] = useState('')
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(todayISO())
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  async function handleSubmit(e) {
    e.preventDefault()
    const amt = Number(amount)
    if (!amt || amt <= 0) {
      setError('El monto debe ser mayor a 0')
      return
    }
    if (amt > saldoDisponible + 0.5) {
      setError(`Excede el disponible (${fmtUSD(saldoDisponible)})`)
      return
    }
    if (!concept.trim()) {
      setError('Este campo es obligatorio')
      return
    }
    setSaving(true)
    setError(null)
    const { error: err } = await createDistribution(monthId, {
      partida,
      kind: 'out',
      movedOn: date,
      concept: concept.trim(),
      beneficiary: partida === 'socios' ? concept.trim() : null,
      amount: amt,
      invoiceId: null,
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
          <h2 className="text-[18px] font-bold text-[#111]">
            Registrar pago · {PARTIDAS[partida].name}
          </h2>
          <p className="text-[13px] text-[#888] mt-0.5">Disponible: {fmtUSD(saldoDisponible)}</p>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          {error && <p className="text-[13px] text-[#D6453F]">{error}</p>}

          <div>
            <label className="block text-[12px] font-mono font-bold uppercase tracking-wide text-[#888] mb-1.5">
              {LABEL_BY_PARTIDA[partida]}
            </label>
            <input
              type="text"
              className="input-base"
              value={concept}
              onChange={(e) => setConcept(e.target.value)}
              placeholder={PLACEHOLDER_BY_PARTIDA[partida]}
            />
          </div>

          <div>
            <label className="block text-[12px] font-mono font-bold uppercase tracking-wide text-[#888] mb-1.5">
              Monto (USD)
            </label>
            <input
              type="number"
              className="input-base"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
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
              {saving ? 'Guardando…' : 'Registrar pago'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
