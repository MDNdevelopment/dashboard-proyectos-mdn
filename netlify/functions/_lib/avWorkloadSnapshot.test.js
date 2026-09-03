import { describe, it, expect } from 'vitest'
import { buildAvWorkloadSnapshot } from './avWorkloadSnapshot.js'

const TODAY = new Date(2026, 8, 2) // 2026-09-02 (mes 0-indexado)

const AUDIOVISUAL_EMPLOYEES = [
  { user_id: 'a1', first_name: 'Ana', last_name: 'Pérez', department_id: 2, deleted_at: null },
  { user_id: 'a2', first_name: 'Luis', last_name: 'Gómez', department_id: 2, deleted_at: null },
  { user_id: 'r1', first_name: 'Marta', last_name: 'Ruiz', department_id: 1, deleted_at: null }, // no es Audiovisual
  {
    user_id: 'a3',
    first_name: 'Baja',
    last_name: 'Da',
    department_id: 2,
    deleted_at: '2026-01-01',
  },
]

function pauta(overrides) {
  return {
    id: 'p',
    client_name: 'Cliente X',
    tema: 'Tema',
    pauta_date: '2026-09-02',
    salida: '09:00',
    llegada: '10:00',
    status: 'programada',
    recurso_ids: ['a1'],
    ...overrides,
  }
}

