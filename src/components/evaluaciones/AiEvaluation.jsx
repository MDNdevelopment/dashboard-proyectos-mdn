import { useState } from 'react'
import { supabase } from '../../supabase'

const SECTION_LABELS = {
  strengths: 'Fortalezas',
  weaknesses: 'Debilidades',
  recommendations: 'Recomendaciones',
}

export default function AiEvaluation({ employeeId }) {
  const [analysis, setAnalysis] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  async function handleGenerate() {
    setLoading(true)
    setError(null)

    const { data: { session } } = await supabase.auth.getSession()

    let res
    try {
      res = await fetch('/api/evaluation-analysis', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ employeeId }),
      })
    } catch {
      setError('Error de red. Intenta de nuevo.')
      setLoading(false)
      return
    }

    const payload = await res.json()

    if (!res.ok) {
      setError(payload.error ?? 'Error al generar el análisis')
      setLoading(false)
      return
    }

    setAnalysis(payload)
    setLoading(false)
  }

  return (
    <div className="bg-white rounded-2xl border border-[#e0ddd4] px-5 py-4">
      <div className="flex items-center justify-between mb-4">
        <p className="text-[11px] font-mono font-bold tracking-[0.14em] uppercase text-[#888]">
          Análisis IA
        </p>
        {!analysis && !loading && (
          <button
            type="button"
            onClick={handleGenerate}
            className="px-4 py-2 rounded-xl text-[13px] font-bold bg-[#111] text-white hover:bg-[#222] transition-colors"
          >
            Generar análisis IA
          </button>
        )}
        {analysis && !loading && (
          <button
            type="button"
            onClick={() => { setAnalysis(null); setError(null) }}
            className="px-3 py-1.5 rounded-xl text-[12px] font-semibold text-[#555] border border-[#e0ddd4] hover:bg-[#f5f3eb] transition-colors"
          >
            Regenerar
          </button>
        )}
      </div>

      {/* Estado de carga */}
      {loading && (
        <div className="flex items-center gap-3 py-6">
          <div className="w-6 h-6 border-2 border-[#FFB800] border-t-transparent rounded-full animate-spin flex-shrink-0" />
          <span className="text-[13px] text-[#888]">Generando análisis…</span>
        </div>
      )}

      {/* Estado de error */}
      {error && !loading && (
        <div className="space-y-3">
          <div className="bg-red-50 border border-red-200 text-red-700 text-[13px] rounded-xl px-4 py-3">
            {error}
          </div>
          <button
            type="button"
            onClick={handleGenerate}
            className="px-4 py-2 rounded-xl text-[13px] font-bold bg-[#111] text-white hover:bg-[#222] transition-colors"
          >
            Reintentar
          </button>
        </div>
      )}

      {/* Resultado */}
      {analysis && !loading && (
        <div className="space-y-5">
          {/* Resumen */}
          <div>
            <p className="text-[11px] font-mono font-bold tracking-[0.1em] uppercase text-[#bbb] mb-1.5">
              Resumen
            </p>
            <p className="text-[13px] text-[#333] leading-relaxed">{analysis.summary}</p>
          </div>

          {/* Fortalezas / Debilidades / Recomendaciones */}
          {['strengths', 'weaknesses', 'recommendations'].map(key => {
            const items = analysis[key]
            if (!Array.isArray(items) || items.length === 0) return null
            return (
              <div key={key}>
                <p className="text-[11px] font-mono font-bold tracking-[0.1em] uppercase text-[#bbb] mb-1.5">
                  {SECTION_LABELS[key]}
                </p>
                <ul className="space-y-1.5">
                  {items.map((item, i) => (
                    <li key={i} className="flex items-start gap-2 text-[13px] text-[#333] leading-relaxed">
                      <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-[#FFB800] flex-shrink-0" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            )
          })}
        </div>
      )}

      {/* Estado inicial (sin acción aún) */}
      {!analysis && !loading && !error && (
        <p className="text-[13px] text-[#aaa] pb-2">
          Genera un análisis de desempeño basado en todo el historial de evaluaciones del empleado.
        </p>
      )}
    </div>
  )
}
