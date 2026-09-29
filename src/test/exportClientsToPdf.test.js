import { describe, it, expect } from 'vitest'
import {
  buildClientColumns,
  computeClientSheetLayout,
  wrapToWidth,
} from '../utils/exportClientsToPdf'

const client = (overrides) => ({
  id: overrides.id ?? 'c',
  name: 'Cliente',
  deleted_at: null,
  social_manager_id: null,
  ...overrides,
})

const employee = (overrides) => ({
  user_id: 'u',
  first_name: 'Nombre',
  last_name: 'Apellido',
  ...overrides,
})

describe('buildClientColumns', () => {
  it('agrupa clientes por social_manager_id y resuelve el nombre (primer nombre) desde employees', () => {
    const employees = [
      employee({ user_id: 'u1', first_name: 'Daniellys', last_name: 'Pérez' }),
      employee({ user_id: 'u2', first_name: 'Bianca', last_name: 'Gómez' }),
    ]
    const clients = [
      client({ id: '1', name: 'ENCCO', social_manager_id: 'u1' }),
      client({ id: '2', name: 'SuperFina', social_manager_id: 'u1' }),
      client({ id: '3', name: 'Gelarttesano', social_manager_id: 'u2' }),
    ]
    // Sin líneas, todos son "sin línea" y caen juntos en la única columna.
    expect(buildClientColumns(clients, employees)).toEqual([
      [
        { manager: 'Bianca', clients: ['Gelarttesano'] },
        { manager: 'Daniellys', clients: ['ENCCO', 'SuperFina'] },
      ],
    ])
  })

  it('excluye clientes archivados (deleted_at)', () => {
    const employees = [employee({ user_id: 'u1', first_name: 'Ana', last_name: 'Ruiz' })]
    const clients = [
      client({ id: '1', name: 'Activo', social_manager_id: 'u1' }),
      client({ id: '2', name: 'Archivado', social_manager_id: 'u1', deleted_at: '2026-01-01' }),
    ]
    expect(buildClientColumns(clients, employees)).toEqual([
      [{ manager: 'Ana', clients: ['Activo'] }],
    ])
  })

  it('clientes sin social asignado caen en "Sin social asignado" al final', () => {
    const employees = [employee({ user_id: 'u1', first_name: 'Ana', last_name: 'Ruiz' })]
    const clients = [
      client({ id: '1', name: 'ConSocial', social_manager_id: 'u1' }),
      client({ id: '2', name: 'SinSocial', social_manager_id: null }),
    ]
    expect(buildClientColumns(clients, employees)).toEqual([
      [
        { manager: 'Ana', clients: ['ConSocial'] },
        { manager: 'Sin social asignado', clients: ['SinSocial'] },
      ],
    ])
  })

  it('ordena alfabéticamente las cuentas dentro de cada grupo y los grupos entre sí', () => {
    const employees = [
      employee({ user_id: 'u1', first_name: 'Zulay', last_name: 'Soto' }),
      employee({ user_id: 'u2', first_name: 'Ana', last_name: 'Ruiz' }),
    ]
    const clients = [
      client({ id: '1', name: 'Zurca', social_manager_id: 'u1' }),
      client({ id: '2', name: 'Blu', social_manager_id: 'u1' }),
      client({ id: '3', name: 'Push', social_manager_id: 'u2' }),
    ]
    expect(buildClientColumns(clients, employees)).toEqual([
      [
        { manager: 'Ana', clients: ['Push'] },
        { manager: 'Zulay', clients: ['Blu', 'Zurca'] },
      ],
    ])
  })

  it('una columna por línea, con la jefa de línea PRIMERA y el resto alfabético debajo', () => {
    const employees = [
      employee({ user_id: 'u1', first_name: 'Bianca' }),
      employee({ user_id: 'u2', first_name: 'Zulay' }),
      employee({ user_id: 'u3', first_name: 'Ana' }),
      employee({ user_id: 'u4', first_name: 'Georgina' }),
    ]
    const clients = [
      client({ id: '1', name: 'Gelarttesano', social_manager_id: 'u1' }),
      client({ id: '2', name: 'Zurca', social_manager_id: 'u2' }),
      client({ id: '3', name: 'Blu', social_manager_id: 'u3' }),
      client({ id: '4', name: 'ALSA', social_manager_id: 'u4' }),
    ]
    const lines = [
      // Bianca es la jefa de l1 aunque alfabéticamente iría después de Ana.
      { id: 'l1', sort_order: 2, lead_user_id: 'u1', member_user_ids: ['u1', 'u2', 'u3'] },
      { id: 'l2', sort_order: 1, lead_user_id: 'u4', member_user_ids: ['u4'] },
    ]
    expect(buildClientColumns(clients, employees, lines)).toEqual([
      // sort_order manda el orden de las columnas: l2 (1) antes que l1 (2).
      [{ manager: 'Georgina', clients: ['ALSA'] }],
      [
        { manager: 'Bianca', clients: ['Gelarttesano'] },
        { manager: 'Ana', clients: ['Blu'] },
        { manager: 'Zulay', clients: ['Zurca'] },
      ],
    ])
  })

  it('socials sin línea y "Sin social asignado" se agregan al final de la última columna', () => {
    const employees = [
      employee({ user_id: 'u1', first_name: 'Bianca' }),
      employee({ user_id: 'u2', first_name: 'Suelta' }),
    ]
    const clients = [
      client({ id: '1', name: 'Gelarttesano', social_manager_id: 'u1' }),
      client({ id: '2', name: 'Independiente', social_manager_id: 'u2' }),
      client({ id: '3', name: 'HuérfanoCliente', social_manager_id: null }),
    ]
    const lines = [{ id: 'l1', sort_order: 1, lead_user_id: 'u1', member_user_ids: ['u1'] }]
    expect(buildClientColumns(clients, employees, lines)).toEqual([
      [
        { manager: 'Bianca', clients: ['Gelarttesano'] },
        { manager: 'Suelta', clients: ['Independiente'] },
        { manager: 'Sin social asignado', clients: ['HuérfanoCliente'] },
      ],
    ])
  })

  it('una línea sin ningún social con cuentas no genera columna', () => {
    const employees = [employee({ user_id: 'u1', first_name: 'Bianca' })]
    const clients = [client({ id: '1', name: 'Gelarttesano', social_manager_id: 'u1' })]
    const lines = [
      { id: 'l-vacia', sort_order: 1, lead_user_id: 'u9', member_user_ids: ['u9'] },
      { id: 'l1', sort_order: 2, lead_user_id: 'u1', member_user_ids: ['u1'] },
    ]
    expect(buildClientColumns(clients, employees, lines)).toHaveLength(1)
  })

  it('marca "(de vacaciones)" al social que hoy está de vacaciones, y solo a ese', () => {
    const employees = [
      employee({ user_id: 'u1', first_name: 'Daniellys' }),
      employee({ user_id: 'u2', first_name: 'Bianca' }),
    ]
    const clients = [
      client({ id: '1', name: 'ENCCO', social_manager_id: 'u1' }),
      client({ id: '2', name: 'Gelarttesano', social_manager_id: 'u2' }),
    ]
    const [column] = buildClientColumns(clients, employees, [], ['u1'])
    expect(column.map((g) => g.manager)).toEqual(['Bianca', 'Daniellys (de vacaciones)'])
  })

  it('sin vacaciones, ningún nombre lleva el sufijo', () => {
    const employees = [employee({ user_id: 'u1', first_name: 'Daniellys' })]
    const clients = [client({ id: '1', name: 'ENCCO', social_manager_id: 'u1' })]
    const [column] = buildClientColumns(clients, employees)
    expect(column[0].manager).toBe('Daniellys')
  })
})

