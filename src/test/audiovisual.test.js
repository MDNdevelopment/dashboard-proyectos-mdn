import { describe, it, expect } from 'vitest'
import {
  grillaStatus,
  nextAgendaDeadline,
  formatCodes,
  formatTime12,
  resourceName,
  resourceNames,
  requesterName,
  pautasInScope,
  pautasInMonth,
  isOutOfMonth,
  monthLabel,
  agendaSortKey,
  sortAgenda,
  avEditMode,
  briefComplete,
  visibleSolicitudes,
  aggregatePiezasByLine,
  aggregateByResource,
  sumPiezasForLine,
  generateAgendaText,
  generateDayAgendaText,
  piezasProgress,
  piezasByEditor,
  editorNames,
  defaultPiezaName,
  isExternalId,
  externalAsUser,
  externalUsersForRole,
  timeRangesOverlap,
  assumedEnd,
  resourceConflicts,
  RESOURCE_DAILY_LIMIT,
} from '../utils/audiovisual'

function pauta(overrides = {}) {
  return {
    id: 'p1',
    client_id: 'c1',
    client_name: 'Cliente 1',
    line_id: 'l1',
    tema: '',
    place: '',
    pauta_date: null,
    salida: null,
    llegada: null,
    formats: [],
    graba_user_id: null,
    graba_other: null,
    edita_user_id: null,
    edita_other: null,
    attendee_ids: [],
    link: '',
    grilla_delivered_at: null,
    piezas_desc: '',
    status: 'solicitada',
    submitted: false,
    piezas_totales: 0,
    piezas_editadas: 0,
    ...overrides,
  }
}

const TODAY = new Date(2026, 6, 15) // 15 jul 2026 (miércoles)

describe('grillaStatus', () => {
  it('sin fecha de pauta → pendiente', () => {
    expect(grillaStatus(pauta({ pauta_date: null }), TODAY)).toBe('pendiente')
  })

  it('entregada a tiempo (≤ 2 días antes) → lista', () => {
    const p = pauta({ pauta_date: '2026-07-20', grilla_delivered_at: '2026-07-18' })
    expect(grillaStatus(p, TODAY)).toBe('lista')
  })

  it('entregada un día antes (dentro del tope de 1 día, pero ya no de 2) → incumple', () => {
    const p = pauta({ pauta_date: '2026-07-20', grilla_delivered_at: '2026-07-19' })
    expect(grillaStatus(p, TODAY)).toBe('incumple')
  })

  it('entregada tarde (mismo día o después del tope) → incumple', () => {
    const p = pauta({ pauta_date: '2026-07-20', grilla_delivered_at: '2026-07-20' })
    expect(grillaStatus(p, TODAY)).toBe('incumple')
  })

  it('sin entregar y la fecha de la pauta ya pasó → incumple', () => {
    const p = pauta({ pauta_date: '2026-07-10', grilla_delivered_at: null })
    expect(grillaStatus(p, TODAY)).toBe('incumple')
  })

  it('sin entregar y la fecha de la pauta aún no llega → pendiente', () => {
    const p = pauta({ pauta_date: '2026-07-25', grilla_delivered_at: null })
    expect(grillaStatus(p, TODAY)).toBe('pendiente')
  })
})

describe('nextAgendaDeadline', () => {
  it('si hoy es jueves, el cierre es hoy mismo', () => {
    const thursday = new Date(2026, 6, 16) // 16 jul 2026 es jueves
    const { deadline } = nextAgendaDeadline(thursday)
    expect(deadline.getDay()).toBe(4)
    expect(deadline.getDate()).toBe(16)
  })

  it('si hoy es miércoles, el cierre es el jueves siguiente', () => {
    const { deadline } = nextAgendaDeadline(TODAY) // miércoles 15
    expect(deadline.getDay()).toBe(4)
    expect(deadline.getDate()).toBe(16)
  })

  it('la semana agendada empieza el lunes después del cierre', () => {
    const { deadline, weekStart, weekEnd } = nextAgendaDeadline(TODAY)
    expect(weekStart.getDay()).toBe(1)
    expect(weekStart.getTime()).toBeGreaterThan(deadline.getTime())
    expect(weekEnd.getDay()).toBe(0)
  })
})

describe('formatCodes', () => {
  it('respeta el orden fijo V/R/F', () => {
    expect(formatCodes(pauta({ formats: ['F', 'V'] }))).toBe('V/F')
  })

  it('sin formatos → cadena vacía', () => {
    expect(formatCodes(pauta({ formats: [] }))).toBe('')
  })
})

describe('formatTime12', () => {
  it('convierte horas de Postgres (HH:MM:SS) a 12h', () => {
    expect(formatTime12('09:05:00')).toBe('09:05 A.M.')
    expect(formatTime12('15:30:00')).toBe('03:30 P.M.')
    expect(formatTime12('00:00:00')).toBe('12:00 A.M.')
    expect(formatTime12('12:00:00')).toBe('12:00 P.M.')
  })

  it('vacío → cadena vacía', () => {
    expect(formatTime12(null)).toBe('')
    expect(formatTime12('')).toBe('')
  })
})

