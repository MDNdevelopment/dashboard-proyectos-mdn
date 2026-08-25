import { describe, it, expect } from 'vitest'
import {
  defaultPeriod,
  resolveLine,
  scoreDeLinea,
  rankingLineas,
  evolucionLinea,
  finanzas,
  compararMeses,
  listarLineas,
  resumenTareas,
  tareasCriticas,
  resumenReuniones,
  misReuniones,
  resumenPautas,
  pautasDelDia,
  executeTool,
  TOOL_DECLARATIONS,
} from './aiChatTools.js'

const LINES = [
  { id: 'l1', name: 'Alfa', color: '#111' },
  { id: 'l2', name: 'Beta', color: '#222' },
]

const USERS = [
  { user_id: 'u1', first_name: 'Ana', last_name: 'Pérez' },
  { user_id: 'u2', first_name: 'Luis', last_name: 'Gómez' },
]

function task(overrides) {
  return {
    id: overrides.id ?? 'default',
    team_id: 'l1',
    description: 'Tarea de prueba',
    status: 'En proceso',
    assignee_ids: [],
    request_date: null,
    due_date: null,
    closed_date: null,
    blocked_reason: null,
    ...overrides,
  }
}

function report(lineId, year, month, data) {
  return { line_id: lineId, year, month, data }
}

const NOW = new Date()
const CUR_YEAR = NOW.getFullYear()
const CUR_MONTH = NOW.getMonth() + 1
const isoInCurrentMonth = (day, hour = 12) =>
  new Date(CUR_YEAR, CUR_MONTH - 1, day, hour).toISOString()
const dateStrInCurrentMonth = (day) =>
  `${CUR_YEAR}-${String(CUR_MONTH).padStart(2, '0')}-${String(day).padStart(2, '0')}`

function meeting(overrides) {
  return {
    id: overrides.id ?? 'default',
    line_id: 'l1',
    status: 'programada',
    starts_at: isoInCurrentMonth(10),
    ...overrides,
  }
}

function pauta(overrides) {
  return {
    id: overrides.id ?? 'default',
    line_id: 'l1',
    status: 'solicitada',
    pauta_date: dateStrInCurrentMonth(10),
    piezas_totales: 0,
    piezas_editadas: 0,
    ...overrides,
  }
}

function fullData({ reunionesReal = 4, reunionesMeta = 4, ingresos = 1000, egresos = 400 } = {}) {
  return {
    reuniones: { realizadas: reunionesReal, meta: reunionesMeta },
    productividad: { tareas: [{ nombre: 'Métricas', realizado: 10, meta: 10 }] },
    crecimiento: { items: [{ clienteId: 'c1', seguidoresGanados: 100, meta: 100 }] },
    solicitudes: { solicitudes: 10, editadas: 10 },
    pautas: { items: [{ realizadas: 5, meta: 5 }] },
    piezas: { piezas: 10, editadas: 10 },
    finanzas: {
      ingresos: [{ monto: ingresos }],
      gastosOperativos: [{ monto: egresos }],
      sueldos: [],
      otrosGastos: [],
    },
  }
}

describe('defaultPeriod', () => {
  it('usa el mes anterior al actual', () => {
    expect(defaultPeriod(new Date(2026, 7, 15))).toEqual({ year: 2026, month: 7 }) // agosto -> julio
  })

  it('cae a diciembre del año anterior en enero', () => {
    expect(defaultPeriod(new Date(2026, 0, 5))).toEqual({ year: 2025, month: 12 })
  })
})

