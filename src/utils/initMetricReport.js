/**
 * Inicializa un nuevo reporte mensual.
 * Portado desde initReport() + migrateReportsItems() del prototipo HTML original.
 *
 * Lógica carry-forward:
 *   - Si existe un reporte del mes anterior (prevReport), se copian metas y
 *     estructura de items, reseteando los valores a 0/null. Las finanzas se
 *     heredan con sus montos (sueldos/gastos fijos son recurrentes).
 *   - Si no existe mes anterior, se usan los DEFAULT_SUBTAREAS y se inicializan
 *     los items de crecimiento/pautas/feedback a partir de lineClients.
 */

import { DEFAULT_SUBTAREAS } from "../components/metricas/constants";

/**
 * @param {object|null} prevReport - Reporte del mes anterior, o null.
 * @param {Array} lineClients      - Array de { id, name } de la cartera actual.
 * @returns {object} - Objeto de datos del nuevo reporte (sin id/line_id/year/month).
 */
export function initMetricReport(prevReport, lineClients = []) {
  if (prevReport) {
    return {
      reuniones: {
        realizadas: 0,
        meta: prevReport.reuniones?.meta ?? 15,
      },
      productividad: {
        tareas: (prevReport.productividad?.tareas ?? []).map(t => ({
          nombre: t.nombre,
          realizado: 0,
          meta: t.meta,
        })),
      },
      crecimiento: {
        items: (prevReport.crecimiento?.items ?? []).map(i => ({
          clienteId: i.clienteId,
          seguidoresActuales: null,
          seguidoresBase: null,
          meta: i.meta,
        })),
      },
      solicitudes: { solicitudes: 0, editadas: 0 },
      pautas: {
        items: (prevReport.pautas?.items ?? []).map(i => ({
          clienteId: i.clienteId,
          realizadas: 0,
          meta: i.meta,
        })),
      },
      piezas: { piezas: 0, editadas: 0 },
      feedback: {
        items: (prevReport.feedback?.items ?? []).map(i => ({
          clienteId: i.clienteId,
          score: null,
        })),
      },
      // Finanzas: heredar montos (sueldos/gastos fijos son recurrentes)
      finanzas: prevReport.finanzas ? {
        ingresos:          (prevReport.finanzas.ingresos ?? []).map(it => ({ ...it })),
        gastosOperativos:  (prevReport.finanzas.gastosOperativos ?? []).map(it => ({ ...it })),
        sueldos:           (prevReport.finanzas.sueldos ?? []).map(it => ({ ...it })),
        otrosGastos:       (prevReport.finanzas.otrosGastos ?? []).map(it => ({ ...it })),
      } : { ingresos: [], gastosOperativos: [], sueldos: [], otrosGastos: [] },
    };
  }

  // Sin mes anterior: defaults con clientes actuales de la cartera
  return {
    reuniones: { realizadas: 0, meta: 15 },
    productividad: {
      tareas: DEFAULT_SUBTAREAS.map(s => ({ nombre: s.nombre, realizado: 0, meta: s.meta })),
    },
    crecimiento: {
      items: lineClients.map(c => ({ clienteId: c.id, seguidoresActuales: null, seguidoresBase: null, meta: 0 })),
    },
    solicitudes: { solicitudes: 0, editadas: 0 },
    pautas: {
      items: lineClients.map(c => ({ clienteId: c.id, realizadas: 0, meta: 0 })),
    },
    piezas: { piezas: 0, editadas: 0 },
    feedback: {
      items: lineClients.map(c => ({ clienteId: c.id, score: null })),
    },
    finanzas: { ingresos: [], gastosOperativos: [], sueldos: [], otrosGastos: [] },
  };
}
