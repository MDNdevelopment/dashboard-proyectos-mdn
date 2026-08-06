/**
 * Materializa el movimiento de una cuenta de una línea a otra DENTRO del reporte
 * del mes en que ocurre el cambio (mes de transición). Función pura y testeable:
 * no hace I/O; recibe los `data` (jsonb) de ambos reportes y devuelve copias nuevas.
 *
 * Reglas del mes de transición (confirmadas con producto):
 *  - INGRESO: se reparte por días (prorrateo). En la línea VIEJA se guarda como una
 *    fila MANUAL (clienteId: null) para que sobreviva a syncReportClients (que solo
 *    conserva filas manuales o filas cuyo cliente sigue en la cartera de la línea).
 *    En la línea NUEVA se guarda como fila ligada al cliente (clienteId), que
 *    sobrevive porque la cuenta ya pertenece a esa línea.
 *  - OPERATIVO (crecimiento / pautas / feedback / justificativo de reunión): sus
 *    valores ya cargados se MIGRAN a la línea nueva (continuidad de seguidores, etc.)
 *    y se quitan de la vieja. En la vieja se descartan; en la nueva se insertan/mezclan
 *    con los valores traídos.
 *
 * Nómina, gastos y demás filas manuales no se tocan.
 *
 * @param {object} params
 * @param {string} params.clientId      - id de la cuenta que se mueve.
 * @param {string} params.clientName    - nombre de la cuenta (para descripción del ingreso).
 * @param {string} params.effectiveLabel- etiqueta de fecha para la fila manual (ej. "24/08/2026").
 * @param {object} params.oldReportData - `data` del reporte del mes de la línea VIEJA (o shape vacío).
 * @param {object} params.newReportData - `data` del reporte del mes de la línea NUEVA (o shape vacío).
 * @param {number} params.oldAmount     - ingreso prorrateado para la línea vieja.
 * @param {number} params.newAmount     - ingreso prorrateado para la línea nueva.
 * @returns {{ oldReportData: object, newReportData: object }}
 */
export function moveClientLine({
  clientId,
  clientName,
  effectiveLabel,
  oldReportData,
  newReportData,
  oldAmount,
  newAmount,
}) {
  const oldData = structuredClone(oldReportData ?? {})
  const newData = structuredClone(newReportData ?? {})

  // Asegurar la estructura mínima en ambos.
  ensureShape(oldData)
  ensureShape(newData)

  // ── 1. Capturar los ítems operativos de la cuenta en la línea vieja ────────────
  const crecItem = findByClient(oldData.crecimiento.items, clientId)
  const pautaItem = findByClient(oldData.pautas.items, clientId)
  const fbItem = findByClient(oldData.feedback.items, clientId)
  const justificativo = oldData.reuniones?.justificativos?.[clientId]

  // ── 2. Línea VIEJA: quitar operativo del cliente ───────────────────────────────
  oldData.crecimiento.items = oldData.crecimiento.items.filter((i) => i.clienteId !== clientId)
  oldData.pautas.items = oldData.pautas.items.filter((i) => i.clienteId !== clientId)
  oldData.feedback.items = oldData.feedback.items.filter((i) => i.clienteId !== clientId)
  if (oldData.reuniones?.justificativos && clientId in oldData.reuniones.justificativos) {
    delete oldData.reuniones.justificativos[clientId]
  }

  // ── 3. Línea VIEJA: ingreso prorrateado como fila MANUAL (sobrevive al sync) ────
  oldData.finanzas.ingresos = oldData.finanzas.ingresos.filter((r) => r.clienteId !== clientId)
  oldData.finanzas.ingresos.push({
    id: 'mov-' + clientId,
    clienteId: null,
    descripcion: `${clientName} (parcial hasta ${effectiveLabel})`,
    monto: oldAmount,
  })

  // ── 4. Línea NUEVA: migrar operativo con sus valores (mezclando por clienteId) ─
  upsertByClient(
    newData.crecimiento.items,
    crecItem ? { ...crecItem, clienteId: clientId } : defaultCrecItem(clientId),
  )
  upsertByClient(
    newData.pautas.items,
    pautaItem ? { ...pautaItem, clienteId: clientId } : defaultPautaItem(clientId),
  )
  upsertByClient(
    newData.feedback.items,
    fbItem ? { ...fbItem, clienteId: clientId } : defaultFeedbackItem(clientId),
  )
  if (justificativo != null) {
    newData.reuniones.justificativos = newData.reuniones.justificativos ?? {}
    newData.reuniones.justificativos[clientId] = justificativo
  }

  // ── 5. Línea NUEVA: ingreso ligado al cliente con el monto prorrateado ─────────
  const existingIngreso = newData.finanzas.ingresos.find((r) => r.clienteId === clientId)
  if (existingIngreso) {
    existingIngreso.monto = newAmount
    if (!existingIngreso.descripcion) existingIngreso.descripcion = clientName
  } else {
    newData.finanzas.ingresos.push({
      id: 'ing-' + clientId,
      clienteId: clientId,
      descripcion: clientName,
      monto: newAmount,
    })
  }

  return { oldReportData: oldData, newReportData: newData }
}

// ── helpers ──────────────────────────────────────────────────────────────────
function findByClient(items, clientId) {
  return (items ?? []).find((i) => i.clienteId === clientId) ?? null
}

function upsertByClient(items, item) {
  const idx = items.findIndex((i) => i.clienteId === item.clienteId)
  if (idx >= 0) items[idx] = item
  else items.push(item)
}

function defaultCrecItem(clienteId) {
  return {
    clienteId,
    seguidoresGanados: null,
    seguidoresGanadosPrev: null,
    seguidoresActuales: null,
    seguidoresBase: null,
    meta: 0,
  }
}
function defaultPautaItem(clienteId) {
  return { clienteId, realizadas: 0, meta: 0 }
}
function defaultFeedbackItem(clienteId) {
  return { clienteId, score: null }
}

/** Garantiza que el objeto data tenga las ramas que tocamos, sin pisar lo existente. */
function ensureShape(data) {
  data.crecimiento = data.crecimiento ?? {}
  data.crecimiento.items = data.crecimiento.items ?? []
  data.pautas = data.pautas ?? {}
  data.pautas.items = data.pautas.items ?? []
  data.feedback = data.feedback ?? {}
  data.feedback.items = data.feedback.items ?? []
  data.reuniones = data.reuniones ?? {}
  data.reuniones.justificativos = data.reuniones.justificativos ?? {}
  data.finanzas = data.finanzas ?? {}
  data.finanzas.ingresos = data.finanzas.ingresos ?? []
  data.finanzas.gastosOperativos = data.finanzas.gastosOperativos ?? []
  data.finanzas.sueldos = data.finanzas.sueldos ?? []
  data.finanzas.otrosGastos = data.finanzas.otrosGastos ?? []
}
