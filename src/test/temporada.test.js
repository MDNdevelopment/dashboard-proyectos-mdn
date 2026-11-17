import {
  ASSIGNMENT_ROLES,
  ALL_STATUSES,
  FORMATOS,
  FORMATO_LABELS,
  FORMATO_META,
  NA_STATUS,
  NO_STATUS,
  STATUSES_BY_FIELD,
  STATUS_META,
  allowedAssignees,
  clientHasPending,
  clientHasStatus,
  clientsWithPending,
  computeTemporadaSummary,
  countedStatuses,
  indexAssignments,
  indexRows,
  isDone,
  mappiAssignee,
  resolveAssignee,
  rowFor,
  slotsOf,
  statusFieldsFor,
  statusLabel,
} from '../utils/temporada'

const POST = { key: '2026-12-24', label: '24/12', kind: 'post' }
const TARJETA = { key: 'tarjeta_navidad', label: 'Tarjeta navidad', kind: 'tarjeta' }

const row = (over) => ({
  id: Math.random().toString(36).slice(2),
  client_id: 'c1',
  slot_key: POST.key,
  formato: null,
  diseno_status: null,
  audiovisual_status: null,
  ...over,
})

describe('formatos y estados: los mismos que la hoja', () => {
  it('los formatos se llaman como en el desplegable FORMATO', () => {
    expect(FORMATOS).toEqual(['diseno_arte', 'diseno_video', 'audiovisual_reel', 'ia'])
    expect(FORMATO_LABELS).toEqual({
      diseno_arte: 'Diseño - Arte',
      diseno_video: 'Diseño - Video',
      audiovisual_reel: 'Audiovisual Reel',
      ia: 'IA',
    })
  })

  it('DISEÑO (y las tarjetas) ofrece N/A y la lista de la hoja', () => {
    expect(STATUSES_BY_FIELD.diseno_status.map(statusLabel)).toEqual([
      'N/A',
      'Pendiente por redes',
      'Enviado a diseño',
      'En modificación',
      'Enviado al cliente',
      'Aprobado',
      'Pendiente cliente',
    ])
  })

  it('AUDIOVISUAL ofrece su propia lista, que también empieza por N/A', () => {
    expect(STATUSES_BY_FIELD.audiovisual_status.map(statusLabel)).toEqual([
      'N/A',
      'Pendiente por grabar',
      'Agendado',
      'En edición',
      'Enviado al cliente',
      'Aprobado',
      'Pendiente cliente',
      'En diseño',
    ])
  })

  it('la columna en blanco se muestra como «Sin estado» pero no es una opción', () => {
    expect(statusLabel(NO_STATUS)).toBe('Sin estado')
    expect(statusLabel(null)).toBe('Sin estado')
    expect(ALL_STATUSES).not.toContain(NO_STATUS)
    expect(STATUS_META[NO_STATUS]).toBeDefined()
  })

  it('cada estado de cada lista tiene estilo, y ALL_STATUSES no repite', () => {
    for (const list of Object.values(STATUSES_BY_FIELD)) {
      for (const k of list) expect(STATUS_META[k]).toBeDefined()
    }
    expect(new Set(ALL_STATUSES).size).toBe(ALL_STATUSES.length)
  })

  it('Aprobado es verde con letras blancas y Pendiente cliente rojo clarito con letras rojas', () => {
    expect(STATUS_META.aprobado).toMatchObject({ bg: 'bg-[#16a34a]', text: 'text-white' })
    expect(STATUS_META.pendiente_cliente).toMatchObject({
      bg: 'bg-[#fee2e2]',
      text: 'text-[#dc2626]',
    })
  })

  it('cada opción trae clases literales', () => {
    for (const meta of [STATUS_META, FORMATO_META]) {
      for (const m of Object.values(meta)) {
        expect(m.bg).toMatch(/^bg-\[#/)
        expect(m.dot).toMatch(/^bg-\[#/)
      }
    }
    for (const f of FORMATOS) expect(FORMATO_META[f].label).toBe(FORMATO_LABELS[f])
  })
})

describe('isDone', () => {
  it('solo «Aprobado» cuenta como terminado; sin estado y N/A no', () => {
    expect(isDone('aprobado')).toBe(true)
    expect(isDone('enviado_cliente')).toBe(false)
    expect(isDone('pendiente_cliente')).toBe(false)
    expect(isDone(NA_STATUS)).toBe(false)
    expect(isDone(null)).toBe(false)
  })
})

describe('slotsOf', () => {
  it('tolera una temporada sin slots o mal formada', () => {
    expect(slotsOf(null)).toEqual([])
    expect(slotsOf({ slots: null })).toEqual([])
    expect(slotsOf({ slots: [POST] })).toEqual([POST])
  })
})

describe('statusFieldsFor / countedStatuses', () => {
  it('una fecha usa Diseño y Audiovisual; una tarjeta solo Diseño', () => {
    expect(statusFieldsFor(POST)).toEqual(['diseno_status', 'audiovisual_status'])
    expect(statusFieldsFor(TARJETA)).toEqual(['diseno_status'])
  })

  it('cuenta las columnas con valor y deja fuera N/A y los blancos', () => {
    const r = row({ diseno_status: 'aprobado', audiovisual_status: NA_STATUS })
    expect(countedStatuses(r, POST)).toEqual(['aprobado'])
    expect(countedStatuses(row(), POST)).toEqual([])
    expect(countedStatuses(null, POST)).toEqual([])
  })

  it('en una tarjeta ignora audiovisual aunque tenga valor', () => {
    const r = row({ slot_key: TARJETA.key, audiovisual_status: 'aprobado' })
    expect(countedStatuses(r, TARJETA)).toEqual([])
  })
})

describe('indexRows / rowFor', () => {
  it('indexa por cliente y slot', () => {
    const index = indexRows([row(), row({ client_id: 'c2', formato: 'ia' })])
    expect(rowFor(index, 'c1', POST.key)).toMatchObject({ client_id: 'c1' })
    expect(rowFor(index, 'c2', POST.key).formato).toBe('ia')
    expect(rowFor(index, 'c3', POST.key)).toBeNull()
  })
})

describe('filtros por cuenta', () => {
  const slots = [POST, TARJETA]
  const rows = [
    row({ client_id: 'c1', diseno_status: 'aprobado', audiovisual_status: NA_STATUS }),
    row({ client_id: 'c2', diseno_status: 'aprobado', audiovisual_status: 'enviado_cliente' }),
    row({ client_id: 'c3', slot_key: TARJETA.key, diseno_status: 'pendiente_redes' }),
  ]

  it('«pendientes»: alguna pieza sin aprobar; N/A no cuenta', () => {
    expect(clientHasPending(rows, slots, 'c1')).toBe(false)
    expect(clientHasPending(rows, slots, 'c2')).toBe(true)
    expect(
      clientsWithPending([{ id: 'c1' }, { id: 'c2' }, { id: 'c3' }], rows, slots).map((c) => c.id),
    ).toEqual(['c2', 'c3'])
  })

  it('por estado: busca en las columnas del slot, incluido N/A', () => {
    expect(clientHasStatus(rows, slots, 'c1', NA_STATUS)).toBe(true)
    expect(clientHasStatus(rows, slots, 'c2', 'enviado_cliente')).toBe(true)
    expect(clientHasStatus(rows, slots, 'c2', 'pendiente_redes')).toBe(false)
    expect(clientHasStatus(rows, slots, 'c3', 'pendiente_redes')).toBe(true)
  })

  it('ignora filas de slots que ya no existen en la temporada', () => {
    const huerfana = [row({ client_id: 'c9', slot_key: 'viejo', diseno_status: 'pendiente_redes' })]
    expect(clientHasPending(huerfana, slots, 'c9')).toBe(false)
  })
})

describe('computeTemporadaSummary', () => {
  const slots = [POST, TARJETA]

  it('sin piezas el porcentaje es null, no 0%', () => {
    const s = computeTemporadaSummary([{ id: 'c1' }], [], slots)
    expect(s.totalPiezas).toBe(0)
    expect(s.pctAprobado).toBeNull()
    expect(s.bySlot.every((x) => x.pct === null)).toBe(true)
  })

  it('cuenta cada columna con estado como una pieza, sin N/A, solo de las cuentas en alcance', () => {
    const rows = [
      row({ client_id: 'c1', diseno_status: 'aprobado', audiovisual_status: 'enviado_cliente' }),
      row({ client_id: 'c1', slot_key: TARJETA.key, diseno_status: 'aprobado' }),
      row({ client_id: 'c1', slot_key: 'otra', diseno_status: NA_STATUS }),
      row({ client_id: 'otra-linea', diseno_status: 'aprobado' }),
    ]
    const s = computeTemporadaSummary([{ id: 'c1' }], rows, slots)
    expect(s.totalPiezas).toBe(3)
    expect(s.terminadas).toBe(2)
    expect(s.pendientes).toBe(1)
    expect(s.pctAprobado).toBe(67)
    expect(s.bySlot).toEqual([
      { key: POST.key, label: '24/12', total: 2, done: 1, pct: 50 },
      { key: TARJETA.key, label: 'Tarjeta navidad', total: 1, done: 1, pct: 100 },
    ])
  })
})

describe('personal asignado', () => {
  const client = { id: 'c1', social_manager_id: 'u-sm' }
  const line = { id: 'l1', lead_user_id: 'u-jefe' }

  it('hay 2 casillas con nombre, como la hoja: jefe y SM', () => {
    expect(ASSIGNMENT_ROLES).toEqual(['jefe', 'sm'])
  })

  it('el valor de MAPPI sale de la línea (jefe) y del cliente (SM)', () => {
    expect(mappiAssignee('jefe', client, line)).toBe('u-jefe')
    expect(mappiAssignee('sm', client, line)).toBe('u-sm')
  })

  it('tolera línea o cliente sin esos datos', () => {
    expect(mappiAssignee('jefe', client, undefined)).toBeNull()
    expect(mappiAssignee('sm', { id: 'c2' }, line)).toBeNull()
    expect(mappiAssignee('disenador', client, line)).toBeNull()
  })

  it('sin asignación manual usa MAPPI', () => {
    const r = resolveAssignee(indexAssignments([]), 'sm', client, line)
    expect(r).toEqual({ userId: 'u-sm', overridden: false, mappiUserId: 'u-sm' })
  })

  it('con asignación manual manda ella, y «sin asignar» (null) también', () => {
    const index = indexAssignments([
      { client_id: 'c1', role: 'sm', user_id: 'u-otro' },
      { client_id: 'c1', role: 'jefe', user_id: null },
      { client_id: 'c9', role: 'sm', user_id: 'u-x' },
    ])
    expect(resolveAssignee(index, 'sm', client, line)).toEqual({
      userId: 'u-otro',
      overridden: true,
      mappiUserId: 'u-sm',
    })
    expect(resolveAssignee(index, 'jefe', client, line).userId).toBeNull()
    expect(resolveAssignee(index, 'jefe', client, line).overridden).toBe(true)
    // La asignación de otro cliente no se mezcla.
    expect(resolveAssignee(index, 'sm', { id: 'c9' }, line).userId).toBe('u-x')
    expect(resolveAssignee(index, 'sm', { id: 'c3', social_manager_id: 'u-m3' }, line).userId).toBe(
      'u-m3',
    )
  })
})

describe('allowedAssignees: solo las personas del desplegable de la hoja', () => {
  const users = [
    { user_id: '1', first_name: 'Sabrina', last_name: 'B' },
    { user_id: '2', first_name: 'Jesús ', last_name: 'G' },
    { user_id: '3', first_name: 'Maria Fernanda', last_name: 'G' },
    { user_id: '4', first_name: 'Pedro', last_name: 'P' },
    { user_id: '5', first_name: 'Katherine', last_name: 'M', deleted_at: '2026-01-01' },
    { user_id: '6', first_name: 'Maria', last_name: 'Altuve' },
  ]
  const ids = (list) => list.map((u) => u.user_id)

  it('empareja por nombre de pila sin tildes ni espacios, y excluye archivados', () => {
    expect(ids(allowedAssignees('jefe', users))).toEqual(['1', '2'])
  })

  it('cada casilla tiene su propia lista (SM incluye a Maria Fernanda)', () => {
    expect(ids(allowedAssignees('sm', users))).toEqual(['1', '2', '3'])
  })

  it('no empareja nombres parciales', () => {
    expect(ids(allowedAssignees('sm', users))).not.toContain('6')
  })

  it('conserva a la persona ya asignada aunque esté fuera de la lista o archivada', () => {
    expect(ids(allowedAssignees('jefe', users, '4'))).toContain('4')
    expect(ids(allowedAssignees('jefe', users, '5'))).toContain('5')
  })

  it('un rol desconocido no ofrece a nadie', () => {
    expect(allowedAssignees('otro', users)).toEqual([])
  })
})
