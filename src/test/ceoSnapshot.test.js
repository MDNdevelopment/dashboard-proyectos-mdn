import { buildCeoSnapshot } from '../../netlify/functions/_lib/ceoSnapshot.js'

const LINES = [
  { id: 'L1', name: 'Línea Uno', color: '#111' },
  { id: 'L2', name: 'Línea Dos', color: '#222' },
]

// L1 agosto: score perfecto (100). L2 agosto: score parcial (30).
const REPORT_L1_AUG = {
  line_id: 'L1',
  year: 2026,
  month: 8,
  data: {
    reuniones: { realizadas: 4, meta: 4 },
    productividad: { tareas: [{ nombre: 'x', meta: 10, realizado: 10 }] },
    crecimiento: { items: [{ clienteId: 'c1', seguidoresGanados: 120, meta: 100 }] },
    solicitudes: { solicitudes: 10, editadas: 10 },
    pautas: { items: [{ realizadas: 2, meta: 2 }] },
    piezas: { piezas: 5, editadas: 5 },
    finanzas: {
      ingresos: [{ monto: 5000 }],
      gastosOperativos: [{ monto: 1000 }],
      sueldos: [{ monto: 1500 }],
      otrosGastos: [],
    },
  },
}

const REPORT_L2_AUG = {
  line_id: 'L2',
  year: 2026,
  month: 8,
  data: {
    reuniones: { realizadas: 2, meta: 4 },
    productividad: { tareas: [{ nombre: 'x', meta: 10, realizado: 5 }] },
    crecimiento: { items: [{ clienteId: 'c2', seguidoresGanados: 50, meta: 100 }] },
    solicitudes: { solicitudes: 10, editadas: 5 },
    pautas: { items: [{ realizadas: 1, meta: 2 }] },
    piezas: { piezas: 10, editadas: 5 },
    finanzas: {
      ingresos: [{ monto: 2000 }],
      gastosOperativos: [{ monto: 500 }],
      sueldos: [{ monto: 800 }],
      otrosGastos: [],
    },
  },
}

const REPORT_L1_JUL = {
  line_id: 'L1',
  year: 2026,
  month: 7,
  data: {
    reuniones: { realizadas: 0, meta: 0 },
    productividad: { tareas: [] },
    crecimiento: { items: [] },
    solicitudes: { solicitudes: 0, editadas: 0 },
    pautas: { items: [] },
    piezas: { piezas: 0, editadas: 0 },
    finanzas: {
      ingresos: [{ monto: 4000 }],
      gastosOperativos: [{ monto: 2000 }],
      sueldos: [],
      otrosGastos: [],
    },
  },
}

const REPORT_L2_JUL = {
  line_id: 'L2',
  year: 2026,
  month: 7,
  data: {
    reuniones: { realizadas: 0, meta: 0 },
    productividad: { tareas: [] },
    crecimiento: { items: [] },
    solicitudes: { solicitudes: 0, editadas: 0 },
    pautas: { items: [] },
    piezas: { piezas: 0, editadas: 0 },
    finanzas: {
      ingresos: [{ monto: 1800 }],
      gastosOperativos: [{ monto: 900 }],
      sueldos: [],
      otrosGastos: [],
    },
  },
}

const TASKS = [
  { status: 'En proceso', due_date: '2099-01-01', closed_date: null },
  { status: 'Pendiente', due_date: '2020-01-01', closed_date: null },
  { status: 'Paralizado', due_date: '2020-01-01', closed_date: null },
  { status: 'Terminado', due_date: '2026-08-10', closed_date: '2026-08-09' },
  { status: 'Terminado', due_date: '2026-08-10', closed_date: '2026-08-12' },
]

const CLIENTS = [{ deleted_at: null }, { deleted_at: null }, { deleted_at: '2026-01-01' }]

const CAMPAIGNS = [
  { amount: 200, start_date: '2026-08-05' },
  { amount: 300, start_date: '2026-08-10' },
  { amount: 999, start_date: '2026-07-01' }, // fuera del mes analizado, no debe sumar
]

const LEADS = [{ status: 'pendiente' }, { status: 'pendiente' }, { status: 'contactado' }]

function baseSnapshot(overrides = {}) {
  return buildCeoSnapshot({
    lines: LINES,
    reports: [REPORT_L1_AUG, REPORT_L2_AUG, REPORT_L1_JUL, REPORT_L2_JUL],
    tasks: TASKS,
    clients: CLIENTS,
    campaigns: CAMPAIGNS,
    leads: LEADS,
    referenceYear: 2026,
    referenceMonth: 8,
    ...overrides,
  })
}

describe('buildCeoSnapshot', () => {
  it('calcula el score promedio del mes analizado', () => {
    const snapshot = baseSnapshot()
    // L1 = 100 (todos los indicadores al 100%), L2 = 30 → promedio 65
    expect(snapshot.score.actual).toBe(65)
    expect(snapshot.score.anterior).not.toBeNull()
  })

  it('arma el ranking de líneas y la línea líder del mes', () => {
    const snapshot = baseSnapshot()
    expect(snapshot.linea_lider).toBe('Línea Uno')
    expect(snapshot.ranking_lineas).toEqual([
      { linea: 'Línea Uno', score: 100 },
      { linea: 'Línea Dos', score: 30 },
    ])
  })

  it('consolida las finanzas de todas las líneas del mes y del mes anterior', () => {
    const snapshot = baseSnapshot()
    // L1: ingresos 5000, egresos 2500 → diferencia 2500. L2: ingresos 2000, egresos 1300 → diferencia 700.
    expect(snapshot.finanzas).toEqual({
      ingresos: 7000,
      egresos: 3800,
      diferencia: 3200,
      diferencia_mes_anterior: 2900,
    })
  })

  it('agrega el estado operativo de las tareas de la empresa', () => {
    const snapshot = baseSnapshot()
    expect(snapshot.tareas).toEqual({
      activas: 3,
      atrasadas: 2,
      bloqueadas: 1,
      porcentaje_a_tiempo: 50,
    })
  })

  it('suma el crecimiento de seguidores y la inversión en Ads solo del mes analizado', () => {
    const snapshot = baseSnapshot()
    expect(snapshot.crecimiento).toEqual({
      seguidores_ganados: 170,
      seguidores_meta: 200,
      inversion_ads: 500,
    })
  })

  it('suma reuniones realizadas y meta de todas las líneas', () => {
    const snapshot = baseSnapshot()
    expect(snapshot.reuniones).toEqual({ realizadas: 6, meta: 8 })
  })

  it('cuenta clientes activos (excluye eliminados) y leads pendientes', () => {
    const snapshot = baseSnapshot()
    expect(snapshot.clientes_activos).toBe(2)
    expect(snapshot.leads_pendientes).toBe(2)
  })

  it('calcula la cobertura de reportes cargados sobre los posibles', () => {
    const snapshot = baseSnapshot()
    // 2 líneas × 2 meses con reporte (jul, ago) cargados = 4; posibles = 2 líneas × mes 8 = 16
    expect(snapshot.cobertura_reportes_pct).toBe(25)
  })

  it('devuelve valores nulos/seguros si no hay líneas ni reportes', () => {
    const snapshot = buildCeoSnapshot({ referenceYear: 2026, referenceMonth: 8 })
    expect(snapshot.score.actual).toBeNull()
    expect(snapshot.linea_lider).toBeNull()
    expect(snapshot.ranking_lineas).toEqual([])
    expect(snapshot.tareas.activas).toBe(0)
    expect(snapshot.clientes_activos).toBe(0)
  })
})
