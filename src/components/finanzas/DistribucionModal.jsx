import { useState, useMemo } from 'react'
import { useAuth } from '../../context/AuthContext'
import { fmtUSD } from '../../utils/metricsFinance'
import { cobradoDe, distribuidoDe, pctsDelMes } from '../../utils/finanzas'
import { createDistributionSplit, createDistribution } from './finanzasApi'
import { PARTIDAS, PARTIDA_KEYS } from './constants'

const MANUAL = '__manual__'

function todayISO() {
  return new Date().toISOString().slice(0, 10)
}

/** Modal de registro de distribución: split de un cobro en partidas, o ajuste manual. */
export default function DistribucionModal({
  monthId,
  invoice,
  invoices,
  distributions,
  finMonth,
  onClose,
  onSaved,
}) {
  const pcts = pctsDelMes(finMonth)
  const { userProfile } = useAuth()
  const paid = useMemo(
    () => invoices.filter((i) => cobradoDe(i) - distribuidoDe(i, distributions) > 0.5),
    [invoices, distributions],
  )

  const [selectedId, setSelectedId] = useState(invoice?.id ?? '')
  const selected = paid.find((i) => i.id === selectedId)
  const disponible = selected ? cobradoDe(selected) - distribuidoDe(selected, distributions) : 0

  const [amounts, setAmounts] = useState(() => ({ gastos: '', socios: '', ganancia: '' }))
  const [splitNote, setSplitNote] = useState('')

  const [manualPartida, setManualPartida] = useState('gastos')
  const [manualAmount, setManualAmount] = useState('')
  const [manualDate, setManualDate] = useState(todayISO())
  const [manualConcept, setManualConcept] = useState('')

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  function pick(id) {
    setSelectedId(id)
    if (id && id !== MANUAL) {
      const inv = paid.find((i) => i.id === id)
      const rem = inv ? cobradoDe(inv) - distribuidoDe(inv, distributions) : 0
      setAmounts({
        gastos: (rem * pcts.gastos).toFixed(2),
        socios: (rem * pcts.socios).toFixed(2),
        ganancia: (rem * pcts.ganancia).toFixed(2),
      })
    }
  }

  const sumaSplit = PARTIDA_KEYS.reduce((a, p) => a + (Number(amounts[p]) || 0), 0)
  const restoSplit = disponible - sumaSplit

  async function handleSaveSplit() {
    if (sumaSplit <= 0) {
      setError('Ingresa al menos un monto')
      return
    }
    if (sumaSplit > disponible + 0.5) {
      setError(`Excede el cobro por ${fmtUSD(sumaSplit - disponible)}`)
      return
    }
    setSaving(true)
    setError(null)
    const { error: err } = await createDistributionSplit(monthId, {
      invoiceId: selected.id,
      movedOn: todayISO(),
      amounts: {
        gastos: Number(amounts.gastos) || 0,
        socios: Number(amounts.socios) || 0,
        ganancia: Number(amounts.ganancia) || 0,
      },
      note: splitNote || null,
      createdBy: userProfile?.user_id,
    })
    setSaving(false)
    if (err) {
      setError(err.message)
      return
    }
    onSaved()
  }

  async function handleSaveManual() {
    const amt = Number(manualAmount)
    if (!amt || amt <= 0) {
      setError('El monto debe ser mayor a 0')
      return
    }
    if (!manualConcept.trim()) {
      setError('El concepto es obligatorio')
      return
    }
    setSaving(true)
    setError(null)
    const { error: err } = await createDistribution(monthId, {
      partida: manualPartida,
      kind: 'in',
      movedOn: manualDate,
      concept: manualConcept.trim(),
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
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="px-6 pt-5 pb-3 border-b border-[#ece9df]">
          <h2 className="text-[18px] font-bold text-[#111]">Registrar distribución</h2>
          <p className="text-[13px] text-[#888] mt-0.5">
            Elige un cobro y registra a dónde va ese dinero
          </p>
        </div>

        <div className="px-6 py-5 space-y-4">
          {error && <p className="text-[13px] text-[#D6453F]">{error}</p>}

          <div>
            <label className="block text-[12px] font-mono font-bold uppercase tracking-wide text-[#888] mb-1.5">
              Cobro a distribuir
            </label>
            <select
              className="input-base"
              value={selectedId}
              onChange={(e) => pick(e.target.value)}
            >
              <option value="" disabled>
                Selecciona un cobro…
              </option>
              {paid.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.clientName} · {i.concept} ·{' '}
                  {fmtUSD(cobradoDe(i) - distribuidoDe(i, distributions))}
                </option>
              ))}
              <option value={MANUAL}>— Ajuste manual (sin cobro) —</option>
            </select>
            {paid.length === 0 && (
              <p className="text-[12.5px] text-[#999] mt-2">
                Aún no hay cobros. Marca un cobro en Facturación primero.
              </p>
            )}
          </div>

          {selected && (
            <div className="space-y-3">
              {PARTIDA_KEYS.map((p) => (
                <div key={p} className="flex items-center gap-3">
                  <span className={`w-24 text-[12.5px] font-medium ${PARTIDAS[p].text}`}>
                    {PARTIDAS[p].name} · {Math.round(pcts[p] * 100)}%
                  </span>
                  <input
                    type="number"
                    className="input-base flex-1"
                    value={amounts[p]}
                    onChange={(e) => setAmounts((a) => ({ ...a, [p]: e.target.value }))}
                  />
                </div>
              ))}
              <input
                type="text"
                className="input-base"
                value={splitNote}
                onChange={(e) => setSplitNote(e.target.value)}
                placeholder="Ej. a nómina, retiro socios, reserva…"
              />
              <p
                className={`text-[12.5px] font-semibold ${
                  Math.abs(restoSplit) < 0.5
                    ? 'text-[#1F9D57]'
                    : restoSplit < 0
                      ? 'text-[#D6453F]'
                      : 'text-[#888]'
                }`}
              >
                {restoSplit < -0.5
                  ? `Excede el cobro por ${fmtUSD(-restoSplit)}`
                  : Math.abs(restoSplit) < 0.5
                    ? 'Cobro completo ✓'
                    : `Distribuido ${fmtUSD(sumaSplit)} de ${fmtUSD(disponible)} · queda ${fmtUSD(restoSplit)}`}
              </p>
            </div>
          )}

          {selectedId === MANUAL && (
            <div className="space-y-3">
              <div className="flex rounded-lg border border-[#e0ddd4] overflow-hidden">
                {PARTIDA_KEYS.map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setManualPartida(p)}
                    className={`flex-1 py-2 text-[12.5px] font-semibold ${
                      manualPartida === p
                        ? 'bg-[#111] text-white'
                        : 'text-[#666] hover:bg-[#f5f3eb]'
                    }`}
                  >
                    {PARTIDAS[p].name}
                  </button>
                ))}
              </div>
              <input
                type="number"
                className="input-base"
                value={manualAmount}
                onChange={(e) => setManualAmount(e.target.value)}
                placeholder="Monto (USD)"
              />
              <input
                type="date"
                className="input-base"
                value={manualDate}
                onChange={(e) => setManualDate(e.target.value)}
              />
              <input
                type="text"
                className="input-base"
                value={manualConcept}
                onChange={(e) => setManualConcept(e.target.value)}
                placeholder="Concepto"
              />
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-[14px] font-semibold text-[#555] border border-[#e0ddd4] hover:bg-[#f5f3eb]"
            >
              Cancelar
            </button>
            {selected && (
              <button
                type="button"
                onClick={handleSaveSplit}
                disabled={saving}
                className="px-4 py-2 rounded-xl text-[14px] font-bold bg-[#111] text-white hover:bg-[#333] disabled:opacity-50"
              >
                {saving ? 'Guardando…' : 'Registrar distribución'}
              </button>
            )}
            {selectedId === MANUAL && (
              <button
                type="button"
                onClick={handleSaveManual}
                disabled={saving}
                className="px-4 py-2 rounded-xl text-[14px] font-bold bg-[#111] text-white hover:bg-[#333] disabled:opacity-50"
              >
                {saving ? 'Guardando…' : 'Registrar distribución'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
