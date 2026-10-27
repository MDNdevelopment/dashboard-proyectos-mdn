import { describe, it, expect } from 'vitest'
import {
  calcTareas,
  calcCnp,
  calcGrilla,
  calcArtes,
  calcPautas,
  calcPiezasGrabadas,
  calcFotos,
  calcVideos,
  calcEdicionCnp,
  calcPlataformas,
  calcEdicion,
  calcArrastre,
  computeEmployeeScore,
  computeAllEmployeeScores,
  INDICATORS,
} from '../utils/employeeScore'
import { resolveProfile, INDICATOR_KEYS } from '../utils/employeeScoreProfiles'

// Octubre 2026 evaluado "desde" mediados de noviembre: todo octubre ya pasó.
const USER = 'user-1'
const YEAR = 2026
const MONTH = 10
const MONTH_IDX = YEAR * 12 + (MONTH - 1)
const HOY = new Date(2026, 10, 15)
const DISP = { factor: 1, rangosExcluidos: [], motivo: null }

const base = (extra = {}) => ({
  userId: USER,
  year: YEAR,
  month: MONTH,
  monthIdx: MONTH_IDX,
  today: HOY,
  disponibilidad: DISP,
  tasks: [],
  cnp: [],
  marks: [],
  clients: [],
  piezas: [],
  pautas: [],
  ...extra,
})

const task = (o = {}) => ({
  assignee_ids: [USER],
  request_date: '2026-10-01',
  due_date: '2026-10-10',
  closed_date: null,
  status: 'En proceso',
  ...o,
})

const pauta = (o = {}) => ({
  recurso_ids: [USER],
  pauta_date: '2026-10-10',
  status: 'realizada',
  formats: ['V'],
  grabacion_por_formato: {},
  deleted_at: null,
  ...o,
})

describe('calcTareas (vencen en el mes, cerradas a tiempo)', () => {
  it('cuenta cerradas a tiempo sobre las que vencen en el mes', () => {
    const tasks = [
      task({ status: 'Terminado', closed_date: '2026-10-09' }),
      task({ status: 'Terminado', closed_date: '2026-10-10' }),
      task({ status: 'Terminado', closed_date: '2026-10-12' }), // tarde
      task({ status: 'En proceso' }), // vencida sin cerrar
    ]
    const r = calcTareas(base({ tasks }))
    expect(r.aplica).toBe(true)
    expect(r.unidades).toBe(4)
    expect(r.pct).toBe(0.5)
    expect(r.detalle).toEqual({ total: 4, cumplidas: 2 })
  })

  it('una tarea pedida en agosto que vence en noviembre no cuenta en octubre', () => {
    const larga = task({ request_date: '2026-08-05', due_date: '2026-11-20' })
    expect(calcTareas(base({ tasks: [larga, larga, larga] })).aplica).toBe(false)
    const nov = { monthIdx: YEAR * 12 + 10, month: 11, today: new Date(2026, 11, 1) }
    const cerrada = task({
      request_date: '2026-08-05',
      due_date: '2026-11-20',
      status: 'Terminado',
      closed_date: '2026-11-18',
    })
    const tarde = { ...cerrada, closed_date: '2026-11-25' }
    const r = calcTareas(base({ ...nov, tasks: [cerrada, tarde] }))
    expect(r.unidades).toBe(2)
    expect(r.pct).toBe(0.5)
  })

  it('una tarea abierta que aún no vence es trabajo pendiente, no incumplimiento', () => {
    const tasks = [
      task({ due_date: '2026-10-30', status: 'En proceso' }),
      task({ due_date: '2026-10-31', status: 'En proceso' }),
    ]
    const r = calcTareas(base({ tasks, today: new Date(2026, 9, 20) }))
    expect(r.unidades).toBe(0)
    expect(r.aplica).toBe(false)
  })

  it('excluye tareas que vencen durante vacaciones confirmadas', () => {
    const tasks = [
      task({ due_date: '2026-10-10' }), // vence en vacaciones y sin cerrar: no penaliza
      task({ due_date: '2026-10-11', status: 'Terminado', closed_date: '2026-10-11' }),
      task({ due_date: '2026-10-12', status: 'Terminado', closed_date: '2026-10-12' }),
    ]
    const disponibilidad = { factor: 0.9, rangosExcluidos: [['2026-10-10', '2026-10-10']] }
    const r = calcTareas(base({ tasks, disponibilidad }))
    expect(r.unidades).toBe(2)
    expect(r.pct).toBe(1)
  })

  it('no aplica con menos de 2 tareas', () => {
    expect(calcTareas(base({ tasks: [task()] })).aplica).toBe(false)
  })
})

