// Helpers de la experiencia por rol: Semana + alertas, huecos sugeridos, Mi trabajo y
// resumen del mes (ver plan "Pautas v3").
import { describe, it, expect } from 'vitest'
import {
  weekRange,
  pautasInWeek,
  groupByDay,
  pautaEstadoResumen,
  alertas,
  resumenPendientesAtrasados,
  ocupacionEstudio,
  ocupacionEstudioMes,
  cargaRecursos,
  diasHabiles,
  sugerirHuecos,
  misSolicitudes,
  hitosPauta,
  miTrabajo,
  disponiblesParaTomar,
  resumenMes,
  pautasPorSemanaPersona,
  isoDateKey,
} from '../utils/audiovisual'

const users = new Map([
  ['u1', { user_id: 'u1', first_name: 'Rafa', last_name: 'Cam' }],
  ['u2', { user_id: 'u2', first_name: 'Sol', last_name: 'Luz' }],
])

function pauta(o = {}) {
  return {
    id: 'p1',
    client_id: 'c1',
    client_name: 'Cliente',
    line_id: 'l1',
    status: 'programada',
    lugar_tipo: 'locacion',
    pauta_date: '2026-10-07',
    salida: '09:00:00',
    llegada: null,
    formats: ['R'],
    recurso_ids: ['u1'],
    created_by: 'j1',
    created_at: '2026-10-01T10:00:00Z',
    submitted: true,
    deleted_at: null,
    grabacion_por_formato: {},
    piezas_por_formato: {},
    grilla_delivered_at: null,
    ...o,
  }
}
const lote = (o = {}) => ({
  id: 'z1',
  pauta_id: 'p1',
  editor_user_id: 'u1',
  formato: 'R',
  es_lote: true,
  cantidad: 10,
  listas: 4,
  status: 'en_edicion',
  ...o,
})

describe('semana', () => {
  it('weekRange: lunes a sábado de la semana que contiene la fecha', () => {
    expect(weekRange('2026-10-07')).toEqual({
      start: '2026-10-05',
      end: '2026-10-10',
      days: ['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09', '2026-10-10'],
    })
    expect(weekRange('2026-10-11').start).toBe('2026-10-05') // domingo cae en la misma semana
    expect(weekRange(new Date(2026, 9, 5)).start).toBe('2026-10-05')
  })

  it('pautasInWeek y groupByDay ignoran borradas, declinadas y sin fecha', () => {
    const range = weekRange('2026-10-07')
    const list = [
      pauta({ id: 'a', pauta_date: '2026-10-05', salida: '13:00' }),
      pauta({ id: 'b', pauta_date: '2026-10-05', salida: '09:00', status: 'solicitada' }),
      pauta({ id: 'c', pauta_date: '2026-10-12' }),
      pauta({ id: 'd', pauta_date: '2026-10-06', deleted_at: 'x' }),
      pauta({ id: 'e', pauta_date: '2026-10-06', status: 'declinada' }),
      pauta({ id: 'f', pauta_date: null }),
    ]
    const semana = pautasInWeek(list, range)
    expect(semana.map((p) => p.id)).toEqual(['a', 'b'])
    const byDay = groupByDay(semana)
    expect(byDay.get('2026-10-05').map((p) => p.id)).toEqual(['b', 'a'])
  })

  it('pautaEstadoResumen recorre los cinco estados', () => {
    expect(pautaEstadoResumen(pauta({ status: 'solicitada' }), []).kind).toBe('aprobar')
    expect(pautaEstadoResumen(pauta(), []).kind).toBe('sin_captura')
    const con = pauta({ piezas_por_formato: { R: { salieron: 10, editadas: 0 } } })
    expect(pautaEstadoResumen(con, [])).toMatchObject({
      kind: 'capturada',
      pct: 0,
      label: '10 capturadas',
    })
    expect(pautaEstadoResumen(con, [lote()])).toMatchObject({
      kind: 'editando',
      pct: 40,
      label: '4/10 editadas',
    })
    expect(pautaEstadoResumen(con, [lote({ listas: 10 })])).toMatchObject({
      kind: 'lista',
      pct: 100,
    })
    expect(pautaEstadoResumen(con, [lote({ listas: 10, status: 'cancelado' })]).kind).toBe(
      'capturada',
    )
  })
})

