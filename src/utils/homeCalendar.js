/**
 * Lógica pura del calendario "Fechas del equipo y clientes" del Home. Combina, para el
 * mes visible, dos dominios: cumpleaños/aniversario de ingreso del equipo MDN (reutiliza
 * `buildEmployeeCalendarEvents` de `employeeCalendar.js` — sin fin de período de prueba
 * ni vacaciones, eso se queda exclusivo de Empresa → Empleados) y tres fechas de clientes
 * (aniversario empresa, cliente MDN desde, cumpleaños de contacto). No toca Supabase.
 *
 * Regla dura (heredada de employeeCalendar.js): aritmética de strings sobre 'yyyy-MM-dd',
 * nunca `new Date('yyyy-MM-dd')` (UTC−4 resta un día). Se cumple porque toda la proyección
 * de fechas pasa por `projectRecurringDate`/`monthGridRange`, ya blindados ahí.
 */
import {
  buildEmployeeCalendarEvents,
  monthGridRange,
  projectRecurringDate,
} from './employeeCalendar'

export const EVENT_TYPES = {
  birthday: {
    label: 'Cumpleaños',
    dot: 'bg-[#FFB800]',
    pill: 'bg-[#fff8e6] text-[#8a6600] border-[#f0dfae]',
    iconColor: 'text-[#8a6600]',
    order: 0,
  },
  anniversary: {
    label: 'Aniversario MDN',
    dot: 'bg-[#4f46e5]',
    pill: 'bg-[#eef0ff] text-[#3730a3] border-[#d7dbff]',
    iconColor: 'text-[#3730a3]',
    order: 1,
  },
  client_anniversary: {
    label: 'Aniversario empresa',
    dot: 'bg-blue-500',
    pill: 'bg-blue-50 text-blue-700 border-blue-200',
    iconColor: 'text-blue-700',
    order: 2,
  },
  client_mdn_anniversary: {
    label: 'Cliente MDN desde',
    dot: 'bg-pink-500',
    pill: 'bg-pink-50 text-pink-700 border-pink-200',
    iconColor: 'text-pink-700',
    order: 3,
  },
  client_contact_birthday: {
    label: 'Cumpleaños de contacto',
    dot: 'bg-teal-500',
    pill: 'bg-teal-50 text-teal-700 border-teal-200',
    iconColor: 'text-teal-700',
    order: 4,
  },
}

/**
 * Un usuario puede ver los eventos de un cliente si es miembro de su línea, o si tiene
 * acceso a toda la empresa (nivel 4+ / admin). Replica el criterio SQL de
 * `notif_client_recipients()` (supabase/migrations/20260901000000_fix_notif_date_cron_hardening.sql):
 * ojo, `tasks_view_all` NO forma parte de ese criterio, así que tampoco se usa aquí.
 */
export function canSeeClientDates(client, lines, userProfile) {
  if (!userProfile) return false
  if (userProfile.access_level >= 4 || userProfile.admin === true) return true
  if (!client.line_id) return false
  const line = lines.find((l) => l.id === client.line_id)
  return (line?.member_user_ids ?? []).includes(userProfile.user_id)
}

/**
 * Construye los eventos del calendario del Home para el mes visible.
 * `employees`: filas de `users` ya filtradas a activos (ver activeEmployees en lib/employees.js).
 * `clients`: filas de `metric_clients` ya filtradas a no archivadas.
 * `lines`: filas de `metric_lines` con `member_user_ids: string[]` (ver metricsApi.js#loadLines).
 * `userProfile`: perfil del usuario logueado (useAuth).
 */
export function buildHomeCalendarEvents({
  employees = [],
  clients = [],
  lines = [],
  userProfile,
  year,
  month,
}) {
  const { startKey, endKey } = monthGridRange(year, month)

  // Equipo: mismo cálculo que Empresa → Empleados, sin vacaciones (vacations: []) — sus
  // eventos vacation_start/vacation_end/probation_end no aparecen porque probation_end
  // solo se genera si on_probation está activo; se filtra explícito igual para blindarlo
  // ante cambios futuros de buildEmployeeCalendarEvents. `buildEmployeeCalendarEvents` no
  // filtra `deleted_at` (esa responsabilidad es del caller, ver activeEmployees en
  // lib/employees.js); acá se filtra también como defensa en profundidad, igual que con
  // los clientes más abajo.
  const activeEmployees = employees.filter((e) => !e.deleted_at)
  const teamEvents = buildEmployeeCalendarEvents({
    employees: activeEmployees,
    vacations: [],
    year,
    month,
  }).filter((ev) => ev.type === 'birthday' || ev.type === 'anniversary')

  const clientEvents = []
  for (const client of clients) {
    if (client.deleted_at) continue
    if (!canSeeClientDates(client, lines, userProfile)) continue

    if (client.anniversary_date) {
      const sourceYear = Number(client.anniversary_date.slice(0, 4))
      for (const dateKey of projectRecurringDate(client.anniversary_date, startKey, endKey)) {
        const years = Number(dateKey.slice(0, 4)) - sourceYear
        clientEvents.push({
          id: `client_anniversary:${client.id}:${dateKey}`,
          dateKey,
          type: 'client_anniversary',
          clientId: client.id,
          clientName: client.name,
          label:
            years > 0
              ? `${client.name} cumple ${years} año${years === 1 ? '' : 's'}`
              : `Aniversario de ${client.name}`,
          detail: null,
        })
      }
    }

    if (client.mdn_since) {
      const sourceYear = Number(client.mdn_since.slice(0, 4))
      for (const dateKey of projectRecurringDate(client.mdn_since, startKey, endKey)) {
        const years = Number(dateKey.slice(0, 4)) - sourceYear
        clientEvents.push({
          id: `client_mdn_anniversary:${client.id}:${dateKey}`,
          dateKey,
          type: 'client_mdn_anniversary',
          clientId: client.id,
          clientName: client.name,
          label:
            years > 0
              ? `${client.name} cumple ${years} año${years === 1 ? '' : 's'} como cliente MDN`
              : `Cliente MDN desde: ${client.name}`,
          detail: null,
        })
      }
    }

    for (const contact of client.contacts ?? []) {
      const bday =
        contact.birth_day === '' || contact.birth_day == null ? null : Number(contact.birth_day)
      const bmonth =
        contact.birth_month === '' || contact.birth_month == null
          ? null
          : Number(contact.birth_month)
      if (!bday || !bmonth) continue
      // Año arbitrario: projectRecurringDate solo usa el MM-DD de sourceKey.
      const sourceKey = `2000-${String(bmonth).padStart(2, '0')}-${String(bday).padStart(2, '0')}`
      for (const dateKey of projectRecurringDate(sourceKey, startKey, endKey)) {
        clientEvents.push({
          id: `client_contact_birthday:${client.id}:${contact.name ?? 'contacto'}:${dateKey}`,
          dateKey,
          type: 'client_contact_birthday',
          clientId: client.id,
          clientName: client.name,
          label: `Cumpleaños de ${contact.name || 'un contacto'} (${client.name})`,
          detail: null,
        })
      }
    }
  }

  const events = [...teamEvents, ...clientEvents]
  events.sort((a, b) => {
    if (a.dateKey !== b.dateKey) return a.dateKey < b.dateKey ? -1 : 1
    const orderDiff = EVENT_TYPES[a.type].order - EVENT_TYPES[b.type].order
    if (orderDiff !== 0) return orderDiff
    const nameA = a.employeeName ?? a.clientName ?? ''
    const nameB = b.employeeName ?? b.clientName ?? ''
    return nameA.localeCompare(nameB)
  })

  return events
}
