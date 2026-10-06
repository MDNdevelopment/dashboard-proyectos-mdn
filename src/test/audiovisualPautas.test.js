// Helpers puros del módulo Pautas rediseñado (estudio, lotes por formato, permisos por
// pauta, lista, reagendamientos, rankings y pendientes). Los helpers previos siguen
// cubiertos en audiovisual.test.js.
import { describe, it, expect } from 'vitest'
import {
  STUDIO_WINDOW_HOURS,
  lugarLabel,
  studioWindow,
  estudioConflicts,
  estudioSlotsForDay,
  syncSalieronFromGrabacion,
  lotesMatrix,
  loteFor,
  planLoteChange,
  isLegacyPiezas,
  legacyEditorSummary,
  editorRemovable,
  pautaPermissions,
  pendingApprovalCount,
  pautaMatchesList,
  pautaMatchesQuery,
  sortForList,
  reagendamientosOf,
  formatReagendamiento,
  rankingFotos,
  rankingVideos,
  pendientesPorEditar,
  pautaMatchesPendiente,
  briefComplete,
  pautaErrorMessage,
  aggregateResourcePerformance,
} from '../utils/audiovisual'

const users = new Map([
  ['u1', { user_id: 'u1', first_name: 'Ana', last_name: 'Pérez' }],
  ['u2', { user_id: 'u2', first_name: 'Luis', last_name: 'Gómez' }],
])

function pauta(o = {}) {
  return {
    id: 'p1',
    client_id: 'c1',
    client_name: 'Cliente',
    line_id: 'l1',
    status: 'programada',
    lugar_tipo: 'estudio',
    place: '',
    pauta_date: '2026-10-10',
    salida: '13:00:00',
    llegada: null,
    formats: ['V', 'R', 'F'],
    recurso_ids: [],
    created_by: 'u1',
    deleted_at: null,
    submitted: true,
    piezas_totales: 0,
    piezas_editadas: 0,
    piezas_por_formato: {},
    grabacion_por_formato: {},
    reagendamientos: [],
    ...o,
  }
}

function lote(o = {}) {
  return {
    id: 'z1',
    pauta_id: 'p1',
    editor_user_id: 'u1',
    formato: 'R',
    es_lote: true,
    cantidad: 4,
    listas: 1,
    status: 'en_edicion',
    ...o,
  }
}

