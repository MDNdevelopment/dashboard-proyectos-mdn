import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../../supabase'

const SEMAFORO_COLOR = { verde: '#16A34A', amarillo: '#FFB800', rojo: '#E14848' }
const TENDENCIA_ICON = { sube: '↑', baja: '↓', estable: '→' }

function formatGeneratedAt(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  const isToday = d.toDateString() === new Date().toDateString()
  const time = d.toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' })
  return isToday
    ? `Actualizado hoy · ${time}`
    : `Actualizado ${d.toLocaleDateString('es-VE')} · ${time}`
}

/**
 * Recuadro "Análisis IA" del Home: resumen ejecutivo generado por Gemini a partir de
 * los indicadores agregados de la empresa (ver netlify/functions/ceo-analysis.js).
 * Se autogenera al montar (con caché diaria en el backend); el botón "Actualizar"
 * fuerza una regeneración. Visibilidad gateada en HomePage vía canSeeCeoAnalysis().
 */
export default function CeoAnalysisCard() {
  const [analysis, setAnalysis] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const fetchAnalysis = useCallback(async (refresh = false) => {
    setLoading(true)
    setError(null)

    const {
      data: { session },
    } = await supabase.auth.getSession()

    let res
    try {
      res = await fetch('/api/ceo-analysis', {
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
      setError(payload.error ?? 'Error al generar el análisis')
      setLoading(false)
      return
    }

    setAnalysis(payload)
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchAnalysis(false)
  }, [fetchAnalysis])

  const semaforoColor = analysis?.estado_general?.semaforo
    ? (SEMAFORO_COLOR[analysis.estado_general.semaforo] ?? '#888')
    : '#888'

  return (
    <div className="relative overflow-hidden rounded-3xl bg-[#111111] px-6 py-7 sm:px-9 sm:py-9">
      <div
        className="absolute inset-0 opacity-[0.07]"
        style={{
          backgroundImage: 'radial-gradient(rgba(255,255,255,0.9) 1px, transparent 1px)',
          backgroundSize: '18px 18px',
        }}
        aria-hidden="true"
      />
      <div
        className="absolute -right-16 -top-20 w-64 h-64 rounded-full blur-3xl opacity-25"
        style={{ backgroundColor: '#FFB800' }}
        aria-hidden="true"
      />

      <div className="relative">
        <div className="flex items-center justify-between mb-4 gap-3">
          <p className="text-[13px] font-mono font-bold tracking-[0.14em] uppercase text-[#FFB800]">
            Análisis IA · Cómo va la empresa
          </p>
          <div className="flex items-center gap-3 flex-shrink-0">
            {analysis?.generated_at && !loading && (
              <span className="text-[12px] text-[#888] hidden sm:inline">
                {formatGeneratedAt(analysis.generated_at)}
              </span>
            )}
            <button
              type="button"
              onClick={() => fetchAnalysis(true)}
              disabled={loading}
              className="px-3 py-1.5 rounded-xl text-[13px] font-semibold text-[#ddd] border border-white/15 hover:bg-white/10 transition-colors disabled:opacity-50"
            >
              Actualizar
            </button>
          </div>
        </div>

        {loading && (
          <div className="flex items-center gap-3 py-6">
            <div className="w-6 h-6 border-2 border-[#FFB800] border-t-transparent rounded-full animate-spin flex-shrink-0" />
            <span className="text-[15px] text-[#bbb]">Generando análisis…</span>
          </div>
        )}

        {error && !loading && (
          <div className="space-y-3">
            <div className="bg-red-500/10 border border-red-500/30 text-red-300 text-[15px] rounded-xl px-4 py-3">
              {error}
            </div>
            <button
              type="button"
              onClick={() => fetchAnalysis(false)}
              className="px-4 py-2 rounded-xl text-[15px] font-bold bg-[#FFB800] text-[#111] hover:bg-[#e6a600] transition-colors"
            >
              Reintentar
            </button>
          </div>
        )}

        {analysis && !loading && !error && (
          <div className="space-y-5">
            {/* Estado general */}
            {analysis.estado_general && (
              <div className="flex items-start gap-3">
                <span
                  className="mt-1.5 w-2.5 h-2.5 rounded-full flex-shrink-0"
                  style={{ backgroundColor: semaforoColor }}
                  aria-hidden="true"
                />
                <div className="min-w-0">
                  <h3 className="text-[19px] font-bold text-white leading-snug">
                    {analysis.estado_general.titulo}
                  </h3>
                  <p className="text-[14.5px] text-[#ccc] leading-relaxed mt-1">
                    {analysis.estado_general.resumen}
                  </p>
                </div>
              </div>
            )}

            {/* Métricas clave */}
            {Array.isArray(analysis.metricas_clave) && analysis.metricas_clave.length > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {analysis.metricas_clave.map((m, i) => (
                  <div key={i} className="bg-white/5 border border-white/10 rounded-xl px-3 py-2.5">
                    <p className="text-[11px] font-mono uppercase tracking-[0.08em] text-[#999] truncate">
                      {m.label}
                    </p>
                    <p className="text-[17px] font-bold text-white mt-0.5">
                      {m.valor}{' '}
                      {m.tendencia && (
                        <span className="text-[13px] text-[#999]">
                          {TENDENCIA_ICON[m.tendencia] ?? ''}
                        </span>
                      )}
                    </p>
                  </div>
                ))}
              </div>
            )}

            {/* Fortalezas / Áreas de mejora */}
            {(analysis.fortalezas?.length > 0 || analysis.areas_mejora?.length > 0) && (
              <div className="grid sm:grid-cols-2 gap-4">
                {analysis.fortalezas?.length > 0 && (
                  <div>
                    <p className="text-[12px] font-mono font-bold tracking-[0.1em] uppercase text-[#999] mb-1.5">
                      Fortalezas
                    </p>
                    <ul className="space-y-1.5">
                      {analysis.fortalezas.map((item, i) => (
                        <li
                          key={i}
                          className="flex items-start gap-2 text-[14px] text-[#ddd] leading-relaxed"
                        >
                          <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-[#16A34A] flex-shrink-0" />
                          {item}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {analysis.areas_mejora?.length > 0 && (
                  <div>
                    <p className="text-[12px] font-mono font-bold tracking-[0.1em] uppercase text-[#999] mb-1.5">
                      Áreas de mejora
                    </p>
                    <ul className="space-y-1.5">
                      {analysis.areas_mejora.map((item, i) => (
                        <li
                          key={i}
                          className="flex items-start gap-2 text-[14px] text-[#ddd] leading-relaxed"
                        >
                          <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-[#FFB800] flex-shrink-0" />
                          {item}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            {/* Críticos */}
            {Array.isArray(analysis.criticos) && analysis.criticos.length > 0 && (
              <div>
                <p className="text-[12px] font-mono font-bold tracking-[0.1em] uppercase text-[#f5a3a3] mb-1.5">
                  Necesita acción
                </p>
                <div className="space-y-2">
                  {analysis.criticos.map((c, i) => (
                    <div
                      key={i}
                      className="border border-[#E14848]/40 bg-[#E14848]/10 rounded-xl px-3.5 py-2.5"
                    >
                      <p className="text-[13.5px] font-bold text-white">{c.area}</p>
                      <p className="text-[13.5px] text-[#ddd] mt-0.5">{c.problema}</p>
                      <p className="text-[13.5px] text-[#FFB800] mt-1">→ {c.accion}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {analysis.generated_at && (
              <p className="text-[12px] text-[#888] sm:hidden">
                {formatGeneratedAt(analysis.generated_at)}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