describe('calcCnp', () => {
  it('aplica con una sola solicitud que vence en el mes', () => {
    const cnp = [
      {
        assignee_id: USER,
        deleted_at: null,
        due_date: '2026-10-12',
        status: 'Terminado',
        closed_date: '2026-10-11',
      },
    ]
    const r = calcCnp(base({ cnp }))
    expect(r.aplica).toBe(true)
    expect(r.pct).toBe(1)
  })
})

describe('arrastre sin penalizar tareas largas en plazo', () => {
  it('una tarea abierta de meses anteriores cuyo due_date es posterior no es arrastre', () => {
    const tasks = [
      task({ request_date: '2026-08-01', due_date: '2026-12-31' }),
      task({ request_date: '2026-09-01', due_date: '2026-12-15' }),
      task({ request_date: '2026-10-01', due_date: '2026-12-15' }),
    ]
    const r = calcArrastre(base({ tasks, today: new Date(2026, 9, 20) }))
    expect(r.detalle.problematicas).toBe(0)
    expect(r.pct).toBe(1)
  })
})

describe('tareas fijas por clave (grilla, artes)', () => {
  const clients = [{ id: 'c1', social_manager_id: USER, designer_id: 'otro', fixed_tasks: null }]

  it('grilla: 0% cuando nunca marcó; aplica por meta derivada', () => {
    const r = calcGrilla(base({ clients }))
    expect(r.aplica).toBe(true)
    expect(r.pct).toBe(0)
    expect(r.detalle.meta).toBeGreaterThanOrEqual(2)
  })

  it('artes no aplica a quien es solo social manager', () => {
    expect(calcArtes(base({ clients })).aplica).toBe(false)
  })
})

describe('calcPautas', () => {
  it('realizadas sobre realizadas + programadas vencidas; ignora declinadas y solicitadas', () => {
    const pautas = [
      pauta(),
      pauta({ pauta_date: '2026-10-12', status: 'programada' }),
      pauta({ status: 'declinada' }),
      pauta({ status: 'solicitada' }),
      pauta({ deleted_at: '2026-10-01', status: 'programada' }),
    ]
    const r = calcPautas(base({ pautas }))
    expect(r.unidades).toBe(2)
    expect(r.pct).toBe(0.5)
  })

  it('una programada futura no cuenta todavía', () => {
    const r = calcPautas(
      base({
        pautas: [pauta({ pauta_date: '2026-10-30', status: 'programada' })],
        today: new Date(2026, 9, 20),
      }),
    )
    expect(r.aplica).toBe(false)
  })

  it('no cuenta pautas donde no es recurso', () => {
    expect(calcPautas(base({ pautas: [pauta({ recurso_ids: ['otro'] })] })).aplica).toBe(false)
  })
})

describe('grabadas vs editadas (piezas_grabadas / fotos / videos)', () => {
  const conPiezas = (o = {}) =>
    pauta({
      formats: ['V', 'F'],
      grabacion_por_formato: { V: { [USER]: 4 }, F: { [USER]: 10 } },
      piezas_por_formato: { V: { salieron: 4, editadas: 2 }, F: { salieron: 10, editadas: 10 } },
      ...o,
    })

  it('piezas_grabadas cuenta todos los formatos y fotos/videos cada grupo', () => {
    const pautas = [conPiezas()]
    const todo = calcPiezasGrabadas(base({ pautas }))
    expect(todo.unidades).toBe(14)
    expect(todo.pct).toBeCloseTo(12 / 14)
    expect(todo.detalle).toEqual({ grabadas: 14, editadas: 12, pautas: 1 })
    expect(calcFotos(base({ pautas })).pct).toBe(1)
    expect(calcVideos(base({ pautas })).pct).toBe(0.5)
  })

  it('reparte las editadas en proporción a lo que grabó cada persona', () => {
    // 4 salieron, 2 editadas: quien grabó 3 recibe 1,5 editadas; el otro recurso, 0,5.
    const pautas = [
      conPiezas({
        formats: ['V'],
        grabacion_por_formato: { V: { [USER]: 3, otro: 1 } },
        piezas_por_formato: { V: { salieron: 4, editadas: 2 } },
      }),
    ]
    const r = calcVideos(base({ pautas }))
    expect(r.unidades).toBe(3)
    expect(r.pct).toBeCloseTo(0.5)
  })

  it('sin "salieron" cargado o sin reparto por persona no hay dato (no 0%)', () => {
    const sinSalieron = conPiezas({ piezas_por_formato: { V: { salieron: 0, editadas: 0 } } })
    expect(calcVideos(base({ pautas: [sinSalieron] })).aplica).toBe(false)
    const sinReparto = conPiezas({ grabacion_por_formato: {} })
    expect(calcPiezasGrabadas(base({ pautas: [sinReparto] })).aplica).toBe(false)
  })

  it('no cuenta pautas de otro mes, no realizadas ni donde no es recurso', () => {
    const pautas = [
      conPiezas({ recurso_ids: ['otro'] }),
      conPiezas({ status: 'programada' }),
      conPiezas({ pauta_date: '2026-09-10' }),
    ]
    expect(calcPiezasGrabadas(base({ pautas })).aplica).toBe(false)
  })

  it('topa lo editado en lo grabado aunque "editadas" supere a "salieron"', () => {
    const pautas = [
      conPiezas({
        piezas_por_formato: { V: { salieron: 4, editadas: 9 }, F: { salieron: 10, editadas: 10 } },
      }),
    ]
    expect(calcVideos(base({ pautas })).pct).toBe(1)
  })
})

