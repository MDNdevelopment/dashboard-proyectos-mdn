import { describe, it, expect } from 'vitest'
import { buildClientGroups, computeClientPdfLayout, wrapToWidth } from '../utils/exportClientsToPdf'

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

describe('buildClientGroups', () => {
  it('agrupa clientes por social_manager_id y resuelve el nombre desde employees', () => {
    const employees = [
      employee({ user_id: 'u1', first_name: 'Daniellys', last_name: 'Pérez' }),
      employee({ user_id: 'u2', first_name: 'Bianca', last_name: 'Gómez' }),
    ]
    const clients = [
      client({ id: '1', name: 'ENCCO', social_manager_id: 'u1' }),
      client({ id: '2', name: 'SuperFina', social_manager_id: 'u1' }),
      client({ id: '3', name: 'Gelarttesano', social_manager_id: 'u2' }),
    ]
    const groups = buildClientGroups(clients, employees)
    expect(groups).toEqual([
      { manager: 'Bianca Gómez', clients: ['Gelarttesano'] },
      { manager: 'Daniellys Pérez', clients: ['ENCCO', 'SuperFina'] },
    ])
  })

  it('excluye clientes archivados (deleted_at)', () => {
    const employees = [employee({ user_id: 'u1', first_name: 'Ana', last_name: 'Ruiz' })]
    const clients = [
      client({ id: '1', name: 'Activo', social_manager_id: 'u1' }),
      client({ id: '2', name: 'Archivado', social_manager_id: 'u1', deleted_at: '2026-01-01T00:00:00Z' }),
    ]
    const groups = buildClientGroups(clients, employees)
    expect(groups).toEqual([{ manager: 'Ana Ruiz', clients: ['Activo'] }])
  })

  it('clientes sin social asignado caen en "Sin social asignado" al final', () => {
    const employees = [employee({ user_id: 'u1', first_name: 'Ana', last_name: 'Ruiz' })]
    const clients = [
      client({ id: '1', name: 'ConSocial', social_manager_id: 'u1' }),
      client({ id: '2', name: 'SinSocial', social_manager_id: null }),
    ]
    const groups = buildClientGroups(clients, employees)
    expect(groups).toEqual([
      { manager: 'Ana Ruiz', clients: ['ConSocial'] },
      { manager: 'Sin social asignado', clients: ['SinSocial'] },
    ])
  })

  it('sin líneas, ordena alfabéticamente las cuentas dentro de cada grupo y los grupos entre sí', () => {
    const employees = [
      employee({ user_id: 'u1', first_name: 'Zulay', last_name: 'Soto' }),
      employee({ user_id: 'u2', first_name: 'Ana', last_name: 'Ruiz' }),
    ]
    const clients = [
      client({ id: '1', name: 'Zurca', social_manager_id: 'u1' }),
      client({ id: '2', name: 'Blu', social_manager_id: 'u1' }),
      client({ id: '3', name: 'Push', social_manager_id: 'u2' }),
    ]
    const groups = buildClientGroups(clients, employees)
    expect(groups).toEqual([
      { manager: 'Ana Ruiz', clients: ['Push'] },
      { manager: 'Zulay Soto', clients: ['Blu', 'Zurca'] },
    ])
  })

  it('pone primero a la jefa de línea y debajo al resto de socials de esa línea', () => {
    const employees = [
      employee({ user_id: 'u1', first_name: 'Bianca', last_name: 'Gómez' }), // jefa
      employee({ user_id: 'u2', first_name: 'Ana', last_name: 'Ruiz' }), // otra social de la misma línea
      employee({ user_id: 'u3', first_name: 'Zulay', last_name: 'Soto' }), // social de otra línea
    ]
    const clients = [
      client({ id: '1', name: 'Gelarttesano', social_manager_id: 'u1' }),
      client({ id: '2', name: 'Blu', social_manager_id: 'u2' }),
      client({ id: '3', name: 'Zurca', social_manager_id: 'u3' }),
    ]
    const lines = [
      { id: 'l1', sort_order: 1, lead_user_id: 'u1', member_user_ids: ['u1', 'u2'] },
      { id: 'l2', sort_order: 2, lead_user_id: 'u3', member_user_ids: ['u3'] },
    ]
    const groups = buildClientGroups(clients, employees, lines)
    expect(groups).toEqual([
      { manager: 'Bianca Gómez', clients: ['Gelarttesano'] },
      { manager: 'Ana Ruiz', clients: ['Blu'] },
      { manager: 'Zulay Soto', clients: ['Zurca'] },
    ])
  })

  it('socials sin línea asociada quedan al final, antes de "Sin social asignado"', () => {
    const employees = [
      employee({ user_id: 'u1', first_name: 'Bianca', last_name: 'Gómez' }),
      employee({ user_id: 'u2', first_name: 'Suelta', last_name: 'Zzz' }),
    ]
    const clients = [
      client({ id: '1', name: 'Gelarttesano', social_manager_id: 'u1' }),
      client({ id: '2', name: 'Independiente', social_manager_id: 'u2' }),
      client({ id: '3', name: 'HuérfanoCliente', social_manager_id: null }),
    ]
    const lines = [{ id: 'l1', sort_order: 1, lead_user_id: 'u1', member_user_ids: ['u1'] }]
    const groups = buildClientGroups(clients, employees, lines)
    expect(groups).toEqual([
      { manager: 'Bianca Gómez', clients: ['Gelarttesano'] },
      { manager: 'Suelta Zzz', clients: ['Independiente'] },
      { manager: 'Sin social asignado', clients: ['HuérfanoCliente'] },
    ])
  })
})

