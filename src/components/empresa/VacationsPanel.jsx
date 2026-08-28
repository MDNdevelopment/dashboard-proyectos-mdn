import { useState, useMemo } from 'react'
import { Avatar } from '../tareas/UserPickerSingle'
import { resolveVacationStatus, vacationDays } from '../../utils/employeeCalendar'
import { isoToDdmmyyyy } from '../../utils/formatDate'
import { lineOfMember } from '../../utils/lineMembers'

const STATUS_LABEL = {
  tentative: { label: 'Tentativa', cls: 'bg-amber-100 text-amber-800' },
  confirmed: { label: 'Confirmada', cls: 'bg-green-100 text-green-800' },
  completed: { label: 'Completada', cls: 'bg-[#f0ede3] text-[#666]' },
}

/**
 * Panel global "Vacaciones del año": qué vacaciones hay en toda la empresa para un año dado,
 * sin tener que abrir empleado por empleado (a diferencia de `VacationsDialog`, que es por
 * persona). Vive dentro de `/empresa/empleados` (bloque colapsable bajo `TeamStatusCards`),
 * no como ruta ni permiso nuevos — hereda el gating admin-only de la tab.
 *
 * `vacations` ya viene filtrado al año seleccionado por `fetchVacationsByYear` (fetch en
 * `EmployeesView.jsx`); este componente es puramente presentacional + filtros locales de
 * línea/estado, igual que `TeamStatusCards`.
 *
 * Props:
 *   year, onYearChange   — año seleccionado y su setter
 *   availableYears       — lista de años seleccionables
 *   vacations            — filas de `vacations` (id, user_id, start_date, end_date, status)
 *   employees            — empleados activos (para resolver nombre/avatar)
 *   lines                — metric_lines, para mostrar/filtrar por equipo y detectar solapes
 *   onOpenEmployee        — (employee) => void, abre `VacationsDialog` de esa persona
 */
export default function VacationsPanel({
  year,
  onYearChange,
  availableYears,
  vacations,
  employees,
  lines,
  onOpenEmployee,
}) {
  // Colapsado por defecto (mismo criterio que los grupos de año en VacationsDialog): es un
  // resumen bajo demanda, no algo que deba competir por espacio con la lista de empleados.
  const [open, setOpen] = useState(false)
  const [lineFilter, setLineFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')

  const employeesById = useMemo(() => new Map(employees.map((e) => [e.user_id, e])), [employees])

  const rows = useMemo(() => {
    const withMeta = vacations
      .map((v) => {
        const emp = employeesById.get(v.user_id)
        if (!emp) return null
        const displayStatus = resolveVacationStatus(v.status, v.end_date)
        if (!displayStatus) return null
        const line = lineOfMember(lines, v.user_id)
        return { v, emp, displayStatus, line, days: vacationDays(v.start_date, v.end_date) }
      })
      .filter(Boolean)

    // Solape: dos filas de la misma línea cuyos rangos se cruzan (comparación de strings
    // 'yyyy-MM-dd', misma regla que el resto del módulo).
    const overlapCount = new Map()
    for (let i = 0; i < withMeta.length; i++) {
      for (let j = i + 1; j < withMeta.length; j++) {
        const a = withMeta[i]
        const b = withMeta[j]
        if (!a.line || !b.line || a.line.id !== b.line.id) continue
        if (a.v.start_date <= b.v.end_date && a.v.end_date >= b.v.start_date) {
          overlapCount.set(a.v.id, (overlapCount.get(a.v.id) ?? 0) + 1)
          overlapCount.set(b.v.id, (overlapCount.get(b.v.id) ?? 0) + 1)
        }
      }
    }

    return withMeta
      .filter((r) => lineFilter === 'all' || r.line?.id === lineFilter)
      .filter((r) => statusFilter === 'all' || r.displayStatus === statusFilter)
      .map((r) => ({ ...r, overlapsWithTeam: overlapCount.get(r.v.id) ?? 0 }))
      .sort((a, b) =>
        a.v.start_date < b.v.start_date ? -1 : a.v.start_date > b.v.start_date ? 1 : 0,
      )
  }, [vacations, employeesById, lines, lineFilter, statusFilter])

  const teamOptions = useMemo(
    () => [...lines].sort((a, b) => a.name.localeCompare(b.name)),
    [lines],
  )

  return (
    <div className="bg-white border border-[#e0ddd4] rounded-2xl mb-4">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-4 py-3"
      >
        <div className="flex items-center gap-2">
          <h3 className="text-[14px] font-bold text-[#111]">Vacaciones del año</h3>
          <span className="text-[12px] text-[#999]">({rows.length})</span>
        </div>
        <svg
          className={`transition-transform ${open ? 'rotate-180' : ''}`}
          width="11"
          height="11"
          viewBox="0 0 10 10"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
        >
          <path d="M2 3.5L5 6.5L8 3.5" strokeLinecap="round" />
        </svg>
      </button>

      {open && (
        <div className="px-4 pb-4">
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <select
              aria-label="Año"
              value={year}
              onChange={(e) => onYearChange(Number(e.target.value))}
              className="input-base w-auto text-[13px] py-1.5"
            >
              {availableYears.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
            <select
              aria-label="Equipo"
              value={lineFilter}
              onChange={(e) => setLineFilter(e.target.value)}
              className="input-base w-auto text-[13px] py-1.5"
            >
              <option value="all">Todos los equipos</option>
              {teamOptions.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
            <select
              aria-label="Estado"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="input-base w-auto text-[13px] py-1.5"
            >
              <option value="all">Todos los estados</option>
              <option value="tentative">Tentativa</option>
              <option value="confirmed">Confirmada</option>
              <option value="completed">Completada</option>
            </select>
          </div>

          {rows.length === 0 ? (
            <p className="text-[13px] text-[#bbb] py-4 text-center">
              Sin vacaciones registradas para {year} con estos filtros.
            </p>
          ) : (
            <div className="space-y-1.5">
              {rows.map(({ v, emp, displayStatus, line, days, overlapsWithTeam }) => {
                const st = STATUS_LABEL[displayStatus] ?? {
                  label: v.status,
                  cls: 'bg-gray-100 text-gray-600',
                }
                return (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => onOpenEmployee(emp)}
                    className="w-full flex items-center gap-3 bg-[#f9f8f4] hover:bg-[#f0ede3] rounded-xl px-3 py-2 text-left transition-colors"
                  >
                    <Avatar user={emp} size={28} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-[13px] font-semibold text-[#111] truncate">
                          {emp.first_name} {emp.last_name}
                        </span>
                        {line && (
                          <span className="text-[11px] text-[#999] truncate">· {line.name}</span>
                        )}
                        {overlapsWithTeam > 0 && (
                          <span className="text-[10px] font-mono font-bold uppercase px-1 py-0.5 rounded bg-amber-100 text-amber-800 flex-shrink-0">
                            coincide con {overlapsWithTeam} del equipo
                          </span>
                        )}
                      </div>
                      <p className="text-[12px] text-[#888]">
                        {isoToDdmmyyyy(v.start_date)} – {isoToDdmmyyyy(v.end_date)} · {days} día
                        {days === 1 ? '' : 's'}
                      </p>
                    </div>
                    <span
                      className={`text-[11px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0 ${st.cls}`}
                    >
                      {st.label}
                    </span>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
