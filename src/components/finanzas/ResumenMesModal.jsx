import { useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import { createSummaryMonth } from './finanzasApi'
import { MONTHS } from '../metricas/constants'

const FIELDS = [
  { key: 'totalFacturado', label: 'Total facturado' },
  { key: 'totalCobrado', label: 'Total cobrado' },
  { key: 'totalGastos', label: 'Gastos operativos' },
  { key: 'totalSocios', label: 'Socios' },
  { key: 'totalGanancia', label: 'Ganancia' },
]

/**
 * Carga un mes histórico como "resumen": solo 5 totales, sin factura/cobro/
 * distribución fila por fila. Pensado para periodos de referencia que no
 * vienen estructurados como la página lo pide (ver ARQUITECTURA.md §2.15).
 * El mes queda `closed` de una vez — no hay un flujo de "cerrar" para un mes
 * sin desglose.
 */
export default function ResumenMesModal({ companyId, year, month, onClose, onSaved }) {
  const { userProfile } = useAuth()
  const [values, setValues] = useState({
    totalFacturado: '',
    totalCobrado: '',
    totalGastos: '',
    totalSocios: '',
    totalGanancia: '',
  })
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  function setField(key, v) {
    setValues((s) => ({ ...s, [key]: v }))
  }

  async function handleSave() {
    setSaving(true)
    setError(null)
    const totals = Object.fromEntries(FIELDS.map(({ key }) => [key, Number(values[key]) || 0]))
    const { error: err } = await createSummaryMonth({
      companyId,
      year,
      month,
      userId: userProfile?.user_id,
      totals: { ...totals, note: note.trim() || null },
    })
    setSaving(false)
    if (err) {
      setError(err.message)
      return
    }
    onSaved?.()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/25 backdrop-blur-[3px]">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
        <h2 className="text-[17px] font-bold text-[#111] mb-1">
          Cargar {MONTHS[month - 1]} {year} como resumen
        </h2>
        <p className="text-[13px] text-[#888] mb-4">
          Solo los montos totales del mes, sin factura ni cobro por cliente. Ideal para un mes
          histórico que no viene estructurado. El mes queda cerrado de inmediato.
        </p>

        <div className="space-y-2.5">
          {FIELDS.map(({ key, label }) => (
            <label key={key} className="block">
              <span className="block text-[12.5px] text-[#666] mb-1">{label}</span>
              <input
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                value={values[key]}
                onChange={(e) => setField(key, e.target.value)}
                className="input-base w-full"
                placeholder="0.00"
              />
            </label>
          ))}
          <label className="block">
            <span className="block text-[12.5px] text-[#666] mb-1">Nota (opcional)</span>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="input-base w-full"
              placeholder="Ej. tomado del Google Sheet de cierre"
            />
          </label>
        </div>

        {error && <p className="text-[13px] text-[#D6453F] mt-3">{error}</p>}

        <div className="flex justify-end gap-2 mt-5">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg text-[13.5px] font-semibold text-[#666] hover:bg-[#f5f3eb]"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="px-3 py-1.5 rounded-lg text-[13.5px] font-semibold bg-[#111] text-white hover:bg-[#333] disabled:opacity-50"
          >
            {saving ? 'Guardando…' : 'Guardar resumen'}
          </button>
        </div>
      </div>
    </div>
  )
}
