import { useEffect, useState } from 'react'
import { supabase } from '../../../supabase'
import { isVigente } from '../../../utils/tacticas'

/**
 * Aviso para la ficha de un cliente: la marca no tiene ninguna táctica vigente ni programada.
 * Consulta sus tácticas y, si no hay una en marcha, ofrece abrir su ficha de tácticas.
 *
 * Es deliberadamente defensivo: si la consulta falla o todavía no responde, no muestra nada
 * (un aviso que no se puede comprobar sería ruido en una ficha que tiene otro propósito).
 *
 * @param {object}   props
 * @param {string}   props.clientId   — metric_clients.id
 * @param {Function} props.onOpen     — (clientId) => void, navega a /ads?client=<id>
 */
export default function SinTacticaAviso({ clientId, onOpen }) {
  const [sinVigente, setSinVigente] = useState(false)

  useEffect(() => {
    if (!clientId) return undefined
    let alive = true
    ;(async () => {
      try {
        const { data, error } = await supabase
          .from('campaigns')
          .select('status, end_date')
          .eq('client_id', clientId)
        if (!alive || error || !Array.isArray(data)) return
        setSinVigente(!data.some((c) => isVigente(c)))
      } catch {
        // Sin dato no se avisa.
      }
    })()
    return () => {
      alive = false
    }
  }, [clientId])

  if (!sinVigente) return null

  return (
    <div
      role="alert"
      className="flex flex-wrap items-center justify-between gap-2 bg-[#fff1c2] border border-[#f0d57a] rounded-xl px-3.5 py-2.5"
    >
      <p className="text-[13.5px] font-semibold text-[#6e4a00]">Sin táctica vigente</p>
      <button
        type="button"
        onClick={() => onOpen(clientId)}
        className="text-[13px] font-semibold text-[#6e4a00] underline underline-offset-2 hover:text-[#111]"
      >
        Ver tácticas
      </button>
    </div>
  )
}