describe('resolveLine', () => {
  it('resuelve por nombre exacto', () => {
    expect(resolveLine('Alfa', LINES)).toEqual({ line: LINES[0] })
  })

  it('ignora mayúsculas y acentos', () => {
    expect(resolveLine('bETA', LINES)).toEqual({ line: LINES[1] })
  })

  it('resuelve por prefijo único', () => {
    expect(resolveLine('Al', LINES)).toEqual({ line: LINES[0] })
  })

  it('devuelve error legible si no existe', () => {
    const { error } = resolveLine('Gamma', LINES)
    expect(error).toMatch(/No se encontró la línea "Gamma"/)
    expect(error).toMatch(/Alfa, Beta/)
  })

  it('devuelve error si el nombre está vacío', () => {
    const { error } = resolveLine('', LINES)
    expect(error).toMatch(/Falta indicar la línea/)
  })

  it('devuelve error de ambigüedad cuando hay varias coincidencias', () => {
    const lines = [...LINES, { id: 'l3', name: 'Alfredo', color: '#333' }]
    const { error } = resolveLine('Alf', lines)
    expect(error).toMatch(/ambiguo/)
    expect(error).toMatch(/Alfa, Alfredo/)
  })
})

describe('scoreDeLinea', () => {
  it('devuelve score total y el desglose de los 6 indicadores', () => {
    const dataset = { lines: LINES, reports: [report('l1', 2026, 6, fullData())] }
    const res = scoreDeLinea({ linea: 'Alfa', anio: 2026, mes: 6 }, dataset)
    expect(res.linea).toBe('Alfa')
    expect(res.score_total).toBe(100)
    expect(res.desglose_indicadores).toHaveLength(6)
    const pautas = res.desglose_indicadores.find((i) => i.indicador === 'pautas')
    expect(pautas).toEqual({ indicador: 'pautas', obtenido: 20, maximo: 20 })
  })

  it('los parciales suman el total (mes con datos parciales)', () => {
    const dataset = {
      lines: LINES,
      reports: [report('l1', 2026, 6, fullData({ reunionesReal: 2, reunionesMeta: 4 }))],
    }
    const res = scoreDeLinea({ linea: 'Alfa', anio: 2026, mes: 6 }, dataset)
    const suma = res.desglose_indicadores.reduce((a, i) => a + i.obtenido, 0)
    expect(res.score_total).toBeCloseTo(suma, 5)
    expect(res.score_total).toBe(90)
  })

  it('usa el último mes cerrado si no se especifica mes/año', () => {
    const today = new Date()
    const { year, month } = defaultPeriod(today)
    const dataset = { lines: LINES, reports: [report('l1', year, month, fullData())] }
    const res = scoreDeLinea({ linea: 'Alfa' }, dataset)
    expect(res.score_total).toBe(100)
  })

  it('excluye meses marcados como incompletos', () => {
    const dataset = {
      lines: LINES,
      reports: [report('l1', 2026, 6, { ...fullData(), incompleto: true })],
    }
    const res = scoreDeLinea({ linea: 'Alfa', anio: 2026, mes: 6 }, dataset)
    expect(res.error).toMatch(/No hay reporte cerrado/)
  })

  it('propaga el error de línea no resuelta', () => {
    const dataset = { lines: LINES, reports: [] }
    const res = scoreDeLinea({ linea: 'Gamma', anio: 2026, mes: 6 }, dataset)
    expect(res.error).toMatch(/No se encontró la línea/)
  })

  it('rechaza años fuera del rango cargado por aiChatData.js', () => {
    const dataset = { lines: LINES, reports: [], availableYears: { min: 2025, max: 2026 } }
    const res = scoreDeLinea({ linea: 'Alfa', anio: 2020, mes: 6 }, dataset)
    expect(res.error).toMatch(/Solo tengo datos cargados de 2025 y 2026/)
  })

  it('marca es_mes_en_curso cuando corresponde al mes actual', () => {
    const now = new Date()
    const dataset = {
      lines: LINES,
      reports: [report('l1', now.getFullYear(), now.getMonth() + 1, fullData())],
    }
    const res = scoreDeLinea(
      { linea: 'Alfa', anio: now.getFullYear(), mes: now.getMonth() + 1 },
      dataset,
    )
    expect(res.es_mes_en_curso).toBe(true)
  })
})

