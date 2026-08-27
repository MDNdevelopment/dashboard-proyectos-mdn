/**
 * Lógica pura del calendario de fechas del equipo (Empresa → Empleados). Reúne, para el
 * mes visible, cinco tipos de evento: cumpleaños, aniversario de ingreso, fin del período
 * de prueba, inicio de vacaciones y regreso a la oficina. No toca Supabase ni el DOM.
 *
 * Regla dura: cumpleaños y aniversario se proyectan al año visible con ARITMÉTICA DE
 * STRINGS sobre 'yyyy-MM-dd', nunca con `new Date('yyyy-MM-dd')` / `parseISO` — esas
 * formas parsean como UTC y en UTC−4 (Venezuela) muestran un día menos.
 */
import { startOfMonth, endOfMonth, startOfWeek, endOfWeek, addDays, format } from 'date-fns'

/** Días de período de prueba usados para derivar `probation_end` desde `hire_date`. */
export const PROBATION_DAYS = 30

export const EVENT_TYPES = {
  birthday: {
    label: 'Cumpleaños',
    dot: 'bg-[#FFB800]',
    pill: 'bg-[#fff8e6] text-[#8a6600] border-[#f0dfae]',
    iconColor: 'text-[#8a6600]',
    order: 0,
  },
  anniversary: {
    label: 'Aniversario',
    dot: 'bg-[#4f46e5]',
    pill: 'bg-[#eef0ff] text-[#3730a3] border-[#d7dbff]',
    iconColor: 'text-[#3730a3]',
    order: 1,
  },
  probation_end: {
    label: 'Fin de prueba',
    dot: 'bg-[#e65100]',
    pill: 'bg-[#fff3e0] text-[#e65100] border-[#f5c99a]',
    iconColor: 'text-[#e65100]',
    order: 2,
  },
  vacation_start: {
    label: 'Inicia vacaciones',
    dot: 'bg-blue-500',
    pill: 'bg-blue-50 text-blue-700 border-blue-200',
    iconColor: 'text-blue-700',
    order: 3,
  },
  vacation_end: {
    label: 'Regresa a la oficina',
    dot: 'bg-green-600',
    pill: 'bg-green-50 text-green-700 border-green-200',
    iconColor: 'text-green-700',
    order: 4,
  },
}

/** Parsea 'YYYY-MM-DD' a Date local (evita el desfase de un día de `new Date(str)` en UTC). */
function parseDateKey(value) {
  if (!value) return null
  const [y, m, d] = value.split('-').map(Number)
  return new Date(y, m - 1, d)
}

const pad = (n) => String(n).padStart(2, '0')

/** Compone 'yyyy-MM-dd' a partir de componentes numéricos (nunca vía `new Date` + toISOString). */
function makeKey(y, m, d) {
  return `${y}-${pad(m)}-${pad(d)}`
}

/** true si `year` es bisiesto (para proyectar 29/02 en años que no lo son). */
function isLeapYear(year) {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0
}

/**
 * Rango de la grilla mensual (misma construcción que AvCalendar/CalendarView, para que
 * el rango pintado y el consultado nunca diverjan) + `fetchStartKey`, un día antes de
 * `startKey`: el evento de regreso de vacaciones cae en `end_date + 1`, así que una
 * vacación que termina justo antes del inicio de la grilla aún debe traerse.
 */
export function monthGridRange(year, month) {
  const anchor = new Date(year, month - 1, 1)
  const gridStart = startOfWeek(startOfMonth(anchor), { weekStartsOn: 1 })
  const gridEnd = endOfWeek(endOfMonth(anchor), { weekStartsOn: 1 })
  const startKey = format(gridStart, 'yyyy-MM-dd')
  const endKey = format(gridEnd, 'yyyy-MM-dd')
  const fetchStartKey = format(addDays(gridStart, -1), 'yyyy-MM-dd')
  return { startKey, endKey, fetchStartKey }
}

/**
 * Proyecta una fecha recurrente ('yyyy-MM-dd', solo se usa el MM-DD) a cada año que toca
 * el rango [startKey, endKey] (cubre grillas que cruzan diciembre/enero). 29/02 se
 * proyecta a 28/02 en años no bisiestos. Devuelve las claves 'yyyy-MM-dd' dentro de rango.
 */