describe('resourceName', () => {
  const usersById = new Map([['u1', { first_name: 'Lizdania', last_name: 'Pérez' }]])

  it('resuelve el empleado asignado', () => {
    const p = pauta({ graba_user_id: 'u1' })
    expect(resourceName(p, 'graba', usersById)).toBe('Lizdania Pérez')
  })

  it('usa el texto libre de tercero cuando no hay empleado asignado', () => {
    const p = pauta({ edita_user_id: null, edita_other: 'Freelance X' })
    expect(resourceName(p, 'edita', usersById)).toBe('Freelance X')
  })

  it('sin recurso asignado → null', () => {
    expect(resourceName(pauta(), 'graba', usersById)).toBeNull()
  })
})

describe('resourceNames', () => {
  const usersById = new Map([
    ['u1', { first_name: 'Lizdania', last_name: 'Pérez' }],
    ['u2', { first_name: 'Georgina', last_name: 'Ríos' }],
  ])

  it('resuelve varios recursos asignados', () => {
    const p = pauta({ recurso_ids: ['u1', 'u2'] })
    expect(resourceNames(p, usersById)).toEqual(['Lizdania Pérez', 'Georgina Ríos'])
  })

  it('sin recursos asignados → array vacío', () => {
    expect(resourceNames(pauta(), usersById)).toEqual([])
  })

  it('ignora ids que no resuelven a ningún empleado', () => {
    const p = pauta({ recurso_ids: ['u1', 'u9'] })
    expect(resourceNames(p, usersById)).toEqual(['Lizdania Pérez'])
  })
})

describe('requesterName', () => {
  const usersById = new Map([['u1', { first_name: 'Georgina', last_name: 'Ríos' }]])

  it('resuelve el nombre de quien creó la pauta', () => {
    const p = pauta({ created_by: 'u1' })
    expect(requesterName(p, usersById)).toBe('Georgina Ríos')
  })

  it('sin created_by o usuario no encontrado → null', () => {
    expect(requesterName(pauta({ created_by: null }), usersById)).toBeNull()
    expect(requesterName(pauta({ created_by: 'u9' }), usersById)).toBeNull()
  })
})

describe('pautasInScope', () => {
  const pautas = [pauta({ id: 'p1', line_id: 'l1' }), pauta({ id: 'p2', line_id: 'l2' })]

  it('sin lineId, devuelve todas', () => {
    expect(pautasInScope(pautas, null)).toHaveLength(2)
  })

  it('con lineId, filtra por línea', () => {
    expect(pautasInScope(pautas, 'l1').map((p) => p.id)).toEqual(['p1'])
  })
})

describe('pautasInMonth', () => {
  it('filtra por año/mes de pauta_date', () => {
    const pautas = [
      pauta({ id: 'p1', pauta_date: '2026-07-15' }),
      pauta({ id: 'p2', pauta_date: '2026-08-02' }),
    ]
    expect(pautasInMonth(pautas, 2026, 7).map((p) => p.id)).toEqual(['p1'])
    expect(pautasInMonth(pautas, 2026, 8).map((p) => p.id)).toEqual(['p2'])
  })

  it('las pautas sin pauta_date se mantienen visibles en cualquier mes', () => {
    const pautas = [
      pauta({ id: 'p1', pauta_date: null }),
      pauta({ id: 'p2', pauta_date: '2026-08-02' }),
    ]
    expect(pautasInMonth(pautas, 2026, 7).map((p) => p.id)).toEqual(['p1'])
    expect(pautasInMonth(pautas, 2026, 12).map((p) => p.id)).toEqual(['p1'])
  })

  it('sin pinnedIds se comporta igual que antes (una pauta de otro mes no aparece)', () => {
    const pautas = [pauta({ id: 'p1', pauta_date: '2026-08-02' })]
    expect(pautasInMonth(pautas, 2026, 7).map((p) => p.id)).toEqual([])
  })

  it('con pinnedIds, una pauta anclada aparece aunque su fecha sea de otro mes', () => {
    const pautas = [
      pauta({ id: 'p1', pauta_date: '2026-08-02' }),
      pauta({ id: 'p2', pauta_date: '2026-07-10' }),
    ]
    const pinned = new Set(['p1'])
    expect(pautasInMonth(pautas, 2026, 7, pinned).map((p) => p.id)).toEqual(['p1', 'p2'])
  })
})

