import { describe, it, expect } from 'vitest'
import {
  buildEffectiveReport,
  effectiveReportGates,
  needsSourcesFor,
} from '../utils/buildEffectiveReport'

const CLIENTS = [
  { id: 'c1', name: 'Cliente 1', fixed_tasks: null, social_links: [] },
  { id: 'c2', name: 'Cliente 2', fixed_tasks: null, social_links: [] },
]
const EMPLOYEES = []

function baseStored() {
  return {
    reuniones: { realizadas: 1, meta: 2, justificativos: { c1: 'no_aplica' } },
    productividad: { tareas: [{ nombre: 'Métricas', realizado: 1, meta: 2 }] },
    crecimiento: { items: [{ clienteId: 'c1', seguidoresGanados: 10, meta: 5 }] },
    solicitudes: { solicitudes: 5, editadas: 3 },
    pautas: { items: [{ clienteId: 'c1', realizadas: 1, meta: 2 }] },
    piezas: { piezas: 4, editadas: 2 },
    feedback: { items: [] },
    finanzas: { ingresos: [], gastosOperativos: [], sueldos: [], otrosGastos: [] },
  }
}

const HOT_CTX = {
  year: 2026,
  month: 9,
  closed: false,
  activeLineClients: CLIENTS,
  lineEmployees: EMPLOYEES,
  now: new Date(2026, 8, 15), // 15 sep 2026 — dentro del mes en curso
}

describe('effectiveReportGates', () => {
  it('apaga todos los gates de derivación en un reporte cerrado', () => {
    const g = effectiveReportGates(2026, 9, true, HOT_CTX.now)
    expect(g.frozen).toBe(true)
    expect(g.shouldAutoSync).toBe(false)
    expect(g.metaAutoSync).toBe(false)
    expect(g.isFijasEra && !false).toBe(true) // isFijasEra no depende de closed, solo el uso lo gatea
  })

  it('metaAutoSync solo aplica en el mes en curso, no cerrado', () => {
    expect(effectiveReportGates(2026, 9, false, new Date(2026, 8, 15)).metaAutoSync).toBe(true)
    expect(effectiveReportGates(2026, 8, false, new Date(2026, 8, 15)).metaAutoSync).toBe(false)
    expect(effectiveReportGates(2026, 9, true, new Date(2026, 8, 15)).metaAutoSync).toBe(false)
  })
})

describe('needsSourcesFor', () => {
  it('es false para un mes cerrado', () => {
    expect(needsSourcesFor(2026, 9, true, HOT_CTX.now)).toBe(false)
  })

  it('es true para un mes abierto en la era de todos los módulos', () => {
    expect(needsSourcesFor(2026, 9, false, HOT_CTX.now)).toBe(true)
  })

  it('es false para un mes abierto anterior a todas las eras', () => {
    // Enero 2026 es anterior a REUNIONES_MODULE_START (2026-07) y a las demás eras.
    expect(needsSourcesFor(2026, 1, false, HOT_CTX.now)).toBe(false)
  })
})

describe('buildEffectiveReport — reporte cerrado', () => {
  it('devuelve el storedData intacto, sin tocar ninguna fuente', () => {
    const stored = baseStored()
    const noisySources = {
      meetingsCount: 999,
      heldClientIds: ['c1'],
      fixedTaskMarks: [{ client_id: 'c1', task_key: 'metricas', period_week: 1, status: 'si' }],
      checks: [{ client_id: 'c1', network: 'Instagram', content_type: 'publicaciones' }],
      piezas: { piezas: 500, editadas: 500 },
      pautasByClient: { c1: 999 },
      cnpSolicitudes: { solicitudes: 999, entregados: 999 },
      tareasSolicitudes: { solicitudes: 999, entregados: 999 },
    }
    const result = buildEffectiveReport(stored, noisySources, {
      ...HOT_CTX,
      closed: true,
    })
    expect(result).toEqual(stored)
  })
})