export function projectRecurringDate(sourceKey, startKey, endKey) {
  if (!sourceKey) return []
  const [, srcMonth, srcDay] = sourceKey.split('-').map(Number)
  const fromYear = Number(startKey.slice(0, 4))
  const toYear = Number(endKey.slice(0, 4))
  const keys = []
  for (let y = fromYear; y <= toYear; y++) {
    const day = srcMonth === 2 && srcDay === 29 && !isLeapYear(y) ? 28 : srcDay
    const key = makeKey(y, srcMonth, day)
    if (key >= startKey && key <= endKey) keys.push(key)
  }
  return keys
}

function fullName(employee) {
  return `${employee.first_name ?? ''} ${employee.last_name ?? ''}`.trim()
}

/**
 * Vocabulario de `vacations.status`. Flujo actual (VacationsDialog.jsx): se crea en
 * 'tentative' (fecha probable, sin aprobar/rechazar) y se pasa a 'confirmed' cuando la
 * fecha queda cerrada — no hay paso de aprobación. 'completed' NO se guarda: se calcula
 * solo a partir de `end_date` vs hoy. Datos históricos usan otros valores ('pending' del
 * viejo flujo de aprobación, 'programmed'/'fulfilled' de una importación previa); por eso
 * `resolveVacationStatus` no exige un vocabulario cerrado y cae a "confirmada" por
 * default en vez de listar cada valor legado.
 */
export const TENTATIVE_STATUSES = ['tentative', 'pending']
export const EXCLUDED_VACATION_STATUSES = ['rejected']

/**
 * Resuelve el status "de exhibición" de una vacación: 'tentative' | 'confirmed' |
 * 'completed' | null (se excluye del calendario y de la estela; hoy solo 'rejected',
 * remanente del viejo flujo de aprobación). 'completed' es 'confirmed' cuya `endDateKey`
 * ya pasó — no es un valor guardado en la fila.
 */
export function resolveVacationStatus(
  rawStatus,
  endDateKey,
  todayKey = format(new Date(), 'yyyy-MM-dd'),
) {
  if (EXCLUDED_VACATION_STATUSES.includes(rawStatus)) return null
  if (TENTATIVE_STATUSES.includes(rawStatus)) return 'tentative'
  return endDateKey < todayKey ? 'completed' : 'confirmed'
}

/**
 * Construye los eventos del calendario para el mes visible.
 * `employees`: filas de `users` ya filtradas a activos (ver activeEmployees en lib/employees.js).
 * `vacations`: filas de `vacations` ya filtradas a status approved/completed (ver lib/vacations.js).
 */
