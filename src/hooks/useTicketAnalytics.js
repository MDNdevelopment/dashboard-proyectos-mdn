import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../supabase'
import { getTicketAgeHours, getSlaStatusKey } from '../components/tickets/slaUtils'

export function useTicketAnalytics({ startDate, endDate }) {
  const [tickets, setTickets] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    async function fetch() {
      setLoading(true)
      setError(null)
      let query = supabase
        .from('support_tickets')
        .select('*, requester:users!requester_id(first_name, last_name), assignee:users!assigned_to(first_name, last_name)')
        .order('created_at', { ascending: true })
      if (startDate) query = query.gte('created_at', startDate)
      if (endDate)   query = query.lte('created_at', endDate)
      const { data, error: err } = await query
      if (!cancelled) {
        if (err) setError(err.message)
        else setTickets(data ?? [])
        setLoading(false)
      }
    }
    fetch()
    return () => { cancelled = true }
  }, [startDate, endDate])

  const metrics = useMemo(() => {
    const total = tickets.length
    const open = tickets.filter(t => t.status === 'abierto').length
    const inProgress = tickets.filter(t => t.status === 'en_progreso').length
    const resolved = tickets.filter(t => t.status === 'resuelto').length
    const overdue = tickets.filter(t => getSlaStatusKey(t) === 'overdue').length

    const resolvedWithTime = tickets.filter(t => t.resolved_at)
    const avgResolutionHours = resolvedWithTime.length
      ? resolvedWithTime.reduce((sum, t) => sum + getTicketAgeHours(t), 0) / resolvedWithTime.length
      : 0

    // tickets per day
    const dayMap = {}
    tickets.forEach(t => {
      const day = t.created_at.slice(0, 10)
      dayMap[day] = (dayMap[day] ?? 0) + 1
    })
    const ticketsPerDay = Object.entries(dayMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, count]) => ({ date, count }))

    // breakdowns
    const statusMap = {}
    const categoryMap = {}
    const priorityMap = {}
    tickets.forEach(t => {
      statusMap[t.status] = (statusMap[t.status] ?? 0) + 1
      categoryMap[t.category] = (categoryMap[t.category] ?? 0) + 1
      priorityMap[t.priority] = (priorityMap[t.priority] ?? 0) + 1
    })
    const statusBreakdown   = Object.entries(statusMap).map(([name, value]) => ({ name, value }))
    const categoryBreakdown = Object.entries(categoryMap).map(([name, value]) => ({ name, value }))
    const priorityBreakdown = Object.entries(priorityMap).map(([name, value]) => ({ name, value }))

    // staff performance
    const staffMap = {}
    tickets.forEach(t => {
      if (!t.assigned_to) return
      const key = t.assigned_to
      if (!staffMap[key]) {
        staffMap[key] = {
          name: t.assignee ? `${t.assignee.first_name} ${t.assignee.last_name}` : key,
          resolved: 0,
          totalHours: 0,
          resolvedCount: 0,
        }
      }
      if (t.status === 'resuelto') {
        staffMap[key].resolved += 1
        staffMap[key].totalHours += getTicketAgeHours(t)
        staffMap[key].resolvedCount += 1
      }
    })
    const staffPerformance = Object.values(staffMap).map(s => ({
      name: s.name,
      resolved: s.resolved,
      avgHours: s.resolvedCount > 0 ? s.totalHours / s.resolvedCount : 0,
    }))

    return {
      total, open, inProgress, resolved, overdue, avgResolutionHours,
      ticketsPerDay, statusBreakdown, categoryBreakdown, priorityBreakdown, staffPerformance,
    }
  }, [tickets])

  return { tickets, loading, error, metrics }
}