describe('rankingLineas', () => {
  it('ordena las líneas de mejor a peor score', () => {
    const dataset = {
      lines: LINES,
      reports: [
        report('l1', 2026, 6, fullData()),
        report('l2', 2026, 6, fullData({ reunionesReal: 0 })),
      ],
    }
    const res = rankingLineas({ anio: 2026, mes: 6 }, dataset)
    expect(res.ranking[0].linea).toBe('Alfa')
    expect(res.ranking[1].linea).toBe('Beta')
    expect(res.lider).toBe('Alfa')
  })

  it('rechaza años fuera del rango cargado por aiChatData.js', () => {
    const dataset = { lines: LINES, reports: [], availableYears: { min: 2025, max: 2026 } }
    expect(rankingLineas({ anio: 2020, mes: 6 }, dataset).error).toMatch(
      /Solo tengo datos cargados/,
    )
  })
})

describe('evolucionLinea', () => {
  it('devuelve 12 meses, con null en los que no hay reporte', () => {
    const dataset = { lines: LINES, reports: [report('l1', 2026, 3, fullData())] }
    const res = evolucionLinea({ linea: 'Alfa', anio: 2026 }, dataset)
    expect(res.meses).toHaveLength(12)
    expect(res.meses[2].score).toBe(100) // marzo, index 2
    expect(res.meses[0].score).toBeNull()
  })

  it('propaga error de línea no resuelta', () => {
    const dataset = { lines: LINES, reports: [] }
    expect(evolucionLinea({ linea: 'Zzz', anio: 2026 }, dataset).error).toBeDefined()
  })

  it('rechaza años fuera del rango cargado por aiChatData.js', () => {
    const dataset = { lines: LINES, reports: [], availableYears: { min: 2025, max: 2026 } }
    expect(evolucionLinea({ linea: 'Alfa', anio: 2020 }, dataset).error).toMatch(
      /Solo tengo datos cargados/,
    )
  })
})

describe('finanzas', () => {
  it('devuelve finanzas de una línea específica', () => {
    const dataset = {
      lines: LINES,
      reports: [report('l1', 2026, 6, fullData({ ingresos: 500, egresos: 200 }))],
    }
    const res = finanzas({ anio: 2026, mes: 6, linea: 'Alfa' }, dataset)
    expect(res.ingresos).toBe(500)
    expect(res.egresos).toBe(200)
    expect(res.diferencia).toBe(300)
  })

  it('devuelve el total de la empresa por línea cuando no se especifica linea', () => {
    const dataset = {
      lines: LINES,
      reports: [
        report('l1', 2026, 6, fullData({ ingresos: 500, egresos: 200 })),
        report('l2', 2026, 6, fullData({ ingresos: 300, egresos: 100 })),
      ],
    }
    const res = finanzas({ anio: 2026, mes: 6 }, dataset)
    expect(res.por_linea).toHaveLength(2)
    expect(res.total_empresa).toEqual({ ingresos: 800, egresos: 300, diferencia: 500 })
  })

  it('devuelve error (no ceros) si no hay reporte para el mes de una línea', () => {
    const dataset = { lines: LINES, reports: [] }
    const res = finanzas({ anio: 2026, mes: 6, linea: 'Alfa' }, dataset)
    expect(res.error).toMatch(/No hay reporte cargado/)
    expect(res.ingresos).toBeUndefined()
  })

  it('marca sin_reporte en vez de ceros para líneas sin reporte del mes (total de empresa)', () => {
    const dataset = {
      lines: LINES,
      reports: [report('l1', 2026, 6, fullData({ ingresos: 500, egresos: 200 }))],
    }
    const res = finanzas({ anio: 2026, mes: 6 }, dataset)
    expect(res.por_linea).toContainEqual({ linea: 'Beta', sin_reporte: true })
    expect(res.total_empresa).toEqual({ ingresos: 500, egresos: 200, diferencia: 300 })
    expect(res.nota).toMatch(/no incluye/)
  })

  it('rechaza años fuera del rango cargado por aiChatData.js', () => {
    const dataset = { lines: LINES, reports: [], availableYears: { min: 2025, max: 2026 } }
    const res = finanzas({ anio: 2023, mes: 6, linea: 'Alfa' }, dataset)
    expect(res.error).toMatch(/Solo tengo datos cargados de 2025 y 2026/)
  })
})