describe('estudio', () => {
  it('lugarLabel distingue estudio, locación y por definir', () => {
    expect(lugarLabel(pauta())).toBe('Estudio MDN')
    expect(lugarLabel(pauta({ lugar_tipo: 'locacion', place: 'Playa' }))).toBe('Playa')
    expect(lugarLabel(pauta({ lugar_tipo: 'locacion', place: '' }))).toBe('Por definir')
  })

  it('studioWindow ocupa 2h y se topa a 24:00', () => {
    expect(STUDIO_WINDOW_HOURS).toBe(2)
    expect(studioWindow('13:00:00')).toEqual({ start: '13:00', end: '15:00' })
    expect(studioWindow('23:30')).toEqual({ start: '23:30', end: '24:00' })
    expect(studioWindow(null)).toBeNull()
  })

  const existing = pauta({ id: 'x', salida: '13:00:00', status: 'programada', client_id: 'otro' })

  it('13:00 vs 15:00 no choca; 13:00 vs 14:59 choca; 11:00 vs 13:00 no choca', () => {
    const base = { date: '2026-10-10', clientId: 'c1' }
    expect(estudioConflicts([existing], { ...base, salida: '15:00' }).blocking).toHaveLength(0)
    expect(estudioConflicts([existing], { ...base, salida: '14:59' }).blocking).toHaveLength(1)
    expect(estudioConflicts([existing], { ...base, salida: '11:00' }).blocking).toHaveLength(0)
    expect(estudioConflicts([existing], { ...base, salida: '11:01' }).blocking).toHaveLength(1)
  })

  it('el mismo cliente puede solaparse', () => {
    const r = estudioConflicts([existing], {
      date: '2026-10-10',
      salida: '13:30',
      clientId: 'otro',
    })
    expect(r.blocking).toHaveLength(0)
    expect(r.warnings).toHaveLength(0)
  })

  it('ignora declinadas, borradas, locaciones, otros días y la propia pauta', () => {
    const c = { date: '2026-10-10', salida: '13:30', clientId: 'c1' }
    expect(estudioConflicts([{ ...existing, status: 'declinada' }], c).blocking).toHaveLength(0)
    expect(estudioConflicts([{ ...existing, deleted_at: 'x' }], c).blocking).toHaveLength(0)
    expect(estudioConflicts([{ ...existing, lugar_tipo: 'locacion' }], c).blocking).toHaveLength(0)
    expect(estudioConflicts([{ ...existing, pauta_date: '2026-10-11' }], c).blocking).toHaveLength(
      0,
    )
    expect(estudioConflicts([existing], { ...c, excludeId: 'x' }).blocking).toHaveLength(0)
  })

  it('una solicitud en ese horario solo avisa; una confirmada sin hora también avisa', () => {
    const c = { date: '2026-10-10', salida: '13:30', clientId: 'c1' }
    const sol = estudioConflicts([{ ...existing, status: 'solicitada' }], c)
    expect(sol.blocking).toHaveLength(0)
    expect(sol.warnings).toEqual([
      { kind: 'solicitada', pauta: expect.objectContaining({ id: 'x' }) },
    ])
    const sinHora = estudioConflicts([{ ...existing, salida: null }], c)
    expect(sinHora.blocking).toHaveLength(0)
    expect(sinHora.warnings[0].kind).toBe('sin_hora')
  })

  it('sin fecha no hay conflictos; sin hora propia solo avisa de confirmadas', () => {
    expect(estudioConflicts([existing], { date: null, salida: '13:00' }).blocking).toHaveLength(0)
    const r = estudioConflicts([existing], { date: '2026-10-10', salida: null, clientId: 'c1' })
    expect(r.blocking).toHaveLength(0)
    expect(r.warnings[0].kind).toBe('sin_hora')
  })

  it('estudioSlotsForDay ordena por hora e incluye solicitadas', () => {
    const slots = estudioSlotsForDay(
      [
        pauta({ id: 'a', salida: '15:00' }),
        pauta({ id: 'b', salida: '09:00', status: 'solicitada' }),
        pauta({ id: 'c', lugar_tipo: 'locacion' }),
      ],
      '2026-10-10',
    )
    expect(slots.map((s) => s.pauta.id)).toEqual(['b', 'a'])
    expect(slots[0]).toMatchObject({ start: '09:00', end: '11:00', status: 'solicitada' })
  })
})

describe('syncSalieronFromGrabacion', () => {
  it('salieron = suma de lo capturado por recurso, conservando editadas', () => {
    const p = pauta({
      formats: ['V', 'F'],
      piezas_por_formato: { V: { salieron: 1, editadas: 1 }, F: { salieron: 0, editadas: 0 } },
    })
    const next = syncSalieronFromGrabacion(p, { V: { u1: 3, u2: 2 }, F: { u1: 10 } })
    expect(next).toEqual({ V: { salieron: 5, editadas: 1 }, F: { salieron: 10, editadas: 0 } })
  })

  it('un formato sin captura queda en 0 y los no activos no aparecen', () => {
    const next = syncSalieronFromGrabacion(pauta({ formats: ['R'] }), { V: { u1: 3 } })
    expect(next).toEqual({ R: { salieron: 0, editadas: 0 } })
  })
})

