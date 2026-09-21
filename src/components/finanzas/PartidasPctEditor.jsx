import { useState } from 'react'
import { PARTIDAS, PARTIDA_KEYS } from './constants'
import { updateMonthPcts } from './finanzasApi'

/**
 * Bloque de edición del reparto del mes (72/18/10 por defecto). Los % viven en
 * `fin_months` — un mes cerrado sigue auditable contra el % vigente cuando se
 * cerró aunque la política cambie después (ver src/utils/finanzas.js → pctsDelMes).
 */
export default function PartidasPctEditor({ finMonth, pcts, canManage, closed, onSaved }) {
  const [editing, setEditing] = useState(false)
  const [values, setValues] = useState(() => ({
    gastos: String(Math.round(pcts.gastos * 100)),
    socios: String(Math.round(pcts.socios * 100)),
    ganancia: String(Math.round(pcts.ganancia * 100)),
  }))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  if (!canManage) return null

  const suma = PARTIDA_KEYS.reduce((a, p) => a + (Number(values[p]) || 0), 0)

  async function handleSave() {
    if (suma !== 100) {
      setError('Los porcentajes deben sumar 100%')
      return
    }
    setSaving(true)
    setError(null)
    const { error: err } = await updateMonthPcts(finMonth.id, {
      gastos: Number(values.gastos) / 100,
      socios: Number(values.socios) / 100,
      ganancia: Number(values.ganancia) / 100,
    })
    setSaving(false)
    if (err) {
      setError(err.message)
      return
    }
    setEditing(false)
    onSaved()
  }

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        disabled={closed}
        className="text-[12.5px] text-[#666] hover:text-[#111] hover:underline disabled:opacity-50 disabled:no-underline"
      >
        Reparto del mes: {Math.round(pcts.gastos * 100)}/{Math.round(pcts.socios * 100)}/
        {Math.round(pcts.ganancia * 100)} · Editar
      </button>
    )
  }

  return (
    <div className="bg-white border border-[#e0ddd4] rounded-xl p-3 flex items-center gap-3 flex-wrap">
      {error && <p className="text-[12.5px] text-[#D6453F] w-full">{error}</p>}
      {PARTIDA_KEYS.map((p) => (
        <div key={p} className="flex items-center gap-1.5">
          <span className={`text-[12.5px] font-medium ${PARTIDAS[p].text}`}>
            {PARTIDAS[p].name}
          </span>
          <input
            type="number"
            className="input-base w-16 text-center"
            value={values[p]}
            onChange={(e) => setValues((v) => ({ ...v, [p]: e.target.value }))}
          />
          <span className="text-[12.5px] text-[#999]">%</span>
        </div>
      ))}
      <span
        className={`text-[12.5px] font-semibold ${suma === 100 ? 'text-[#1F9D57]' : 'text-[#D6453F]'}`}
      >
        suma {suma}%
      </span>
      <button
        type="button"
        onClick={() => setEditing(false)}
        className="text-[12.5px] text-[#666] hover:underline"
      >
        Cancelar
      </button>
      <button
        type="button"
        onClick={handleSave}
        disabled={saving}
        className="px-3 py-1.5 rounded-lg text-[12.5px] font-semibold bg-[#111] text-white hover:bg-[#333] disabled:opacity-50"
      >
        {saving ? 'Guardando…' : 'Guardar'}
      </button>
    </div>
  )
}
