import {
  todayCaracas,
  isVigente,
  isProgramada,
  daysLeft,
  daysPillTone,
  daysLabel,
  periodProgress,
  latestByBrand,
  brandsWithoutVigente,
  completionPct,
  checklistCounts,
  groupByMonth,
  monthLabel,
  parseDriveId,
  leadNameOf,
  normalizeDriveUrl,
  closeDateOf,
  handoffContent,
  carryOverItem,
  isVencidaSinCerrar,
  matchesEstado,
  ESTADOS_BASE,
  ESTADO_OF_GROUP,
  vencenPronto,
  brandsByLine,
} from '../utils/tacticas'

const TODAY = '2026-11-19'

const camp = (over = {}) => ({
  id: 'c1',
  client_id: 'b1',
  status: 'En Curso',
  start_date: '2026-11-01',
  end_date: '2026-12-31',
  created_at: '2026-11-01T10:00:00Z',
  ...over,
})

describe('todayCaracas', () => {
  it('usa la fecha de Caracas (UTC-4), no la de UTC', () => {
    // 01:30 UTC del 20-nov sigue siendo 19-nov en Caracas.
    expect(todayCaracas(new Date('2026-11-20T01:30:00Z'))).toBe('2026-11-19')
    expect(todayCaracas(new Date('2026-11-20T05:00:00Z'))).toBe('2026-11-20')
  })
})

describe('isVigente / isProgramada', () => {
  it('Pendiente o En Curso con fin >= hoy es vigente', () => {
    expect(isVigente(camp({ status: 'Pendiente' }), TODAY)).toBe(true)
    expect(isVigente(camp({ status: 'En Curso' }), TODAY)).toBe(true)
  })

  it('vence hoy todavía es vigente; ayer ya no', () => {
    expect(isVigente(camp({ end_date: TODAY }), TODAY)).toBe(true)
    expect(isVigente(camp({ end_date: '2026-11-18' }), TODAY)).toBe(false)
  })

  it('Finalizado no es vigente aunque la fecha de fin sea futura', () => {
    expect(isVigente(camp({ status: 'Finalizado' }), TODAY)).toBe(false)
  })

  it('Descartado (legado) no es vigente', () => {
    expect(isVigente(camp({ status: 'Descartado' }), TODAY)).toBe(false)
  })

  it('sin fecha de fin no es vigente', () => {
    expect(isVigente(camp({ end_date: null }), TODAY)).toBe(false)
    expect(isVigente(null, TODAY)).toBe(false)
  })

  it('programada = vigente que empieza en el futuro', () => {
    expect(isProgramada(camp({ start_date: '2026-12-01' }), TODAY)).toBe(true)
    expect(isProgramada(camp(), TODAY)).toBe(false)
    expect(isProgramada(camp({ start_date: '2026-12-01', status: 'Finalizado' }), TODAY)).toBe(
      false,
    )
  })
})

describe('daysLeft / daysPillTone / daysLabel', () => {
  it('cuenta días enteros hasta el fin', () => {
    expect(daysLeft(camp({ end_date: '2026-11-20' }), TODAY)).toBe(1)
    expect(daysLeft(camp({ end_date: TODAY }), TODAY)).toBe(0)
    expect(daysLeft(camp({ end_date: '2026-11-17' }), TODAY)).toBe(-2)
    expect(daysLeft(camp({ end_date: null }), TODAY)).toBeNull()
  })

  it('no se desfasa al cruzar el cambio de mes o de año', () => {
    expect(daysLeft(camp({ end_date: '2027-01-01' }), '2026-12-31')).toBe(1)
  })

  it('rojo ≤ 3 o vencida, amarillo ≤ 10, verde el resto', () => {
    expect(daysPillTone(-5)).toBe('red')
    expect(daysPillTone(0)).toBe('red')
    expect(daysPillTone(3)).toBe('red')
    expect(daysPillTone(4)).toBe('yellow')
    expect(daysPillTone(10)).toBe('yellow')
    expect(daysPillTone(11)).toBe('green')
    expect(daysPillTone(null)).toBe('green')
  })

  it('arma el texto de la pill', () => {
    expect(daysLabel(0)).toBe('Vence hoy')
    expect(daysLabel(1)).toBe('1 día')
    expect(daysLabel(13)).toBe('13 días')
    expect(daysLabel(-1)).toBe('Venció hace 1 día')
    expect(daysLabel(-4)).toBe('Venció hace 4 días')
    expect(daysLabel(null)).toBe('—')
  })
})