describe('lotes por editor × formato', () => {
  it('lotesMatrix agrupa por editor y formato, con huérfanos en null', () => {
    const piezas = [
      lote({ id: 'a', editor_user_id: 'u1', formato: 'R' }),
      lote({ id: 'b', editor_user_id: 'u1', formato: 'V' }),
      lote({ id: 'c', editor_user_id: null, formato: 'F' }),
      { id: 'd', es_lote: false, editor_user_id: 'u2', formato: 'V', status: 'listo' },
    ]
    const { editorIds, byEditor } = lotesMatrix(piezas)
    expect(editorIds).toEqual(['u1', null])
    expect(byEditor.get('u1').R.id).toBe('a')
    expect(byEditor.get('u1').V.id).toBe('b')
    expect(byEditor.get(null).F.id).toBe('c')
    expect(loteFor(piezas, 'u1', 'V').id).toBe('b')
    expect(loteFor(piezas, 'u2', 'V')).toBeNull()
    expect(loteFor(piezas, null, 'F').id).toBe('c')
  })

  it('planLoteChange inserta en el primer +, respeta el cupo y borra al llegar a 0', () => {
    expect(planLoteChange({ lote: null, key: 'cantidad', delta: 3, max: 10 })).toEqual({
      action: 'insert',
      fields: { cantidad: 3, listas: 0 },
      applied: 3,
    })
    expect(planLoteChange({ lote: null, key: 'cantidad', delta: 5, max: 2 })).toMatchObject({
      action: 'insert',
      fields: { cantidad: 2, listas: 0 },
      applied: 2,
    })
    expect(planLoteChange({ lote: null, key: 'cantidad', delta: 1, max: 0 }).action).toBe('noop')
    const l = lote({ cantidad: 4, listas: 0 })
    expect(planLoteChange({ lote: l, key: 'cantidad', delta: -4, max: 10 })).toMatchObject({
      action: 'delete',
      applied: -4,
    })
    expect(planLoteChange({ lote: l, key: 'cantidad', delta: -10, max: 10 }).action).toBe('delete')
    expect(planLoteChange({ lote: l, key: 'cantidad', delta: 2, max: 1 })).toMatchObject({
      action: 'update',
      fields: { cantidad: 5 },
      applied: 1,
    })
  })

  it('planLoteChange nunca baja cantidad por debajo de listas ni listas fuera de [0, cantidad]', () => {
    const l = lote({ cantidad: 4, listas: 3 })
    expect(planLoteChange({ lote: l, key: 'cantidad', delta: -4 })).toMatchObject({
      action: 'update',
      fields: { cantidad: 3 },
      applied: -1,
    })
    expect(planLoteChange({ lote: l, key: 'listas', delta: 5 })).toMatchObject({
      fields: { listas: 4 },
      applied: 1,
    })
    expect(planLoteChange({ lote: l, key: 'listas', delta: -9 })).toMatchObject({
      fields: { listas: 0 },
      applied: -3,
    })
    expect(planLoteChange({ lote: l, key: 'listas', delta: 0 }).action).toBe('noop')
    expect(planLoteChange({ lote: null, key: 'listas', delta: 1 }).action).toBe('noop')
  })

  it('isLegacyPiezas / legacyEditorSummary leen filas sueltas y lotes por igual', () => {
    const piezas = [
      { id: 'a', es_lote: false, editor_user_id: 'u1', formato: 'V', status: 'listo' },
      { id: 'b', es_lote: false, editor_user_id: 'u1', formato: 'V', status: 'pendiente' },
      { id: 'c', es_lote: false, editor_user_id: 'u1', formato: 'V', status: 'cancelado' },
      lote({ id: 'd', editor_user_id: 'u2', formato: 'F', cantidad: 10, listas: 4 }),
      { id: 'e', es_lote: false, editor_user_id: null, formato: null, status: 'listo' },
    ]
    expect(isLegacyPiezas(piezas)).toBe(true)
    expect(isLegacyPiezas([lote()])).toBe(false)
    expect(isLegacyPiezas([])).toBe(false)
    expect(legacyEditorSummary(piezas, users)).toEqual([
      { editorId: 'u1', name: 'Ana Pérez', formato: 'V', unidades: 2, listas: 1 },
      { editorId: 'u2', name: 'Luis Gómez', formato: 'F', unidades: 10, listas: 4 },
      { editorId: null, name: 'Sin asignar', formato: null, unidades: 1, listas: 1 },
    ])
  })

  it('editorRemovable solo si ningún lote tiene entregas', () => {
    expect(editorRemovable([lote({ listas: 0 }), lote({ listas: 0 })])).toBe(true)
    expect(editorRemovable([lote({ listas: 0 }), lote({ listas: 1 })])).toBe(false)
    expect(editorRemovable([])).toBe(true)
  })
})

