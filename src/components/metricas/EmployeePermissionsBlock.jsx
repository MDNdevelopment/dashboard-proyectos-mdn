import { useState, useEffect, useMemo } from 'react'
import { fetchPermissionsForEmployee } from '../../lib/employeePermissions'
import { PERMISSION_TYPES } from '../../utils/employeePermissions'
import { vacationDays } from '../../utils/employeeCalendar'
import { isoToDdmmyyyy } from '../../utils/formatDate'

/**
 * Bloque de historial de "Permisos" (RRHH) para la ficha de un empleado. Se monta desde
 * EmployeeFichaContent.jsx, compartido por EmployeeInfoModal y LineFichaModal — aparece
 * en ambos sin tocarlos. Presentacional + fetch propio, agrupado por año (colapsado
 * salvo el año en curso), mismo patrón que VacationsDialog.
 */
export default function EmployeePermissionsBlock({ userId }) {
  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(true)
  const [openYears, setOpenYears] = useState(() => new Set([new Date().getFullYear()]))

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetchPermissionsForEmployee(userId)
      .then((rows) => {
        if (!cancelled) setRecords(rows)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [userId])

  const byYear = useMemo(() => {
    const map = new Map()
    for (const r of records) {
      const year = Number(r.start_date.slice(0, 4))
      if (!map.has(year)) map.set(year, [])
      map.get(year).push(r)
    }
    const years = [...map.keys()].sort((a, b) => b - a)
    return years.map((year) => [year, map.get(year)])
  }, [records])

  function toggleYear(year) {
    setOpenYears((prev) => {
      const next = new Set(prev)
      if (next.has(year)) next.delete(year)
      else next.add(year)
      return next
    })
  }

  if (loading) {
    return (
      <div className="p-3 rounded-xl bg-[#faf9f5] border border-[#ece9df] flex justify-center">
        <div className="w-4 h-4 border-2 border-[#FFB800] border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="p-3 rounded-xl bg-[#faf9f5] border border-[#ece9df]">
      <p className="text-[11.5px] font-mono font-bold uppercase tracking-[0.12em] text-[#aaa] mb-2">
        Permisos
      </p>
      {byYear.length === 0 ? (
        <p className="text-[14px] text-[#bbb]">Sin registros.</p>
      ) : (
        <div className="space-y-1.5">
          {byYear.map(([year, rows]) => {
            const isOpen = openYears.has(year)
            return (
              <div key={year} className="border border-[#e0ddd4] rounded-lg bg-white">
                <button
                  type="button"
                  onClick={() => toggleYear(year)}
                  className="w-full flex items-center justify-between px-3 py-2 text-left"
                >
                  <span className="text-[13.5px] font-bold text-[#111]">{year}</span>
                  <span className="text-[12.5px] text-[#888]">
                    {rows.length} registro{rows.length === 1 ? '' : 's'}
                    <svg
                      className={`inline-block ml-2 transition-transform ${isOpen ? 'rotate-180' : ''}`}
                      width="9"
                      height="9"
                      viewBox="0 0 10 10"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.6"
                    >
                      <path d="M2 3.5L5 6.5L8 3.5" strokeLinecap="round" />
                    </svg>
                  </span>
                </button>
                {isOpen && (
                  <div className="px-3 pb-2.5 space-y-1.5">
                    {rows.map((r) => {
                      const meta = PERMISSION_TYPES[r.type] ?? {
                        label: r.type,
                        pill: 'bg-gray-100 text-gray-600',
                      }
                      const days = vacationDays(r.start_date, r.end_date)
                      return (
                        <div key={r.id} className="text-[13.5px] text-[#444]">
                          <span
                            className={`inline-block text-[12px] font-semibold px-1.5 py-0.5 rounded-full border mr-1.5 ${meta.pill}`}
                          >
                            {meta.label}
                          </span>
                          {meta.hasTime ? (
                            <>
                              {isoToDdmmyyyy(r.start_date)}
                              {r.event_time && (
                                <span className="text-[#999]"> · {r.event_time.slice(0, 5)}</span>
                              )}
                            </>
                          ) : (
                            <>
                              {isoToDdmmyyyy(r.start_date)} – {isoToDdmmyyyy(r.end_date)}
                              <span className="text-[#999]">
                                {' '}
                                · {days} día{days === 1 ? '' : 's'}
                              </span>
                            </>
                          )}
                          {r.reason && <p className="text-[#888] text-[13px] mt-0.5">{r.reason}</p>}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
