import { STATUS, PRIORITY } from './constants'

export default function TicketStatusBadge({ type, value }) {
  const map = type === 'priority' ? PRIORITY : STATUS
  const entry = map[value]
  if (!entry) return null
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[13px] font-semibold font-mono ${entry.color}`}>
      {entry.label}
    </span>
  )
}