describe('isOutOfMonth', () => {
  it('false si la pauta no tiene fecha', () => {
    expect(isOutOfMonth(pauta({ pauta_date: null }), 2026, 7)).toBe(false)
  })

  it('false si la fecha cae en el año/mes dado', () => {
    expect(isOutOfMonth(pauta({ pauta_date: '2026-07-15' }), 2026, 7)).toBe(false)
  })

  it('true si la fecha cae en otro mes o año', () => {
    expect(isOutOfMonth(pauta({ pauta_date: '2026-08-15' }), 2026, 7)).toBe(true)
    expect(isOutOfMonth(pauta({ pauta_date: '2027-07-15' }), 2026, 7)).toBe(true)
  })
})

describe('monthLabel', () => {
  it('devuelve mes y año en español', () => {
    expect(monthLabel('2026-09-15')).toMatch(/septiembre/i)
    expect(monthLabel('2026-09-15')).toMatch(/2026/)
  })

  it('vacío si no hay fecha', () => {
    expect(monthLabel(null)).toBe('')
  })
})

describe('sortAgenda', () => {
  it('ordena por fecha y luego por hora de salida', () => {
    const pautas = [
      pauta({ id: 'p1', pauta_date: '2026-07-20', salida: '10:00' }),
      pauta({ id: 'p2', pauta_date: '2026-07-15', salida: '14:00' }),
      pauta({ id: 'p3', pauta_date: '2026-07-15', salida: '09:00' }),
    ]
    expect(sortAgenda(pautas).map((p) => p.id)).toEqual(['p3', 'p2', 'p1'])
  })

  it('las pautas sin fecha quedan al final', () => {
    const pautas = [
      pauta({ id: 'p1', pauta_date: null }),
      pauta({ id: 'p2', pauta_date: '2026-07-15', salida: '09:00' }),
    ]
    expect(sortAgenda(pautas).map((p) => p.id)).toEqual(['p2', 'p1'])
  })

  it('es estable: pautas con la misma clave conservan siempre el mismo orden relativo', () => {
    const pautas = [
      pauta({ id: 'pb', pauta_date: '2026-07-15', salida: '09:00' }),
      pauta({ id: 'pa', pauta_date: '2026-07-15', salida: '09:00' }),
    ]
    const once = sortAgenda(pautas).map((p) => p.id)
    const twice = sortAgenda(sortAgenda(pautas)).map((p) => p.id)
    expect(twice).toEqual(once)
  })

  it('agendaSortKey compone fecha+hora con las pautas sin dato al final', () => {
    expect(agendaSortKey(pauta({ pauta_date: '2026-07-15', salida: '09:00' }))).toBe(
      '2026-07-15T09:00000',
    )
    const sinDato = agendaSortKey(pauta({ pauta_date: null, salida: null }))
    const conDato = agendaSortKey(pauta({ pauta_date: '2026-12-31', salida: '23:59' }))
    expect(sinDato > conDato).toBe(true)
  })
})

describe('avEditMode', () => {
  it('coordina si tiene audiovisual.coordina, sin importar audiovisual.manage', () => {
    expect(avEditMode({ canCoordinate: true, canManage: true })).toBe('coordina')
    expect(avEditMode({ canCoordinate: true, canManage: false })).toBe('coordina')
  })

  it('solicita si solo tiene audiovisual.manage', () => {
    expect(avEditMode({ canCoordinate: false, canManage: true })).toBe('solicita')
  })

  it('lectura sin ninguna capability', () => {
    expect(avEditMode({ canCoordinate: false, canManage: false })).toBe('lectura')
  })
})

describe('briefComplete', () => {
  it('requiere cliente + enlace o descripción de piezas', () => {
    expect(briefComplete(pauta({ client_id: null, link: 'x' }))).toBe(false)
    expect(briefComplete(pauta({ client_id: 'c1', link: '', piezas_desc: '' }))).toBe(false)
    expect(briefComplete(pauta({ client_id: 'c1', link: 'https://drive.google.com/x' }))).toBe(true)
    expect(briefComplete(pauta({ client_id: 'c1', piezas_desc: '3 reels' }))).toBe(true)
  })
})

describe('visibleSolicitudes', () => {
  const pautas = [
    pauta({ id: 'p1', status: 'solicitada', submitted: true }),
    pauta({ id: 'p2', status: 'solicitada', submitted: false }),
    pauta({ id: 'p3', status: 'programada', submitted: true }),
  ]

  it('la coordinadora solo ve las solicitudes ya enviadas', () => {
    expect(visibleSolicitudes(pautas, { canCoordinate: true }).map((p) => p.id)).toEqual(['p1'])
  })

  it('quien solicita ve las suyas en borrador o enviadas', () => {
    expect(visibleSolicitudes(pautas, { canCoordinate: false }).map((p) => p.id)).toEqual([
      'p1',
      'p2',
    ])
  })
})