describe('pautaPermissions', () => {
  const sol = pauta({ status: 'solicitada' })
  const prog = pauta({ status: 'programada', recurso_ids: ['u2'] })

  it('coordina puede todo lo de agenda', () => {
    const p = pautaPermissions({ canCoordinate: true, pauta: sol, userId: 'x' })
    expect(p).toMatchObject({
      canEditBrief: true,
      canApprove: true,
      canDelete: true,
      canReagendar: false,
    })
    const q = pautaPermissions({ canCoordinate: true, pauta: prog, userId: 'x' })
    expect(q).toMatchObject({ canReagendar: true, canMarkRealizada: true, canEditPiezas: true })
  })

  it('la solicitante edita y borra su solicitud mientras siga solicitada', () => {
    const p = pautaPermissions({ canManage: true, userId: 'u1', pauta: sol })
    expect(p).toMatchObject({ canEditBrief: true, canDelete: true, canApprove: false })
    const q = pautaPermissions({ canManage: true, userId: 'u1', pauta: prog })
    expect(q).toMatchObject({ canEditBrief: false, canDelete: false, canEditPiezas: false })
    const r = pautaPermissions({ canManage: true, userId: 'u9', pauta: sol })
    expect(r.canEditBrief).toBe(false)
  })

  it('la jefa de la línea edita el brief y las piezas de su línea, no reagenda', () => {
    const p = pautaPermissions({ userId: 'u9', pauta: prog, leadLineIds: ['l1'] })
    expect(p).toMatchObject({
      canEditBrief: true,
      canEditPiezas: true,
      canReagendar: false,
      canApprove: false,
    })
    const q = pautaPermissions({ userId: 'u9', pauta: prog, leadLineIds: ['l2'] })
    expect(q).toMatchObject({ canEditBrief: false, canEditPiezas: false })
  })

  it('el recurso asignado solo carga piezas; gestión puede reagendar', () => {
    expect(pautaPermissions({ userId: 'u2', pauta: prog })).toMatchObject({
      canEditPiezas: true,
      canEditBrief: false,
      canReagendar: false,
    })
    expect(pautaPermissions({ canGestionPautas: true, pauta: prog }).canReagendar).toBe(true)
  })

  it('en papelera solo coordina restaura; sin pauta todo falso', () => {
    const del = pauta({ deleted_at: 'x' })
    expect(pautaPermissions({ canCoordinate: true, pauta: del })).toMatchObject({
      canRestore: true,
      canEditBrief: false,
      canDelete: false,
    })
    expect(pautaPermissions({ userId: 'u1', pauta: del }).canRestore).toBe(false)
    const dec = pauta({ status: 'declinada' })
    expect(pautaPermissions({ canCoordinate: true, pauta: dec })).toMatchObject({
      canReopen: true,
      canApprove: false,
    })
    expect(pautaPermissions({ userId: 'u1', canManage: true, pauta: dec }).canReopen).toBe(false)
    expect(Object.values(pautaPermissions({ pauta: null })).every((v) => v === false)).toBe(true)
  })

  it('pendingApprovalCount cuenta solicitudes enviadas no borradas', () => {
    expect(
      pendingApprovalCount([
        pauta({ status: 'solicitada', submitted: true }),
        pauta({ status: 'solicitada', submitted: false }),
        pauta({ status: 'solicitada', submitted: true, deleted_at: 'x' }),
        pauta({ status: 'programada' }),
      ]),
    ).toBe(1)
  })
})