describe('alertas', () => {
  const hoy = '2026-10-08'
  it('clasifica por aprobar, sin captura, grilla incumplida y piezas atrasadas', () => {
    const list = [
      pauta({ id: 'sol', status: 'solicitada' }),
      pauta({ id: 'noenv', status: 'solicitada', submitted: false }),
      pauta({ id: 'ayer', pauta_date: '2026-10-07' }), // programada, pasó, sin captura
      pauta({ id: 'hoy', pauta_date: '2026-10-08', link: 'https://drive/x' }), // hoy aún no cuenta
      pauta({
        id: 'ok',
        pauta_date: '2026-10-06',
        status: 'realizada',
        piezas_por_formato: { R: { salieron: 3, editadas: 0 } },
      }),
      pauta({ id: 'grilla', pauta_date: '2026-10-09' }), // vence 10-07 sin entrega → incumple
      pauta({ id: 'grillaok', pauta_date: '2026-10-09', grilla_delivered_at: '2026-10-01' }),
      pauta({
        id: 'atras',
        status: 'realizada',
        pauta_date: '2026-09-25',
        piezas_por_formato: { R: { salieron: 5, editadas: 2 } },
      }),
      pauta({
        id: 'reciente',
        status: 'realizada',
        pauta_date: '2026-10-05',
        piezas_por_formato: { R: { salieron: 5, editadas: 0 } },
      }),
      pauta({ id: 'borrada', status: 'solicitada', deleted_at: 'x' }),
    ]
    const piezas = new Map([['atras', [lote({ pauta_id: 'atras', cantidad: 5, listas: 2 })]]])
    const a = alertas(list, piezas, hoy)
    expect(a.porAprobar.map((p) => p.id)).toEqual(['sol'])
    expect(a.sinCaptura.map((p) => p.id)).toEqual(['ayer'])
    expect(a.grillaIncumple.map((p) => p.id)).toEqual(['grilla'])
    expect(a.piezasAtrasadas.map((p) => p.id)).toEqual(['atras'])
    expect(a.total).toBe(4)
  })

  it('cnpPendientes: solo CNP audiovisuales abiertos, por entrega y sumados al total', () => {
    const cnp = (o) => ({ id: 'x', is_audiovisual: true, status: 'Pendiente', ...o })
    const cnps = [
      cnp({ id: 'sin-fecha' }),
      cnp({ id: 'tarde', due_date: '2026-10-20', status: 'En proceso' }),
      cnp({ id: 'pronto', due_date: '2026-10-09', status: 'Paralizado' }),
      cnp({ id: 'terminado', status: 'Terminado' }),
      cnp({ id: 'borrado', deleted_at: 'x' }),
      cnp({ id: 'diseno', is_audiovisual: false }),
    ]
    const a = alertas([pauta({ status: 'solicitada' })], new Map(), hoy, { cnps })
    expect(a.cnpPendientes.map((c) => c.id)).toEqual(['pronto', 'tarde', 'sin-fecha'])
    expect(a.total).toBe(1 + 3)
    expect(alertas([], new Map(), hoy).cnpPendientes).toEqual([])
  })

  it('acepta Date como hoy', () => {
    const a = alertas([pauta({ status: 'solicitada' })], new Map(), new Date(2026, 9, 8))
    expect(a.porAprobar).toHaveLength(1)
  })
})

describe('resumenPendientesAtrasados', () => {
  const cnp = (o) => ({ id: 'n', is_audiovisual: true, status: 'Pendiente', pieces: [], ...o })

  it('suma pendientes por formato y por cliente; los CNP van aparte y solo cuentan clientes con algo', () => {
    const pautas = [
      pauta({
        id: 'a',
        client_id: 'c1',
        client_name: 'Smashack',
        status: 'realizada',
        formats: ['V', 'R', 'F'],
        piezas_por_formato: {
          V: { salieron: 2, editadas: 0 },
          R: { salieron: 5, editadas: 0 },
          F: { salieron: 10, editadas: 0 },
        },
      }),
      pauta({
        id: 'b',
        client_id: 'c2',
        client_name: 'Push',
        status: 'realizada',
        formats: ['R'],
        piezas_por_formato: { R: { salieron: 3, editadas: 0 } },
      }),
    ]
    const piezas = new Map([
      ['a', [lote({ pauta_id: 'a', formato: 'R', cantidad: 5, listas: 2 })]],
      ['b', [lote({ id: 'z2', pauta_id: 'b', formato: 'R', cantidad: 3, listas: 3 })]],
    ])
    const cnps = [
      cnp({
        id: 'n1',
        client_id: 'c2',
        client_ids: ['c2'],
        pieces: [{ done: true }, { done: false }],
      }),
      cnp({ id: 'n2', client_id: 'c1', client_ids: ['c1', 'c2'] }),
    ]
    const clientsById = new Map([
      ['c1', { id: 'c1', name: 'Smashack' }],
      ['c2', { id: 'c2', name: 'Push' }],
    ])
    const r = resumenPendientesAtrasados(pautas, piezas, cnps, clientsById)
    expect(r.porFormato).toMatchObject({ V: 2, R: 3, F: 10, cnp: 2, total: 17 })
    // Smashack: 2 V + 3 R + 10 F + 1 CNP (n2, primera marca). Push: 0 de pauta + 1 CNP.
    expect(r.porCliente.map((c) => [c.name, c.total])).toEqual([
      ['Smashack', 16],
      ['Push', 1],
    ])
  })

  it('un CNP terminado o sin pendientes no aporta; sin nada devuelve totales en 0', () => {
    const r = resumenPendientesAtrasados([], new Map(), [cnp({ status: 'Terminado' })], new Map())
    expect(r.porFormato.total).toBe(0)
    expect(r.porCliente).toEqual([])
  })
})