// ── computeClientSheetLayout / wrapToWidth ────────────────────────────────────
// Medición determinista sin jsPDF: cada caracter mide 6pt, sin importar el
// fontSize (alcanza para verificar que nada excede el ancho de columna).
const measureText = (text) => text.length * 6

const LAYOUT_OPTS = {
  pageWidth: 595,
  pageHeight: 842,
  marginX: 28,
  marginTop: 56,
  marginBottom: 28,
  columns: 4,
  rowHeight: 17,
  cellPadX: 4,
  headerFontSize: 8.5,
  bodyFontSize: 8.5,
}
const COL_WIDTH = (LAYOUT_OPTS.pageWidth - LAYOUT_OPTS.marginX * 2) / LAYOUT_OPTS.columns
const TEXT_WIDTH = COL_WIDTH - LAYOUT_OPTS.cellPadX * 2

describe('wrapToWidth', () => {
  it('no envuelve texto que ya cabe', () => {
    expect(wrapToWidth('ADS', 200, 11, measureText)).toEqual(['ADS'])
  })

  it('envuelve por palabras cuando el texto excede el ancho', () => {
    const lines = wrapToWidth('MARIA ANTONELLA ROMERO', 100, 11, measureText)
    expect(lines.length).toBeGreaterThan(1)
    lines.forEach((line) => expect(measureText(line, 11)).toBeLessThanOrEqual(100))
  })

  it('parte por caracteres una palabra sola más ancha que el límite', () => {
    const lines = wrapToWidth('Supercalifragilisticoso', 50, 11, measureText)
    expect(lines.length).toBeGreaterThan(1)
    lines.forEach((line) => expect(measureText(line, 11)).toBeLessThanOrEqual(50))
  })
})

