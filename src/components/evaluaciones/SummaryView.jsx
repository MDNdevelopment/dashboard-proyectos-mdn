import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../supabase'
import getPastMonthRange from '../../utils/getPastMonthRange'

export default function SummaryView({ companyId }) {
  const { firstDay } = getPastMonthRange()

  // El selector de mes usa formato YYYY-MM (input[type=month])
  // Convertimos a YYYY-MM-01 para la RPC
  const defaultMonth = firstDay.slice(0, 7) // YYYY-MM

  const [selectedMonth, setSelectedMonth] = useState(defaultMonth)
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [useDefault, setUseDefault] = useState(true) // true=usa vista, false=usa RPC

  const load = useCallback(async () => {
    if (!companyId) return
    setLoading(true)
    setError(null)

    let result, err

    if (useDefault) {
      // Vista del mes anterior
      const res = await supabase
        .from('employee_evaluation_summary_last_month')
        .select('*')
        .eq('company_id', companyId)
        .order('avg_score', { ascending: false })
      result = res.data
      err = res.error
    } else {
      // RPC con período seleccionado
      const periodParam = `${selectedMonth}-01`
      const res = await supabase.rpc('summary', { period_param: periodParam })
      // La RPC no filtra por company_id; filtrar localmente si devuelve más de una empresa
      result = (res.data ?? []).filter(r => r.company_id === companyId || !r.company_id)
      err = res.error
    }

    if (err) { setError(err.message) }
    else { setRows(result ?? []) }
    setLoading(false)
  }, [companyId, useDefault, selectedMonth])

  useEffect(() => { load() }, [load])

  function handleMonthChange(e) {
    const val = e.target.value
    setSelectedMonth(val)
    setUseDefault(val === defaultMonth)
  }

  function scoreColor(score) {
    if (score == null) return 'text-[#bbb]'
    if (score >= 4) return 'text-green-600'
    if (score >= 3) return 'text-[#b45309]'
    return 'text-red-600'
  }

  return (
    <div className="space-y-4">
      {/* Cabecera con selector de período */}
      <div className="flex items-center gap-3">
        <p className="text-[13px] text-[#888]">
          {rows.length} empleado{rows.length !== 1 ? 's' : ''} evaluado{rows.length !== 1 ? 's' : ''}
        </p>
        <label className="flex items-center gap-2 ml-auto">
          <span className="text-[11px] font-mono font-bold uppercase tracking-[0.1em] text-[#888]">
            Período
          </span>
          <input
            type="month"
            className="input-base py-1 text-[13px]"
            value={selectedMonth}
            onChange={handleMonthChange}
          />
        </label>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-[13px] rounded-xl px-4 py-3">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-6 h-6 border-2 border-[#FFB800] border-t-transparent rounded-full animate-spin" />
        </div>
      ) : rows.length === 0 ? (
        <div className="bg-white rounded-xl border border-[#e0ddd4] p-10 text-center">
          <p className="text-[15px] font-semibold text-[#888] mb-1">Sin datos</p>
          <p className="text-[13px] text-[#bbb]">
            No hay evaluaciones para el período seleccionado.
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-[#e0ddd4] overflow-hidden">
          {/* Cabecera de tabla */}
          <div className="grid grid-cols-[1fr_auto_auto] gap-4 px-5 py-2.5 border-b border-[#f0ede3] bg-[#fafaf7]">
            <span className="text-[10px] font-mono font-bold uppercase tracking-[0.12em] text-[#aaa]">
              Empleado
            </span>
            <span className="text-[10px] font-mono font-bold uppercase tracking-[0.12em] text-[#aaa]">
              Cargo
            </span>
            <span className="text-[10px] font-mono font-bold uppercase tracking-[0.12em] text-[#aaa] text-right">
              Score
            </span>
          </div>

          {rows.map((row, idx) => (
            <div
              key={row.user_id ?? row.employee_id ?? idx}
              className="grid grid-cols-[1fr_auto_auto] gap-4 px-5 py-3 border-b border-[#f0ede3] last:border-0 hover:bg-[#fafaf7] transition-colors items-center"
            >
              {/* Posición + nombre */}
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="text-[11px] font-mono text-[#bbb] w-5 flex-shrink-0">
                  {idx + 1}
                </span>
                <div className="min-w-0">
                  <p className="text-[14px] font-semibold text-[#111] truncate">
                    {row.first_name} {row.last_name}
                  </p>
                  <p className="text-[11px] text-[#aaa] truncate">{row.email}</p>
                </div>
              </div>

              {/* Cargo */}
              <span className="text-[12px] text-[#666] whitespace-nowrap">
                {row.position_name ?? row.position ?? '—'}
              </span>

              {/* Score */}
              <div className="text-right flex-shrink-0">
                <span className={`text-[18px] font-bold ${scoreColor(row.avg_score ?? row.total_score)}`}>
                  {(row.avg_score ?? row.total_score)?.toFixed(1) ?? '—'}
                </span>
                <span className="text-[11px] text-[#bbb] font-mono"> /5</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