describe('ocupación del estudio y carga de recursos', () => {
  const estudio = (o) => pauta({ lugar_tipo: 'estudio', ...o })

  it('ocupacionEstudio: 5 bloques de 2h; una pauta a las 09:00 ocupa 08–10 y 10–12', () => {
    const r = ocupacionEstudio([estudio({ salida: '09:00:00' })], '2026-10-07')
    expect(r.bloques).toHaveLength(5)
    expect(r.bloques.map((b) => Boolean(b.pauta))).toEqual([true, true, false, false, false])
    expect(r).toMatchObject({ ocupados: 2, pct: 40 })
  })

  it('las solicitadas no ocupan; las locaciones tampoco', () => {
    const r = ocupacionEstudio(
      [estudio({ status: 'solicitada' }), pauta({ lugar_tipo: 'locacion', salida: '14:00' })],
      '2026-10-07',
    )
    expect(r.ocupados).toBe(0)
  })

  it('ocupacionEstudioMes promedia los días hábiles', () => {
    // octubre 2026: 27 días hábiles (lun–sáb) × 5 bloques = 135; una pauta ocupa 2 → 1%
    expect(ocupacionEstudioMes([estudio({ salida: '09:00:00' })], 2026, 10)).toBe(1)
    expect(ocupacionEstudioMes([], 2026, 10)).toBe(0)
  })

  it('cargaRecursos cuenta pautas confirmadas por recurso y marca sobrecarga diaria', () => {
    const range = weekRange('2026-10-07')
    const list = [
      pauta({ id: 'a', pauta_date: '2026-10-05', recurso_ids: ['u1', 'u2'] }),
      pauta({ id: 'b', pauta_date: '2026-10-05', recurso_ids: ['u1'] }),
      pauta({ id: 'c', pauta_date: '2026-10-05', recurso_ids: ['u1'] }),
      pauta({ id: 'd', pauta_date: '2026-10-06', recurso_ids: ['u2'], status: 'solicitada' }),
    ]
    expect(cargaRecursos(list, range, users)).toEqual([
      { id: 'u1', name: 'Rafa Cam', count: 3, porDia: { '2026-10-05': 3 }, sobrecargado: true },
      { id: 'u2', name: 'Sol Luz', count: 1, porDia: { '2026-10-05': 1 }, sobrecargado: false },
    ])
  })
})

