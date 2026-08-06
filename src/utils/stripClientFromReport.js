/**
 * Devuelve una copia del `data` (jsonb) de un reporte SIN rastro de un cliente:
 * lo quita de crecimiento/pautas/feedback, de los justificativos de reuniones y de
 * las filas de ingreso ligadas a ese cliente. Las filas manuales (clienteId==null) y
 * el resto de secciones (sueldos, gastos, etc.) quedan intactas.
 *
 * Se usa al fijar la fecha de fin de contrato de una cuenta, para limpiar los reportes
 * ya guardados de meses POSTERIORES al mes de fin (ver metricsApi.cleanupClientAfterContractEnd).
 *
 * @param {object} reportData - `data` del reporte.
 * @param {string} clientId   - id de la cuenta a quitar.
 * @returns {object} copia nueva de reportData sin el cliente.
 */
export function stripClientFromReport(reportData, clientId) {
  const data = structuredClone(reportData ?? {})

  if (data.crecimiento?.items) {
    data.crecimiento.items = data.crecimiento.items.filter((i) => i.clienteId !== clientId)
  }
  if (data.pautas?.items) {
    data.pautas.items = data.pautas.items.filter((i) => i.clienteId !== clientId)
  }
  if (data.feedback?.items) {
    data.feedback.items = data.feedback.items.filter((i) => i.clienteId !== clientId)
  }
  if (data.reuniones?.justificativos && clientId in data.reuniones.justificativos) {
    delete data.reuniones.justificativos[clientId]
  }
  if (data.finanzas?.ingresos) {
    data.finanzas.ingresos = data.finanzas.ingresos.filter((r) => r.clienteId !== clientId)
  }

  return data
}

/**
 * ¿El `data` de un reporte contiene algún rastro del cliente? (para no reescribir reportes
 * que no lo mencionan).
 */
export function reportHasClient(reportData, clientId) {
  if (!reportData) return false
  const inItems = (arr) => (arr ?? []).some((i) => i.clienteId === clientId)
  return (
    inItems(reportData.crecimiento?.items) ||
    inItems(reportData.pautas?.items) ||
    inItems(reportData.feedback?.items) ||
    inItems(reportData.finanzas?.ingresos) ||
    !!(reportData.reuniones?.justificativos && clientId in reportData.reuniones.justificativos)
  )
}