describe('aggregatePiezasByLine', () => {
  const lines = [
    { id: 'l1', name: 'Georgina' },
    { id: 'l2', name: 'Sabrina' },
  ]

  it('suma piezas solo de pautas realizadas, agrupadas por línea', () => {
    const pautas = [
      pauta({
        id: 'p1',
        line_id: 'l1',
        status: 'realizada',
        piezas_totales: 5,
        piezas_editadas: 4,
      }),
      pauta({
        id: 'p2',
        line_id: 'l1',
        status: 'realizada',
        piezas_totales: 3,
        piezas_editadas: 3,
      }),
      pauta({
        id: 'p3',
        line_id: 'l1',
        status: 'programada',
        piezas_totales: 10,
        piezas_editadas: 10,
      }),
      pauta({
        id: 'p4',
        line_id: 'l2',
        status: 'realizada',
        piezas_totales: 2,
        piezas_editadas: 1,
      }),
    ]
    const result = aggregatePiezasByLine(pautas, lines)
    expect(result).toContainEqual({ lineId: 'l1', label: 'Georgina', totales: 8, editadas: 7 })
    expect(result).toContainEqual({ lineId: 'l2', label: 'Sabrina', totales: 2, editadas: 1 })
  })
})

describe('aggregateByResource', () => {
  const usersById = new Map([
    ['u1', { first_name: 'Diego', last_name: '' }],
    ['u2', { first_name: 'Nadia', last_name: '' }],
  ])

  it('atribuye piezas totales a quien graba y editadas a quien edita', () => {
    const pautas = [
      pauta({
        status: 'realizada',
        recurso_ids: ['u1'],
        edita_user_id: 'u2',
        piezas_totales: 5,
        piezas_editadas: 5,
      }),
      pauta({
        status: 'realizada',
        recurso_ids: ['u1'],
        edita_user_id: 'u2',
        piezas_totales: 6,
        piezas_editadas: 5,
      }),
    ]
    const result = aggregateByResource(pautas, usersById)
    expect(result).toContainEqual({ name: 'Diego', graba: 11, edita: 0 })
    expect(result).toContainEqual({ name: 'Nadia', graba: 0, edita: 10 })
  })

  it('con varios recursos en una misma pauta, atribuye el total completo a cada uno (sin repartir)', () => {
    const pautas = [pauta({ status: 'realizada', recurso_ids: ['u1', 'u2'], piezas_totales: 8 })]
    const result = aggregateByResource(pautas, usersById)
    expect(result).toContainEqual({ name: 'Diego', graba: 8, edita: 0 })
    expect(result).toContainEqual({ name: 'Nadia', graba: 8, edita: 0 })
  })

  it('ignora pautas que no están realizadas', () => {
    const pautas = [pauta({ status: 'programada', recurso_ids: ['u1'], piezas_totales: 5 })]
    expect(aggregateByResource(pautas, usersById)).toEqual([])
  })

  it('con piezas en el checklist, atribuye la edición pieza por pieza a cada editor real (no al edita_user_id legacy)', () => {
    const pautas = [
      pauta({
        id: 'p1',
        status: 'realizada',
        recurso_ids: ['u1'],
        edita_user_id: 'u2',
        piezas_totales: 3,
      }),
    ]
    const piezasByPauta = new Map([
      [
        'p1',
        [
          { editor_user_id: 'u1', status: 'listo' },
          { editor_user_id: 'u2', status: 'listo' },
          { editor_user_id: 'u2', status: 'pendiente' },
        ],
      ],
    ])
    const result = aggregateByResource(pautas, usersById, piezasByPauta)
    expect(result).toContainEqual({ name: 'Diego', graba: 3, edita: 1 })
    expect(result).toContainEqual({ name: 'Nadia', graba: 0, edita: 1 })
  })

  it('pautas sin piezas en el checklist caen al camino legacy (edita_user_id/piezas_editadas)', () => {
    const pautas = [
      pauta({
        id: 'p1',
        status: 'realizada',
        recurso_ids: ['u1'],
        edita_user_id: 'u2',
        piezas_totales: 5,
        piezas_editadas: 5,
      }),
    ]
    const result = aggregateByResource(pautas, usersById, new Map())
    expect(result).toContainEqual({ name: 'Nadia', graba: 0, edita: 5 })
  })
})

describe('piezasProgress', () => {
  it('cuenta listas sobre el total de piezas activas (excluye canceladas)', () => {
    const piezas = [
      { status: 'listo' },
      { status: 'listo' },
      { status: 'pendiente' },
      { status: 'cancelado' },
    ]
    expect(piezasProgress(piezas)).toEqual({ total: 3, listas: 2, canceladas: 1, pct: 67 })
  })

  it('sin piezas, devuelve todo en cero', () => {
    expect(piezasProgress([])).toEqual({ total: 0, listas: 0, canceladas: 0, pct: 0 })
  })
})

