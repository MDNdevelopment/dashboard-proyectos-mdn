import { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from '../../supabase'

const OUTCOME_LABEL = {
  sin_cobertura: 'Sin cobertura',
  error: 'Error de herramienta',
  timeout: 'Tardó demasiado',
}

const OUTCOME_COLOR = {
  sin_cobertura: 'bg-amber-50 text-amber-700 border-amber-200',
  error: 'bg-red-50 text-red-700 border-red-200',
  timeout: 'bg-[#f5f3eb] text-[#666] border-[#e0ddd4]',
}

const LOOKBACK_ROWS = 500

/** Agrupa por pregunta normalizada (sin distinguir mayúsculas/espacios) para que "¿cuántos
 * tickets hay?" y "¿Cuántos tickets hay?" cuenten como el mismo hueco. */
function groupByQuestion(rows) {
  const groups = new Map()
  for (const row of rows) {
    const key = (row.question ?? '').trim().toLowerCase()
    if (!key) continue
    if (!groups.has(key)) {
      groups.set(key, {
        question: row.question,
        count: 0,
        lastAsked: row.created_at,
        outcomes: new Set(),
        toolsUsed: new Set(),
      })
    }
    const g = groups.get(key)
    g.count += 1
    if (row.created_at > g.lastAsked) g.lastAsked = row.created_at
    g.outcomes.add(row.outcome)
    for (const t of row.tools_used ?? []) g.toolsUsed.add(t)
  }
  return [...groups.values()].sort((a, b) => b.count - a.count)
}

/**
 * Backlog priorizado de preguntas que MAPPI no pudo responder (outcome != 'respondida'),
 * agrupadas por frecuencia — reemplaza el flujo de "el usuario avisa por WhatsApp" por
 * algo que se mide solo. Ver netlify/functions/_lib/aiChatLog.js y la migración
 * mappi_chat_logs.
 */
export default function MappiLogsView({ companyId }) {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    if (!companyId) return
    setLoading(true)
    setError(null)
    const { data, error: err } = await supabase
      .from('mappi_chat_logs')
      .select('question, outcome, tools_used, created_at')
      .eq('company_id', companyId)
      .neq('outcome', 'respondida')
      .order('created_at', { ascending: false })
      .limit(LOOKBACK_ROWS)
    if (err) {
      setError(err.message)
      setLoading(false)
      return
    }
    setRows(data ?? [])
    setLoading(false)
  }, [companyId])

  useEffect(() => {
    load()
  }, [load])

  const grouped = useMemo(() => groupByQuestion(rows), [rows])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="w-6 h-6 border-2 border-[#FFB800] border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 text-red-700 text-[15px] rounded-xl px-4 py-3">
        {error}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <p className="text-[14px] text-[#888]">
        Preguntas que MAPPI no pudo responder bien, agrupadas por frecuencia (últimos{' '}
        {LOOKBACK_ROWS} casos). Es el mismo hueco que antes llegaba por captura de WhatsApp — acá se
        prioriza solo.
      </p>

      {grouped.length === 0 ? (
        <div className="bg-white rounded-xl border border-[#e0ddd4] p-8 text-center">
          <p className="text-[15px] font-semibold text-[#888]">Sin huecos registrados</p>
          <p className="text-[13.5px] text-[#bbb] mt-1">
            Todavía no hay preguntas sin cobertura, con error o que hayan tardado demasiado.
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-[#e0ddd4] overflow-x-auto">
          <table className="w-full text-[13.5px]">
            <thead>
              <tr className="border-b border-[#e0ddd4] text-left text-[#888]">
                <th className="px-4 py-2.5 font-semibold">Pregunta</th>
                <th className="px-4 py-2.5 font-semibold">Veces</th>
                <th className="px-4 py-2.5 font-semibold">Motivo</th>
                <th className="px-4 py-2.5 font-semibold">Última vez</th>
              </tr>
            </thead>
            <tbody>
              {grouped.map((g) => (
                <tr key={g.question} className="border-b border-[#f0ede3] last:border-0">
                  <td className="px-4 py-2.5 text-[#111] max-w-md">{g.question}</td>
                  <td className="px-4 py-2.5 font-mono font-semibold text-[#111]">{g.count}</td>
                  <td className="px-4 py-2.5">
                    <div className="flex flex-wrap gap-1">
                      {[...g.outcomes].map((o) => (
                        <span
                          key={o}
                          className={`text-[12px] font-semibold px-2 py-0.5 rounded-full border ${OUTCOME_COLOR[o] ?? 'bg-[#f5f3eb] text-[#666] border-[#e0ddd4]'}`}
                        >
                          {OUTCOME_LABEL[o] ?? o}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-[#888]">
                    {new Date(g.lastAsked).toLocaleDateString('es-VE')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