describe('periodProgress', () => {
  it('es la fracción transcurrida del período', () => {
    const c = camp({ start_date: '2026-11-01', end_date: '2026-11-21' })
    expect(periodProgress(c, '2026-11-01')).toBe(0)
    expect(periodProgress(c, '2026-11-11')).toBe(50)
    expect(periodProgress(c, '2026-11-21')).toBe(100)
  })

  it('se acota entre 0 y 100', () => {
    const c = camp({ start_date: '2026-11-10', end_date: '2026-11-20' })
    expect(periodProgress(c, '2026-11-01')).toBe(0)
    expect(periodProgress(c, '2026-12-01')).toBe(100)
  })

  it('un período de un solo día no divide por cero', () => {
    const c = camp({ start_date: '2026-11-19', end_date: '2026-11-19' })
    expect(periodProgress(c, '2026-11-18')).toBe(0)
    expect(periodProgress(c, '2026-11-19')).toBe(100)
  })

  it('sin fechas devuelve 0', () => {
    expect(periodProgress({}, TODAY)).toBe(0)
  })
})

describe('latestByBrand', () => {
  it('elige la de mayor start_date por marca', () => {
    const map = latestByBrand([
      camp({ id: 'a', client_id: 'b1', start_date: '2026-05-01' }),
      camp({ id: 'b', client_id: 'b1', start_date: '2026-09-01' }),
      camp({ id: 'c', client_id: 'b2', start_date: '2026-01-01' }),
    ])
    expect(map.get('b1').id).toBe('b')
    expect(map.get('b2').id).toBe('c')
    expect(map.size).toBe(2)
  })

  it('desempata por created_at', () => {
    const map = latestByBrand([
      camp({ id: 'a', start_date: '2026-09-01', created_at: '2026-09-01T08:00:00Z' }),
      camp({ id: 'b', start_date: '2026-09-01', created_at: '2026-09-01T09:00:00Z' }),
    ])
    expect(map.get('b1').id).toBe('b')
  })

  it('ignora las tácticas sin marca', () => {
    const map = latestByBrand([camp({ id: 'a', client_id: null })])
    expect(map.size).toBe(0)
  })

  it('tolera null y vacío', () => {
    expect(latestByBrand(null).size).toBe(0)
    expect(latestByBrand([]).size).toBe(0)
  })
})

describe('brandsWithoutVigente', () => {
  const clients = [{ id: 'b1' }, { id: 'b2' }, { id: 'b3' }]

  it('devuelve las marcas sin táctica vigente', () => {
    const out = brandsWithoutVigente(
      clients,
      [
        camp({ client_id: 'b1' }),
        camp({ client_id: 'b2', status: 'Finalizado' }),
        camp({ client_id: 'b3', end_date: '2026-10-01' }),
      ],
      TODAY,
    )
    expect(out.map((c) => c.id)).toEqual(['b2', 'b3'])
  })

  it('una programada cubre a la marca', () => {
    const out = brandsWithoutVigente(
      [{ id: 'b1' }],
      [camp({ client_id: 'b1', start_date: '2027-01-01', end_date: '2027-03-31' })],
      TODAY,
    )
    expect(out).toEqual([])
  })

  it('con varias vigentes la marca igual cuenta una sola vez como cubierta', () => {
    const out = brandsWithoutVigente(
      [{ id: 'b1' }],
      [camp({ id: 'x', client_id: 'b1' }), camp({ id: 'y', client_id: 'b1' })],
      TODAY,
    )
    expect(out).toEqual([])
  })
})

describe('completionPct / checklistCounts', () => {
  it('redondea el porcentaje de acciones hechas', () => {
    const list = [{ done: true }, { done: false }, { done: false }]
    expect(checklistCounts(list)).toEqual({ done: 1, total: 3 })
    expect(completionPct(list)).toBe(33)
  })

  it('sin checklist devuelve null, no 0', () => {
    expect(completionPct([])).toBeNull()
    expect(completionPct(null)).toBeNull()
    expect(completionPct(undefined)).toBeNull()
  })

  it('todo hecho es 100', () => {
    expect(completionPct([{ done: true }, { done: true }])).toBe(100)
  })
})