describe('piezasByEditor', () => {
  it('agrupa por editor_user_id ordenando por position dentro de cada grupo', () => {
    const piezas = [
      { id: 'b', editor_user_id: 'u1', position: 1 },
      { id: 'a', editor_user_id: 'u1', position: 0 },
      { id: 'c', editor_user_id: 'u2', position: 0 },
    ]
    const grouped = piezasByEditor(piezas)
    expect([...grouped.keys()]).toEqual(['u1', 'u2'])
    expect(grouped.get('u1').map((p) => p.id)).toEqual(['a', 'b'])
  })

  it('agrupa piezas sin editor bajo la clave null', () => {
    const piezas = [{ id: 'a', editor_user_id: null, position: 0 }]
    const grouped = piezasByEditor(piezas)
    expect(grouped.get(null).map((p) => p.id)).toEqual(['a'])
  })
})

describe('editorNames', () => {
  const usersById = new Map([
    ['u1', { first_name: 'Lizdania', last_name: 'Pérez' }],
    ['u2', { first_name: 'Georgina', last_name: 'Ríos' }],
    [
      'ext:r1',
      externalAsUser({ id: 'r1', full_name: 'Alan Puentes', roles: ['edicion'], deleted_at: null }),
    ],
  ])

  it('resuelve nombres únicos de editores, empleados y externos', () => {
    const piezas = [
      { editor_user_id: 'u1', position: 0 },
      { editor_user_id: 'ext:r1', position: 1 },
      { editor_user_id: 'u1', position: 2 },
    ]
    expect(editorNames(piezas, usersById)).toEqual(['Lizdania Pérez', 'Alan Puentes'])
  })

  it('ignora piezas sin editor asignado', () => {
    const piezas = [{ editor_user_id: null, position: 0 }]
    expect(editorNames(piezas, usersById)).toEqual([])
  })

  it('sin piezas → array vacío', () => {
    expect(editorNames([], usersById)).toEqual([])
  })
})

describe('defaultPiezaName', () => {
  it('genera nombres "Video #N" 1-indexados', () => {
    expect(defaultPiezaName(0)).toBe('Video #1')
    expect(defaultPiezaName(4)).toBe('Video #5')
  })
})

describe('sumPiezasForLine', () => {
  it('suma piezas totales y editadas solo de pautas realizadas', () => {
    const pautas = [
      pauta({ status: 'realizada', piezas_totales: 5, piezas_editadas: 4 }),
      pauta({ status: 'realizada', piezas_totales: 3, piezas_editadas: 2 }),
      pauta({ status: 'programada', piezas_totales: 100, piezas_editadas: 100 }),
    ]
    expect(sumPiezasForLine(pautas)).toEqual({ piezas: 8, editadas: 6 })
  })

  it('sin pautas realizadas → ceros', () => {
    expect(sumPiezasForLine([pauta({ status: 'solicitada' })])).toEqual({ piezas: 0, editadas: 0 })
  })
})

describe('generateAgendaText', () => {
  const lines = [
    { id: 'l1', name: 'Georgina' },
    { id: 'l2', name: 'Sabrina' },
  ]
  const usersById = new Map([['u1', { first_name: 'Lizdania', last_name: '' }]])

  it('agrupa las pautas programadas por fecha e incluye el resumen por línea', () => {
    const pautas = [
      pauta({
        id: 'p1',
        line_id: 'l1',
        status: 'programada',
        client_name: 'Turbo Pre',
        pauta_date: '2026-07-17',
        salida: '09:00:00',
        formats: ['V'],
        recurso_ids: ['u1'],
      }),
    ]
    const text = generateAgendaText(pautas, lines, usersById, TODAY)
    expect(text).toContain('TURBO PRE')
    expect(text).toContain('LIZDANIA')
    expect(text).toContain('GEORGINA: 1')
    expect(text).toContain('SABRINA: 0')
    expect(text).toContain('TOTAL DE PAUTAS: 1')
  })

  it('lista las pautas sin fecha en la sección "por agendar"', () => {
    const pautas = [
      pauta({ id: 'p1', line_id: 'l1', status: 'programada', client_name: 'Agrolago' }),
    ]
    const text = generateAgendaText(pautas, lines, usersById, TODAY)
    expect(text).toContain('POR AGENDAR')
    expect(text).toContain('AGROLAGO')
  })

  it('sin pautas programadas con fecha, deja la nota correspondiente', () => {
    const text = generateAgendaText([], lines, usersById)
    expect(text).toContain('Sin pautas agendadas con fecha')
  })

  it('omite los días con fecha ya pasada respecto a "today"', () => {
    const pautas = [
      pauta({
        id: 'p1',
        line_id: 'l1',
        status: 'programada',
        client_name: 'Ya Pasó',
        pauta_date: '2026-07-10', // antes de TODAY (15 jul 2026)
      }),
      pauta({
        id: 'p2',
        line_id: 'l1',
        status: 'programada',
        client_name: 'Por Venir',
        pauta_date: '2026-07-17',
      }),
    ]
    const text = generateAgendaText(pautas, lines, usersById, TODAY)
    expect(text).not.toContain('YA PASÓ')
    expect(text).toContain('POR VENIR')
    expect(text).toContain('GEORGINA: 1')
  })

  it('el día de hoy (today) no se considera pasado', () => {
    const pautas = [
      pauta({
        id: 'p1',
        line_id: 'l1',
        status: 'programada',
        client_name: 'Hoy Mismo',
        pauta_date: '2026-07-15', // == TODAY
      }),
    ]
    const text = generateAgendaText(pautas, lines, usersById, TODAY)
    expect(text).toContain('HOY MISMO')
  })
})