describe('calcEdicionCnp', () => {
  const cnpAv = (o = {}) => ({
    assignee_id: USER,
    deleted_at: null,
    is_audiovisual: true,
    created_at: '2026-10-05T10:00:00Z',
    due_date: '2026-10-20',
    status: 'En proceso',
    pieces: [{ done: true }, { done: false }],
    ...o,
  })

  it('piezas entregadas sobre solicitadas, solo de CNP audiovisual', () => {
    const r = calcEdicionCnp(base({ cnp: [cnpAv(), cnpAv({ is_audiovisual: false })] }))
    expect(r.aplica).toBe(true)
    expect(r.unidades).toBe(2)
    expect(r.pct).toBe(0.5)
    expect(r.detalle).toEqual({ solicitadas: 2, entregadas: 1 })
  })

  it('no aplica sin CNP audiovisual del mes', () => {
    expect(calcEdicionCnp(base({ cnp: [cnpAv({ assignee_id: 'otro' })] })).aplica).toBe(false)
    expect(
      calcEdicionCnp(base({ cnp: [cnpAv({ created_at: '2026-09-05T10:00:00Z' })] })).aplica,
    ).toBe(false)
  })
})

describe('calcPlataformas (cobertura del Chequeo)', () => {
  const clients = [
    { id: 'c1', social_manager_id: USER, social_links: [{ red: 'Instagram' }], fixed_tasks: null },
  ]
  const check = (week, o = {}) => ({
    client_id: 'c1',
    network: 'Instagram',
    content_type: 'publicaciones',
    period_year: 2026,
    period_month: 10,
    period_week: week,
    last_published_at: '2026-10-08',
    ...o,
  })

  it('realizado / meta: Instagram tiene 3 tipos de contenido × 4 registros', () => {
    const r = calcPlataformas(base({ clients, checks: [check(1), check(2)] }))
    expect(r.aplica).toBe(true)
    expect(r.unidades).toBe(12)
    expect(r.pct).toBeCloseTo(2 / 12)
    expect(r.detalle).toEqual({ realizado: 2, meta: 12 })
  })

  it('una casilla nunca registrada cuenta en la meta pero no en lo realizado', () => {
    const r = calcPlataformas(base({ clients, checks: [] }))
    expect(r.aplica).toBe(true)
    expect(r.pct).toBe(0)
  })

  it('ignora cuentas de otro social manager, el opt-out y las fechas vacías', () => {
    expect(
      calcPlataformas(base({ clients: [{ ...clients[0], social_manager_id: 'otro' }] })).aplica,
    ).toBe(false)
    expect(
      calcPlataformas(base({ clients: [{ ...clients[0], fixed_tasks: { plataformas: false } }] }))
        .aplica,
    ).toBe(false)
    const r = calcPlataformas(base({ clients, checks: [check(1, { last_published_at: null })] }))
    expect(r.pct).toBe(0)
  })

  it('no aplica antes de septiembre 2026 (cuando el reporte adoptó este modelo)', () => {
    const ago = { year: 2026, month: 8, monthIdx: 2026 * 12 + 7 }
    expect(calcPlataformas(base({ ...ago, clients })).aplica).toBe(false)
  })
})

