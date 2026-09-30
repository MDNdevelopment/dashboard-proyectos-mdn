/**
 * Test estrella: el score que ve Operaciones (buildEffectiveReport + calcTotal/sumScore
 * directo) y el score que ven Resumen/Inicio/Hub/Empresa (la misma fila, leída después
 * con monthLineScore y con aggregateMetricsDashboard) deben ser EXACTAMENTE el mismo
 * número. Puro, sin red — reproduce el caso real que motivó este cambio: Team Georgina
 * mostraba 85.1 en Resumen y 84.7 en Operaciones para el mismo mes.
 */
import { describe, it, expect } from 'vitest'
import { buildEffectiveReport } from '../utils/buildEffectiveReport'
import { calcTotal, sumScore, monthLineScore } from '../utils/metricsScore'
import { aggregateMetricsDashboard } from '../utils/aggregateMetricsDashboard'
import { calcFinanzas } from '../utils/metricsFinance'

const LINE = { id: 'l1', name: 'Georgina', color: '#FAB51A' }
const CLIENTS = [
  { id: 'c1', name: 'Cliente 1', fixed_tasks: null, social_links: [] },
  { id: 'c2', name: 'Cliente 2', fixed_tasks: null, social_links: [] },
]

// Reporte "guardado" deliberadamente DESALINEADO con las fuentes en vivo — como quedaría
// congelado en Supabase si nadie volvió a guardar Operaciones desde entonces.
function storedData() {
  return {
    reuniones: { realizadas: 1, meta: 2, justificativos: {} },
    productividad: { tareas: [{ nombre: 'Métricas', realizado: 1, meta: 5 }] },
    crecimiento: { items: [{ clienteId: 'c1', seguidoresGanados: 3, meta: 10 }] },
    solicitudes: { solicitudes: 20, editadas: 5 },
    pautas: { items: [{ clienteId: 'c1', realizadas: 0, meta: 4 }] },
    piezas: { piezas: 20, editadas: 3 },
    feedback: { items: [] },
    finanzas: { ingresos: [], gastosOperativos: [], sueldos: [], otrosGastos: [] },
  }
}

// Fuentes en vivo — lo que devolvería reportSourcesApi/countXxxForLine hoy.
const SOURCES = {
  meetingsCount: 8,
  heldClientIds: ['c1'],
  fixedTaskMarks: [{ client_id: 'c1', task_key: 'metricas', period_week: 1, status: 'si' }],
  checks: [],
  piezas: { piezas: 6, editadas: 6, porGrupo: null },
  pautasByClient: { c1: 4 },
  cnpSolicitudes: { solicitudes: 10, entregados: 9 },
  tareasSolicitudes: { solicitudes: 4, entregados: 4 },
}

const CTX = {
  year: 2026,
  month: 9, // en o después de todas las eras de auto-llenado
  closed: false,
  activeLineClients: CLIENTS,
  lineEmployees: [],
  now: new Date(2026, 8, 15),
}

describe('reporte efectivo — equivalencia Operaciones ⇔ camino de lectura', () => {
  it('el mismo score sale por calcTotal directo, monthLineScore y aggregateMetricsDashboard', () => {
    const stored = storedData()

    // Camino A: lo que calcula/muestra OperacionesView.
    const effective = buildEffectiveReport(stored, SOURCES, CTX)
    const scoreOperaciones = sumScore(calcTotal(effective, null))

    // Camino B: la misma fila, tal como la dejaría loadYearReportsEffective, leída
    // después por monthLineScore (Hub de línea) y por aggregateMetricsDashboard (Resumen).
    const rows = [{ line_id: 'l1', year: 2026, month: 9, data: effective }]
    const { score: scoreHub } = monthLineScore(rows, 9)
    const agg = aggregateMetricsDashboard([LINE], rows, 2026, calcTotal, sumScore, calcFinanzas, 9)
    const scoreResumen = agg.matrix['l1'][8] // índice 8 = mes 9

    expect(scoreHub).toBe(scoreOperaciones)
    expect(scoreResumen).toBe(scoreOperaciones)
  })

  it('sin derivar (data crudo), el score SÍ difiere — así falla si alguien reconecta un consumidor a loadYearReports', () => {
    const stored = storedData()
    const effective = buildEffectiveReport(stored, SOURCES, CTX)
    const scoreOperaciones = sumScore(calcTotal(effective, null))

    const rowsCrudo = [{ line_id: 'l1', year: 2026, month: 9, data: stored }]
    const { score: scoreCrudo } = monthLineScore(rowsCrudo, 9)

    expect(scoreCrudo).not.toBe(scoreOperaciones)
  })
})