describe('groupByMonth / monthLabel', () => {
  it('agrupa por mes, ordena y deja los sin mes al final', () => {
    const groups = groupByMonth([
      { id: 1, month: '2026-12' },
      { id: 2, month: '' },
      { id: 3, month: '2026-11' },
      { id: 4, month: '2026-12' },
      { id: 5 },
    ])
    expect(groups.map((g) => g.month)).toEqual(['2026-11', '2026-12', ''])
    expect(groups[1].items.map((i) => i.id)).toEqual([1, 4])
    expect(groups[2].items.map((i) => i.id)).toEqual([2, 5])
  })

  it('tolera entrada que no es un arreglo', () => {
    expect(groupByMonth(null)).toEqual([])
  })

  it('arma la etiqueta del mes', () => {
    expect(monthLabel('2026-11')).toBe('Noviembre 2026')
    expect(monthLabel('')).toBe('Sin mes')
  })
})

describe('parseDriveId', () => {
  const ID = '1AbCdEfGhIjKlMnOpQrStUvWxYz012345'

  it('carpeta', () => {
    expect(parseDriveId(`https://drive.google.com/drive/folders/${ID}`)).toEqual({
      id: ID,
      kind: 'folder',
    })
  })

  it('carpeta con cuenta (u/N) y parámetros', () => {
    expect(parseDriveId(`https://drive.google.com/drive/u/2/folders/${ID}?usp=sharing`)).toEqual({
      id: ID,
      kind: 'folder',
    })
  })

  it('archivo y Google Doc', () => {
    expect(parseDriveId(`https://drive.google.com/file/d/${ID}/view`)).toEqual({
      id: ID,
      kind: 'file',
    })
    expect(parseDriveId(`https://docs.google.com/document/d/${ID}/edit`)).toEqual({
      id: ID,
      kind: 'document',
    })
  })

  it('formato viejo ?id=', () => {
    expect(parseDriveId(`https://drive.google.com/open?id=${ID}`)).toEqual({
      id: ID,
      kind: 'unknown',
    })
  })

  it('rechaza lo que no es Drive o no trae id', () => {
    expect(parseDriveId('https://example.com/folders/' + ID)).toBeNull()
    expect(parseDriveId('https://drive.google.com/drive/my-drive')).toBeNull()
    expect(parseDriveId('no es un link')).toBeNull()
    expect(parseDriveId('')).toBeNull()
    expect(parseDriveId(null)).toBeNull()
  })
})

describe('leadNameOf', () => {
  const clientsById = new Map([
    ['b1', { id: 'b1', line_id: 'l1' }],
    ['b2', { id: 'b2', line_id: null }],
    ['b3', { id: 'b3', line_id: 'l2' }],
  ])
  const linesById = new Map([
    ['l1', { id: 'l1', lead_user_id: 'u1' }],
    ['l2', { id: 'l2', lead_user_id: null }],
  ])
  const usersMap = new Map([['u1', 'Sabrina Pérez']])

  it('resuelve la jefa de la línea del cliente', () => {
    expect(leadNameOf('b1', clientsById, linesById, usersMap)).toBe('Sabrina Pérez')
  })

  it('devuelve null si el cliente no tiene línea, la línea no tiene jefa o no se conoce al usuario', () => {
    expect(leadNameOf('b2', clientsById, linesById, usersMap)).toBeNull()
    expect(leadNameOf('b3', clientsById, linesById, usersMap)).toBeNull()
    expect(leadNameOf('b1', clientsById, linesById, new Map())).toBeNull()
    expect(leadNameOf('zzz', clientsById, linesById, usersMap)).toBeNull()
    expect(leadNameOf('b1', undefined, undefined, undefined)).toBeNull()
  })
})

describe('normalizeDriveUrl', () => {
  it('vacío o solo espacios pasa a null', () => {
    expect(normalizeDriveUrl('')).toBeNull()
    expect(normalizeDriveUrl('   ')).toBeNull()
    expect(normalizeDriveUrl(undefined)).toBeNull()
  })

  it('recorta espacios', () => {
    expect(normalizeDriveUrl('  https://drive.google.com/x  ')).toBe('https://drive.google.com/x')
  })
})

