import { useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import { fmtUSD } from '../../utils/metricsFinance'
import { tasaRealFx, brechaPct } from '../../utils/finanzas'
import { createFxOperation } from './finanzasApi'
import { FX_OP_TYPES } from './constants'

function todayISO() {
  return new Date().toISOString().slice(0, 10)
}

function fmtBs(n) {
  return Number(n ?? 0).toLocaleString('es-VE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

/**
 * Comprar / vender dólares (§8.2 y §8.3 de la spec) — un solo modal con prop
 * `opType`, solo cambian labels y el orden de los 2 campos de monto. Muestra en
 * vivo la tasa real, la BCV y la brecha. El trigger `fin_fx_sync` (migración
 * 20260928100000) es quien genera la fila del libro de Bs y, si hubo brecha, la
 * de la partida técnica 'cambio' — este modal solo inserta la operación.
 *
 * La operación es INMUTABLE (sin editar): un error se corrige borrando y
 * volviendo a registrarla — así el `on delete cascade` limpia sus 2 filas
 * derivadas sin necesitar lógica de resincronización.
 */
export default function FxOperacionModal({
  companyId,
  monthId,
  opType,
  rateBcv,
  saldoBs,
  divisaFisica,
  onClose,
  onSaved,
}) {
  const { userProfile } = useAuth()
  const [date, setDate] = useState(todayISO())
  const [amountBs, setAmountBs] = useState('')
  const [amountUsd, setAmountUsd] = useState('')
  const [counterparty, setCounterparty] = useState('')
  const [purpose, setPurpose] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const label = FX_OP_TYPES[opType]?.label ?? opType
  const bs = Number(amountBs) || 0
  const usd = Number(amountUsd) || 0
  const rateReal = tasaRealFx({ amountBs: bs, amountUsd: usd })
  const brecha = rateBcv?.rate ? brechaPct(rateReal, rateBcv.rate) : null

  // Advierte sin bloquear: puede haber un cobro sin registrar todavía que cubra
  // la diferencia (§8.2/§8.3 de la spec).
  const saldoRelevante = opType === 'compra' ? saldoBs : divisaFisica
  const excedeSaldo = opType === 'compra' ? bs > saldoRelevante + 0.5 : usd > saldoRelevante + 0.5

  async function handleSubmit(e) {
    e.preventDefault()
    if (!bs || bs <= 0 || !usd || usd <= 0) {
      setError('Los dos montos deben ser mayores a 0')
      return
    }
    if (!rateBcv?.rate) {
      setError('No hay tasa BCV cargada — carga la tasa del día antes de registrar la operación')
      return
    }
    setSaving(true)
    setError(null)
    const { error: err } = await createFxOperation(monthId, {
      companyId,
      opType,
      movedOn: date,
      amountBs: bs,
      amountUsd: usd,
      rateBcv: rateBcv.rate,
      counterparty: counterparty.trim() || null,
      purpose: purpose.trim() || null,
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
          <h2 className="text-[18px] font-bold text-[#111]">{label}</h2>
          <p className="text-[13px] text-[#888] mt-0.5">
            Las operaciones no se editan: si te equivocas, elimínala y regístrala de nuevo.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          {error && <p className="text-[13px] text-[#D6453F]">{error}</p>}

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
              {opType === 'compra' ? 'Bs que entregas' : 'Bs que recibes'}
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
              {opType === 'compra' ? 'Dólares que recibes' : 'Dólares que entregas'}
            </label>
            <input
              type="number"
              className="input-base"
              value={amountUsd}
              onChange={(e) => setAmountUsd(e.target.value)}
            />
          </div>

          {bs > 0 && usd > 0 && (
            <p className="text-[12.5px] text-[#666]">
              Tasa real: <span className="font-mono font-semibold">{fmtBs(rateReal)}</span>
              {rateBcv?.rate != null && (
                <>
                  {' '}
                  · BCV: <span className="font-mono font-semibold">{fmtBs(rateBcv.rate)}</span>
                </>
              )}
              {brecha != null && (
                <>
                  {' '}
                  · Brecha:{' '}
                  <span className="font-mono font-semibold">{(brecha * 100).toFixed(1)}%</span>
                </>
              )}
            </p>
          )}

          {!rateBcv?.rate && (
            <p className="text-[12.5px] text-[#9a6800]">
              No hay tasa BCV cargada — carga la tasa desde el botón &quot;Tasa BCV&quot; antes de
              registrar.
            </p>
          )}

          <div>
            <label className="block text-[12px] font-mono font-bold uppercase tracking-wide text-[#888] mb-1.5">
              {opType === 'compra'
                ? 'A quién le compraste (opcional)'
                : 'A quién le vendiste (opcional)'}
            </label>
            <input
              type="text"
              className="input-base"
              value={counterparty}
              onChange={(e) => setCounterparty(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-[12px] font-mono font-bold uppercase tracking-wide text-[#888] mb-1.5">
              Para qué (opcional)
            </label>
            <input
              type="text"
              className="input-base"
              value={purpose}
              onChange={(e) => setPurpose(e.target.value)}
              placeholder="Ej. para nómina de la primera quincena"
            />
          </div>

          {excedeSaldo && (
            <p className="text-[12.5px] text-[#9a6800]">
              {opType === 'compra'
                ? `Supera el saldo actual de Caja Bs (${fmtBs(saldoRelevante)} Bs) — puede haber un cobro sin registrar todavía.`
                : `Supera la divisa física actual (${fmtUSD(saldoRelevante)}) — puede haber un cobro sin registrar todavía.`}
            </p>
          )}

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
              {saving ? 'Guardando…' : opType === 'compra' ? 'Registrar compra' : 'Registrar venta'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
