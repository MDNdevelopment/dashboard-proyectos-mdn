import { useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import { fmtUSD } from '../../utils/metricsFinance'
import { createDistribution, createDistributionsBatch } from './finanzasApi'
import { PARTIDAS, PARTIDA_KEYS, NOTA_TRASPASO_PARTIDA } from './constants'

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

/**
 * Modal de registro de un pago (egreso) contra el saldo de una partida.
 *
 * Si el monto excede el disponible de la partida, en vez de bloquear pide de cuál
 * otra partida tomar la diferencia: registra el traspaso (salida de la partida
 * origen + entrada a la partida que paga) y el pago, los 3 movimientos juntos en un
 * solo insert (createDistributionsBatch) — nunca dos llamadas sueltas, para no dejar
 * el traspaso a medias si la segunda falla.
 */
export default function PagoPartidaModal({ monthId, partida, saldos, onClose, onSaved }) {
  const { userProfile } = useAuth()
  const [concept, setConcept] = useState('')
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(todayISO())
  const [sourcePartida, setSourcePartida] = useState(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const saldoDisponible = saldos[partida]
  const amt = Number(amount) || 0
  const faltante = Math.max(0, amt - saldoDisponible)
  const otrasPartidas = PARTIDA_KEYS.filter((p) => p !== partida)

  async function handleSubmit(e) {
    e.preventDefault()
    if (!amt || amt <= 0) {
      setError('El monto debe ser mayor a 0')
      return
    }
    if (!concept.trim()) {
      setError('Este campo es obligatorio')
      return
    }
    if (faltante > 0.5) {
      if (!sourcePartida) {
        setError('Elige de qué partida tomar la diferencia')
        return
      }
      if (faltante > saldos[sourcePartida] + 0.5) {
        setError(
          `${PARTIDAS[sourcePartida].name} tampoco alcanza (disponible ${fmtUSD(saldos[sourcePartida])})`,
        )
        return
      }
    }

    setSaving(true)
    setError(null)
    const beneficiary = partida === 'socios' ? concept.trim() : null
    const rows =
      faltante > 0.5
        ? [
            {
              partida: sourcePartida,
              kind: 'out',
              movedOn: date,
              concept: `Traspaso a ${PARTIDAS[partida].name}: ${concept.trim()}`,
              amount: faltante,
              note: NOTA_TRASPASO_PARTIDA,
              createdBy: userProfile?.user_id,
            },
            {
              partida,
              kind: 'in',
              movedOn: date,
              concept: `Traspaso desde ${PARTIDAS[sourcePartida].name}`,
              amount: faltante,
              note: NOTA_TRASPASO_PARTIDA,
              createdBy: userProfile?.user_id,
            },
            {
              partida,
              kind: 'out',
              movedOn: date,
              concept: concept.trim(),
              beneficiary,
              amount: amt,
              createdBy: userProfile?.user_id,
            },
          ]
        : null

    const { error: err } = rows
      ? await createDistributionsBatch(monthId, rows)
      : await createDistribution(monthId, {
          partida,
          kind: 'out',
          movedOn: date,
          concept: concept.trim(),
          beneficiary,
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

          {faltante > 0.5 && (
            <div className="rounded-xl border border-[#f0d9a0] bg-[#fff8ea] p-3 space-y-2">
              <p className="text-[12.5px] text-[#9a6800] font-medium">
                Excede el disponible de {PARTIDAS[partida].name} por {fmtUSD(faltante)}. ¿De qué
                partida tomamos la diferencia?
              </p>
              <div className="flex gap-2">
                {otrasPartidas.map((p) => {
                  const alcanza = saldos[p] >= faltante - 0.5
                  return (
                    <button
                      key={p}
                      type="button"
                      disabled={!alcanza}
                      onClick={() => setSourcePartida(p)}
                      className={`flex-1 rounded-lg border px-2 py-2 text-[12.5px] font-semibold text-left transition-colors ${
                        sourcePartida === p
                          ? 'border-[#111] bg-[#111] text-white'
                          : alcanza
                            ? 'border-[#e0ddd4] text-[#333] hover:bg-[#f5f3eb]'
                            : 'border-[#e0ddd4] text-[#bbb] cursor-not-allowed opacity-60'
                      }`}
                    >
                      {PARTIDAS[p].name}
                      <br />
                      <span className="font-normal">{fmtUSD(saldos[p])} disp.</span>
                    </button>
                  )
                })}
              </div>
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