describe('buildAvWorkloadSnapshot', () => {
  it('no marca sobrecarga con 2 pautas en un día (umbral 3)', () => {
    const pautas = [
      pauta({ id: 'p1', recurso_ids: ['a1'] }),
      pauta({ id: 'p2', recurso_ids: ['a1'] }),
    ]
    const snap = buildAvWorkloadSnapshot({ pautas, employees: AUDIOVISUAL_EMPLOYEES, today: TODAY })
    expect(snap.sobrecargas).toEqual([])
  })

  it('marca sobrecarga con 3 pautas del mismo recurso en el mismo día', () => {
    const pautas = [
      pauta({ id: 'p1', recurso_ids: ['a1'] }),
      pauta({ id: 'p2', recurso_ids: ['a1'] }),
      pauta({ id: 'p3', recurso_ids: ['a1'] }),
    ]
    const snap = buildAvWorkloadSnapshot({ pautas, employees: AUDIOVISUAL_EMPLOYEES, today: TODAY })
    expect(snap.sobrecargas).toHaveLength(1)
    expect(snap.sobrecargas[0]).toMatchObject({
      persona: 'Ana Pérez',
      fecha: '2026-09-02',
      cantidad: 3,
    })
  })

  it('cada pauta de una sobrecarga conserva su estado (realizada vs programada), para que el modelo no confunda el tiempo verbal', () => {
    const pautas = [
      pauta({ id: 'p1', recurso_ids: ['a1'], status: 'programada' }),
      pauta({ id: 'p2', recurso_ids: ['a1'], status: 'programada' }),
      pauta({ id: 'p3', recurso_ids: ['a1'], status: 'programada' }),
    ]
    const snap = buildAvWorkloadSnapshot({ pautas, employees: AUDIOVISUAL_EMPLOYEES, today: TODAY })
    expect(snap.sobrecargas[0].pautas).toEqual([
      { cliente: 'Cliente X', tema: 'Tema', estado: 'programada' },
      { cliente: 'Cliente X', tema: 'Tema', estado: 'programada' },
      { cliente: 'Cliente X', tema: 'Tema', estado: 'programada' },
    ])
  })

  it('ventana ±3 días: un día fuera de rango (día 4) no cuenta', () => {
    const pautas = [
      pauta({ id: 'p1', pauta_date: '2026-09-06', status: 'programada' }), // hoy+4, fuera
      pauta({ id: 'p2', pauta_date: '2026-09-06', status: 'programada' }),
      pauta({ id: 'p3', pauta_date: '2026-09-06', status: 'programada' }),
    ]
    const snap = buildAvWorkloadSnapshot({ pautas, employees: AUDIOVISUAL_EMPLOYEES, today: TODAY })
    expect(snap.sobrecargas).toEqual([])
    expect(snap.dias).toEqual([])
  })

  it('un día dentro de la ventana sí cuenta (hoy+3)', () => {
    const pautas = [
      pauta({ id: 'p1', pauta_date: '2026-09-05', status: 'programada' }),
      pauta({ id: 'p2', pauta_date: '2026-09-05', status: 'programada' }),
      pauta({ id: 'p3', pauta_date: '2026-09-05', status: 'programada' }),
    ]
    const snap = buildAvWorkloadSnapshot({ pautas, employees: AUDIOVISUAL_EMPLOYEES, today: TODAY })
    expect(snap.sobrecargas).toHaveLength(1)
  })

  it('en el pasado solo cuenta status realizada; programada en el pasado se ignora', () => {
    const pautas = [
      pauta({ id: 'p1', pauta_date: '2026-08-31', status: 'programada' }),
      pauta({ id: 'p2', pauta_date: '2026-08-31', status: 'programada' }),
      pauta({ id: 'p3', pauta_date: '2026-08-31', status: 'programada' }),
    ]
    const snap = buildAvWorkloadSnapshot({ pautas, employees: AUDIOVISUAL_EMPLOYEES, today: TODAY })
    expect(snap.sobrecargas).toEqual([])
  })

  it('en el futuro solo cuenta programada/realizada, no solicitada ni declinada', () => {
    const pautas = [
      pauta({ id: 'p1', pauta_date: '2026-09-04', status: 'solicitada' }),
      pauta({ id: 'p2', pauta_date: '2026-09-04', status: 'declinada' }),
      pauta({ id: 'p3', pauta_date: '2026-09-04', status: 'programada' }),
    ]
    const snap = buildAvWorkloadSnapshot({ pautas, employees: AUDIOVISUAL_EMPLOYEES, today: TODAY })
    expect(snap.sobrecargas).toEqual([])
  })

  it('ignora recursos externos (ext:<uuid>)', () => {
    const pautas = [
      pauta({ id: 'p1', recurso_ids: ['ext:xyz'] }),
      pauta({ id: 'p2', recurso_ids: ['ext:xyz'] }),
      pauta({ id: 'p3', recurso_ids: ['ext:xyz'] }),
    ]
    const snap = buildAvWorkloadSnapshot({ pautas, employees: AUDIOVISUAL_EMPLOYEES, today: TODAY })
    expect(snap.sobrecargas).toEqual([])
  })

  it('ignora empleados que no son de Audiovisual (department_id !== 2)', () => {
    const pautas = [
      pauta({ id: 'p1', recurso_ids: ['r1'] }),
      pauta({ id: 'p2', recurso_ids: ['r1'] }),
      pauta({ id: 'p3', recurso_ids: ['r1'] }),
    ]
    const snap = buildAvWorkloadSnapshot({ pautas, employees: AUDIOVISUAL_EMPLOYEES, today: TODAY })
    expect(snap.sobrecargas).toEqual([])
  })

  it('ignora empleados eliminados (deleted_at)', () => {
    const pautas = [
      pauta({ id: 'p1', recurso_ids: ['a3'] }),
      pauta({ id: 'p2', recurso_ids: ['a3'] }),
      pauta({ id: 'p3', recurso_ids: ['a3'] }),
    ]
    const snap = buildAvWorkloadSnapshot({ pautas, employees: AUDIOVISUAL_EMPLOYEES, today: TODAY })
    expect(snap.sobrecargas).toEqual([])
  })

  it('sobrecargas vacío cuando no hay nada, pero conserva hoy/ventana', () => {
    const snap = buildAvWorkloadSnapshot({
      pautas: [],
      employees: AUDIOVISUAL_EMPLOYEES,
      today: TODAY,
    })
    expect(snap.sobrecargas).toEqual([])
    expect(snap.hoy).toBe('2026-09-02')
    expect(snap.ventana).toEqual({ desde: '2026-08-30', hasta: '2026-09-05' })
  })

  it('el umbral es configurable', () => {
    const pautas = [
      pauta({ id: 'p1', recurso_ids: ['a1'] }),
      pauta({ id: 'p2', recurso_ids: ['a1'] }),
    ]
    const snap = buildAvWorkloadSnapshot({
      pautas,
      employees: AUDIOVISUAL_EMPLOYEES,
      today: TODAY,
      umbral: 2,
    })
    expect(snap.sobrecargas).toHaveLength(1)
  })
})