describe('closeDateOf', () => {
  it('sin closed_at usa la fecha de fin', () => {
    expect(closeDateOf({ end_date: '2026-11-30' })).toBe('2026-11-30')
    expect(closeDateOf({ end_date: '2026-11-30', closed_at: null })).toBe('2026-11-30')
  })

  it('si se cerró antes de tiempo, gana el cierre real', () => {
    expect(closeDateOf({ end_date: '2026-12-31', closed_at: '2026-11-15T15:00:00Z' })).toBe(
      '2026-11-15',
    )
  })

  it('si se cerró después de la fecha de fin (cierre automático), gana la fecha de fin', () => {
    // El cron corre a las 11:00 UTC del día siguiente al vencimiento.
    expect(closeDateOf({ end_date: '2026-11-30', closed_at: '2026-12-01T11:00:00Z' })).toBe(
      '2026-11-30',
    )
  })

  it('usa el día de Caracas, no el de UTC', () => {
    // 01:30 UTC del 16 sigue siendo 15 en Caracas (UTC-4).
    expect(closeDateOf({ end_date: '2026-12-31', closed_at: '2026-11-16T01:30:00Z' })).toBe(
      '2026-11-15',
    )
  })

  it('sin fecha de fin devuelve null', () => {
    expect(closeDateOf({})).toBeNull()
    expect(closeDateOf(null)).toBeNull()
  })
})

describe('handoffContent', () => {
  it('separa las acciones hechas de las pendientes y calcula el %', () => {
    const c = handoffContent({
      checklist: [
        { id: 'a', title: 'A', done: true },
        { id: 'b', title: 'B', done: false },
        { id: 'c', title: 'C', done: false },
        { id: 'd', title: 'D', done: true },
      ],
    })
    expect(c.done.map((i) => i.id)).toEqual(['a', 'd'])
    expect(c.pending.map((i) => i.id)).toEqual(['b', 'c'])
    expect(c.total).toBe(4)
    expect(c.pct).toBe(50)
  })

  it('refleja lo que se tilde después de cerrar (se lee en vivo, no es una copia)', () => {
    const source = { checklist: [{ id: 'a', title: 'A', done: false }] }
    expect(handoffContent(source).pending).toHaveLength(1)
    source.checklist[0].done = true
    expect(handoffContent(source).pending).toHaveLength(0)
  })

  it('sin checklist: nada que arrastrar y % null', () => {
    expect(handoffContent({ checklist: [] })).toEqual({
      done: [],
      pending: [],
      total: 0,
      pct: null,
    })
    expect(handoffContent(null).total).toBe(0)
  })
})

describe('carryOverItem', () => {
  it('conserva id y título, destilda, quita el mes viejo y marca el origen', () => {
    const out = carryOverItem({ id: 'a', title: 'Reel', done: true, month: '2026-09' }, 'src-1')
    expect(out).toEqual({ id: 'a', title: 'Reel', done: false, carried_from: 'src-1' })
  })

  it('no muta el ítem original', () => {
    const original = { id: 'a', title: 'Reel', done: false, month: '2026-09' }
    carryOverItem(original, 'src-1')
    expect(original).toEqual({ id: 'a', title: 'Reel', done: false, month: '2026-09' })
  })
})

describe('isVencidaSinCerrar', () => {
  it('en marcha con la fecha de fin pasada', () => {
    expect(isVencidaSinCerrar(camp({ status: 'En Curso', end_date: '2026-11-18' }), TODAY)).toBe(
      true,
    )
    expect(isVencidaSinCerrar(camp({ status: 'Pendiente', end_date: '2026-11-18' }), TODAY)).toBe(
      true,
    )
  })

  it('no lo es si vence hoy, si ya se cerró o si no tiene fecha', () => {
    expect(isVencidaSinCerrar(camp({ status: 'En Curso', end_date: TODAY }), TODAY)).toBe(false)
    expect(isVencidaSinCerrar(camp({ status: 'Finalizado', end_date: '2026-11-01' }), TODAY)).toBe(
      false,
    )
    expect(isVencidaSinCerrar(camp({ end_date: null }), TODAY)).toBe(false)
  })
})