// ── computeClientPdfLayout / wrapToWidth ──────────────────────────────────────
// Medición determinista sin jsPDF: cada caracter mide 6pt, sin importar el
// fontSize (alcanza para verificar que nada excede el ancho de columna).
const measureText = (text) => text.length * 6

const LAYOUT_OPTS = {
  pageWidth: 595,
  pageHeight: 842,
  marginX: 36,
  marginTop: 70,
  marginBottom: 36,
  columns: 3,
  gap: 16,
  lineHeight: 14,
  groupGap: 10,
  headerFontSize: 11,
  bodyFontSize: 10.5,
}
const COL_WIDTH =
  (LAYOUT_OPTS.pageWidth - LAYOUT_OPTS.marginX * 2 - LAYOUT_OPTS.gap * (LAYOUT_OPTS.columns - 1)) /
  LAYOUT_OPTS.columns

function colXFor(col) {
  return LAYOUT_OPTS.marginX + col * (COL_WIDTH + LAYOUT_OPTS.gap)
}

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

describe('computeClientPdfLayout', () => {
  it('ningún texto excede el ancho de su columna (sin solapamiento horizontal)', () => {
    const groups = [
      { manager: 'Maria Antonella Romero', clients: ['Cow Rodizio', 'DomiSalud', 'Udimed'] },
      { manager: 'Bianca Rodríguez', clients: ['Agrolago', 'Fein Kaffee', 'Gelarttesano'] },
      { manager: 'Maria Almarza', clients: ['Maderas Adidas', 'Minipets'] },
    ]
    const { ops } = computeClientPdfLayout(groups, LAYOUT_OPTS, measureText)
    expect(ops.length).toBeGreaterThan(0)
    ops.forEach((op) => {
      const rightEdge = colXFor(op.col) + COL_WIDTH
      const textWidth = measureText(op.text, op.fontSize)
      expect(op.x + textWidth).toBeLessThanOrEqual(rightEdge + 0.001)
    })
  })

  it('un nombre de social largo se envuelve en varias líneas dentro de su columna', () => {
    const groups = [{ manager: 'Maria Antonella Romero Fernandez', clients: ['Cow Rodizio'] }]
    const { ops } = computeClientPdfLayout(groups, LAYOUT_OPTS, measureText)
    const headerOps = ops.filter((op) => op.bold)
    expect(headerOps.length).toBeGreaterThan(1)
    for (let i = 1; i < headerOps.length; i++) {
      expect(headerOps[i].y).toBeGreaterThan(headerOps[i - 1].y)
    }
  })

  it('usa 3 columnas: todas las x pertenecen a las 3 posiciones esperadas', () => {
    const groups = [
      { manager: 'Social Uno', clients: Array.from({ length: 30 }, (_, i) => `Cliente ${i + 1}`) },
      { manager: 'Social Dos', clients: Array.from({ length: 30 }, (_, i) => `Cliente ${i + 1}`) },
    ]
    const { ops } = computeClientPdfLayout(groups, LAYOUT_OPTS, measureText)
    const usedCols = new Set(ops.map((op) => op.col))
    expect(usedCols.size).toBeGreaterThan(1)
    ops.forEach((op) => {
      expect(op.col).toBeGreaterThanOrEqual(0)
      expect(op.col).toBeLessThan(3)
    })
  })

  it('sangría francesa: la segunda línea de una cuenta envuelta arranca más a la derecha que la primera', () => {
    const groups = [{ manager: 'Social', clients: ['Nombre De Cuenta Muy Largo Que No Cabe'] }]
    const { ops } = computeClientPdfLayout(groups, LAYOUT_OPTS, measureText)
    const bodyOps = ops.filter((op) => !op.bold)
    expect(bodyOps.length).toBeGreaterThan(1)
    expect(bodyOps[1].x).toBeGreaterThan(bodyOps[0].x)
  })

  it('salta de columna y de página cuando el contenido excede el alto útil', () => {
    const groups = Array.from({ length: 20 }, (_, gi) => ({
      manager: `Social ${gi + 1}`,
      clients: Array.from({ length: 15 }, (_, i) => `Cliente ${gi}-${i}`),
    }))
    const { ops, pageCount } = computeClientPdfLayout(groups, LAYOUT_OPTS, measureText)
    expect(pageCount).toBeGreaterThan(1)
    const usedPages = new Set(ops.map((op) => op.page))
    expect(usedPages.size).toBe(pageCount)
  })
})
