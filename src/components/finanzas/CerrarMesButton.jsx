import { useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import { closeMonth } from './finanzasApi'
import { MONTHS } from '../metricas/constants'

/**
 * Botón + confirmación para cerrar el mes activo y abrir el siguiente,
 * precargando su facturación recurrente. Ver finanzasApi.closeMonth().
 */
export default function CerrarMesButton({ companyId, finMonth, year, month, clients, onDone }) {
  const { userProfile } = useAuth()
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  if (finMonth?.closed) return null

  async function handleClose() {
    setSaving(true)
    setError(null)
    const { error: err } = await closeMonth({
      companyId,
      monthId: finMonth.id,
      year,
      month,
      userId: userProfile?.user_id,
      clients,
    })
    setSaving(false)
    if (err) {
      setError(err.message)
      return
    }
    setOpen(false)
    onDone?.()
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="px-3 py-1.5 rounded-lg text-[13px] font-semibold text-[#666] border border-[#e0ddd4] hover:bg-[#f5f3eb] transition-colors"
      >
        Cerrar mes
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/25 backdrop-blur-[3px]">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
            <h2 className="text-[17px] font-bold text-[#111] mb-2">
              Cerrar {MONTHS[month - 1]} {year}
            </h2>
            <p className="text-[13.5px] text-[#666] mb-4">
              Ya no se podrá modificar facturación, cobros ni distribución de este mes. Se abrirá el
              mes siguiente con la facturación recurrente precargada.
            </p>
            {error && <p className="text-[13px] text-[#D6453F] mb-3">{error}</p>}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="px-3 py-1.5 rounded-lg text-[13.5px] font-semibold text-[#666] hover:bg-[#f5f3eb]"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleClose}
                disabled={saving}
                className="px-3 py-1.5 rounded-lg text-[13.5px] font-semibold bg-[#111] text-white hover:bg-[#333] disabled:opacity-50"
              >
                {saving ? 'Cerrando…' : 'Cerrar mes'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