export function buildEmployeeCalendarEvents({ employees = [], vacations = [], year, month }) {
  const { startKey, endKey } = monthGridRange(year, month)
  const employeesById = new Map(employees.map((e) => [e.user_id, e]))
  const events = []

  for (const emp of employees) {
    const name = fullName(emp)

    // Cumpleaños: se proyecta cada año que toque la grilla, sin importar el año de nacimiento.
    // Si `birth_date` trae año de nacimiento válido se muestra "cumple N años"; si no
    // (dato incompleto o edad no calculable), se usa el mensaje genérico sin cantidad.
    const birthYear = emp.birth_date ? Number(emp.birth_date.slice(0, 4)) : null
    for (const dateKey of projectRecurringDate(emp.birth_date, startKey, endKey)) {
      const leapBirth = emp.birth_date?.slice(5) === '02-29'
      const age = birthYear ? Number(dateKey.slice(0, 4)) - birthYear : null
      events.push({
        id: `birthday:${emp.user_id}:${dateKey}`,
        dateKey,
        type: 'birthday',
        employeeId: emp.user_id,
        employeeName: name,
        avatarUrl: emp.avatar_url ?? null,
        label: age > 0 ? `${name} cumple ${age} años` : `Cumpleaños de ${name}`,
        detail: leapBirth ? 'Nació el 29 de febrero' : null,
      })
    }

    // Aniversario de ingreso: se omite el año de contratación (mismo criterio que el cron SQL).
    if (emp.hire_date) {
      const hireYear = Number(emp.hire_date.slice(0, 4))
      for (const dateKey of projectRecurringDate(emp.hire_date, startKey, endKey)) {
        const eventYear = Number(dateKey.slice(0, 4))
        if (eventYear <= hireYear) continue
        const years = eventYear - hireYear
        events.push({
          id: `anniversary:${emp.user_id}:${dateKey}`,
          dateKey,
          type: 'anniversary',
          employeeId: emp.user_id,
          employeeName: name,
          avatarUrl: emp.avatar_url ?? null,
          label: `${name} cumple ${years} año${years === 1 ? '' : 's'} en MDN`,
          detail: null,
        })
      }
    }

    // Fin de período de prueba: derivado de hire_date + PROBATION_DAYS, solo si sigue activo.
    if (emp.on_probation && emp.hire_date) {
      const hireDate = parseDateKey(emp.hire_date)
      const probationEndKey = format(addDays(hireDate, PROBATION_DAYS), 'yyyy-MM-dd')
      if (probationEndKey >= startKey && probationEndKey <= endKey) {
        const overdue = probationEndKey < format(new Date(), 'yyyy-MM-dd')
        events.push({
          id: `probation_end:${emp.user_id}:${probationEndKey}`,
          dateKey: probationEndKey,
          type: 'probation_end',
          employeeId: emp.user_id,
          employeeName: name,
          avatarUrl: emp.avatar_url ?? null,
          label: `Termina el período de prueba de ${name}`,
          detail: overdue ? 'Prueba vencida' : null,
        })
      }
    }
  }

  // Vacaciones: solo inicio y regreso (día siguiente al último día libre), no el rango completo.
  const todayKey = format(new Date(), 'yyyy-MM-dd')
  for (const vac of vacations) {
    const emp = employeesById.get(vac.user_id)
    if (!emp || !vac.start_date || !vac.end_date) continue
    const displayStatus = resolveVacationStatus(vac.status, vac.end_date, todayKey)
    if (!displayStatus) continue // 'rejected': no se muestra
    const tentative = displayStatus === 'tentative'
    const name = fullName(emp)

    if (vac.start_date >= startKey && vac.start_date <= endKey) {
      events.push({
        id: `vacation_start:${vac.id}`,
        dateKey: vac.start_date,
        type: 'vacation_start',
        employeeId: emp.user_id,
        employeeName: name,
        avatarUrl: emp.avatar_url ?? null,
        tentative,
        label: tentative
          ? `${name} tiene tentativas vacaciones (hasta ${format(parseDateKey(vac.end_date), 'dd/MM')})`
          : `${name} inicia vacaciones (hasta ${format(parseDateKey(vac.end_date), 'dd/MM')})`,
        detail: tentative ? 'Fecha por confirmar' : null,
      })
    }

    const returnKey = format(addDays(parseDateKey(vac.end_date), 1), 'yyyy-MM-dd')
    if (returnKey >= startKey && returnKey <= endKey) {
      events.push({
        id: `vacation_end:${vac.id}`,
        dateKey: returnKey,
        type: 'vacation_end',
        employeeId: emp.user_id,
        employeeName: name,
        avatarUrl: emp.avatar_url ?? null,
        tentative,
        label: tentative ? `${name} regresaría a la oficina` : `${name} regresa a la oficina`,
        detail: tentative ? 'Fecha por confirmar' : null,
      })
    }
  }

  events.sort((a, b) => {
    if (a.dateKey !== b.dateKey) return a.dateKey < b.dateKey ? -1 : 1
    const orderDiff = EVENT_TYPES[a.type].order - EVENT_TYPES[b.type].order
    if (orderDiff !== 0) return orderDiff
    return a.employeeName.localeCompare(b.employeeName)
  })

  return events
}

/** Agrupa eventos ya construidos por su `dateKey` ('yyyy-MM-dd'). */
export function groupEventsByDay(events) {
  const map = new Map()
  for (const ev of events) {
    if (!map.has(ev.dateKey)) map.set(ev.dateKey, [])
    map.get(ev.dateKey).push(ev)
  }
  return map
}
