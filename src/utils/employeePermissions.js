/**
 * Lógica pura del reporte de "Permisos" (RRHH): permisos, ausencias, reposos médicos,
 * llegadas tarde y salidas temprano de cada colaborador. No toca Supabase ni el DOM —
 * separado del componente para poder testear la agregación sin montar React ni mockear
 * la red (mismo criterio que metricsScore.js / aggregateMetricsDashboard.js / employeeCalendar.js).
 *
 * Regla dura del repo: aritmética de strings sobre 'yyyy-MM-dd', nunca `new Date(string)`
 * ni `parseISO` — esas formas parsean como UTC y en UTC−4 (Venezuela) muestran un día
 * menos. Para contar días calendario sí hay que pasar por milisegundos: se reusa
 * `vacationDays()` de employeeCalendar.js, que ya resuelve esto con fechas locales.
 */
import { vacationDays } from './employeeCalendar'

/**
 * Vocabulario cerrado hoy en la tabla (`employee_permissions_type_check`). Agregar un
 * tipo nuevo es solo una entrada aquí + el CHECK de la migración correspondiente — el
 * resto de este archivo y de la UI (PermisosRrhhView, PermissionFormDialog,
 * EmployeePermissionsBlock) itera `PERMISSION_TYPES`, no hay switches por tipo.
 *
 * `fullDay: true` marca los tipos que representan un día completo no trabajado (cuentan
 * para la columna "Días" del reporte); `llegada_tarde`/`salida_temprana` son eventos de
 * UN día trabajado con una hora puntual (`event_time`), así que NO restan un día — de ahí
 * `fullDay: false` y `hasTime: true`.
 */
export const PERMISSION_TYPES = {
  permiso: {
    label: 'Permiso',
    plural: 'Permisos',
    dot: 'bg-[#FFB800]',
    pill: 'bg-[#fff8e6] text-[#8a6600] border-[#f0dfae]',
    fullDay: true,
  },
  ausencia: {
    label: 'Ausencia',
    plural: 'Ausencias',
    dot: 'bg-[#dc2626]',
    pill: 'bg-red-50 text-red-700 border-red-200',
    fullDay: true,
  },
  reposo: {
    label: 'Reposo médico',
    plural: 'Reposos',
    dot: 'bg-blue-500',
    pill: 'bg-blue-50 text-blue-700 border-blue-200',
    fullDay: true,
  },
  llegada_tarde: {
    label: 'Llegada tarde',
    plural: 'Llegadas tarde',
    dot: 'bg-orange-500',
    pill: 'bg-orange-50 text-orange-700 border-orange-200',
    fullDay: false,
    hasTime: true,
  },
  salida_temprana: {
    label: 'Salida temprana',
    plural: 'Salidas temprano',
    dot: 'bg-purple-500',
    pill: 'bg-purple-50 text-purple-700 border-purple-200',
    fullDay: false,
    hasTime: true,
  },
}

const pad = (n) => String(n).padStart(2, '0')

/** Primer y último día ('yyyy-MM-dd') del mes (year, month 1-12). */
export function monthBounds(year, month) {
  const lastDay = new Date(year, month, 0).getDate()
  return { first: `${year}-${pad(month)}-01`, last: `${year}-${pad(month)}-${pad(lastDay)}` }
}

/** true si el rango [row.start_date, row.end_date] toca el mes (year, month). */
export function permissionInMonth(row, year, month) {
  if (!row?.start_date || !row?.end_date) return false
  const { first, last } = monthBounds(year, month)
  return row.start_date <= last && row.end_date >= first
}

/**
 * Días del registro que caen DENTRO del mes (recorta el rango a los bordes del mes, no
 * cuenta el rango completo). Un permiso del 28/09 al 03/10 aporta 3 días a septiembre y
 * 3 a octubre — sin este recorte el reporte mensual duplicaría días que no ocurrieron
 * en ese mes.
 */
export function permissionDaysInMonth(row, year, month) {
  if (!permissionInMonth(row, year, month)) return 0
  const { first, last } = monthBounds(year, month)
  const clampedStart = row.start_date > first ? row.start_date : first
  const clampedEnd = row.end_date < last ? row.end_date : last
  return vacationDays(clampedStart, clampedEnd)
}

function fullName(employee) {
  return `${employee.first_name ?? ''} ${employee.last_name ?? ''}`.trim()
}

function emptyCounts() {
  const counts = {}
  for (const key of Object.keys(PERMISSION_TYPES)) counts[key] = 0
  return counts
}

/**
 * Agrega los registros de `rows` (filas de `employee_permissions`) por empleado para el
 * mes (year, month). Incluye a todos los `employees` recibidos, aun sin registros (fila
 * en cero) — así la tabla muestra al equipo completo, no solo a quien tuvo novedades.
 *
 * `dias` solo suma los tipos `fullDay` (permiso/ausencia/reposo): una llegada tarde o
 * salida temprana es un día SÍ trabajado, no restaría de "días ausente" aunque el
 * registro tenga start_date=end_date igual que los demás tipos.
 *
 * @returns {{
 *   rows: Array<{ userId, name, avatarUrl, dias, ...conteos por cada key de PERMISSION_TYPES }>,
 *   totals: { dias, ...conteos por cada key de PERMISSION_TYPES },
 * }}
 */
export function aggregatePermissionsByMonth(rows = [], employees = [], year, month) {
  const byEmployee = new Map(
    employees.map((e) => [
      e.user_id,
      {
        userId: e.user_id,
        name: fullName(e),
        avatarUrl: e.avatar_url ?? null,
        ...emptyCounts(),
        dias: 0,
      },
    ]),
  )

  for (const row of rows) {
    const entry = byEmployee.get(row.user_id)
    if (!entry) continue // registro de alguien fuera del roster recibido (p. ej. archivado)
    if (!permissionInMonth(row, year, month)) continue
    const meta = PERMISSION_TYPES[row.type]
    if (!meta) continue
    entry[row.type] += 1
    if (meta.fullDay) entry.dias += permissionDaysInMonth(row, year, month)
  }

  const sortedRows = Array.from(byEmployee.values()).sort((a, b) => a.name.localeCompare(b.name))

  const totals = sortedRows.reduce(
    (acc, r) => {
      const next = { ...acc, dias: acc.dias + r.dias }
      for (const key of Object.keys(PERMISSION_TYPES)) next[key] = acc[key] + r[key]
      return next
    },
    { ...emptyCounts(), dias: 0 },
  )

  return { rows: sortedRows, totals }
}