describe('generateDayAgendaText', () => {
  const usersById = new Map([['u1', { first_name: 'Lizdania', last_name: '' }]])

  it('lista solo las pautas programadas de la fecha exacta', () => {
    const pautas = [
      pauta({
        id: 'p1',
        status: 'programada',
        client_name: 'Cliente Del Día',
        pauta_date: '2026-07-17',
        salida: '09:00:00',
      }),
      pauta({
        id: 'p2',
        status: 'programada',
        client_name: 'Otro Día',
        pauta_date: '2026-07-18',
      }),
      pauta({
        id: 'p3',
        status: 'solicitada',
        client_name: 'Sin Confirmar',
        pauta_date: '2026-07-17',
      }),
    ]
    const text = generateDayAgendaText('2026-07-17', pautas, usersById)
    expect(text).toContain('CLIENTE DEL DÍA')
    expect(text).not.toContain('OTRO DÍA')
    expect(text).not.toContain('SIN CONFIRMAR')
    expect(text).toContain('TOTAL DE PAUTAS: 1')
  })

  it('sin pautas ese día, deja la nota correspondiente', () => {
    const text = generateDayAgendaText('2026-07-17', [], usersById)
    expect(text).toContain('Sin pautas agendadas este día')
  })
})

describe('isExternalId', () => {
  it('reconoce un id de recurso externo por su prefijo', () => {
    expect(isExternalId('ext:abc-123')).toBe(true)
  })

  it('no confunde un user_id real de empleado con uno externo', () => {
    expect(isExternalId('abc-123')).toBe(false)
    expect(isExternalId(null)).toBe(false)
    expect(isExternalId(undefined)).toBe(false)
  })
})

describe('externalAsUser', () => {
  it('da forma de pseudo-usuario prefijando el id y partiendo el nombre en first/last', () => {
    const u = externalAsUser({
      id: 'abc-123',
      full_name: 'Alan Puentes',
      roles: ['grabacion'],
      deleted_at: null,
    })
    expect(u).toEqual({
      user_id: 'ext:abc-123',
      first_name: 'Alan',
      last_name: 'Puentes',
      avatar_url: null,
      is_external: true,
      roles: ['grabacion'],
      deleted_at: null,
    })
  })

  it('con un nombre de un solo token, deja last_name vacío', () => {
    const u = externalAsUser({ id: 'x', full_name: 'Madonna', roles: [] })
    expect(u.first_name).toBe('Madonna')
    expect(u.last_name).toBe('')
  })
})

describe('externalUsersForRole', () => {
  const resources = [
    { id: 'r1', full_name: 'Alan Puentes', roles: ['grabacion'], deleted_at: null },
    { id: 'r2', full_name: 'Jeremy Gando', roles: ['grabacion', 'edicion'], deleted_at: null },
    { id: 'r3', full_name: 'David Martinez', roles: ['ads'], deleted_at: null },
    {
      id: 'r4',
      full_name: 'Archivado',
      roles: ['grabacion'],
      deleted_at: '2026-01-01T00:00:00Z',
    },
  ]

  it('filtra por rol: solo grabación entra al picker de recursos', () => {
    const result = externalUsersForRole(resources, 'grabacion')
    expect(result.map((u) => u.user_id)).toEqual(['ext:r1', 'ext:r2'])
  })

  it('filtra por rol: solo edición entra al picker de editores', () => {
    const result = externalUsersForRole(resources, 'edicion')
    expect(result.map((u) => u.user_id)).toEqual(['ext:r2'])
  })

  it('un recurso solo-ads no aparece en el picker de recursos ni en el de editores', () => {
    expect(externalUsersForRole(resources, 'grabacion')).not.toContainEqual(
      expect.objectContaining({ user_id: 'ext:r3' }),
    )
    expect(externalUsersForRole(resources, 'edicion')).not.toContainEqual(
      expect.objectContaining({ user_id: 'ext:r3' }),
    )
  })

  it('excluye recursos archivados (deleted_at)', () => {
    const result = externalUsersForRole(resources, 'grabacion')
    expect(result.map((u) => u.user_id)).not.toContain('ext:r4')
  })
})

