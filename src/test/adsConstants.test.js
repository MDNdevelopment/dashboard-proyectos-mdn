/**
 * Test de src/components/ads/constants.js: confirma que los estados de
 * Tácticas/Ads quedaron consolidados a 4 (Pendiente, En Curso, Finalizado,
 * Descartado) y que los estados eliminados (Revisión, Aprobado, Cancelado)
 * ya no existen.
 */
import { STATUS, STATUSES, RESULT_FIELDS } from '../components/ads/constants'

describe('constants de Ads/Tácticas — estados', () => {
  it('STATUSES contiene exactamente los 4 estados vigentes', () => {
    expect(STATUSES).toEqual(['Pendiente', 'En Curso', 'Finalizado', 'Descartado'])
  })

  it('STATUS expone metadata (bg/text/dot) para cada uno de los 4 estados', () => {
    expect(Object.keys(STATUS)).toEqual(['Pendiente', 'En Curso', 'Finalizado', 'Descartado'])
    for (const key of STATUSES) {
      expect(STATUS[key]).toMatchObject({ label: key, bg: expect.any(String), text: expect.any(String) })
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
