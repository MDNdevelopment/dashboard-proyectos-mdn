import { useState, useMemo, useEffect } from 'react'
import { moveClientToLine } from './metricsApi'
import { prorateMonthlyFee, daysInMonth } from '../../utils/prorateMonthlyFee'
import { useAuth } from '../../context/AuthContext'
import DateInput from '../common/DateInput'
import { fmtUSD } from '../../utils/metricsFinance'

function todayIso() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function isoParts(iso) {
  const [y, m, d] = String(iso).split('-').map(Number)
  return { year: y, month: m, day: d }
}

/**
 * Modal para mover una cuenta de una línea a otra con prorrateo del ingreso del mes.
 * Al confirmar: materializa la atribución del mes de transición en los reportes de ambas
 * líneas y cambia client.line_id (ver metricsApi.moveClientToLine / utils/moveClientLine).
 *
 * Props:
 *   client      — fila del cliente (id, name, line_id, monthly_fee)
 *   lines       — líneas disponibles (para elegir destino)
 *   companyId   — string
 *   onClose()   — cierra el modal
 *   onMoved(updatedClient) — callback tras mover con éxito
 */
export default function MoverClienteModal({ client, lines = [], companyId, onClose, onMoved }) {
  const { userProfile } = useAuth()
  const fee = Number(client?.monthly_fee) || 0

  const fromLine = lines.find((l) => l.id === client?.line_id) ?? null
  const destOptions = lines.filter((l) => l.id !== client?.line_id)

  const [toLineId, setToLineId] = useState('')
  const [effectiveDate, setEffectiveDate] = useState(todayIso)
  const [oldAmount, setOldAmount] = useState(0)
  const [newAmount, setNewAmount] = useState(0)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const { year, month, day } = isoParts(effectiveDate)
  const totalDays = useMemo(() => daysInMonth(year, month), [year, month])

  // Prorrateo por defecto: se recalcula al cambiar fecha o cuenta. El usuario puede
  // luego ajustar los montos a mano (se mantienen espejados para que sumen el fee).
  const preview = useMemo(() => prorateMonthlyFee(fee, day, totalDays), [fee, day, totalDays])
  useEffect(() => {
    setOldAmount(preview.oldAmount)
    setNewAmount(preview.newAmount)
  }, [preview.oldAmount, preview.newAmount])

  const toLine = lines.find((l) => l.id === toLineId) ?? null

  function editOld(v) {
    const val = v === '' ? 0 : Number(v)
    setOldAmount(val)
    setNewAmount(Math.round((fee - val + Number.EPSILON) * 100) / 100)
  }
  function editNew(v) {
    const val = v === '' ? 0 : Number(v)
    setNewAmount(val)
    setOldAmount(Math.round((fee - val + Number.EPSILON) * 100) / 100)
  }

  async function handleConfirm() {
    if (!toLineId) {
      setError('Selecciona la línea destino.')
      return
    }
    setSaving(true)
    setError(null)
    const { data, error: err } = await moveClientToLine({
      companyId,
      client,
      toLineId,
      effectiveDate,
      oldAmount,
      newAmount,
      userId: userProfile?.user_id ?? null,
    })
    setSaving(false)
    if (err) {
      setError(err.message)
      return
    }
    onMoved?.(data)
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/25 backdrop-blur-[3px]">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md flex flex-col max-h-[90vh]">
        <div className="flex-shrink-0 flex items-center justify-between px-6 pt-5 pb-4 border-b border-[#ece9df]">
          <h2 className="text-[18px] font-bold text-[#111]">Mover de línea</h2>
          <button
            type="button"
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-lg text-[#999] hover:text-[#111] hover:bg-[#f0ede3] transition-colors"
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

        <div className="px-6 py-5 space-y-5 overflow-y-auto flex-1">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-[14px] rounded-lg px-3 py-2">
              {error}
            </div>
          )}

          <p className="text-[14px] text-[#555]">
            Mover <span className="font-semibold text-[#111]">{client?.name}</span>
            {fromLine ? (
              <>
                {' '}
                de <span className="font-semibold">{fromLine.name}</span>
              </>
            ) : null}{' '}
            a otra línea.
          </p>

          {/* Línea destino */}
          <div>
            <label className="block text-[13px] font-mono font-bold tracking-[0.12em] uppercase text-[#888] mb-1.5">
              Línea destino
            </label>
            <select
              className="input-base"
              value={toLineId}
              onChange={(e) => setToLineId(e.target.value)}
            >
              <option value="">Seleccionar…</option>
              {destOptions.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </div>

          {/* Fecha efectiva */}
          <div>
            <label className="block text-[13px] font-mono font-bold tracking-[0.12em] uppercase text-[#888] mb-1.5">
              Fecha del cambio
            </label>
            <DateInput
              value={effectiveDate}
              onChange={(v) => setEffectiveDate(v || todayIso())}
              clearable={false}
            />
            <p className="text-[12px] text-[#999] mt-1">
              Desde esta fecha la cuenta cuenta para la línea nueva.
            </p>
          </div>

          {/* Prorrateo del ingreso del mes */}
          <div className="bg-[#faf9f5] border border-[#ece9df] rounded-xl p-4 space-y-3">
            <p className="text-[13px] font-mono font-bold tracking-[0.12em] uppercase text-[#888]">
              Ingreso del mes ({fmtUSD(fee)})
            </p>
            {fee > 0 ? (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-[11.5px] font-mono text-[#aaa] uppercase tracking-wide mb-1">
                      {fromLine?.name ?? 'Línea vieja'} ({preview.oldDays}d)
                    </p>
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      className="input-base"
                      value={oldAmount}
                      onChange={(e) => editOld(e.target.value)}
                    />
                  </div>
                  <div>
                    <p className="text-[11.5px] font-mono text-[#aaa] uppercase tracking-wide mb-1">
                      {toLine?.name ?? 'Línea nueva'} ({preview.newDays}d)
                    </p>
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      className="input-base"
                      value={newAmount}
                      onChange={(e) => editNew(e.target.value)}
                    />
                  </div>
                </div>
                <p className="text-[12px] text-[#999]">
                  Prorrateado por días (editable). El operativo del mes (crecimiento, pautas,
                  feedback) se migra a la línea nueva.
                </p>
              </>
            ) : (
              <p className="text-[13px] text-[#888]">
                La cuenta no tiene mensualidad configurada; solo se migra el operativo a la línea
                nueva.
              </p>
            )}
          </div>
        </div>

        <div className="flex-shrink-0 flex items-center justify-end gap-2 px-6 py-4 border-t border-[#ece9df]">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-[15px] font-semibold text-[#555] border border-[#e0ddd4] hover:bg-[#f5f3eb] transition-colors"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={saving || !toLineId}
            className="px-4 py-2 rounded-xl text-[15px] font-bold bg-[#111] text-white hover:bg-[#222] transition-colors disabled:opacity-50"
          >
            {saving ? 'Moviendo…' : 'Mover'}
          </button>
        </div>
      </div>
    </div>
  )
}
