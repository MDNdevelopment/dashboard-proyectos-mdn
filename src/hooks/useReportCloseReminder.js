import { useCallback, useEffect, useState } from 'react'
import { loadLines, loadReportsClosureStatus } from '../components/metricas/metricsApi'
import {
  closurePeriod,
  daysLeftToClose,
  isClosureWindow,
  pendingLeadReports,
  shouldShowClosureReminder,
} from '../utils/reportClosure'
import { readSeenDate, writeSeenDate } from '../lib/reportReminder'

/**
 * Orquesta el modal de recordatorio de cierre de reportes (días 1 al 5 del
 * mes, ver ARQUITECTURA.md §2.5 y `src/utils/reportClosure.js`).
 *
 * - Fuera de la ventana de avisos no hace ninguna query (cero costo el resto
 *   del mes).
 * - Dentro de la ventana, busca las líneas que el usuario lidera
 *   (`metric_line_members.is_lead`) y cuyo reporte del mes anterior sigue sin
 *   cerrarse.
 * - `dismiss()` marca hoy como visto (localStorage): el modal reaparece al
 *   día siguiente si todavía hay pendientes.
 */
export function useReportCloseReminder(companyId, userId) {
  const [pending, setPending] = useState([])
  const [seenDate, setSeenDate] = useState(() => readSeenDate())

  const period = closurePeriod()
  const daysLeft = daysLeftToClose()

  const load = useCallback(async () => {
    if (!companyId || !userId || !isClosureWindow()) {
      setPending([])
      return
    }

    const { data: lines } = await loadLines(companyId)
    const leadLines = (lines ?? []).filter((l) => l.lead_user_id === userId)
    if (leadLines.length === 0) {
      setPending([])
      return
    }

    const { data: reports } = await loadReportsClosureStatus(
      leadLines.map((l) => l.id),
      period.year,
      period.month,
    )
    setPending(pendingLeadReports(leadLines, reports ?? [], userId))
  }, [companyId, userId, period.year, period.month])

  useEffect(() => {
    load()
  }, [load])

  const dismiss = useCallback(() => {
    const today = new Date().toISOString().slice(0, 10)
    writeSeenDate(today)
    setSeenDate(today)
  }, [])

  const show = shouldShowClosureReminder({ pending, seenDate })

  return { show, pending, period, daysLeft, dismiss }
}