describe('recursos externos integrados en los helpers de resolución existentes', () => {
  const usersById = new Map([
    ['u1', { first_name: 'Diego', last_name: '' }],
    [
      'ext:r1',
      externalAsUser({
        id: 'r1',
        full_name: 'Alan Puentes',
        roles: ['grabacion'],
        deleted_at: null,
      }),
    ],
  ])

  it('resourceNames resuelve un recurso externo igual que un empleado', () => {
    const p = pauta({ recurso_ids: ['u1', 'ext:r1'] })
    expect(resourceNames(p, usersById)).toEqual(['Diego', 'Alan Puentes'])
  })

  it('piezasByEditor agrupa piezas cuyo editor es un recurso externo', () => {
    const piezas = [
      { editor_user_id: 'ext:r1', position: 0 },
      { editor_user_id: 'u1', position: 1 },
    ]
    const grouped = piezasByEditor(piezas)
    expect([...grouped.keys()]).toEqual(['ext:r1', 'u1'])
  })

  it('aggregateByResource suma piezas de un editor externo por su nombre resuelto', () => {
    const pautas = [pauta({ status: 'realizada', recurso_ids: ['u1'], piezas_totales: 4 })]
    const piezasByPauta = new Map([['p1', [{ editor_user_id: 'ext:r1', status: 'listo' }]]])
    const result = aggregateByResource(pautas, usersById, piezasByPauta)
    expect(result).toContainEqual({ name: 'Alan Puentes', graba: 0, edita: 1 })
  })
})

describe('timeRangesOverlap', () => {
  it('solapa cuando los rangos se cruzan', () => {
    expect(timeRangesOverlap('09:00', '11:00', '10:00', '12:00')).toBe(true)
  })

  it('no solapa cuando son adyacentes (semiabierto [inicio, fin))', () => {
    expect(timeRangesOverlap('09:00', '11:00', '11:00', '13:00')).toBe(false)
  })

  it('solapa cuando un rango contiene al otro', () => {
    expect(timeRangesOverlap('09:00', '13:00', '10:00', '11:00')).toBe(true)
  })

  it('no solapa cuando no se cruzan en absoluto', () => {
    expect(timeRangesOverlap('09:00', '10:00', '11:00', '12:00')).toBe(false)
  })

  it('sin horas en ninguno de los dos lados no se puede afirmar solapamiento', () => {
    expect(timeRangesOverlap(null, null, null, null)).toBe(false)
    expect(timeRangesOverlap(undefined, undefined, '09:00', '10:00')).toBe(false)
  })

  it('un rango solo con salida (instante) solapa si cae dentro del otro rango', () => {
    expect(timeRangesOverlap('10:30', null, '10:00', '12:00')).toBe(true)
    expect(timeRangesOverlap('12:00', null, '10:00', '12:00')).toBe(false) // fin exclusivo
    expect(timeRangesOverlap('13:00', null, '10:00', '12:00')).toBe(false)
  })

  it('dos instantes solo solapan si son exactamente iguales', () => {
    expect(timeRangesOverlap('10:00', null, '10:00', null)).toBe(true)
    expect(timeRangesOverlap('10:00', null, '10:05', null)).toBe(false)
  })
})

describe('assumedEnd', () => {
  it('suma la ventana asumida a la hora de salida', () => {
    expect(assumedEnd('13:00')).toBe('16:00')
    expect(assumedEnd('09:30')).toBe('12:30')
  })

  it('acepta el formato time de Postgres (HH:MM:SS)', () => {
    expect(assumedEnd('13:00:00')).toBe('16:00')
  })

  it('topa al final del día en vez de derramarse al siguiente', () => {
    expect(assumedEnd('22:00')).toBe('24:00')
    expect(assumedEnd('23:45')).toBe('24:00')
  })

  it('sin salida no hay fin que asumir', () => {
    expect(assumedEnd(null)).toBe(null)
    expect(assumedEnd(undefined)).toBe(null)
    expect(assumedEnd('')).toBe(null)
  })
})

