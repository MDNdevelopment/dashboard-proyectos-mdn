/**
 * Inicializa un nuevo reporte mensual.
 * Portado desde initReport() + migrateReportsItems() del prototipo HTML original.
 *
 * Lógica de precedencia (para periodos NO guardados):
 *   1. Se construye una base carry-forward desde prevReport (si existe) o con
 *      DEFAULT_SUBTAREAS (si no hay mes anterior).
 *   2. reuniones.meta es siempre derivada: 1 por cada marca de la cartera (nadie
 *      justificó "No aplica" todavía en un período recién inicializado) — ver
 *      computeReunionesMeta en utils/reunionesMeta.js. Se recalcula en vivo en
 *      OperacionesView a medida que se marcan justificativos.
 *   3. Las metas de tareas fijas de la línea (lineMetas.tareas) sobreescriben
 *      productividad.tareas en AMBOS casos. Esto garantiza que cambiar la meta
 *      en Empresa › Líneas se refleje en todos los meses aún no guardados.
 *   4. Los reportes YA GUARDADOS no pasan por esta función; se muestran tal cual
 *      (congelados) desde OperacionesView.
 *
 *   Las finanzas se heredan con sus montos (sueldos/gastos fijos son recurrentes).
 *   Los items de crecimiento/pautas/feedback se reconcilian vía syncReportClients.
 */

import { DEFAULT_SUBTAREAS } from '../components/metricas/constants'
import { computeReunionesMeta } from './reunionesMeta'

/**
 * @param {object|null} prevReport   - Reporte del mes anterior, o null.
 * @param {Array}  lineClients       - Array de { id, name } de la cartera actual.
 * @param {object} lineMetas         - Metas configuradas en la línea: { reuniones?: number, tareas?: [{nombre, meta}] }.
 *                                     Tiene prioridad sobre el carry-forward para meses no guardados.
 * @param {Array}  lineEmployees     - Array de empleados (de users) filtrados para la línea.
 * @returns {object} - Objeto de datos del nuevo reporte (sin id/line_id/year/month).
 */
export function initMetricReport(prevReport, lineClients = [], lineMetas = {}, lineEmployees = []) {
  // ── 1. Construir base (carry-forward o defaults) ──────────────────────────────
  let base

  if (prevReport) {
    base = {
      reuniones: {
        realizadas: null,
        meta: computeReunionesMeta(lineClients, {}),
        comentario: null,
        justificativos: {}, // no se hereda del mes anterior: cada mes justifica lo suyo
      },
      productividad: {
        tareas: (prevReport.productividad?.tareas ?? []).map((t) => ({
          nombre: t.nombre,
          realizado: null,
          meta: t.meta,
        })),
      },
      crecimiento: {
        items: (prevReport.crecimiento?.items ?? []).map((i) => ({
          clienteId: i.clienteId,
          seguidoresGanados: null,
          seguidoresGanadosPrev: null,
          seguidoresActuales: null,
          seguidoresBase: null,
          meta: i.meta,
        })),
      },
      solicitudes: { solicitudes: null, editadas: null },
      pautas: {
        items: (prevReport.pautas?.items ?? []).map((i) => ({
          clienteId: i.clienteId,
          realizadas: null,
          meta: i.meta,
        })),
      },
      piezas: { piezas: null, editadas: null },
      feedback: {
        items: (prevReport.feedback?.items ?? []).map((i) => ({
          clienteId: i.clienteId,
          score: null,
        })),
      },
      // Finanzas: heredar montos (sueldos/gastos fijos son recurrentes)
      finanzas: prevReport.finanzas
        ? {
            ingresos: (prevReport.finanzas.ingresos ?? []).map((it) => ({ ...it })),
            gastosOperativos: (prevReport.finanzas.gastosOperativos ?? []).map((it) => ({ ...it })),
            sueldos: (prevReport.finanzas.sueldos ?? []).map((it) => ({ ...it })),
            otrosGastos: (prevReport.finanzas.otrosGastos ?? []).map((it) => ({ ...it })),
          }
        : { ingresos: [], gastosOperativos: [], sueldos: [], otrosGastos: [] },
    }
  } else {
    // Sin mes anterior: defaults
    base = {
      reuniones: {
        realizadas: null,
        meta: computeReunionesMeta(lineClients, {}),
        comentario: null,
        justificativos: {},
      },
      productividad: {
        tareas: DEFAULT_SUBTAREAS.map((s) => ({ nombre: s.nombre, realizado: null, meta: s.meta })),
      },
      crecimiento: {
        items: lineClients.map((c) => ({
          clienteId: c.id,
          seguidoresGanados: null,
          seguidoresGanadosPrev: null,
          seguidoresActuales: null,
          seguidoresBase: null,
          meta: null,
        })),
      },
      solicitudes: { solicitudes: null, editadas: null },
      pautas: {
        items: lineClients.map((c) => ({ clienteId: c.id, realizadas: null, meta: null })),
      },
      piezas: { piezas: null, editadas: null },
      feedback: {
        items: lineClients.map((c) => ({ clienteId: c.id, score: null })),
      },
      finanzas: {
        ingresos: lineClients.map((c) => ({
          id: 'ing-' + c.id,
          clienteId: c.id,
          descripcion: c.name,
          monto: Number(c.monthly_fee) || 0,
        })),
        gastosOperativos: [],
        sueldos: lineEmployees.map((emp) => ({
          id: 'sue-' + emp.user_id,
          empleadoId: emp.user_id,
          descripcion: `${emp.first_name ?? ''} ${emp.last_name ?? ''}`.trim(),
          monto: Number(emp.monthly_salary) || 0,
        })),
        otrosGastos: [],
      },
    }
  }

  // ── 2. Aplicar overrides de la línea (tienen prioridad sobre el carry-forward) ─
  if (lineMetas.tareas && lineMetas.tareas.length > 0) {
    base.productividad.tareas = lineMetas.tareas.map((t) => ({
      nombre: t.nombre,
      realizado: 0,
      meta: Number(t.meta) || 0,
    }))
  }

  return base
}
