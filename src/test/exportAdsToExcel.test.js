/**
 * Tests del mapeo puro de filas para el export a Excel de Ads (tab Ads).
 * Se testea `buildAdRows` en vez del workbook completo: no depende de ExcelJS
 * ni del DOM, solo valida que cada columna se resuelve desde el ad correcto.
 */
import { buildAdRows } from '../utils/exportAdsToExcel'

const BASE_AD = {
  id: 'ad-1',
  client: 'Banco Exterior',
  name: 'Ad Julio',
  start_date: '2026-07-05',
  end_date: '2026-07-15',
  objective: 'Alcance',
  piece_url: 'https://example.com/pieza.png',
  amount: 80,
  status: 'En Curso',
}

describe('buildAdRows', () => {
  it('mapea las 15 columnas en el orden esperado (sin Responsable)', () => {
    const [row] = buildAdRows([BASE_AD])

    expect(row).toEqual([
      'Banco Exterior',
      'Ad Julio',
      '5 jul. 2026',
      '15 jul. 2026',
      '11 días',
      'Alcance',
      'https://example.com/pieza.png',
      80,
      'En Curso',
      '', '', '', '', '', '', // resultados vacíos: no está Finalizado (6 indicadores)
    ])
  })

  it('deja vacías las columnas de resultado cuando el ad no está Finalizado', () => {
    const [row] = buildAdRows([{ ...BASE_AD, reach: 1000 }])
    expect(row.slice(9)).toEqual(['', '', '', '', '', ''])
  })

  it('rellena solo las columnas de los indicadores capturados cuando el ad está Finalizado', () => {
    const finalizado = {
      ...BASE_AD,
      status: 'Finalizado',
      reach: 1000,
      interactions: 200,
      // followers, impressions, views, profile_visits no fueron capturados (null)
    }
    const [row] = buildAdRows([finalizado])
    expect(row.slice(9)).toEqual([1000, 200, '', '', '', ''])
  })

  it('rellena las 6 columnas de resultado cuando todos los indicadores fueron capturados', () => {
    const finalizado = {
      ...BASE_AD,
      status: 'Finalizado',
      reach: 1000,
      interactions: 200,
      followers: 30,
      impressions: 5000,
      views: 3000,
      profile_visits: 45,
    }
    const [row] = buildAdRows([finalizado])
    expect(row.slice(9)).toEqual([1000, 200, 30, 5000, 3000, 45])
  })

  it('produce una fila por cada ad recibido, preservando el orden', () => {
    const rows = buildAdRows([BASE_AD, { ...BASE_AD, id: 'ad-2', name: 'Ad Pepsi' }])
    expect(rows).toHaveLength(2)
    expect(rows[0][1]).toBe('Ad Julio')
    expect(rows[1][1]).toBe('Ad Pepsi')
  })
})