describe('vista Lista', () => {
  it('pautaMatchesList por estado y papelera', () => {
    expect(pautaMatchesList(pauta({ status: 'solicitada' }), 'solicitadas')).toBe(true)
    expect(pautaMatchesList(pauta({ status: 'programada' }), 'agendadas')).toBe(true)
    expect(pautaMatchesList(pauta({ status: 'realizada' }), 'realizadas')).toBe(true)
    expect(pautaMatchesList(pauta({ status: 'declinada' }), 'declinadas')).toBe(true)
    expect(pautaMatchesList(pauta({ status: 'programada', deleted_at: 'x' }), 'agendadas')).toBe(
      false,
    )
    expect(pautaMatchesList(pauta({ deleted_at: 'x' }), 'papelera')).toBe(true)
    expect(pautaMatchesList(pauta(), 'papelera')).toBe(false)
  })

  it('pautaMatchesQuery por recurso y texto', () => {
    const p = pauta({ client_name: 'Smashack', tema: 'Lanzamiento', recurso_ids: ['u2'] })
    expect(pautaMatchesQuery(p, { recursoId: 'u2', usersById: users })).toBe(true)
    expect(pautaMatchesQuery(p, { recursoId: 'u1', usersById: users })).toBe(false)
    expect(pautaMatchesQuery(p, { query: 'smash', usersById: users })).toBe(true)
    expect(pautaMatchesQuery(p, { query: 'lanza', usersById: users })).toBe(true)
    expect(pautaMatchesQuery(p, { query: 'luis', usersById: users })).toBe(true)
    expect(pautaMatchesQuery(p, { query: 'estudio', usersById: users })).toBe(true)
    expect(pautaMatchesQuery(p, { query: 'zzz', usersById: users })).toBe(false)
    expect(pautaMatchesQuery(p, {})).toBe(true)
  })

  it('sortForList: agenda ascendente, realizadas descendente', () => {
    const a = pauta({ id: 'a', pauta_date: '2026-10-01' })
    const b = pauta({ id: 'b', pauta_date: '2026-10-05' })
    expect(sortForList([b, a], 'agendadas').map((p) => p.id)).toEqual(['a', 'b'])
    expect(sortForList([a, b], 'realizadas').map((p) => p.id)).toEqual(['b', 'a'])
  })
})

describe('reagendamientos', () => {
  const entry = {
    from_date: '2026-10-12',
    from_salida: '10:00:00',
    to_date: '2026-10-15',
    to_salida: '11:00:00',
    at: '2026-10-05T14:00:00Z',
    by: 'u1',
  }

  it('reagendamientosOf normaliza y ordena del más reciente al más viejo', () => {
    const p = pauta({ reagendamientos: [{ ...entry, at: '2026-10-01T00:00:00Z' }, entry, null] })
    const list = reagendamientosOf(p)
    expect(list).toHaveLength(2)
    expect(list[0].at).toBe(entry.at)
    expect(reagendamientosOf(pauta({ reagendamientos: 'basura' }))).toEqual([])
  })

  it('formatReagendamiento arma el texto legible', () => {
    expect(formatReagendamiento(entry, users)).toBe(
      'Reagendada desde 12 oct 10:00 A.M. · por Ana Pérez · 5 oct',
    )
    expect(formatReagendamiento({ ...entry, from_salida: null, by: null, at: null }, users)).toBe(
      'Reagendada desde 12 oct',
    )
  })
})