describe('computeClientSheetLayout', () => {
  const columnOf = (manager, n, prefix = 'C') => [
    { manager, clients: Array.from({ length: n }, (_, i) => `${prefix}${i}`) },
  ]

  it('ningún texto excede el ancho útil de su celda (sin invadir la columna vecina)', () => {
    const columns = [
      [{ manager: 'Georgina', clients: ['Cow Rodizio', 'DomiSalud', 'Udimed'] }],
      [{ manager: 'Bianca', clients: ['Agrolago', 'Fein Kaffee', 'Gelarttesano'] }],
      [{ manager: 'Maria', clients: ['Maderas Adidas', 'Minipets'] }],
    ]
    const { cells } = computeClientSheetLayout(columns, LAYOUT_OPTS, measureText)
    expect(cells.length).toBeGreaterThan(0)
    cells.forEach((cell) => {
      expect(cell.indent + measureText(cell.text, cell.fontSize)).toBeLessThanOrEqual(
        TEXT_WIDTH + 0.001,
      )
    })
  })

  it('cada línea ocupa su propia columna, en el orden recibido', () => {
    const columns = [
      [{ manager: 'Georgina', clients: ['ALSA'] }],
      [{ manager: 'Daniellys', clients: ['ENCCO'] }],
      [{ manager: 'Sabrina', clients: ['TurboPre'] }],
      [{ manager: 'Bianca', clients: ['Agrolago'] }],
    ]
    const { cells } = computeClientSheetLayout(columns, LAYOUT_OPTS, measureText)
    const headers = cells.filter((c) => c.bold)
    expect(headers.map((h) => [h.text, h.col, h.row, h.page])).toEqual([
      ['GEORGINA', 0, 0, 0],
      ['DANIELLYS', 1, 0, 0],
      ['SABRINA', 2, 0, 0],
      ['BIANCA', 3, 0, 0],
    ])
  })

  it('nunca se sale de la rejilla de la página', () => {
    const columns = [columnOf('Uno', 30), columnOf('Dos', 30)]
    const { cells, rows } = computeClientSheetLayout(columns, LAYOUT_OPTS, measureText)
    cells.forEach((cell) => {
      expect(cell.col).toBeGreaterThanOrEqual(0)
      expect(cell.col).toBeLessThan(4)
      expect(cell.row).toBeGreaterThanOrEqual(0)
      expect(cell.row).toBeLessThan(rows)
    })
  })

  it('el encabezado de cada social va centrado y en negritas; las cuentas, a la izquierda', () => {
    const columns = [[{ manager: 'Georgina', clients: ['ALSA', 'Smashack'] }]]
    const { cells } = computeClientSheetLayout(columns, LAYOUT_OPTS, measureText)
    expect(cells[0]).toMatchObject({ text: 'GEORGINA', bold: true, align: 'center', row: 0 })
    expect(cells[1]).toMatchObject({ text: '1. ALSA', bold: false, align: 'left', row: 1 })
    expect(cells[2]).toMatchObject({ text: '2. Smashack', row: 2 })
  })

  it('deja una fila en blanco entre grupos de la misma columna', () => {
    const columns = [
      [
        { manager: 'Georgina', clients: ['ALSA'] },
        { manager: 'Madelaine', clients: ['PLI'] },
      ],
    ]
    const { cells } = computeClientSheetLayout(columns, LAYOUT_OPTS, measureText)
    // GEORGINA fila 0, ALSA fila 1, fila 2 en blanco, MADELAINE fila 3.
    expect(cells.find((c) => c.text === 'MADELAINE')).toMatchObject({ col: 0, row: 3 })
    expect(cells.some((c) => c.col === 0 && c.row === 2)).toBe(false)
  })

  it('la numeración es continua dentro de la columna y reinicia en la siguiente', () => {
    const columns = [
      [
        { manager: 'Georgina', clients: ['ALSA', 'Smashack'] },
        { manager: 'Madelaine', clients: ['PLI'] },
      ],
      [{ manager: 'Bianca', clients: ['Agrolago'] }],
    ]
    const { cells } = computeClientSheetLayout(columns, LAYOUT_OPTS, measureText)
    const body = cells.filter((c) => !c.bold)
    expect(body.map((c) => c.text)).toEqual(['1. ALSA', '2. Smashack', '3. PLI', '1. Agrolago'])
  })

  it('sangría francesa: la segunda línea de una cuenta envuelta se indenta y ocupa su propia fila', () => {
    const columns = [[{ manager: 'Social', clients: ['Nombre De Cuenta Muy Largo Que No Cabe'] }]]
    const { cells } = computeClientSheetLayout(columns, LAYOUT_OPTS, measureText)
    const body = cells.filter((c) => !c.bold)
    expect(body.length).toBeGreaterThan(1)
    expect(body[1].indent).toBeGreaterThan(body[0].indent)
    expect(body[1].row).toBe(body[0].row + 1)
  })

  it('una columna que no cabe en la página continúa en LA MISMA columna de la página siguiente', () => {
    const columns = [columnOf('Larga', 80), [{ manager: 'Corta', clients: ['Uno'] }]]
    const { cells, pageCount } = computeClientSheetLayout(columns, LAYOUT_OPTS, measureText)
    expect(pageCount).toBe(2)
    // Todo lo de la línea larga vive en la columna 0, repartido en 2 páginas.
    const larga = cells.filter((c) => c.col === 0)
    expect(new Set(larga.map((c) => c.page))).toEqual(new Set([0, 1]))
    // La línea vecina nunca se ve invadida: sigue entera en la página 0.
    cells.filter((c) => c.col === 1).forEach((c) => expect(c.page).toBe(0))
  })

  it('con más líneas que columnas por página, las que sobran pasan a la página siguiente', () => {
    const columns = Array.from({ length: 6 }, (_, i) => [
      { manager: `Social${i}`, clients: ['Uno'] },
    ])
    const { cells, pageCount } = computeClientSheetLayout(columns, LAYOUT_OPTS, measureText)
    expect(pageCount).toBe(2)
    expect(cells.find((c) => c.text === 'SOCIAL4')).toMatchObject({ page: 1, col: 0, row: 0 })
    expect(cells.find((c) => c.text === 'SOCIAL5')).toMatchObject({ page: 1, col: 1, row: 0 })
  })
})