describe('huecos sugeridos', () => {
  it('diasHabiles salta domingos y empieza mañana', () => {
    const dias = diasHabiles('2026-10-03', 3) // sábado
    expect(dias).toEqual(['2026-10-05', '2026-10-06', '2026-10-07'])
  })

  it('estudio: ocupado / aviso / libre según las pautas del día', () => {
    const list = [
      pauta({
        id: 'x',
        lugar_tipo: 'estudio',
        salida: '13:00:00',
        client_id: 'otro',
        client_name: 'Fein',
      }),
      pauta({
        id: 'y',
        lugar_tipo: 'estudio',
        salida: '16:00:00',
        status: 'solicitada',
        client_id: 'c9',
        client_name: 'Push',
      }),
    ]
    const huecos = sugerirHuecos(list, '2026-10-07', { clientId: 'c1', lugarTipo: 'estudio' })
    const by = Object.fromEntries(huecos.map((h) => [h.hora, h]))
    expect(huecos).toHaveLength(19)
    expect(huecos.map((h) => h.hora).slice(0, 3)).toEqual(['08:00', '08:30', '09:00'])
    expect(by['08:30'].estado).toBe('libre')
    expect(by['11:30']).toMatchObject({ estado: 'ocupado', motivo: 'Fein' })
    expect(by['10:30'].estado).toBe('libre')
    expect(by['15:30']).toMatchObject({ estado: 'aviso', motivo: 'solicitud de Push' })
    expect(by['09:00'].estado).toBe('libre')
    expect(by['12:00']).toMatchObject({ estado: 'ocupado', motivo: 'Fein' })
    expect(by['14:00'].estado).toBe('ocupado')
    expect(by['15:00']).toMatchObject({ estado: 'aviso', motivo: 'solicitud de Push' })
    expect(by['17:00'].estado).toBe('aviso')
    // mismo cliente puede solaparse
    expect(
      sugerirHuecos(list, '2026-10-07', { clientId: 'otro', lugarTipo: 'estudio' }).find(
        (h) => h.hora === '13:00',
      ).estado,
    ).toBe('libre')
  })

  it('locación: aviso solo si todos los recursos están saturados', () => {
    const tres = ['a', 'b', 'c'].map((id) => pauta({ id, recurso_ids: ['u1'] }))
    expect(sugerirHuecos(tres, '2026-10-07', { recursoIds: ['u1'] })[0].estado).toBe('aviso')
    expect(sugerirHuecos(tres, '2026-10-07', { recursoIds: ['u1', 'u2'] })[0].estado).toBe('libre')
    expect(sugerirHuecos(tres, null, { recursoIds: ['u1'] })[0].estado).toBe('libre')
  })
})

describe('mis solicitudes', () => {
  it('misSolicitudes filtra por autor y ordena por fecha de creación desc', () => {
    const list = [
      pauta({ id: 'a', created_by: 'j1', created_at: '2026-10-01T00:00:00Z' }),
      pauta({ id: 'b', created_by: 'j1', created_at: '2026-10-03T00:00:00Z' }),
      pauta({ id: 'c', created_by: 'j2' }),
      pauta({ id: 'd', created_by: 'j1', deleted_at: 'x' }),
    ]
    expect(misSolicitudes(list, 'j1').map((p) => p.id)).toEqual(['b', 'a'])
    expect(misSolicitudes(list, null)).toEqual([])
  })

  it('hitosPauta marca los hitos alcanzados', () => {
    expect(hitosPauta(pauta({ status: 'solicitada' })).map((h) => h.done)).toEqual([
      true,
      false,
      false,
    ])
    expect(hitosPauta(pauta({ status: 'programada' }))[1]).toMatchObject({
      done: true,
      date: '2026-10-07',
    })
    expect(hitosPauta(pauta({ status: 'realizada' })).map((h) => h.done)).toEqual([
      true,
      true,
      true,
    ])
    expect(hitosPauta(pauta({ status: 'declinada' })).map((h) => h.key)).toEqual([
      'solicitada',
      'declinada',
    ])
  })
})