describe('compararMeses', () => {
  it('compara el score de una línea entre dos meses, sin cifras financieras', () => {
    const dataset = {
      lines: LINES,
      reports: [
        report('l1', 2026, 5, fullData({ reunionesReal: 2, reunionesMeta: 4 })),
        report('l1', 2026, 6, fullData()),
      ],
    }
    const res = compararMeses({ mes_a: 5, mes_b: 6, anio: 2026, linea: 'Alfa' }, dataset)
    expect(res.linea).toBe('Alfa')
    expect(res.delta_score).toBeGreaterThan(0)
    expect(res.delta_diferencia).toBeUndefined()
    expect(res.junio.diferencia).toBeUndefined()
  })

  it('compara toda la empresa cuando no se indica línea', () => {
    const dataset = {
      lines: LINES,
      reports: [report('l1', 2026, 5, fullData()), report('l1', 2026, 6, fullData())],
    }
    const res = compararMeses({ mes_a: 5, mes_b: 6, anio: 2026 }, dataset)
    expect(res.linea).toBe('Toda la empresa')
  })

  it('propaga error de línea no resuelta', () => {
    const dataset = { lines: LINES, reports: [] }
    expect(
      compararMeses({ mes_a: 5, mes_b: 6, anio: 2026, linea: 'Zzz' }, dataset).error,
    ).toBeDefined()
  })

  it('rechaza años fuera del rango cargado por aiChatData.js', () => {
    const dataset = { lines: LINES, reports: [], availableYears: { min: 2025, max: 2026 } }
    expect(compararMeses({ mes_a: 5, mes_b: 6, anio: 2020 }, dataset).error).toMatch(
      /Solo tengo datos cargados/,
    )
  })
})

describe('listarLineas', () => {
  it('devuelve los nombres de las líneas', () => {
    expect(listarLineas({}, { lines: LINES })).toEqual({ lineas: ['Alfa', 'Beta'] })
  })
})

describe('resumenTareas', () => {
  it('cuenta tareas activas, atrasadas, bloqueadas y por estado', () => {
    const dataset = {
      lines: LINES,
      tasks: [
        task({ id: '1', status: 'En proceso' }),
        task({ id: '2', status: 'Paralizado', blocked_reason: 'Falta brief' }),
        task({ id: '3', status: 'Pendiente', due_date: '2020-01-01' }), // vencida hace años
        task({ id: '4', status: 'Terminado' }), // cerrada, no cuenta como activa
      ],
    }
    const res = resumenTareas({}, dataset)
    expect(res.linea).toBe('Toda la empresa')
    expect(res.tareas_activas).toBe(3)
    expect(res.bloqueadas).toBe(1)
    expect(res.atrasadas).toBe(1)
    expect(res.por_estado).toEqual({ 'En proceso': 1, Paralizado: 1, Pendiente: 1 })
  })

  it('filtra por línea cuando se especifica', () => {
    const dataset = {
      lines: LINES,
      tasks: [task({ id: '1', team_id: 'l1' }), task({ id: '2', team_id: 'l2' })],
    }
    const res = resumenTareas({ linea: 'Beta' }, dataset)
    expect(res.linea).toBe('Beta')
    expect(res.tareas_activas).toBe(1)
  })

  it('propaga error de línea no resuelta', () => {
    const dataset = { lines: LINES, tasks: [] }
    expect(resumenTareas({ linea: 'Zzz' }, dataset).error).toBeDefined()
  })

  it('calcula porcentaje a tiempo sobre tareas cerradas con ambas fechas', () => {
    const dataset = {
      lines: LINES,
      tasks: [
        task({ id: '1', status: 'Terminado', due_date: '2026-06-10', closed_date: '2026-06-09' }), // a tiempo
        task({ id: '2', status: 'Terminado', due_date: '2026-06-10', closed_date: '2026-06-15' }), // tarde
      ],
    }
    const res = resumenTareas({}, dataset)
    expect(res.porcentaje_entregado_a_tiempo).toBe(50)
  })
})

