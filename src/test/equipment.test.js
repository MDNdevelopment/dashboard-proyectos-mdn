import {
  validateEquipment,
  filterEquipment,
  countsByStatus,
  groupByLine,
  icloudSuggestions,
  modelSuggestions,
  IPHONE_MODELS,
} from '../utils/equipment'

const eq = (over = {}) => ({
  id: 'e1',
  model: 'iPhone 15',
  serial: 'ABC123',
  icloud_email: 'redesmdn1@gmail.com',
  line_id: 'l1',
  responsible_user_id: 'u1',
  status: 'en_uso',
  ...over,
})

describe('validateEquipment', () => {
  it('exige modelo', () => {
    expect(validateEquipment({ model: '  ' })).toMatch(/modelo/i)
  })

  it('rechaza un correo de iCloud mal formado', () => {
    expect(validateEquipment({ model: 'iPhone 13', icloud_email: 'no-es-correo' })).toMatch(
      /iCloud/i,
    )
  })

  it('acepta un equipo válido, con o sin serial y correo', () => {
    expect(validateEquipment({ model: 'iPhone 13', serial: '', icloud_email: '' })).toBeNull()
    expect(validateEquipment({ model: 'iPhone 13', icloud_email: 'a@b.com' })).toBeNull()
  })
})

describe('filterEquipment', () => {
  const list = [
    eq(),
    eq({
      id: 'e2',
      model: 'iPhone 13 Pro Max',
      serial: null,
      icloud_email: 'mdnpublicidadcol@gmail.com',
      line_id: 'l2',
      status: 'disponible',
      responsible_user_id: 'u2',
    }),
    eq({ id: 'e3', model: 'iPhone 11', status: 'baja' }),
  ]
  const names = { u1: 'Ana Pérez', u2: 'Luis Gómez' }

  it('oculta los dados de baja por defecto', () => {
    expect(filterEquipment(list, {}, names).map((e) => e.id)).toEqual(['e1', 'e2'])
  })

  it('los muestra con showRetired o filtrando por ese estado', () => {
    expect(filterEquipment(list, { showRetired: true }, names)).toHaveLength(3)
    expect(filterEquipment(list, { status: 'baja' }, names).map((e) => e.id)).toEqual(['e3'])
  })

  it('busca por modelo, serial, correo de iCloud y responsable', () => {
    expect(filterEquipment(list, { search: 'pro max' }, names).map((e) => e.id)).toEqual(['e2'])
    expect(filterEquipment(list, { search: 'abc1' }, names).map((e) => e.id)).toEqual(['e1'])
    expect(filterEquipment(list, { search: 'publicidadcol' }, names).map((e) => e.id)).toEqual([
      'e2',
    ])
    expect(filterEquipment(list, { search: 'luis' }, names).map((e) => e.id)).toEqual(['e2'])
  })

  it('filtra por línea y responsable', () => {
    expect(filterEquipment(list, { line: 'l1' }, names).map((e) => e.id)).toEqual(['e1'])
    expect(filterEquipment(list, { responsible: 'u2' }, names).map((e) => e.id)).toEqual(['e2'])
  })
})

describe('countsByStatus', () => {
  it('cuenta por estado y el total excluye las bajas', () => {
    const list = [eq(), eq({ status: 'disponible' }), eq({ status: 'baja' })]
    expect(countsByStatus(list)).toEqual({
      total: 2,
      en_uso: 1,
      disponible: 1,
      en_reparacion: 0,
      baja: 1,
    })
  })
})

describe('groupByLine', () => {
  const lines = [
    { id: 'l1', name: 'Team Georgina' },
    { id: 'l2', name: 'Team Sabrina' },
    { id: 'l3', name: 'Team Bianca' },
  ]

  it('agrupa en el orden de las líneas y omite las que no tienen equipos', () => {
    const list = [
      eq({ id: 'a', line_id: 'l2' }),
      eq({ id: 'b', line_id: 'l1' }),
      eq({ id: 'c', line_id: 'l1' }),
    ]
    const groups = groupByLine(list, lines)
    expect(groups.map((g) => g.line.name)).toEqual(['Team Georgina', 'Team Sabrina'])
    expect(groups[0].items.map((i) => i.id)).toEqual(['b', 'c'])
  })

  it('manda al final los equipos sin línea o con una línea desconocida', () => {
    const list = [
      eq({ id: 'a', line_id: null }),
      eq({ id: 'b', line_id: 'borrada' }),
      eq({ id: 'c', line_id: 'l1' }),
    ]
    const groups = groupByLine(list, lines)
    expect(groups.map((g) => g.line?.name ?? null)).toEqual(['Team Georgina', null])
    expect(groups[1].items.map((i) => i.id)).toEqual(['a', 'b'])
  })

  it('junta los correos de iCloud distintos del grupo', () => {
    const list = [
      eq({ id: 'a', icloud_email: 'x@mdn.com' }),
      eq({ id: 'b', icloud_email: 'x@mdn.com' }),
      eq({ id: 'c', icloud_email: 'y@mdn.com' }),
      eq({ id: 'd', icloud_email: null }),
    ]
    expect(groupByLine(list, lines)[0].icloudEmails).toEqual(['x@mdn.com', 'y@mdn.com'])
  })
})

describe('sugerencias', () => {
  it('icloudSuggestions deduplica sin distinguir mayúsculas y ordena', () => {
    const list = [
      eq({ icloud_email: 'B@mdn.com' }),
      eq({ icloud_email: 'b@mdn.com' }),
      eq({ icloud_email: 'a@mdn.com' }),
      eq({ icloud_email: null }),
    ]
    expect(icloudSuggestions(list)).toEqual(['a@mdn.com', 'B@mdn.com'])
  })

  it('modelSuggestions agrega los modelos registrados que no están en la lista común', () => {
    const list = [eq({ model: 'iphone 13' }), eq({ model: 'iPhone SE' })]
    const out = modelSuggestions(list)
    expect(out).toHaveLength(IPHONE_MODELS.length + 1)
    expect(out).toContain('iPhone SE')
    expect(out).not.toContain('iphone 13')
  })
})
