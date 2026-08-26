/**
 * Conteos derivados de `tasks` para el indicador "Solicitudes vs Entregados" de
 * Reportes → Operaciones (ver src/components/metricas/OperacionesView.jsx y
 * SOLICITUDES_MODULE_START). Mismo patrón que countPiezasForLine en
 * src/components/pautas/avPautasApi.js.
 */
import { supabase } from '../../supabase'

/**
 * Cuenta tareas solicitadas vs entregadas para una línea en un mes dado.
 * "Solicitada" = request_date dentro del mes. "Entregada" = de ese mismo conjunto,
 * las que están en status Terminado (sin importar cuándo se cerraron).
 */
export async function countTareasSolicitudesForLine(companyId, lineId, { month, year }) {
  const monthStart = new Date(year, month - 1, 1)
  const monthEnd = new Date(year, month, 1)
  const toISO = (d) => d.toISOString().slice(0, 10)

  const { data, error } = await supabase
    .from('tasks')
    .select('status')
    .eq('company_id', companyId)
    .eq('team_id', lineId)
    .gte('request_date', toISO(monthStart))
    .lt('request_date', toISO(monthEnd))

  if (error) return { solicitudes: 0, entregados: 0, error }
  const rows = data ?? []
  return {
    solicitudes: rows.length,
    entregados: rows.filter((r) => r.status === 'Terminado').length,
    error: null,
  }
}
