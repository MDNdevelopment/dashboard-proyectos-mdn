import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../supabase'
import { useAiChatContext } from '../../context/AiChatContext'
import { buildChatSeed } from '../../lib/avWorkloadSeed'
import AiAvatar from '../ai/AiAvatar'

/**
 * Recuadro "Recomendaciones" del Home (solo admins): avatar de MAPPI + burbuja blanca con
 * su análisis de carga de Audiovisual (ver netlify/functions/av-workload-insight.js —
 * personas de Audiovisual con 3+ pautas en un mismo día, en la ventana hoy ±3 días).
 * Mismo patrón de fetch autenticado y caché diaria que CeoAnalysisCard.jsx, pero con el
 * layout de burbuja de chat en vez de tarjeta oscura, y un botón para llevar el contexto
 * al chat de MAPPI (openWithContext).
 */
export default function RecomendacionesCard() {
  const [insight, setInsight] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const { openWithContext } = useAiChatContext()

  const fetchInsight = useCallback(async (refresh = false) => {
    setLoading(true)
    setError(null)

    const {
      data: { session },
    } = await supabase.auth.getSession()

    let res
    try {
      res = await fetch('/api/av-workload-insight', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({ refresh }),
      })
    } catch {
      setError('Error de red. Intenta de nuevo.')
      setLoading(false)
      return
    }

    let payload
    try {
      payload = await res.json()
    } catch {
      setError('Respuesta inválida del servidor. Intenta de nuevo.')
      setLoading(false)
      return
    }

    if (!res.ok) {
      setError(payload.error ?? 'Error al generar las recomendaciones')
      setLoading(false)
      return
    }

    setInsight(payload)
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchInsight(false)
  }, [fetchInsight])

  const hallazgos = Array.isArray(insight?.hallazgos) ? insight.hallazgos : []

  if (!loading && !error && !insight?.resumen && hallazgos.length === 0) {
    return null
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3 gap-3">
        <div className="flex items-center gap-2">
          <span className="w-1.5 h-4 rounded-full bg-[#ccc]" aria-hidden="true" />
          <h2 className="text-[13px] font-mono font-bold tracking-[0.14em] uppercase text-[#888]">
            Recomendaciones
          </h2>
        </div>
        <button
          type="button"
          onClick={() => fetchInsight(true)}
          disabled={loading}
          className="text-[13px] font-semibold text-[#666] hover:text-[#111] transition-colors disabled:opacity-50"
        >
          Actualizar
        </button>
      </div>

      <div className="flex items-start gap-3">
        <AiAvatar size={56} bordered />
        <div className="flex-1 min-w-0 bg-white rounded-2xl rounded-tl-sm border-2 border-[#FFB800] px-5 py-4">
          {loading && (
            <div className="flex items-center gap-3 py-1">
              <div className="w-4 h-4 border-2 border-[#FFB800] border-t-transparent rounded-full animate-spin flex-shrink-0" />
              <span className="text-[14px] text-[#888]">Analizando la carga del equipo…</span>
            </div>
          )}

          {error && !loading && (
            <div className="space-y-2">
              <p className="text-[14px] text-[#E14848]">{error}</p>
              <button
                type="button"
                onClick={() => fetchInsight(false)}
                className="text-[13.5px] font-semibold text-[#111] underline underline-offset-2"
              >
                Reintentar
              </button>
            </div>
          )}

          {insight && !loading && !error && (
            <div className="space-y-3">
              {insight.resumen && (
                <p className="text-[14.5px] text-[#111] leading-relaxed">{insight.resumen}</p>
              )}

              {hallazgos.length > 0 && (
                <ul className="space-y-2">
                  {hallazgos.map((h, i) => (
                    <li key={i} className="text-[14px] text-[#333] leading-relaxed">
                      <span className="font-semibold text-[#111]">{h.persona}</span>
                      {h.detalle ? ` — ${h.detalle}` : ''}
                      {h.sugerencia && (
                        <div className="text-[13.5px] text-[#888] mt-0.5">→ {h.sugerencia}</div>
                      )}
                    </li>
                  ))}
                </ul>
              )}

              {hallazgos.length > 0 && (
                <button
                  type="button"
                  onClick={() => openWithContext(buildChatSeed(insight))}
                  className="text-[13.5px] font-semibold text-[#111] underline underline-offset-2 hover:text-[#666] transition-colors"
                >
                  Preguntarle a MAPPI sobre esto
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