describe('rankings', () => {
  const realizada = (o) => pauta({ status: 'realizada', ...o })
  const pautas = [
    realizada({
      id: 'p1',
      formats: ['V', 'R', 'F'],
      grabacion_por_formato: { V: { u1: 2 }, R: { u1: 3, u2: 1 }, F: { u2: 20 } },
    }),
  ]
  const piezas = new Map([
    [
      'p1',
      [
        lote({ id: 'a', editor_user_id: 'u1', formato: 'R', cantidad: 4, listas: 4 }),
        lote({ id: 'b', editor_user_id: 'u1', formato: 'V', cantidad: 2, listas: 1 }),
        lote({ id: 'c', editor_user_id: 'u2', formato: 'F', cantidad: 20, listas: 15 }),
      ],
    ],
  ])
  const cnp = [{ assignee_id: 'u2', status: 'Terminado', pieces: [{ done: true }, { done: true }] }]
  const perf = aggregateResourcePerformance(pautas, users, piezas, cnp)

  it('aggregateResourcePerformance expone el subtipo exacto (V/R) además del grupo', () => {
    const u1 = perf.find((r) => r.id === 'u1')
    expect(u1).toMatchObject({ grabaV: 2, grabaR: 3, grabaAv: 5, editaV: 1, editaR: 4, editaAv: 5 })
  })

  it('rankingFotos solo cuenta fotos', () => {
    expect(rankingFotos(perf)).toEqual([
      { id: 'u2', name: 'Luis Gómez', capturadas: 20, editadas: 15, estimado: false },
    ])
  })

  it('rankingVideos suma 4K + Reel y las piezas CNP van a editadas, no a fotos', () => {
    const videos = rankingVideos(perf)
    expect(videos[0]).toMatchObject({ id: 'u1', capturadas: 5, editadas: 5 })
    expect(videos[0].desglose).toMatchObject({
      video4k: { capturadas: 2, editadas: 1 },
      reel: { capturadas: 3, editadas: 4 },
      cnp: 0,
    })
    const u2 = videos.find((r) => r.id === 'u2')
    expect(u2).toMatchObject({ capturadas: 1, editadas: 2 })
    expect(u2.desglose.cnp).toBe(2)
  })

  it('las capturas sin desglose (legacy) cuentan como videos estimados', () => {
    const legacy = aggregateResourcePerformance(
      [realizada({ formats: [], recurso_ids: ['u1'], piezas_totales: 7 })],
      users,
      new Map(),
    )
    expect(rankingVideos(legacy)[0]).toMatchObject({ capturadas: 7, estimado: true })
    expect(rankingFotos(legacy)).toEqual([])
  })
})

