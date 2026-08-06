/**
 * notificationFormat.js
 * Maps notification types to display metadata (icon, label, nav route).
 * Kept as pure functions so they can be unit-tested without a DOM.
 */

/** @typedef {{ type: string, entity_type: string|null, entity_id: string|null }} Notif */

/**
 * Returns an emoji icon for a notification type.
 * @param {string} type
 * @returns {string}
 */
export function notifIcon(type) {
  const icons = {
    task_assigned: '📋',
    task_comment: '💬',
    checklist_item_assigned: '☑️',
    project_added: '📁',
    client_anniversary: '🎂',
    client_mdn_anniversary: '🤝',
    client_contact_birthday: '🎂',
    employee_birthday: '🎂',
    employee_mdn_anniversary: '🎊',
    meeting_invite: '📅',
    meeting_reminder_day: '📅',
    meeting_reminder_hour: '⏰',
    campaign_autoclosed: '✅',
    ad_autoclosed: '✅',
  }
  return icons[type] ?? '🔔'
}

/**
 * Returns a short human-readable label for a notification type.
 * @param {string} type
 * @returns {string}
 */
export function notifLabel(type) {
  const labels = {
    task_assigned: 'Tarea asignada',
    task_comment: 'Comentario en tarea',
    checklist_item_assigned: 'Ítem asignado',
    project_added: 'Proyecto',
    client_anniversary: 'Aniversario de cliente',
    client_mdn_anniversary: 'Aniversario MDN',
    client_contact_birthday: 'Cumpleaños de contacto',
    employee_birthday: 'Cumpleaños',
    employee_mdn_anniversary: 'Aniversario MDN',
    meeting_invite: 'Reunión agendada',
    meeting_reminder_day: 'Recordatorio de reunión',
    meeting_reminder_hour: 'Recordatorio de reunión',
    campaign_autoclosed: 'Campaña finalizada',
    ad_autoclosed: 'Ad finalizado',
  }
  return labels[type] ?? 'Notificación'
}

/**
 * Returns the in-app navigation path for a notification.
 * Used when the user clicks a notification to navigate to the relevant entity.
 *
 * @param {Notif} notif
 * @returns {string} — a React Router path
 */
export function notifRoute(notif) {
  const { type, entity_type, entity_id } = notif

  if (type === 'task_assigned' || type === 'task_comment' || type === 'checklist_item_assigned') {
    // Deep-link al detalle de la tarea vía ?taskId=uuid (TareasPage lo lee y abre TaskModal)
    if (entity_id) return `/tareas?taskId=${entity_id}`
    return '/tareas'
  }
  if (
    type === 'meeting_invite' ||
    type === 'meeting_reminder_day' ||
    type === 'meeting_reminder_hour'
  ) {
    // Deep-link al detalle de solo lectura de la reunión vía ?meetingId=uuid (ReunionesPage lo lee)
    if (entity_id) return `/reuniones?meetingId=${entity_id}`
    return '/reuniones'
  }
  if (type === 'project_added') {
    // Deep-link to the project modal via ?projectId=uuid (AppLayout reads this param)
    if (entity_id) return `/?projectId=${entity_id}`
    return '/'
  }
  if (entity_type === 'campaign' || entity_type === 'ad') return '/ads'
  if (entity_type === 'client') return '/empresa/clientes'
  if (entity_type === 'employee') return '/empresa/empleados'
  return '/'
}

/**
 * Formats the notification's created_at timestamp to a short relative or absolute string.
 * @param {string} isoString
 * @returns {string}
 */
export function notifTimeAgo(isoString) {
  if (!isoString) return ''
  const now = Date.now()
  const then = new Date(isoString).getTime()
  if (isNaN(then)) return ''
  const diffMs = now - then
  const diffMin = Math.floor(diffMs / 60_000)
  if (diffMin < 1) return 'Ahora'
  if (diffMin < 60) return `hace ${diffMin} min`
  const diffH = Math.floor(diffMin / 60)
  if (diffH < 24) return `hace ${diffH} h`
  const diffD = Math.floor(diffH / 24)
  if (diffD < 7) return `hace ${diffD} d`
  // Fall back to formatted date
  return new Date(isoString).toLocaleDateString('es-VE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'America/Caracas',
  })
}
