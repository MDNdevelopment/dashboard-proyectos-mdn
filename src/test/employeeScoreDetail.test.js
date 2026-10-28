import { describe, it, expect } from 'vitest'
import { formatIndicatorDetail, explainNoData } from '../utils/employeeScoreDetail'
import { INDICATOR_KEYS } from '../utils/employeeScoreProfiles'
import { MIN_UNITS } from '../utils/employeeScore'

// `detalle` tal como lo devuelve cada calcX de employeeScore.js.
const DETALLES = {
  tareas: { total: 7, cumplidas: 4 },
  cnp: { total: 3, cumplidas: 3 },
  grilla: { meta: 12, si: 8 },
  calendario: { meta: 5, si: 5 },
  metricas: { meta: 5, si: 4 },
  plataformas: { meta: 12, realizado: 9 },
  artes: { meta: 10, si: 10 },
  pautas: { unidades: 3, realizadas: 2 },
  piezas_grabadas: { grabadas: 14, editadas: 12, pautas: 2 },
  fotos: { grabadas: 10, editadas: 10, pautas: 1 },
  videos: { grabadas: 4, editadas: 2, pautas: 1 },
  edicion_cnp: { solicitadas: 5, entregadas: 3 },
  edicion: { unidades: 9, listas: 6, piezas: 4, cnp: 5 },
  campanas: { misPagadas: 2, misOrganicas: 1 },
  tickets: { unidades: 5, enSla: 4 },
  entregas: { tUniverso: 10, tCerradas: 8, cSolicitadas: 6, cEntregadas: 6 },
  puntualidad: { total: 8, aTiempo: 6 },
  arrastre: { unidades: 5, problematicas: 1 },
  tareas_fijas: { meta: 8, si: 6 },
  piezas_av: { unidades: 4, listas: 4 },
  reuniones: { unidades: 3, realizadas: 2 },
  chequeo: { unidades: 6, conFecha: 5 },
}

describe('formatIndicatorDetail', () => {
  it('tiene una frase con cifras para cada indicador del catálogo', () => {
    INDICATOR_KEYS.forEach((key) => {
      const texto = formatIndicatorDetail(key, DETALLES[key])
      expect(texto, key).toBeTruthy()
      expect(texto, key).not.toMatch(/undefined|NaN/)
    })
  })

  it('redacta las frases principales', () => {
    expect(formatIndicatorDetail('tareas', DETALLES.tareas)).toBe('4 de 7 tareas cerradas a tiempo')
    expect(formatIndicatorDetail('grilla', DETALLES.grilla)).toBe('8 de 12 semanas cumplidas')
    expect(formatIndicatorDetail('pautas', DETALLES.pautas)).toBe('2 de 3 pautas asistidas')
    expect(formatIndicatorDetail('edicion', DETALLES.edicion)).toBe('6 de 9 ediciones listas')
    expect(formatIndicatorDetail('plataformas', DETALLES.plataformas)).toBe(
      '9 de 12 registros de plataformas',
    )
    expect(formatIndicatorDetail('piezas_grabadas', DETALLES.piezas_grabadas)).toBe(
      '12 de 14 piezas grabadas ya editadas',
    )
    expect(formatIndicatorDetail('videos', DETALLES.videos)).toBe(
      '2 de 4 videos capturados ya editados',
    )
    expect(formatIndicatorDetail('edicion_cnp', DETALLES.edicion_cnp)).toBe(
      '3 de 5 piezas de CNP entregadas',
    )
    expect(formatIndicatorDetail('campanas', DETALLES.campanas)).toBe('2 pagadas · 1 orgánica')
    expect(formatIndicatorDetail('fotos', DETALLES.fotos)).toBe(
      '10 de 10 fotos capturadas ya editadas',
    )
  })

  it('usa el singular cuando es 1', () => {
    expect(formatIndicatorDetail('tareas', { total: 1, cumplidas: 1 })).toBe(
      '1 de 1 tarea cerrada a tiempo',
    )
  })

  it('devuelve null con detalle vacío, incompleto o de otra forma — nunca inventa cifras', () => {
    INDICATOR_KEYS.forEach((key) => {
      expect(formatIndicatorDetail(key, {}), key).toBeNull()
      expect(formatIndicatorDetail(key, null), key).toBeNull()
    })
    expect(formatIndicatorDetail('tareas', { total: 'x', cumplidas: 1 })).toBeNull()
    expect(formatIndicatorDetail('indicador_inexistente', { total: 1 })).toBeNull()
  })
})

describe('explainNoData', () => {
  it('explica cuántas hubo y cuántas se necesitan, leyendo el mínimo real', () => {
    expect(MIN_UNITS.tareas).toBe(2)
    expect(explainNoData('tareas', { unidades: 1 })).toBe(
      'Hubo 1 tarea con vencimiento; se necesitan al menos 2',
    )
    expect(explainNoData('tickets', { unidades: 2 })).toBe(
      `Hubo 2 tickets; se necesitan al menos ${MIN_UNITS.tickets}`,
    )
  })

  it('sin actividad cuando no hubo nada', () => {
    expect(explainNoData('tareas', { unidades: 0 })).toBe('Sin tareas con vencimiento este mes')
    expect(explainNoData('pautas')).toBe('Sin pautas este mes')
  })

  it('grabadas, fotos y videos sin nada grabado: lo dicen con su nombre', () => {
    expect(explainNoData('piezas_grabadas', { unidades: 0 })).toBe('Sin piezas grabadas este mes')
    expect(explainNoData('fotos', { unidades: 0 })).toBe('Sin fotos capturadas este mes')
    expect(explainNoData('videos', { unidades: 0 })).toBe('Sin videos capturados este mes')
    expect(explainNoData('edicion_cnp', { unidades: 0 })).toBe('Sin piezas de CNP este mes')
  })

  it('cubre todos los indicadores sin texto roto', () => {
    INDICATOR_KEYS.forEach((key) => {
      expect(explainNoData(key, { unidades: 0 }), key).not.toMatch(/undefined|NaN/)
    })
  })
})
