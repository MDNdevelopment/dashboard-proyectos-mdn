import { SLA_HOURS } from './constants'

export function getTicketAgeHours(ticket) {
  const start = new Date(ticket.created_at).getTime()
  const end = ticket.resolved_at
    ? new Date(ticket.resolved_at).getTime()
    : Date.now()
  return (end - start) / (1000 * 60 * 60)
}

export function getSlaThresholdHours(priority) {
  return SLA_HOURS[priority] ?? 24
}

export function getSlaStatusKey(ticket) {
  if (ticket.status === 'resuelto') return null
  const ageHours = getTicketAgeHours(ticket)
  const threshold = getSlaThresholdHours(ticket.priority)
  if (ageHours >= threshold) return 'overdue'
  if (ageHours >= threshold * 0.75) return 'warning'
  return 'on_track'
}
