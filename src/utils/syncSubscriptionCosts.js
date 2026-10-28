import { allocatedMonthly } from './subscriptions'

/**
 * Fila de `finanzas.gastosOperativos` que representa lo que le toca a una línea de una
 * suscripción (`fuente: 'suscripcion'`). Es de solo lectura en el reporte: se edita en
 * Empresa → Suscripciones.
 */
export const SUBSCRIPTION_SOURCE = 'suscripcion'

export const isSubscriptionRow = (item) => item?.fuente === SUBSCRIPTION_SOURCE

/**
 * Filas de gasto de una línea a partir de las filas de la RPC `line_subscription_costs`
 * (ya filtradas por línea). Ignora asignaciones que no son de esa línea.
 */
export function subscriptionRowsForLine(lineId, costRows = []) {
  const rows = []
  for (const r of costRows) {
    if (r.line_id !== lineId) continue
    const mine = allocatedMonthly(
      { amount: r.amount, frequency: r.frequency },
      r.allocations ?? [],
    ).find((a) => a.line_id === lineId)
    if (!mine || !(mine.monthly > 0)) continue
    rows.push({
      id: 'sub-' + r.subscription_id,
      fuente: SUBSCRIPTION_SOURCE,
      suscripcionId: r.subscription_id,
      descripcion: `${r.name} (suscripción)`,
      monto: mine.monthly,
      clienteId: null,
    })
  }
  return rows
}

/**
 * Reemplaza en `finanzas.gastosOperativos` TODAS las filas de suscripción por las vigentes
 * y deja intactas las manuales. A diferencia de ingresos/sueldos (syncReportClients) no se
 * conserva lo ya guardado: son de solo lectura, así que la fuente manda. Solo llamar con
 * meses NO congelados. No muta `data`.
 */
export function syncSubscriptionCosts(data, lineId, costRows = []) {
  const next = structuredClone(data)
  next.finanzas ??= { ingresos: [], gastosOperativos: [], sueldos: [], otrosGastos: [] }
  const manual = (next.finanzas.gastosOperativos ?? []).filter((i) => !isSubscriptionRow(i))
  next.finanzas.gastosOperativos = [...manual, ...subscriptionRowsForLine(lineId, costRows)]
  return next
}

/** Solo las filas de suscripción de `finanzas.gastosOperativos`. */
export const subscriptionRowsOf = (data) =>
  (data?.finanzas?.gastosOperativos ?? []).filter(isSubscriptionRow)

/**
 * Copia de `stored` con las filas de suscripción de `effective` y el resto de `finanzas`
 * exactamente como estaba guardado (lo usa el auto-guardado: nunca persiste ingresos/sueldos
 * reconciliados solo para mostrarlos).
 */
export function withSubscriptionRowsFrom(stored, effective) {
  const finanzas = stored?.finanzas ?? {
    ingresos: [],
    gastosOperativos: [],
    sueldos: [],
    otrosGastos: [],
  }
  return {
    ...stored,
    finanzas: {
      ...finanzas,
      gastosOperativos: [
        ...(finanzas.gastosOperativos ?? []).filter((i) => !isSubscriptionRow(i)),
        ...subscriptionRowsOf(effective),
      ],
    },
  }
}