describe('buildEffectiveReport — gate de Reuniones', () => {
  it('conserva el valor guardado antes de REUNIONES_MODULE_START (2026-07)', () => {
    const stored = baseStored()
    const result = buildEffectiveReport(
      stored,
      { meetingsCount: 999 },
      { ...HOT_CTX, year: 2026, month: 6, now: new Date(2026, 5, 15) },
    )
    expect(result.reuniones.realizadas).toBe(1) // valor original, no 999
  })

  it('pisa con el conteo derivado en o después de REUNIONES_MODULE_START', () => {
    const stored = baseStored()
    const result = buildEffectiveReport(stored, { meetingsCount: 7 }, HOT_CTX)
    expect(result.reuniones.realizadas).toBe(7)
  })
})

describe('buildEffectiveReport — meta de reuniones (metaAutoSync)', () => {
  it('recalcula la meta con computeReunionesMeta en el mes en curso', () => {
    const stored = baseStored()
    const result = buildEffectiveReport(stored, { meetingsCount: 0 }, HOT_CTX)
    // c1 está justificado 'no_aplica' → se descuenta; c2 cuenta → meta = 1
    expect(result.reuniones.meta).toBe(1)
  })

  it('no toca la meta fuera del mes en curso', () => {
    const stored = baseStored()
    const result = buildEffectiveReport(
      stored,
      { meetingsCount: 0 },
      { ...HOT_CTX, month: 8 }, // no es el mes de `now` (septiembre)
    )
    expect(result.reuniones.meta).toBe(2) // valor original
  })
})

describe('buildEffectiveReport — gate de Tareas Fijas', () => {
  it('conserva las tareas guardadas antes de TAREAS_FIJAS_MODULE_START (2026-09)', () => {
    const stored = baseStored()
    const result = buildEffectiveReport(
      stored,
      { fixedTaskMarks: [{ client_id: 'c1', task_key: 'metricas', period_week: 1, status: 'si' }] },
      { ...HOT_CTX, year: 2026, month: 8, now: new Date(2026, 7, 15) },
    )
    expect(result.productividad.tareas).toEqual(stored.productividad.tareas)
  })

  it('deriva las tareas desde fixed_task_marks en o después de la era', () => {
    const stored = baseStored()
    const result = buildEffectiveReport(
      stored,
      { fixedTaskMarks: [{ client_id: 'c1', task_key: 'metricas', period_week: 1, status: 'si' }] },
      HOT_CTX,
    )
    const metricas = result.productividad.tareas.find((t) => t.nombre === 'Métricas')
    expect(metricas).toBeDefined()
  })
})

describe('buildEffectiveReport — gate de Chequeo (Actualización de Plataformas)', () => {
  it('no agrega la fila antes de CHEQUEO_PRODUCTIVIDAD_START', () => {
    const stored = baseStored()
    const result = buildEffectiveReport(
      stored,
      { checks: [] },
      { ...HOT_CTX, year: 2026, month: 8, now: new Date(2026, 7, 15) },
    )
    expect(
      result.productividad.tareas.some((t) => t.nombre === 'Actualización de Plataformas'),
    ).toBe(false)
  })

  it('agrega/reemplaza la fila en o después de la era', () => {
    const stored = baseStored()
    const result = buildEffectiveReport(stored, { checks: [] }, HOT_CTX)
    const fila = result.productividad.tareas.filter(
      (t) => t.nombre === 'Actualización de Plataformas',
    )
    expect(fila).toHaveLength(1)
  })
})

describe('buildEffectiveReport — gate Audiovisual (piezas y pautas)', () => {
  it('conserva piezas/pautas guardadas antes de AUDIOVISUAL_MODULE_START', () => {
    const stored = baseStored()
    const result = buildEffectiveReport(
      stored,
      { piezas: { piezas: 999, editadas: 999 }, pautasByClient: { c1: 999 } },
      { ...HOT_CTX, year: 2026, month: 8, now: new Date(2026, 7, 15) },
    )
    expect(result.piezas).toEqual(stored.piezas)
    expect(result.pautas.items[0].realizadas).toBe(1)
  })

  it('deriva piezas y pautas.realizadas en o después de la era', () => {
    const stored = baseStored()
    const result = buildEffectiveReport(
      stored,
      { piezas: { piezas: 6, editadas: 5, porGrupo: null }, pautasByClient: { c1: 9 } },
      HOT_CTX,
    )
    expect(result.piezas.piezas).toBe(6)
    expect(result.piezas.editadas).toBe(5)
    expect(result.pautas.items[0].realizadas).toBe(9)
  })
})