describe('calcEdicion', () => {
  const pieza = (o = {}) => ({
    editor_user_id: USER,
    status: 'listo',
    created_at: '2026-10-05T10:00:00Z',
    es_lote: false,
    ...o,
  })

  it('piezas listas / asignadas como editor, aplica desde 1 unidad', () => {
    const r = calcEdicion(base({ piezas: [pieza()] }))
    expect(r.key).toBe('edicion')
    expect(r.aplica).toBe(true)
    expect(r.pct).toBe(1)
  })

  it('suma las piezas de CNP audiovisual al mismo cociente', () => {
    const cnp = [
      {
        assignee_id: USER,
        deleted_at: null,
        is_audiovisual: true,
        created_at: '2026-10-05T10:00:00Z',
        due_date: '2026-10-20',
        status: 'En proceso',
        pieces: [{ done: true }, { done: false }],
      },
    ]
    const r = calcEdicion(base({ piezas: [pieza(), pieza({ status: 'pendiente' })], cnp }))
    expect(r.unidades).toBe(4)
    expect(r.pct).toBe(0.5)
    expect(r.detalle).toEqual({ unidades: 4, listas: 2, piezas: 2, cnp: 2 })
  })

  it('un editor que solo trabaja CNP también tiene edición', () => {
    const cnp = [
      {
        assignee_id: USER,
        deleted_at: null,
        is_audiovisual: true,
        created_at: '2026-10-05T10:00:00Z',
        due_date: '2026-10-20',
        status: 'Terminado',
        pieces: [{ done: true }],
      },
    ]
    expect(calcEdicion(base({ cnp })).pct).toBe(1)
  })
})

describe('perfiles por cargo y estado del score', () => {
  const zero = Object.fromEntries(INDICATOR_KEYS.map((k) => [k, 0]))
  const profiles = [
    { id: 'd', is_default: true, match: {}, weights: { ...zero, tareas: 70, cnp: 30 } },
    {
      id: 'dept',
      name: 'Audiovisual',
      match: { department_ids: [2] },
      weights: { ...zero, tareas: 70, cnp: 30 },
    },
    {
      id: 'foto',
      name: 'Fotógrafo',
      match: { position_ids: [9] },
      weights: { ...zero, pautas: 56, fotos: 44 },
    },
    { id: 'cm', name: 'Community Manager', match: { position_ids: [7] }, weights: { ...zero } },
  ]

  it('el perfil por cargo le gana al de departamento', () => {
    expect(resolveProfile({ position_id: 9, department_id: 2 }, profiles).id).toBe('foto')
  })

  it('un fotógrafo con 2 pautas y fotos sin cargar tiene score (medición parcial)', () => {
    const r = computeEmployeeScore(
      base({
        pautas: [pauta({ formats: ['F'] }), pauta({ formats: ['F'], pauta_date: '2026-10-12' })],
      }),
      profiles[2].weights,
    )
    expect(r.estado).toBe('ok')
    expect(r.score).toBe(100)
    const fotos = r.breakdown.find((b) => b.key === 'fotos')
    expect(fotos.aplica).toBe(false)
  })

  it('un Community Manager (todo en 0) queda sin_datos: solo cuenta la evaluación del jefe', () => {
    const r = computeEmployeeScore(base({ tasks: [task(), task(), task()] }), profiles[3].weights)
    expect(r.score).toBeNull()
    expect(r.estado).toBe('sin_datos')
  })

  it('computeAllEmployeeScores resuelve el perfil por cargo', () => {
    const users = [
      {
        user_id: USER,
        position_id: 9,
        department_id: 2,
        access_level: 1,
        hire_date: null,
        on_probation: false,
      },
    ]
    const scores = computeAllEmployeeScores(
      users,
      { ...base(), vacations: [], pautas: [pauta()] },
      profiles,
      { year: YEAR, month: MONTH, monthIdx: MONTH_IDX },
    )
    const r = scores.get(USER)
    expect(r.breakdown.filter((b) => b.pesoBase > 0).map((b) => b.key)).toEqual(['pautas', 'fotos'])
  })
})

it('cada indicador del catálogo tiene su key en INDICATOR_KEYS', () => {
  expect(INDICATORS.map((i) => i.key).sort()).toEqual([...INDICATOR_KEYS].sort())
})