describe('matchesEstado (filtro Estado de Base)', () => {
  const urgente = camp({ status: 'En Curso', start_date: '2026-11-01', end_date: '2026-11-21' }) // 2 días
  const porVencer = camp({ status: 'En Curso', start_date: '2026-11-01', end_date: '2026-11-27' }) // 8 días
  const lejana = camp({ status: 'En Curso', start_date: '2026-11-01', end_date: '2026-12-31' })
  const programada = camp({ status: 'Pendiente', start_date: '2026-12-01', end_date: '2026-12-31' })
  const cerrada = camp({ status: 'Finalizado', start_date: '2026-09-01', end_date: '2026-10-31' })
  const colgada = camp({ status: 'Pendiente', start_date: '2026-10-01', end_date: '2026-11-10' })
  const all = { urgente, porVencer, lejana, programada, cerrada, colgada }
  const pick = (estado) =>
    Object.entries(all)
      .filter(([, c]) => matchesEstado(c, estado, TODAY))
      .map(([k]) => k)

  it('"todas" deja pasar todo', () => {
    expect(pick('todas')).toEqual(Object.keys(all))
  })

  it('Al día / Por vencer / Urgentes son las vigentes según los días que quedan', () => {
    expect(pick('al_dia')).toEqual(['lejana', 'programada'])
    expect(pick('por_vencer')).toEqual(['porVencer'])
    expect(pick('urgentes')).toEqual(['urgente'])
  })

  it('una vencida sin cerrar no es urgente: ya no está vigente', () => {
    expect(matchesEstado(colgada, 'urgentes', TODAY)).toBe(false)
  })

  it('finalizadas por estado guardado', () => {
    expect(pick('finalizadas')).toEqual(['cerrada'])
  })

  it('"sin_fecha" son las que no tienen inicio o fin; no entran en ningún grupo de días', () => {
    const nf = camp({ status: 'Pendiente', start_date: null, end_date: null })
    expect(matchesEstado(nf, 'sin_fecha', TODAY)).toBe(true)
    expect(matchesEstado(urgente, 'sin_fecha', TODAY)).toBe(false)
    for (const e of ['al_dia', 'por_vencer', 'urgentes', 'finalizadas']) {
      expect(matchesEstado(nf, e, TODAY)).toBe(false)
    }
    expect(isVigente(nf, TODAY)).toBe(false)
  })

  it('las opciones son los grupos de la torta más Todas, Finalizadas y Sin fecha', () => {
    expect(ESTADOS_BASE.map((e) => e.key)).toEqual([
      'todas',
      'al_dia',
      'por_vencer',
      'urgentes',
      'sin_tactica',
      'finalizadas',
      'sin_fecha',
    ])
    expect(Object.values(ESTADO_OF_GROUP).sort()).toEqual(
      ['al_dia', 'por_vencer', 'sin_tactica', 'urgentes'].sort(),
    )
  })
})

describe('vencenPronto', () => {
  it('vigentes que vencen en ≤ 10 días, la que vence antes primero', () => {
    const list = vencenPronto(
      [
        camp({ id: 'ocho', end_date: '2026-11-27' }),
        camp({ id: 'dos', end_date: '2026-11-21' }),
        camp({ id: 'lejos', end_date: '2026-12-31' }),
        camp({ id: 'cerrada', status: 'Finalizado', end_date: '2026-11-20' }),
      ],
      TODAY,
    )
    expect(list.map((c) => c.id)).toEqual(['dos', 'ocho'])
  })
})

describe('brandsByLine', () => {
  const linesById = new Map([
    ['l1', { id: 'l1', name: 'Sabrina' }],
    ['l2', { id: 'l2', name: 'Bianca' }],
  ])

  it('agrupa por línea, ordena por nombre y deja "Sin línea" al final', () => {
    const teams = brandsByLine(
      [
        { id: 'a', line_id: 'l1' },
        { id: 'b', line_id: null },
        { id: 'c', line_id: 'l2' },
        { id: 'd', line_id: 'l1' },
        { id: 'e', line_id: 'borrada' },
      ],
      linesById,
    )
    expect(teams.map((t) => [t.name, t.brands.map((b) => b.id)])).toEqual([
      ['Bianca', ['c']],
      ['Sabrina', ['a', 'd']],
      ['Sin línea', ['b', 'e']],
    ])
    expect(teams.at(-1).lineId).toBeNull()
  })
})