describe('mi trabajo', () => {
  const hoy = '2026-10-07'
  const list = [
    pauta({ id: 'hoy1', pauta_date: hoy, salida: '13:00' }),
    pauta({ id: 'hoy2', pauta_date: hoy, salida: '09:00' }),
    pauta({ id: 'prox', pauta_date: '2026-10-09' }),
    pauta({ id: 'otro', pauta_date: hoy, recurso_ids: ['u2'] }),
    pauta({ id: 'pasada', pauta_date: '2026-10-05', status: 'realizada' }),
    pauta({
      id: 'pasadaok',
      pauta_date: '2026-10-05',
      status: 'realizada',
      grabacion_por_formato: { R: { u1: 2 } },
    }),
    pauta({ id: 'sol', pauta_date: hoy, status: 'solicitada' }),
  ]
  const piezas = [
    lote({ id: 'l1', pauta_id: 'pasada', cantidad: 10, listas: 4 }),
    lote({ id: 'l2', pauta_id: 'hoy1', cantidad: 2, listas: 2 }),
    lote({ id: 'l3', pauta_id: 'prox', editor_user_id: 'u2' }),
    lote({ id: 'l4', pauta_id: 'otro', cantidad: 3, listas: 0 }),
  ]

  it('separa hoy, próximas, pasadas sin captura y lotes propios por entregar', () => {
    const r = miTrabajo(list, piezas, 'u1', hoy)
    expect(r.hoy.map((p) => p.id)).toEqual(['hoy2', 'hoy1'])
    expect(r.proximas.map((p) => p.id)).toEqual(['prox'])
    expect(r.pasadasSinCaptura.map((p) => p.id)).toEqual(['pasada'])
    expect(r.porEditar.map(({ lote: l }) => l.id)).toEqual(['l1', 'l4'])
    expect(r.resumen).toEqual({ pautasSemana: 5, pendientes: 9 })
    expect(r.entregadas.map(({ lote: l }) => l.id)).toEqual(['l2'])
  })

  it('entregadas: solo lotes propios completos, de pautas vigentes, la más reciente primero', () => {
    const lista = [
      pauta({ id: 'a', pauta_date: '2026-10-01' }),
      pauta({ id: 'b', pauta_date: '2026-10-05' }),
      pauta({ id: 'c', pauta_date: '2026-10-06', deleted_at: '2026-10-07' }),
    ]
    const pz = [
      lote({ id: 'la', pauta_id: 'a', cantidad: 4, listas: 4 }),
      lote({ id: 'lb', pauta_id: 'b', cantidad: 2, listas: 2 }),
      lote({ id: 'lc', pauta_id: 'c', cantidad: 2, listas: 2 }),
      lote({ id: 'ld', pauta_id: 'b', cantidad: 3, listas: 1 }),
      lote({ id: 'le', pauta_id: 'b', editor_user_id: 'u2', cantidad: 2, listas: 2 }),
    ]
    const r = miTrabajo(lista, pz, 'u1', hoy)
    expect(r.entregadas.map(({ lote: l }) => l.id)).toEqual(['lb', 'la'])
    expect(r.porEditar.map(({ lote: l }) => l.id)).toEqual(['ld'])
  })

  it('disponiblesParaTomar lista formatos con cupo solo donde canTake lo permite', () => {
    const list2 = [
      pauta({ id: 'a', piezas_por_formato: { R: { salieron: 5, editadas: 0 } } }),
      pauta({
        id: 'b',
        formats: ['V', 'F'],
        piezas_por_formato: { V: { salieron: 2, editadas: 0 }, F: { salieron: 10, editadas: 0 } },
      }),
      pauta({
        id: 'c',
        status: 'solicitada',
        piezas_por_formato: { R: { salieron: 5, editadas: 0 } },
      }),
    ]
    const piezasBy = new Map([
      ['a', [lote({ pauta_id: 'a', formato: 'R', cantidad: 3 })]],
      ['b', [lote({ pauta_id: 'b', formato: 'F', cantidad: 10 })]],
    ])
    const r = disponiblesParaTomar(list2, piezasBy, (p) => p.id !== 'b')
    expect(r).toEqual([{ pauta: expect.objectContaining({ id: 'a' }), formato: 'R', faltan: 2 }])
    expect(
      disponiblesParaTomar(list2, piezasBy, () => true).map((d) => `${d.pauta.id}:${d.formato}`),
    ).toEqual(['a:R', 'b:V'])
  })
})