describe('buildEffectiveReport — gate de Solicitudes', () => {
  it('conserva solicitudes guardadas antes de SOLICITUDES_MODULE_START', () => {
    const stored = baseStored()
    const result = buildEffectiveReport(
      stored,
      { cnpSolicitudes: { solicitudes: 99, entregados: 99 } },
      { ...HOT_CTX, year: 2026, month: 8, now: new Date(2026, 7, 15) },
    )
    expect(result.solicitudes).toEqual(stored.solicitudes)
  })

  it('deriva y desglosa CNP + Tareas en o después de la era', () => {
    const stored = baseStored()
    const result = buildEffectiveReport(
      stored,
      {
        cnpSolicitudes: { solicitudes: 10, entregados: 8 },
        tareasSolicitudes: { solicitudes: 4, entregados: 4 },
      },
      HOT_CTX,
    )
    expect(result.solicitudes.solicitudes).toBe(14)
    expect(result.solicitudes.editadas).toBe(12)
    expect(result.solicitudes.cnp).toEqual({ solicitudes: 10, entregados: 8 })
    expect(result.solicitudes.tareas).toEqual({ solicitudes: 4, entregados: 4 })
  })
})

describe('buildEffectiveReport — frozen / roster', () => {
  it('no corre syncReportClients en un mes pasado (frozen): un cliente nuevo no aparece', () => {
    const stored = baseStored()
    const result = buildEffectiveReport(
      stored,
      {},
      {
        year: 2026,
        month: 6, // mes pasado respecto a `now`
        closed: false,
        activeLineClients: [
          ...CLIENTS,
          { id: 'c3', name: 'Nuevo', fixed_tasks: null, social_links: [] },
        ],
        lineEmployees: EMPLOYEES,
        now: new Date(2026, 8, 15),
      },
    )
    expect(result.crecimiento.items.map((i) => i.clienteId)).not.toContain('c3')
  })

  it('sí corre syncReportClients en el mes en curso: un cliente nuevo aparece', () => {
    const stored = baseStored()
    const result = buildEffectiveReport(
      stored,
      {},
      {
        ...HOT_CTX,
        activeLineClients: [
          ...CLIENTS,
          { id: 'c3', name: 'Nuevo', fixed_tasks: null, social_links: [] },
        ],
      },
    )
    expect(result.crecimiento.items.map((i) => i.clienteId)).toContain('c3')
  })
})

describe('buildEffectiveReport — poda de justificativos', () => {
  it('elimina del mapa los clientes con reunión realizada (heldClientIds)', () => {
    const stored = baseStored()
    stored.reuniones.justificativos = { c1: 'no_aplica', c2: 'no_cumplio' }
    const result = buildEffectiveReport(stored, { heldClientIds: ['c2'] }, HOT_CTX)
    expect(result.reuniones.justificativos).toEqual({ c1: 'no_aplica' })
  })

  it('no poda justificativos en un reporte cerrado', () => {
    const stored = baseStored()
    stored.reuniones.justificativos = { c1: 'no_aplica', c2: 'no_cumplio' }
    const result = buildEffectiveReport(
      stored,
      { heldClientIds: ['c2'] },
      { ...HOT_CTX, closed: true },
    )
    expect(result.reuniones.justificativos).toEqual({ c1: 'no_aplica', c2: 'no_cumplio' })
  })
})

describe('buildEffectiveReport — inmutabilidad', () => {
  it('no muta storedData', () => {
    const stored = baseStored()
    const snapshot = JSON.parse(JSON.stringify(stored))
    buildEffectiveReport(stored, { meetingsCount: 999 }, HOT_CTX)
    expect(stored).toEqual(snapshot)
  })
})