describe('tareasCriticas', () => {
  it('lista tareas bloqueadas con motivo, línea y responsables', () => {
    const dataset = {
      lines: LINES,
      users: USERS,
      tasks: [
        task({
          id: '1',
          status: 'Paralizado',
          blocked_reason: 'Esperando aprobación del cliente',
          assignee_ids: ['u1', 'u2'],
        }),
      ],
    }
    const res = tareasCriticas({ tipo: 'bloqueadas' }, dataset)
    expect(res.total).toBe(1)
    expect(res.tareas[0]).toEqual({
      tarea: 'Tarea de prueba',
      linea: 'Alfa',
      responsables: ['Ana Pérez', 'Luis Gómez'],
      motivo: 'Esperando aprobación del cliente',
    })
  })

  it('lista tareas atrasadas con días de atraso', () => {
    const dataset = {
      lines: LINES,
      users: USERS,
      tasks: [task({ id: '1', status: 'Pendiente', due_date: '2020-01-01' })],
    }
    const res = tareasCriticas({ tipo: 'atrasadas' }, dataset)
    expect(res.tareas[0].dias_de_atraso).toBeGreaterThan(0)
  })

  it('excluye tareas cerradas', () => {
    const dataset = {
      lines: LINES,
      users: USERS,
      tasks: [task({ id: '1', status: 'Terminado', due_date: '2020-01-01' })],
    }
    expect(tareasCriticas({ tipo: 'atrasadas' }, dataset).total).toBe(0)
  })

  it('default a bloqueadas si tipo no es válido', () => {
    const dataset = { lines: LINES, users: USERS, tasks: [task({ id: '1', status: 'Paralizado' })] }
    expect(tareasCriticas({ tipo: 'raro' }, dataset).tipo).toBe('bloqueadas')
  })
})

describe('resumenReuniones', () => {
  it('cuenta programadas, realizadas y canceladas del mes actual por defecto', () => {
    const dataset = {
      lines: LINES,
      meetings: [
        meeting({ id: '1', status: 'programada', starts_at: isoInCurrentMonth(20, 23) }), // futura
        meeting({ id: '2', status: 'realizada' }),
        meeting({ id: '3', status: 'cancelada' }),
        meeting({ id: '4', line_id: 'l2', status: 'realizada' }), // otra línea
      ],
    }
    const res = resumenReuniones({}, dataset)
    expect(res.linea).toBe('Toda la empresa')
    expect(res.total).toBe(4)
    expect(res.programadas).toBe(1)
    expect(res.realizadas).toBe(2)
    expect(res.canceladas).toBe(1)
  })

  it('marca como vencidas_sin_marcar las programadas cuya fecha ya pasó', () => {
    const dataset = {
      lines: LINES,
      meetings: [
        meeting({ id: '1', status: 'programada', starts_at: new Date(2000, 0, 1).toISOString() }),
      ],
    }
    const res = resumenReuniones({ mes: 1, anio: 2000 }, dataset)
    expect(res.vencidas_sin_marcar).toBe(1)
  })

  it('filtra por línea cuando se especifica', () => {
    const dataset = {
      lines: LINES,
      meetings: [meeting({ id: '1', line_id: 'l1' }), meeting({ id: '2', line_id: 'l2' })],
    }
    const res = resumenReuniones({ linea: 'Beta' }, dataset)
    expect(res.linea).toBe('Beta')
    expect(res.total).toBe(1)
  })

  it('propaga error de línea no resuelta', () => {
    expect(resumenReuniones({ linea: 'Zzz' }, { lines: LINES, meetings: [] }).error).toBeDefined()
  })

  it('excluye reuniones de otros meses', () => {
    const dataset = {
      lines: LINES,
      meetings: [meeting({ id: '1', starts_at: new Date(2000, 0, 1).toISOString() })],
    }
    expect(resumenReuniones({}, dataset).total).toBe(0)
  })
})