describe('resumenMes', () => {
  it('calcula % editado, totales, pautas y ocupación del mes', () => {
    const list = [
      pauta({
        id: 'a',
        status: 'realizada',
        lugar_tipo: 'estudio',
        salida: '09:00:00',
        piezas_por_formato: { R: { salieron: 10, editadas: 0 } },
      }),
      pauta({
        id: 'b',
        status: 'programada',
        piezas_por_formato: { R: { salieron: 10, editadas: 0 } },
      }),
      pauta({ id: 'c', status: 'solicitada', pauta_date: null }),
      pauta({
        id: 'd',
        status: 'realizada',
        pauta_date: '2026-09-20',
        piezas_por_formato: { R: { salieron: 99, editadas: 0 } },
      }),
    ]
    const piezas = new Map([
      ['a', [lote({ pauta_id: 'a', cantidad: 10, listas: 10 })]],
      ['b', [lote({ pauta_id: 'b', cantidad: 10, listas: 5 })]],
    ])
    expect(resumenMes(list, piezas, { year: 2026, month: 10 })).toEqual({
      capturadasVideo: 20,
      editadasVideo: 15,
      capturadasFoto: 0,
      editadasFoto: 0,
      pctEditado: 75,
      capturadas: 20,
      editadas: 15,
      pendientes: 5,
      realizadas: 1,
      programadas: 1,
      solicitadas: 1,
      ocupacionEstudio: 1,
    })
    expect(resumenMes([], new Map(), { year: 2026, month: 10 }).pctEditado).toBeNull()
  })

  it('desglosa video (V+R) y foto con min(salieron, listas) por grupo', () => {
    const list = [
      pauta({
        id: 'a',
        status: 'realizada',
        formats: ['V', 'R', 'F'],
        piezas_por_formato: {
          V: { salieron: 2, editadas: 0 },
          R: { salieron: 3, editadas: 0 },
          F: { salieron: 10, editadas: 0 },
        },
      }),
    ]
    const piezas = new Map([
      [
        'a',
        [
          lote({ pauta_id: 'a', formato: 'R', cantidad: 3, listas: 9 }),
          lote({ id: 'z2', pauta_id: 'a', formato: 'F', cantidad: 10, listas: 4 }),
          lote({
            id: 'z3',
            pauta_id: 'a',
            formato: 'F',
            cantidad: 5,
            listas: 5,
            status: 'cancelado',
          }),
        ],
      ],
    ])
    expect(resumenMes(list, piezas, { year: 2026, month: 10 })).toMatchObject({
      capturadasVideo: 5,
      editadasVideo: 5,
      capturadasFoto: 10,
      editadasFoto: 4,
    })
  })

  it('isoDateKey queda exportado', () => {
    expect(isoDateKey(new Date(2026, 9, 7))).toBe('2026-10-07')
  })
})

describe('pautasPorSemanaPersona', () => {
  const list = [
    pauta({ id: 'a', status: 'realizada', pauta_date: '2026-10-05', recurso_ids: ['u1'] }),
    pauta({ id: 'b', status: 'programada', pauta_date: '2026-10-07', recurso_ids: ['u2'] }),
    pauta({ id: 'c', status: 'realizada', pauta_date: '2026-10-14', recurso_ids: ['u2'] }),
    pauta({ id: 'd', status: 'solicitada', pauta_date: '2026-10-06', recurso_ids: ['u1'] }),
    pauta({ id: 'e', status: 'declinada', pauta_date: '2026-10-06', recurso_ids: ['u1'] }),
    pauta({
      id: 'f',
      status: 'realizada',
      pauta_date: '2026-10-08',
      recurso_ids: [],
      deleted_at: 'x',
    }),
    pauta({
      id: 'g',
      status: 'realizada',
      pauta_date: '2026-10-09',
      recurso_ids: [],
      grabacion_por_formato: { R: { u1: 2 } },
    }),
    pauta({ id: 'h', status: 'realizada', pauta_date: '2026-09-20', recurso_ids: ['u1'] }),
  ]
  const piezas = new Map([
    ['b', [lote({ pauta_id: 'b', editor_user_id: 'u1' })]],
    ['c', [lote({ pauta_id: 'c', editor_user_id: 'u1', status: 'cancelado' })]],
    ['f', [lote({ pauta_id: 'f', editor_user_id: 'u1' })]],
  ])

  it('lista las semanas lunes-sábado que tocan el mes', () => {
    const sem = pautasPorSemanaPersona(list, piezas, 'u1', { year: 2026, month: 10 })
    expect(sem.map((s) => s.start)).toEqual([
      '2026-09-28',
      '2026-10-05',
      '2026-10-12',
      '2026-10-19',
      '2026-10-26',
    ])
  })

  it('cuenta pautas distintas confirmadas y separa capturó de editó', () => {
    const sem = pautasPorSemanaPersona(list, piezas, 'u1', { year: 2026, month: 10 })
    // Semana 5-10: a (capturó), b (editó), g (capturó por reparto). d, e y f no cuentan.
    expect(sem[1]).toMatchObject({ total: 3, capturo: 2, edito: 1 })
    // Semana 12-17: c solo tiene un lote cancelado.
    expect(sem[2]).toMatchObject({ total: 0, capturo: 0, edito: 0 })
    expect(sem[0].total).toBe(0)
  })

  it('una pauta donde captura y edita cuenta una sola vez en el total', () => {
    const both = [pauta({ id: 'a', status: 'realizada', recurso_ids: ['u1'] })]
    const pz = new Map([['a', [lote({ pauta_id: 'a', editor_user_id: 'u1' })]]])
    const sem = pautasPorSemanaPersona(both, pz, 'u1', { year: 2026, month: 10 })
    expect(sem[1]).toMatchObject({ total: 1, capturo: 1, edito: 1 })
  })
})
