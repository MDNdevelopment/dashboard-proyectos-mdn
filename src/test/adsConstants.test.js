/**
 * Test de src/components/ads/constants.js: confirma los estados SELECCIONABLES
 * (Pendiente, En Curso, Finalizado) y que 'Descartado' quedó como legacy —fuera
 * de STATUSES pero aún en STATUS (meta) para renderizar filas históricas—, y que
 * los estados eliminados (Revisión, Aprobado, Cancelado) no existen.
 */
import { STATUS, STATUSES, OBJECTIVES, RESULT_FIELDS } from '../components/ads/constants'

describe('constants de Ads/Tácticas — estados', () => {
  it('STATUSES contiene exactamente los 3 estados seleccionables (sin Descartado)', () => {
    expect(STATUSES).toEqual(['Pendiente', 'En Curso', 'Finalizado'])
  })

  it("'Descartado' es legacy: NO seleccionable pero sigue en STATUS (meta) para renderizar filas viejas", () => {
    expect(STATUSES).not.toContain('Descartado')
    expect(STATUS['Descartado']).toMatchObject({
      label: 'Descartado',
      bg: expect.any(String),
      text: expect.any(String),
    })
  })

  it('STATUS expone metadata (bg/text/dot) para cada estado seleccionable', () => {
    for (const key of STATUSES) {
      expect(STATUS[key]).toMatchObject({
        label: key,
        bg: expect.any(String),
        text: expect.any(String),
      })
    }
  })

  it('no incluye los estados eliminados (Revisión, Aprobado, Cancelado)', () => {
    expect(STATUSES).not.toContain('Revisión')
    expect(STATUSES).not.toContain('Aprobado')
    expect(STATUSES).not.toContain('Cancelado')
    expect(STATUS['Revisión']).toBeUndefined()
    expect(STATUS['Aprobado']).toBeUndefined()
    expect(STATUS['Cancelado']).toBeUndefined()
  })
})

describe('constants de Ads — objetivos', () => {
  it('OBJECTIVES incluye "Una combinación de ambas"', () => {
    expect(OBJECTIVES).toContain('Una combinación de ambas')
  })
})

describe('constants de Ads — resultados', () => {
  it('RESULT_FIELDS expone los 6 indicadores seleccionables con su label', () => {
    expect(RESULT_FIELDS).toEqual([
      { key: 'reach', label: 'Alcance' },
      { key: 'interactions', label: 'Interacciones' },
      { key: 'followers', label: 'Seguidores' },
      { key: 'impressions', label: 'Impresiones' },
      { key: 'views', label: 'Visualizaciones' },
      { key: 'profile_visits', label: 'Visitas al perfil' },
    ])
  })
})
