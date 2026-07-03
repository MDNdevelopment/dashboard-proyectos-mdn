import { useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import { useTicketAnalytics } from '../../hooks/useTicketAnalytics'
import TimeRangeSelector from './analytics/TimeRangeSelector'
import SummaryCards from './analytics/SummaryCards'
import TicketsOverTimeChart from './analytics/TicketsOverTimeChart'
import StatusPieChart from './analytics/StatusPieChart'
import CategoryBarChart from './analytics/CategoryBarChart'
import PriorityBarChart from './analytics/PriorityBarChart'
import StaffPerformanceTable from './analytics/StaffPerformanceTable'

function defaultDateRange() {
  const end = new Date()
  const start = new Date()
  start.setDate(start.getDate() - 29)
  return {
    start: start.toISOString().slice(0, 10),
    end:   end.toISOString().slice(0, 10),
  }
}

export default function TicketAnalyticsView() {
  const { userProfile } = useAuth()
  const canAccess = userProfile?.access_level >= 3 || userProfile?.admin === true

  const [range, setRange] = useState(defaultDateRange)

  const { metrics, loading, error } = useTicketAnalytics({
    startDate: range.start,
    endDate:   range.end,
  })

  if (!canAccess) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="text-center">
          <p className="text-[18px] font-bold text-[#111] mb-1">Acceso restringido</p>
          <p className="text-[15px] text-[#888]">No tienes acceso a esta sección.</p>
        </div>
      </div>
    )
  }

  return (
    <div>
      <div className="flex justify-end mb-6">
        <TimeRangeSelector
          startDate={range.start}
          endDate={range.end}
          onChange={(start, end) => setRange({ start, end })}
        />
      </div>

      {error && (
        <div className="mb-4 px-4 py-3 rounded-xl bg-[#fce4ec] text-[#c62828] text-[15px] font-medium">
          Error al cargar datos: {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-24">
          <div className="w-7 h-7 border-2 border-[#FFB800] border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <div className="space-y-5">
          <SummaryCards metrics={metrics} />

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <TicketsOverTimeChart data={metrics.ticketsPerDay} />
            <StatusPieChart data={metrics.statusBreakdown} />
            <CategoryBarChart data={metrics.categoryBreakdown} />
            <PriorityBarChart data={metrics.priorityBreakdown} />
          </div>

          <StaffPerformanceTable data={metrics.staffPerformance} />
        </div>
      )}
    </div>
  )
}
