import { employeeActiveInMonth } from './employeeInMonth'
import { clientInMonth } from './clientInMonth'

/**
 * Poda las filas de finanzas heredadas del mes anterior que no corresponden al mes destino.
 *
 * Contexto (bug real, Team Bianca agosto 2026): un reporte de un mes YA PASADO que todavía
 * no existía se inicializa con initMetricReport(), que copia `finanzas.sueldos` e
 * `finanzas.ingresos` del mes anterior TAL CUAL. Como el mes ya pasó, isReportFrozen() es
 * true y FinanzasView/OperacionesView se saltan syncReportClients() — el único punto donde
 * se descartan empleados/clientes que ya no van. Resultado: el reporte nace con la nómina y
 * la cartera de otro mes, incluyendo gente dada de baja antes de ese mes.
 *
 * Por qué no reusar syncReportClients() aquí: ese reconcilia contra el roster de HOY
 * (metric_line_members), y archive-employee.js borra la membresía al archivar — sobre un mes
 * pasado eliminaría también a quien sí trabajó ese mes y se archivó después. Esta función solo
 * mira fechas de baja, nunca membresía, así que es segura para meses pasados.
 *
 * Solo debe aplicarse a un reporte recién inicializado (initMetricReport), NUNCA a uno ya
 * guardado: ese es histórico capturado a mano y se respeta tal cual.
 *
 * Las filas manuales (sin `empleadoId` / `clienteId`) y aquellas cuyo empleado/cliente no se
 * encuentra en el listado se conservan: no hay información para descartarlas.
 *
 * @param {object} data          - data del reporte recién inicializado.
 * @param {object} opts
 * @param {Array}  opts.allEmployees - Todos los users de la empresa, INCLUIDOS los archivados.
 * @param {Array}  opts.allClients   - Todos los metric_clients, INCLUIDOS los archivados.
 * @param {number} opts.year
 * @param {number} opts.month        - 1-12
 * @returns {object} Nueva copia de data con las filas podadas.
 */
export function pruneCarryForward(data, { allEmployees = [], allClients = [], year, month }) {
  const next = structuredClone(data)
  if (!next.finanzas) return next

  const employeeById = new Map(allEmployees.map((e) => [e.user_id, e]))
  const clientById = new Map(allClients.map((c) => [c.id, c]))

  next.finanzas = {
    ...next.finanzas,
    sueldos: (next.finanzas.sueldos ?? []).filter((row) => {
      if (row.empleadoId == null) return true // fila manual
      const emp = employeeById.get(row.empleadoId)
      if (!emp) return true // no resoluble: no hay base para descartarla
      return employeeActiveInMonth(emp, year, month)
    }),
    ingresos: (next.finanzas.ingresos ?? []).filter((row) => {
      if (row.clienteId == null) return true // fila manual
      const cli = clientById.get(row.clienteId)
      if (!cli) return true
      return clientInMonth(cli, year, month)
    }),
  }

  return next
}
