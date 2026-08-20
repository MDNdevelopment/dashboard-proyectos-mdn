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
  avEditMode,
  briefComplete,
  visibleSolicitudes,
  aggregatePiezasByLine,
  aggregateByResource,
  sumPiezasForLine,
  generateAgendaText,
  piezasProgress,
  piezasByEditor,
  defaultPiezaName,
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
    const text = generateAgendaText(pautas, lines, usersById)
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
    const text = generateAgendaText(pautas, lines, usersById)
    expect(text).toContain('POR AGENDAR')
    expect(text).toContain('AGROLAGO')
  })

  it('sin pautas programadas con fecha, deja la nota correspondiente', () => {
    const text = generateAgendaText([], lines, usersById)
    expect(text).toContain('Sin pautas agendadas con fecha')
  })
})