describe('misReuniones', () => {
  const inDays = (n) => new Date(Date.now() + n * 24 * 60 * 60 * 1000).toISOString()

  it('devuelve error si el dataset no trae callerUserId', () => {
    expect(misReuniones({}, { lines: LINES, meetings: [] }).error).toBeDefined()
  })

  it('solo incluye reuniones donde el caller es participante', () => {
    const dataset = {
      lines: LINES,
      callerUserId: 'u1',
      meetings: [
        meeting({ id: '1', attendee_ids: ['u1'], starts_at: inDays(1) }),
        meeting({ id: '2', attendee_ids: ['u2'], starts_at: inDays(1) }),
      ],
    }
    const res = misReuniones({}, dataset)
    expect(res.total).toBe(1)
    expect(res.reuniones[0].fecha).toBeDefined()
  })

  it('excluye reuniones pasadas o canceladas, y ordena por fecha ascendente', () => {
    const dataset = {
      lines: LINES,
      callerUserId: 'u1',
      meetings: [
        meeting({ id: 'pasada', attendee_ids: ['u1'], starts_at: inDays(-1) }),
        meeting({
          id: 'cancelada',
          attendee_ids: ['u1'],
          status: 'cancelada',
          starts_at: inDays(2),
        }),
        meeting({ id: 'lejos', attendee_ids: ['u1'], title: 'Lejos', starts_at: inDays(5) }),
        meeting({ id: 'cerca', attendee_ids: ['u1'], title: 'Cerca', starts_at: inDays(2) }),
      ],
    }
    const res = misReuniones({}, dataset)
    expect(res.total).toBe(2)
    expect(res.reuniones.map((r) => r.titulo)).toEqual(['Cerca', 'Lejos'])
  })

  it('respeta el límite pedido', () => {
    const dataset = {
      lines: LINES,
      callerUserId: 'u1',
      meetings: [1, 2, 3].map((n) =>
        meeting({ id: String(n), attendee_ids: ['u1'], starts_at: inDays(n) }),
      ),
    }
    expect(misReuniones({ limite: 2 }, dataset).reuniones).toHaveLength(2)
  })
})

describe('resumenPautas', () => {
  it('desglosa por estado y suma piezas de las realizadas del mes actual', () => {
    const dataset = {
      lines: LINES,
      pautas: [
        pauta({ id: '1', status: 'solicitada' }),
        pauta({ id: '2', status: 'programada' }),
        pauta({ id: '3', status: 'realizada', piezas_totales: 5, piezas_editadas: 3 }),
        pauta({ id: '4', status: 'realizada', piezas_totales: 2, piezas_editadas: 2 }),
      ],
    }
    const res = resumenPautas({}, dataset)
    expect(res.por_estado).toEqual({ solicitada: 1, programada: 1, realizada: 2 })
    expect(res.piezas_totales).toBe(7)
    expect(res.piezas_editadas).toBe(5)
  })

  it('cuenta solicitudes sin agendar (sin pauta_date)', () => {
    const dataset = {
      lines: LINES,
      pautas: [pauta({ id: '1', status: 'solicitada', pauta_date: null })],
    }
    const res = resumenPautas({}, dataset)
    expect(res.solicitudes_sin_agendar).toBe(1)
    // Sin fecha, no cuenta en el desglose por estado del mes.
    expect(res.por_estado).toEqual({})
  })

  it('filtra por línea cuando se especifica', () => {
    const dataset = {
      lines: LINES,
      pautas: [pauta({ id: '1', line_id: 'l1' }), pauta({ id: '2', line_id: 'l2' })],
    }
    const res = resumenPautas({ linea: 'Beta' }, dataset)
    expect(res.linea).toBe('Beta')
    expect(res.por_estado.solicitada).toBe(1)
  })

  it('propaga error de línea no resuelta', () => {
    expect(resumenPautas({ linea: 'Zzz' }, { lines: LINES, pautas: [] }).error).toBeDefined()
  })
})