describe('pendientesPorEditar', () => {
  const lines = [
    { id: 'l1', name: 'Línea 1' },
    { id: 'l2', name: 'Línea 2' },
  ]

  it('pendiente = salieron − listas por formato, agrupado por línea', () => {
    const pautas = [
      pauta({
        id: 'p1',
        line_id: 'l1',
        status: 'realizada',
        piezas_por_formato: { R: { salieron: 10, editadas: 4 }, F: { salieron: 5, editadas: 5 } },
      }),
      pauta({
        id: 'p2',
        line_id: 'l1',
        status: 'programada',
        piezas_por_formato: { V: { salieron: 3, editadas: 0 } },
      }),
    ]
    const piezas = new Map([
      [
        'p1',
        [
          lote({ formato: 'R', cantidad: 6, listas: 4 }),
          lote({ id: 'z2', formato: 'F', cantidad: 5, listas: 5 }),
        ],
      ],
    ])
    const { porLinea, porPauta } = pendientesPorEditar(pautas, piezas, lines)
    expect(porLinea).toEqual([
      { lineId: 'l1', name: 'Línea 1', V: 3, R: 6, F: 0, sinDesglose: 0, total: 9 },
    ])
    expect(porPauta.get('p1')).toEqual({ V: 0, R: 6, F: 0, sinDesglose: 0 })
    expect(porPauta.get('p2')).toEqual({ V: 3, R: 0, F: 0, sinDesglose: 0 })
  })

  it('lee filas sueltas viejas, ignora canceladas y nunca es negativo', () => {
    const p = pauta({
      id: 'p1',
      status: 'realizada',
      piezas_por_formato: { V: { salieron: 2, editadas: 2 } },
    })
    const piezas = new Map([
      [
        'p1',
        [
          { es_lote: false, formato: 'V', status: 'listo' },
          { es_lote: false, formato: 'V', status: 'listo' },
          { es_lote: false, formato: 'V', status: 'cancelado' },
          { es_lote: false, formato: 'V', status: 'listo' },
        ],
      ],
    ])
    const { porLinea } = pendientesPorEditar([p], piezas, lines)
    expect(porLinea).toEqual([])
  })

  it('sin desglose usa piezas_totales − piezas_editadas; excluye solicitadas, declinadas y borradas; línea general', () => {
    const pautas = [
      pauta({ id: 'a', line_id: null, status: 'realizada', piezas_totales: 8, piezas_editadas: 3 }),
      pauta({
        id: 'b',
        status: 'solicitada',
        piezas_por_formato: { V: { salieron: 5, editadas: 0 } },
      }),
      pauta({
        id: 'c',
        status: 'declinada',
        piezas_por_formato: { V: { salieron: 5, editadas: 0 } },
      }),
      pauta({ id: 'd', deleted_at: 'x', piezas_por_formato: { V: { salieron: 5, editadas: 0 } } }),
    ]
    const { porLinea } = pendientesPorEditar(
      pautas,
      new Map(),
      [...lines, { id: 'g', name: 'Independientes' }],
      'g',
    )
    expect(porLinea).toEqual([
      { lineId: 'g', name: 'Independientes', V: 0, R: 0, F: 0, sinDesglose: 5, total: 5 },
    ])
  })

  it('pautaMatchesPendiente filtra por línea y formato', () => {
    const porPauta = new Map([['p1', { V: 0, R: 6, F: 0, sinDesglose: 0 }]])
    const p = pauta({ id: 'p1', line_id: 'l1' })
    expect(pautaMatchesPendiente(p, porPauta, { lineId: 'l1', formato: 'R' })).toBe(true)
    expect(pautaMatchesPendiente(p, porPauta, { lineId: 'l1', formato: 'V' })).toBe(false)
    expect(pautaMatchesPendiente(p, porPauta, { lineId: 'l2', formato: 'R' })).toBe(false)
    expect(pautaMatchesPendiente(p, porPauta, { lineId: null, formato: null })).toBe(true)
    expect(pautaMatchesPendiente(pauta({ id: 'zz' }), porPauta, {})).toBe(false)
    expect(
      pautaMatchesPendiente(pauta({ id: 'p1', line_id: null }), porPauta, { lineId: 'g' }, 'g'),
    ).toBe(true)
  })
})

describe('briefComplete / pautaErrorMessage (rediseño)', () => {
  it('el tema basta para completar el brief', () => {
    expect(briefComplete({ client_id: 'c1', tema: 'Lanzamiento' })).toBe(true)
    expect(briefComplete({ client_id: 'c1', tema: '  ' })).toBe(false)
    expect(briefComplete({ client_id: null, tema: 'x' })).toBe(false)
  })

  it('traduce el choque de estudio y el lote duplicado', () => {
    expect(
      pautaErrorMessage({
        code: '23P01',
        message: 'conflicting key value violates exclusion constraint',
      }),
    ).toMatch(/estudio ya está ocupado/)
    expect(
      pautaErrorMessage({
        code: '23505',
        message:
          'duplicate key value violates unique constraint "av_pauta_piezas_lote_unico_por_editor_formato"',
      }),
    ).toMatch(/ya tiene ese formato/)
    expect(pautaErrorMessage({ code: '23505', message: 'otra cosa' })).toMatch(/No se pudo guardar/)
  })
})
