import { describe, it, expect } from 'vitest'
import {
  calcEntregas,
  calcPuntualidad,
  calcArrastre,
  calcTareasFijas,
  calcPiezasAv,
  calcReuniones,
  calcCampanas,
  calcChequeo,
  calcTickets,
  computeEmployeeScore,
  computeAllEmployeeScores,
  INDICATORS,
} from '../utils/employeeScore'
import { currentMonthIndex } from '../components/tareas/constants'

const USER = 'user-1'
const MONTH_IDX = currentMonthIndex()
const [YEAR, MONTH] = (() => {
  const y = Math.floor(MONTH_IDX / 12)
  const m = (MONTH_IDX % 12) + 1
  return [y, m]
})()

function isoInMonth(day) {
  return `${YEAR}-${String(MONTH).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function task(overrides = {}) {
  return {
    assignee_ids: [USER],
    created_by: 'someone-else',
    request_date: isoInMonth(1),
    due_date: isoInMonth(10),
    closed_date: null,
    status: 'En proceso',
    ...overrides,
  }
}

function cnp(overrides = {}) {
  return {
    assignee_id: USER,
    created_by: 'someone-else',
    due_date: isoInMonth(10),
    closed_date: null,
    created_at: `${isoInMonth(5)}T10:00:00Z`,
    status: 'En proceso',
    deleted_at: null,
    pieces: [],
    ...overrides,
  }
}

const disponibilidadCompleta = { factor: 1, rangosExcluidos: [], motivo: null }

describe('calcEntregas', () => {
  it('no aplica con menos de 3 unidades', () => {
    const ctx = {
      userId: USER,
      monthIdx: MONTH_IDX,
      tasks: [task({ status: 'Terminado', closed_date: isoInMonth(9) })],
      cnp: [],
      disponibilidad: disponibilidadCompleta,
    }
    expect(calcEntregas(ctx).aplica).toBe(false)
  })

  it('cumplimiento 100% cuando todas las tareas y CNP están cerrados', () => {
    const ctx = {
      userId: USER,
      monthIdx: MONTH_IDX,
      tasks: [
        task({ status: 'Terminado', closed_date: isoInMonth(9) }),
        task({ status: 'Terminado', closed_date: isoInMonth(9) }),
        task({ status: 'Terminado', closed_date: isoInMonth(9) }),
      ],
      cnp: [],
      disponibilidad: disponibilidadCompleta,
    }
    const r = calcEntregas(ctx)
    expect(r.aplica).toBe(true)
    expect(r.pct).toBeCloseTo(1)
  })

  it('redistribuye el 100% del peso a CNP cuando no hay tareas', () => {
    const ctx = {
      userId: USER,
      monthIdx: MONTH_IDX,
      tasks: [],
      cnp: [
        cnp({ status: 'Terminado', closed_date: isoInMonth(9) }),
        cnp({ status: 'Terminado', closed_date: isoInMonth(9) }),
        cnp({ status: 'Pendiente' }),
      ],
      disponibilidad: disponibilidadCompleta,
    }
    const r = calcEntregas(ctx)
    expect(r.aplica).toBe(true)
    // 2 de 3 piezas entregadas, con el 100% del peso en CNP (sin tareas).
    expect(r.pct).toBeCloseTo(2 / 3)
  })

  it('excluye del universo las tareas cuyo due_date cae en vacaciones confirmadas', () => {
    const rangosExcluidos = [[isoInMonth(1), isoInMonth(15)]]
    const ctx = {
      userId: USER,
      monthIdx: MONTH_IDX,
      tasks: [
        task({ status: 'Pendiente', due_date: isoInMonth(10) }), // excluida (en vacaciones)
        task({ status: 'Terminado', closed_date: isoInMonth(20), due_date: isoInMonth(20) }),
        task({ status: 'Terminado', closed_date: isoInMonth(21), due_date: isoInMonth(21) }),
        task({ status: 'Terminado', closed_date: isoInMonth(22), due_date: isoInMonth(22) }),
      ],
      cnp: [],
      disponibilidad: { factor: 0.5, rangosExcluidos, motivo: 'vacaciones' },
    }
    const r = calcEntregas(ctx)
    // Solo 3 tareas cuentan (la de vacaciones se excluyó), todas cerradas → 100%.
    expect(r.detalle.tUniverso).toBe(3)
    expect(r.pct).toBeCloseTo(1)
  })
})

describe('calcPuntualidad', () => {
  it('no aplica sin tareas cerradas con ambas fechas', () => {
    const ctx = {
      userId: USER,
      monthIdx: MONTH_IDX,
      tasks: [task()],
      cnp: [],
      disponibilidad: disponibilidadCompleta,
    }
    expect(calcPuntualidad(ctx).aplica).toBe(false)
  })

  it('cuenta a tiempo cuando closed_date <= due_date', () => {
    const ctx = {
      userId: USER,
      monthIdx: MONTH_IDX,
      tasks: [
        task({ status: 'Terminado', due_date: isoInMonth(10), closed_date: isoInMonth(9) }),
        task({ status: 'Terminado', due_date: isoInMonth(10), closed_date: isoInMonth(10) }),
        task({ status: 'Terminado', due_date: isoInMonth(10), closed_date: isoInMonth(15) }), // tarde
      ],
      cnp: [],
      disponibilidad: disponibilidadCompleta,
    }
    const r = calcPuntualidad(ctx)
    expect(r.aplica).toBe(true)
    expect(r.pct).toBeCloseTo(2 / 3)
  })
})

describe('calcArrastre', () => {
  it('no aplica con menos de 3 tareas abiertas', () => {
    const ctx = { userId: USER, tasks: [task()] }
    expect(calcArrastre(ctx).aplica).toBe(false)
  })

  it('pct 1.0 cuando ninguna tarea abierta está paralizada/vencida', () => {
    const future = `${YEAR + 1}-01-01`
    const ctx = {
      userId: USER,
      tasks: [task({ due_date: future }), task({ due_date: future }), task({ due_date: future })],
    }
    const r = calcArrastre(ctx)
    expect(r.aplica).toBe(true)
    expect(r.pct).toBeCloseTo(1)
  })

  it('penaliza tareas paralizadas', () => {
    const future = `${YEAR + 1}-01-01`
    const ctx = {
      userId: USER,
      tasks: [
        task({ due_date: future }),
        task({ due_date: future }),
        task({ status: 'Paralizado', due_date: future }),
        task({ status: 'Paralizado', due_date: future }),
      ],
    }
    const r = calcArrastre(ctx)
    // ratio 2/4 = 0.5 → pct = max(0, 1 - 0.5/0.5) = 0
    expect(r.pct).toBeCloseTo(0)
  })
})

describe('calcTareasFijas', () => {
  it('no aplica sin cuentas asignadas', () => {
    const ctx = { userId: USER, year: YEAR, month: MONTH, marks: [], clients: [] }
    expect(calcTareasFijas(ctx).aplica).toBe(false)
  })

  it('aplica y da 0 cuando el empleado nunca marcó nada (meta derivada, no marcas)', () => {
    const clients = [{ id: 'c1', social_manager_id: USER, designer_id: null, fixed_tasks: null }]
    const ctx = { userId: USER, year: YEAR, month: MONTH, marks: [], clients }
    const r = calcTareasFijas(ctx)
    expect(r.aplica).toBe(true)
    expect(r.pct).toBe(0)
  })

  it('ignora marcas de otro período aunque compartan period_week (evita falso match)', () => {
    const clients = [{ id: 'c1', social_manager_id: USER, designer_id: null, fixed_tasks: null }]
    const otherMonth = MONTH === 12 ? 1 : MONTH + 1
    const otherYear = MONTH === 12 ? YEAR + 1 : YEAR
    // Marca "si" en la semana 1 pero de OTRO mes: si el filtro por período no
    // funcionara, se colaría como si fuera la semana 1 del mes que se está evaluando.
    const marks = [
      {
        client_id: 'c1',
        task_key: 'grilla',
        period_week: 1,
        period_year: otherYear,
        period_month: otherMonth,
        status: 'si',
      },
    ]
    const ctx = { userId: USER, year: YEAR, month: MONTH, marks, clients }
    const r = calcTareasFijas(ctx)
    expect(r.pct).toBe(0)
  })
})

describe('calcPiezasAv', () => {
  it('no aplica sin piezas asignadas', () => {
    const ctx = { userId: USER, monthIdx: MONTH_IDX, piezas: [] }
    expect(calcPiezasAv(ctx).aplica).toBe(false)
  })

  it('pct = listas / asignadas', () => {
    const piezas = [
      { editor_user_id: USER, status: 'listo', created_at: `${isoInMonth(5)}T00:00:00Z` },
      { editor_user_id: USER, status: 'en_edicion', created_at: `${isoInMonth(5)}T00:00:00Z` },
      { editor_user_id: USER, status: 'listo', created_at: `${isoInMonth(5)}T00:00:00Z` },
    ]
    const r = calcPiezasAv({ userId: USER, monthIdx: MONTH_IDX, piezas })
    expect(r.aplica).toBe(true)
    expect(r.pct).toBeCloseTo(2 / 3)
  })

  it('un lote cuenta por sus unidades (cantidad/listas), no como una fila', () => {
    const piezas = [
      {
        editor_user_id: USER,
        es_lote: true,
        cantidad: 50,
        listas: 32,
        status: 'en_edicion',
        created_at: `${isoInMonth(5)}T00:00:00Z`,
      },
    ]
    const r = calcPiezasAv({ userId: USER, monthIdx: MONTH_IDX, piezas })
    expect(r.detalle).toEqual({ unidades: 50, listas: 32 })
    expect(r.pct).toBeCloseTo(32 / 50)
  })

  it('las piezas canceladas no cuentan', () => {
    const piezas = [
      { editor_user_id: USER, status: 'listo', created_at: `${isoInMonth(5)}T00:00:00Z` },
      { editor_user_id: USER, status: 'cancelado', created_at: `${isoInMonth(5)}T00:00:00Z` },
    ]
    const r = calcPiezasAv({ userId: USER, monthIdx: MONTH_IDX, piezas })
    expect(r.detalle).toEqual({ unidades: 1, listas: 1 })
  })
})

describe('calcReuniones', () => {
  it('no cuenta reuniones creadas por el propio empleado (anti auto-círculo)', () => {
    const meetings = [
      {
        attendee_ids: [USER],
        created_by: USER,
        status: 'realizada',
        starts_at: `${isoInMonth(5)}T10:00:00Z`,
      },
    ]
    expect(calcReuniones({ userId: USER, monthIdx: MONTH_IDX, meetings }).aplica).toBe(false)
  })

  it('pct = realizadas / convocadas (excluye canceladas del denominador)', () => {
    const meetings = [
      {
        attendee_ids: [USER],
        created_by: 'jefe',
        status: 'realizada',
        starts_at: `${isoInMonth(5)}T10:00:00Z`,
      },
      {
        attendee_ids: [USER],
        created_by: 'jefe',
        status: 'programada',
        starts_at: `${isoInMonth(6)}T10:00:00Z`,
      },
      {
        attendee_ids: [USER],
        created_by: 'jefe',
        status: 'cancelada',
        starts_at: `${isoInMonth(7)}T10:00:00Z`,
      },
    ]
    const r = calcReuniones({ userId: USER, monthIdx: MONTH_IDX, meetings })
    expect(r.aplica).toBe(true)
    expect(r.pct).toBeCloseTo(0.5)
  })
})

describe('calcCampanas', () => {
  it('no aplica sin campañas', () => {
    expect(
      calcCampanas({ userId: USER, monthIdx: MONTH_IDX, paidCampaigns: [], campaigns: [] }).aplica,
    ).toBe(false)
  })

  it('results_pending=false cuenta como resultados cargados', () => {
    const paidCampaigns = [
      {
        responsable_id: USER,
        status: 'Finalizado',
        results_pending: false,
        updated_at: `${isoInMonth(20)}T00:00:00Z`,
      },
      {
        responsable_id: USER,
        status: 'Finalizado',
        results_pending: true,
        updated_at: `${isoInMonth(21)}T00:00:00Z`,
      },
    ]
    const r = calcCampanas({ userId: USER, monthIdx: MONTH_IDX, paidCampaigns, campaigns: [] })
    expect(r.aplica).toBe(true)
    expect(r.pct).toBeCloseTo(0.5)
  })
})

describe('calcCampanas — tácticas orgánicas al cierre', () => {
  // Fecha YYYY-MM-DD en el mes evaluado desplazado `offset` meses (day 0 = último día del mes anterior).
  const iso = (offset, day) => {
    const d = new Date(Date.UTC(YEAR, MONTH - 1 + offset, day))
    return d.toISOString().slice(0, 10)
  }
  const items = (done, total) =>
    Array.from({ length: total }, (_, i) => ({ id: `i${i}`, title: `a${i}`, done: i < done }))
  const tactica = (over = {}) => ({
    assignee: USER,
    status: 'Finalizado',
    created_at: `${iso(0, 1)}T10:00:00Z`,
    end_date: iso(0, 20),
    closed_at: `${iso(0, 20)}T15:00:00Z`,
    checklist: items(1, 2),
    ...over,
  })
  const run = (campaigns, paidCampaigns = []) =>
    calcCampanas({ userId: USER, monthIdx: MONTH_IDX, paidCampaigns, campaigns })

  it('el % es el de acciones cumplidas de la táctica cerrada en el mes', () => {
    const r = run([tactica({ checklist: items(3, 4) })])
    expect(r.aplica).toBe(true)
    expect(r.pct).toBeCloseTo(0.75)
    expect(r.detalle.misOrganicas).toBe(1)
  })

  it('promedia varias tácticas', () => {
    const r = run([tactica({ checklist: items(2, 2) }), tactica({ checklist: items(0, 2) })])
    expect(r.pct).toBeCloseTo(0.5)
  })

  it('cuenta una táctica creada hace meses que cierra este mes', () => {
    const r = run([tactica({ created_at: `${iso(-3, 5)}T10:00:00Z` })])
    expect(r.aplica).toBe(true)
  })

  it('NO cuenta una táctica creada este mes que cierra en otro', () => {
    const r = run([tactica({ end_date: iso(1, 20), closed_at: `${iso(1, 20)}T15:00:00Z` })])
    expect(r.aplica).toBe(false)
  })

  it('NO cuenta una táctica que sigue en marcha (aún no cierra)', () => {
    expect(run([tactica({ status: 'En Curso', closed_at: null })]).aplica).toBe(false)
    expect(run([tactica({ status: 'Pendiente', closed_at: null })]).aplica).toBe(false)
  })

  it('una táctica sin checklist no cuenta como 0 %: queda fuera del promedio', () => {
    const sola = run([tactica({ checklist: [] })])
    expect(sola.aplica).toBe(false)

    const mezcla = run([tactica({ checklist: items(2, 2) }), tactica({ checklist: [] })])
    expect(mezcla.pct).toBeCloseTo(1)
    expect(mezcla.detalle.misOrganicas).toBe(1)
  })

  it('el cierre automático del día siguiente al fin no la pasa al mes siguiente', () => {
    // Vence el último día del mes; el cron la finaliza el día 1 del siguiente.
    const r = run([tactica({ end_date: iso(1, 0), closed_at: `${iso(1, 1)}T11:00:00Z` })])
    expect(r.aplica).toBe(true)
  })

  it('una táctica cerrada antes de tiempo cuenta en el mes en que se cerró', () => {
    const r = run([tactica({ end_date: iso(2, 10), closed_at: `${iso(0, 15)}T15:00:00Z` })])
    expect(r.aplica).toBe(true)
  })

  it('NO cuenta una táctica ya cerrada en un mes anterior', () => {
    const r = run([tactica({ end_date: iso(-1, 10), closed_at: `${iso(-1, 10)}T15:00:00Z` })])
    expect(r.aplica).toBe(false)
  })

  it('NO cuenta las tácticas de otro responsable', () => {
    expect(run([tactica({ assignee: 'otro' })]).aplica).toBe(false)
  })

  it('sin closed_at (filas anteriores) se fecha por su fecha de fin', () => {
    expect(run([tactica({ closed_at: null })]).aplica).toBe(true)
    expect(run([tactica({ closed_at: null, end_date: iso(-1, 10) })]).aplica).toBe(false)
  })

  it('con pagadas y orgánicas, cada mitad pesa 50 %', () => {
    const paid = [
      {
        responsable_id: USER,
        status: 'Finalizado',
        results_pending: false,
        updated_at: `${iso(0, 10)}T00:00:00Z`,
      },
    ]
    const r = run([tactica({ checklist: items(1, 2) })], paid)
    // pagadas 100 % × 0.5 + orgánicas 50 % × 0.5
    expect(r.pct).toBeCloseTo(0.75)
    expect(r.unidades).toBe(2)
  })

  it('solo orgánicas: ellas se llevan todo el peso', () => {
    const r = run([tactica({ checklist: items(1, 4) })])
    expect(r.pct).toBeCloseTo(0.25)
  })
})

describe('calcChequeo', () => {
  it('no aplica sin cuentas como social manager', () => {
    expect(calcChequeo({ userId: USER, monthIdx: MONTH_IDX, checks: [], clients: [] }).aplica).toBe(
      false,
    )
  })

  it('pct = celdas con last_published_at / celdas actualizadas por el empleado', () => {
    const clients = [{ id: 'c1', social_manager_id: USER }]
    const checks = [
      {
        client_id: 'c1',
        updated_by: USER,
        updated_at: `${isoInMonth(5)}T00:00:00Z`,
        last_published_at: `${isoInMonth(5)}T00:00:00Z`,
      },
      {
        client_id: 'c1',
        updated_by: USER,
        updated_at: `${isoInMonth(6)}T00:00:00Z`,
        last_published_at: null,
      },
    ]
    const r = calcChequeo({ userId: USER, monthIdx: MONTH_IDX, checks, clients })
    expect(r.aplica).toBe(true)
    expect(r.pct).toBeCloseTo(0.5)
  })
})

describe('calcTickets', () => {
  it('no aplica fuera de IT (department_id != 0)', () => {
    const ctx = {
      userId: USER,
      monthIdx: MONTH_IDX,
      tickets: [{ assigned_to: USER }],
      department_id: 5,
    }
    expect(calcTickets(ctx).aplica).toBe(false)
  })

  it('en IT, cuenta resueltos dentro de SLA', () => {
    const tickets = [
      {
        assigned_to: USER,
        priority: 'alta',
        created_at: `${isoInMonth(1)}T00:00:00Z`,
        resolved_at: `${isoInMonth(1)}T02:00:00Z`,
      },
      {
        assigned_to: USER,
        priority: 'alta',
        created_at: `${isoInMonth(1)}T00:00:00Z`,
        resolved_at: null,
      },
      {
        assigned_to: USER,
        priority: 'baja',
        created_at: `${isoInMonth(1)}T00:00:00Z`,
        resolved_at: `${isoInMonth(5)}T00:00:00Z`,
      },
    ]
    const r = calcTickets({ userId: USER, monthIdx: MONTH_IDX, tickets, department_id: 0 })
    expect(r.aplica).toBe(true)
    expect(r.unidades).toBe(3)
  })
})

describe('computeEmployeeScore — guardas de volumen mínimo', () => {
  it('score null y estado sin_datos cuando hay muy pocas unidades', () => {
    const ctx = {
      userId: USER,
      year: YEAR,
      month: MONTH,
      monthIdx: MONTH_IDX,
      department_id: 5,
      disponibilidad: disponibilidadCompleta,
      tasks: [task({ status: 'Terminado', closed_date: isoInMonth(9) })],
      cnp: [],
      marks: [],
      clients: [],
      piezas: [],
      meetings: [],
      campaigns: [],
      paidCampaigns: [],
      checks: [],
      tickets: [],
    }
    const weights = { entregas: 100 }
    const res = computeEmployeeScore(ctx, weights)
    expect(res.score).toBeNull()
    expect(res.estado).toBe('sin_datos')
  })

  it('con suficiente volumen produce un score numérico y estado ok', () => {
    const clients = [{ id: 'c1', social_manager_id: USER, designer_id: null, fixed_tasks: null }]
    const ctx = {
      userId: USER,
      year: YEAR,
      month: MONTH,
      monthIdx: MONTH_IDX,
      department_id: 5,
      disponibilidad: disponibilidadCompleta,
      tasks: [
        task({ status: 'Terminado', due_date: isoInMonth(9), closed_date: isoInMonth(9) }),
        task({ status: 'Terminado', due_date: isoInMonth(9), closed_date: isoInMonth(9) }),
        task({ status: 'Terminado', due_date: isoInMonth(9), closed_date: isoInMonth(9) }),
        task({ status: 'Terminado', due_date: isoInMonth(9), closed_date: isoInMonth(9) }),
      ],
      cnp: [],
      marks: [],
      clients,
      piezas: [],
      meetings: [],
      campaigns: [],
      paidCampaigns: [],
      checks: [],
      tickets: [],
    }
    const weights = {
      entregas: 25,
      puntualidad: 20,
      arrastre: 10,
      tareas_fijas: 15,
      piezas_av: 10,
      reuniones: 5,
      campanas: 5,
      chequeo: 5,
      tickets: 0,
    }
    const res = computeEmployeeScore(ctx, weights)
    expect(res.estado).toBe('ok')
    expect(res.score).not.toBeNull()
    expect(res.score).toBeGreaterThan(0)
    expect(res.score).toBeLessThanOrEqual(100)
  })

  it('marca estado parcial cuando la disponibilidad es menor a 0.5 y lo saca del ranking', () => {
    const clients = [{ id: 'c1', social_manager_id: USER, designer_id: null, fixed_tasks: null }]
    const ctx = {
      userId: USER,
      year: YEAR,
      month: MONTH,
      monthIdx: MONTH_IDX,
      department_id: 5,
      disponibilidad: { factor: 0.3, rangosExcluidos: [], motivo: 'vacaciones' },
      tasks: [
        task({ status: 'Terminado', due_date: isoInMonth(9), closed_date: isoInMonth(9) }),
        task({ status: 'Terminado', due_date: isoInMonth(9), closed_date: isoInMonth(9) }),
        task({ status: 'Terminado', due_date: isoInMonth(9), closed_date: isoInMonth(9) }),
        task({ status: 'Terminado', due_date: isoInMonth(9), closed_date: isoInMonth(9) }),
      ],
      cnp: [],
      marks: [],
      clients,
      piezas: [],
      meetings: [],
      campaigns: [],
      paidCampaigns: [],
      checks: [],
      tickets: [],
    }
    const weights = {
      entregas: 25,
      puntualidad: 20,
      arrastre: 10,
      tareas_fijas: 15,
      piezas_av: 10,
      reuniones: 5,
      campanas: 5,
      chequeo: 5,
      tickets: 0,
    }
    const res = computeEmployeeScore(ctx, weights)
    expect(res.estado).toBe('parcial')
    expect(res.enRanking).toBe(false)
    expect(res.score).not.toBeNull() // el score se muestra, solo no compite
  })

  it('excluye del ranking a quien tiene más del 60% de tareas auto-asignadas', () => {
    const clients = [{ id: 'c1', social_manager_id: USER, designer_id: null, fixed_tasks: null }]
    const ctx = {
      userId: USER,
      year: YEAR,
      month: MONTH,
      monthIdx: MONTH_IDX,
      department_id: 5,
      disponibilidad: disponibilidadCompleta,
      tasks: [
        task({
          status: 'Terminado',
          due_date: isoInMonth(9),
          closed_date: isoInMonth(9),
          created_by: USER,
        }),
        task({
          status: 'Terminado',
          due_date: isoInMonth(9),
          closed_date: isoInMonth(9),
          created_by: USER,
        }),
        task({
          status: 'Terminado',
          due_date: isoInMonth(9),
          closed_date: isoInMonth(9),
          created_by: USER,
        }),
        task({
          status: 'Terminado',
          due_date: isoInMonth(9),
          closed_date: isoInMonth(9),
          created_by: 'jefe',
        }),
      ],
      cnp: [],
      marks: [],
      clients,
      piezas: [],
      meetings: [],
      campaigns: [],
      paidCampaigns: [],
      checks: [],
      tickets: [],
    }
    const weights = {
      entregas: 25,
      puntualidad: 20,
      arrastre: 10,
      tareas_fijas: 15,
      piezas_av: 10,
      reuniones: 5,
      campanas: 5,
      chequeo: 5,
      tickets: 0,
    }
    const res = computeEmployeeScore(ctx, weights)
    expect(res.autoCirculoPct).toBeCloseTo(0.75)
    expect(res.enRanking).toBe(false)
  })

  it('los pesos efectivos de los indicadores aplicables suman 100', () => {
    const clients = [{ id: 'c1', social_manager_id: USER, designer_id: null, fixed_tasks: null }]
    const ctx = {
      userId: USER,
      year: YEAR,
      month: MONTH,
      monthIdx: MONTH_IDX,
      department_id: 5,
      disponibilidad: disponibilidadCompleta,
      tasks: [
        task({ status: 'Terminado', due_date: isoInMonth(9), closed_date: isoInMonth(9) }),
        task({ status: 'Terminado', due_date: isoInMonth(9), closed_date: isoInMonth(9) }),
        task({ status: 'Terminado', due_date: isoInMonth(9), closed_date: isoInMonth(9) }),
        task({ status: 'Terminado', due_date: isoInMonth(9), closed_date: isoInMonth(9) }),
      ],
      cnp: [],
      marks: [],
      clients,
      piezas: [],
      meetings: [],
      campaigns: [],
      paidCampaigns: [],
      checks: [],
      tickets: [],
    }
    const weights = {
      entregas: 25,
      puntualidad: 20,
      arrastre: 10,
      tareas_fijas: 15,
      piezas_av: 10,
      reuniones: 5,
      campanas: 5,
      chequeo: 5,
      tickets: 0,
    }
    const res = computeEmployeeScore(ctx, weights)
    const sumaPesos = res.breakdown.filter((b) => b.aplica).reduce((s, b) => s + b.pesoEfectivo, 0)
    expect(sumaPesos).toBeCloseTo(100)
  })
})

describe('INDICATORS', () => {
  it('define los 22 indicadores (15 básicos + 7 anteriores) con label', () => {
    expect(INDICATORS).toHaveLength(22)
    INDICATORS.forEach((i) => {
      expect(i.key).toBeTruthy()
      expect(i.label).toBeTruthy()
      expect(typeof i.calc).toBe('function')
    })
  })
})

describe('computeAllEmployeeScores', () => {
  it('calcula el score de cada empleado indexando los datos una sola vez', () => {
    const users = [
      {
        user_id: 'u1',
        position_id: null,
        department_id: 5,
        access_level: 1,
        hire_date: null,
        on_probation: false,
      },
      {
        user_id: 'u2',
        position_id: null,
        department_id: 5,
        access_level: 1,
        hire_date: null,
        on_probation: false,
      },
    ]
    const profiles = [
      {
        id: 'default',
        is_default: true,
        match: {},
        weights: {
          entregas: 25,
          puntualidad: 20,
          arrastre: 10,
          tareas_fijas: 15,
          piezas_av: 10,
          reuniones: 5,
          campanas: 5,
          chequeo: 5,
          tickets: 0,
        },
      },
    ]
    const inputs = {
      tasks: [
        {
          assignee_ids: ['u1'],
          created_by: 'jefe',
          due_date: isoInMonth(9),
          closed_date: isoInMonth(9),
          request_date: isoInMonth(1),
          status: 'Terminado',
        },
      ],
      cnp: [],
      marks: [],
      clients: [],
      piezas: [],
      meetings: [],
      campaigns: [],
      paidCampaigns: [],
      checks: [],
      tickets: [],
      vacations: [],
    }
    const scores = computeAllEmployeeScores(users, inputs, profiles, {
      year: YEAR,
      month: MONTH,
      monthIdx: MONTH_IDX,
    })
    expect(scores.size).toBe(2)
    expect(scores.get('u1')).toBeTruthy()
    expect(scores.get('u2').score).toBeNull() // sin ningún dato
  })
})