describe('resourceConflicts', () => {
  const usersById = new Map([
    ['r1', { first_name: 'Nadia', last_name: 'Torres' }],
    ['ext:r2', { first_name: 'Alan', last_name: 'Puentes' }],
  ])

  it('sin conflicto: no hay bloqueos ni avisos', () => {
    const candidate = { recurso_ids: ['r1'], salida: '09:00', llegada: '11:00' }
    const sameDay = [
      { id: 'p2', recurso_ids: ['r1'], salida: '12:00', llegada: '13:00', client_name: 'B' },
    ]
    const result = resourceConflicts(candidate, sameDay, usersById)
    expect(result.blocking).toEqual([])
    expect(result.warnings).toEqual([])
  })

  it('bloquea cuando el recurso ya está en una pauta del día con horario solapado', () => {
    const candidate = { recurso_ids: ['r1'], salida: '09:00', llegada: '11:00' }
    const clashing = {
      id: 'p2',
      recurso_ids: ['r1'],
      salida: '10:00',
      llegada: '12:00',
      client_name: 'B',
    }
    const result = resourceConflicts(candidate, [clashing], usersById)
    expect(result.blocking).toEqual([{ resourceId: 'r1', name: 'Nadia Torres', pauta: clashing }])
  })

  it('avisa cuando el recurso llega al límite diario y no bloquea', () => {
    const candidate = { recurso_ids: ['r1'], salida: null, llegada: null }
    const sameDay = [
      { id: 'p2', recurso_ids: ['r1'], salida: null, llegada: null, client_name: 'B' },
      { id: 'p3', recurso_ids: ['r1'], salida: null, llegada: null, client_name: 'C' },
    ]
    const result = resourceConflicts(candidate, sameDay, usersById)
    expect(result.blocking).toEqual([])
    expect(result.warnings).toEqual([
      { kind: 'daily_limit', resourceId: 'r1', name: 'Nadia Torres', count: RESOURCE_DAILY_LIMIT },
    ])
  })

  it('no repite el aviso si el recurso ya tenía el límite y no cambió (previousRecursoIds)', () => {
    const candidate = { recurso_ids: ['r1'], salida: null, llegada: null }
    const sameDay = [
      { id: 'p2', recurso_ids: ['r1'], salida: null, llegada: null, client_name: 'B' },
      { id: 'p3', recurso_ids: ['r1'], salida: null, llegada: null, client_name: 'C' },
    ]
    const result = resourceConflicts(candidate, sameDay, usersById, ['r1'])
    expect(result.warnings).toEqual([])
  })

  // Ventana asumida de 3 h para pautas sin hora de llegada: el choque deja de ser un hecho
  // y pasa a ser una suposición, así que avisa (confirmable) en vez de bloquear.
  it('avisa (no bloquea) cuando el choque solo existe bajo la ventana asumida de 3 h', () => {
    // Existente 13:00 sin cierre → se asume 13:00–16:00. Nueva a las 15:00 cae dentro.
    const candidate = { recurso_ids: ['r1'], salida: '15:00', llegada: null }
    const existente = {
      id: 'p2',
      recurso_ids: ['r1'],
      salida: '13:00',
      llegada: null,
      client_name: 'B',
    }
    const result = resourceConflicts(candidate, [existente], usersById)

    expect(result.blocking).toEqual([])
    expect(result.warnings).toEqual([
      { kind: 'probable_overlap', resourceId: 'r1', name: 'Nadia Torres', pauta: existente },
    ])
  })

  it('fuera de la ventana asumida de 3 h no avisa nada', () => {
    // Existente 13:00 sin cierre → 13:00–16:00. Nueva a las 16:30 queda fuera.
    const candidate = { recurso_ids: ['r1'], salida: '16:30', llegada: null }
    const existente = { id: 'p2', recurso_ids: ['r1'], salida: '13:00', llegada: null }
    const result = resourceConflicts(candidate, [existente], usersById)

    expect(result.blocking).toEqual([])
    expect(result.warnings).toEqual([])
  })

  it('sigue BLOQUEANDO cuando el choque se deduce de horas reales, sin suponer nada', () => {
    // La nueva sale 14:00 (sin cierre) y la existente es 14:00–14:30 real: el instante de
    // salida cae dentro de un rango conocido, así que el choque es un hecho, no una hipótesis.
    const candidate = { recurso_ids: ['r1'], salida: '14:00', llegada: null }
    const existente = {
      id: 'p2',
      recurso_ids: ['r1'],
      salida: '14:00',
      llegada: '14:30',
      client_name: 'RE/MAX',
    }
    const result = resourceConflicts(candidate, [existente], usersById)

    expect(result.blocking).toHaveLength(1)
    expect(result.warnings).toEqual([])
  })

  it('el aviso de solape probable no se filtra por previousRecursoIds (mover la hora debe avisar)', () => {
    const candidate = { recurso_ids: ['r1'], salida: '15:00', llegada: null }
    const existente = { id: 'p2', recurso_ids: ['r1'], salida: '13:00', llegada: null }
    // 'r1' ya estaba asignado antes del cambio: aun así debe avisar, porque lo que cambió
    // fue el horario.
    const result = resourceConflicts(candidate, [existente], usersById, ['r1'])

    expect(result.warnings.map((w) => w.kind)).toEqual(['probable_overlap'])
  })

  it('trata un recurso externo (ext:) igual que un empleado', () => {
    const candidate = { recurso_ids: ['ext:r2'], salida: '09:00', llegada: '10:00' }
    const clashing = {
      id: 'p2',
      recurso_ids: ['ext:r2'],
      salida: '09:30',
      llegada: '10:30',
      client_name: 'B',
    }
    const result = resourceConflicts(candidate, [clashing], usersById)
    expect(result.blocking[0].name).toBe('Alan Puentes')
  })
})