describe('pautasDelDia', () => {
  const hoy = dateStrInCurrentMonth(10)
  const otroDia = dateStrInCurrentMonth(11)

  it('lista las pautas programadas/realizadas de la fecha dada, ordenadas por hora', () => {
    const dataset = {
      lines: LINES,
      pautas: [
        pauta({
          id: '1',
          status: 'programada',
          pauta_date: hoy,
          salida: '14:00',
          llegada: '15:00',
          client_name: 'Cliente B',
        }),
        pauta({
          id: '2',
          status: 'realizada',
          pauta_date: hoy,
          salida: '09:00',
          llegada: '10:00',
          client_name: 'Cliente A',
        }),
        pauta({ id: '3', status: 'solicitada', pauta_date: hoy, client_name: 'Cliente C' }), // sin agendar, no cuenta
        pauta({ id: '4', status: 'programada', pauta_date: otroDia, client_name: 'Cliente D' }), // otro día
      ],
    }
    const res = pautasDelDia({ fecha: hoy }, dataset)
    expect(res.fecha).toBe(hoy)
    expect(res.total).toBe(2)
    expect(res.pautas.map((p) => p.cliente)).toEqual(['Cliente A', 'Cliente B'])
    expect(res.pautas[0]).toEqual({
      cliente: 'Cliente A',
      linea: 'Alfa',
      hora: '09:00 - 10:00',
      estado: 'realizada',
    })
  })

  it('usa el día de hoy cuando no se especifica fecha', () => {
    const now = new Date()
    const todayKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
    const dataset = {
      lines: LINES,
      pautas: [
        pauta({ id: '1', status: 'programada', pauta_date: todayKey, client_name: 'Cliente A' }),
      ],
    }
    const res = pautasDelDia({}, dataset)
    expect(res.fecha).toBe(todayKey)
    expect(res.total).toBe(1)
  })

  it('filtra por línea cuando se especifica', () => {
    const dataset = {
      lines: LINES,
      pautas: [
        pauta({ id: '1', status: 'programada', pauta_date: hoy, line_id: 'l1' }),
        pauta({ id: '2', status: 'programada', pauta_date: hoy, line_id: 'l2' }),
      ],
    }
    const res = pautasDelDia({ fecha: hoy, linea: 'Beta' }, dataset)
    expect(res.linea).toBe('Beta')
    expect(res.total).toBe(1)
  })

  it('propaga error de línea no resuelta', () => {
    expect(pautasDelDia({ linea: 'Zzz' }, { lines: LINES, pautas: [] }).error).toBeDefined()
  })

  it('devuelve hora null si la pauta no tiene salida', () => {
    const dataset = {
      lines: LINES,
      pautas: [pauta({ id: '1', status: 'programada', pauta_date: hoy })],
    }
    const res = pautasDelDia({ fecha: hoy }, dataset)
    expect(res.pautas[0].hora).toBeNull()
  })
})

describe('executeTool', () => {
  it('ejecuta una tool conocida', () => {
    const res = executeTool('listar_lineas', {}, { lines: LINES, reports: [] })
    expect(res.lineas).toEqual(['Alfa', 'Beta'])
  })

  it('devuelve error para una tool desconocida, sin lanzar', () => {
    const res = executeTool('no_existe', {}, { lines: LINES, reports: [] })
    expect(res.error).toMatch(/Herramienta desconocida/)
  })

  it('atrapa excepciones del ejecutor y las convierte en {error}', () => {
    const res = executeTool('score_de_linea', { linea: 'Alfa' }, { lines: LINES, reports: null })
    expect(res.error).toBeDefined()
  })
})

describe('TOOL_DECLARATIONS', () => {
  it('declara las 12 herramientas con nombre y parámetros', () => {
    expect(TOOL_DECLARATIONS).toHaveLength(12)
    TOOL_DECLARATIONS.forEach((t) => {
      expect(t.name).toBeTruthy()
      expect(t.description).toBeTruthy()
      expect(t.parameters.type).toBe('object')
    })
  })

  it('expone "finanzas" como tool, acotada a ingresos/egresos/diferencia', () => {
    expect(TOOL_DECLARATIONS.find((t) => t.name === 'finanzas')).toBeDefined()
    const dataset = {
      lines: LINES,
      reports: [report('l1', 2026, 6, fullData({ ingresos: 500, egresos: 200 }))],
    }
    const res = executeTool('finanzas', { anio: 2026, mes: 6, linea: 'Alfa' }, dataset)
    expect(res).toEqual({
      periodo: 'junio 2026',
      linea: 'Alfa',
      ingresos: 500,
      egresos: 200,
      diferencia: 300,
    })
  })
})
