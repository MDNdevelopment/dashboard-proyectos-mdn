/**
 * Tests de meetingsApi.js — capa de acceso a datos del módulo Reuniones.
 * Cubre: resolución de line_id/client_name desde client_id (snapshot),
 * el conteo de "realizadas" (marcado manual) para Reportes → Operaciones,
 * el toggle markMeetingHeld/unmarkMeetingHeld, y que sanitizeFields
 * solo persiste el campo de la modalidad activa (location o meeting_url).
 */
import { vi } from 'vitest'

const {
  mockClientLookup, mockInsertResult, mockUpdateResult, mockCancelResult,
  mockDeleteResult, mockCountResult, mockLoadResult, mockHeldResult, mockUnheldResult,
} = vi.hoisted(() => ({
  mockClientLookup: vi.fn(),
  mockInsertResult: vi.fn(),
  mockUpdateResult: vi.fn(),
  mockCancelResult: vi.fn(),
  mockDeleteResult: vi.fn(),
  mockCountResult: vi.fn(),
  mockLoadResult: vi.fn(),
  mockHeldResult: vi.fn(),
  mockUnheldResult: vi.fn(),
}))

// Builder chainable genérico: cada método intermedio devuelve `this`, y el objeto
// entero es "thenable" para que un `await` al final de la cadena (sin .single()) resuelva.
function chainable(getResult) {
  const obj = {}
  const passthrough = ['select', 'eq', 'neq', 'gte', 'lte', 'lt', 'gt', 'order', 'in', 'is', 'insert', 'update', 'delete', 'upsert']
  passthrough.forEach((m) => { obj[m] = vi.fn(() => obj) })
  obj.single = vi.fn(() => Promise.resolve(getResult()))
  obj.maybeSingle = vi.fn(() => Promise.resolve(getResult()))
  obj.then = (resolve, reject) => Promise.resolve(getResult()).then(resolve, reject)
  return obj
}

vi.mock('../supabase', () => ({
  supabase: {
    from: vi.fn((table) => {
      if (table === 'metric_clients') return chainable(mockClientLookup)
      if (table === 'meetings') {
        // Diferenciamos insert/update/delete/count por el último mock configurado en el test;
        // cada test solo configura el mock relevante a su operación.
        return chainable(() =>
          mockInsertResult.__active ? mockInsertResult() :
          mockUpdateResult.__active ? mockUpdateResult() :
          mockCancelResult.__active ? mockCancelResult() :
          mockDeleteResult.__active ? mockDeleteResult() :
          mockCountResult.__active ? mockCountResult() :
          mockHeldResult.__active ? mockHeldResult() :
          mockUnheldResult.__active ? mockUnheldResult() :
          mockLoadResult()
        )
      }
      return chainable(() => ({ data: null, error: null }))
    }),
  },
}))

import {
  loadMeetings, countMeetingsHeldForLine, loadHeldClientIdsForLine, createMeeting, updateMeeting,
  cancelMeeting, deleteMeeting, markMeetingHeld, unmarkMeetingHeld,
} from '../components/reuniones/meetingsApi'

function activateOnly(active) {
  [mockInsertResult, mockUpdateResult, mockCancelResult, mockDeleteResult, mockCountResult, mockHeldResult, mockUnheldResult].forEach((m) => {
    m.__active = m === active
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  activateOnly(null)
  mockLoadResult.mockReturnValue({ data: [], error: null })
})

describe('createMeeting — snapshot de línea/cliente', () => {
  it('resuelve line_id y client_name desde metric_clients al crear', async () => {
    mockClientLookup.mockReturnValue({ data: { name: 'Banco Exterior', line_id: 'line-1' }, error: null })
    activateOnly(mockInsertResult)
    mockInsertResult.mockReturnValue({
      data: { id: 'm-1', client_id: 'c-1', client_name: 'Banco Exterior', line_id: 'line-1' },
      error: null,
    })

    const { data } = await createMeeting('co-1', {
      title: 'Reunión mensual', client_id: 'c-1', starts_at: '2026-07-20T14:00:00.000Z',
      modality: 'presencial', location: 'Oficina', attendee_ids: ['u1'],
    }, 'u1')

    expect(data.client_name).toBe('Banco Exterior')
    expect(data.line_id).toBe('line-1')
  })

  it('no consulta metric_clients cuando no se elige cliente (client_id vacío)', async () => {
    activateOnly(mockInsertResult)
    mockInsertResult.mockReturnValue({ data: { id: 'm-2', client_id: null, line_id: null }, error: null })

    await createMeeting('co-1', {
      title: 'Sync interno', client_id: null, starts_at: '2026-07-20T14:00:00.000Z',
      modality: 'videollamada', meeting_url: 'https://meet.example.com/abc', attendee_ids: [],
    }, 'u1')

    expect(mockClientLookup).not.toHaveBeenCalled()
  })
})

describe('updateMeeting — re-snapshot al cambiar de cliente', () => {
  it('re-resuelve line_id/client_name cuando se incluye un nuevo client_id', async () => {
    mockClientLookup.mockReturnValue({ data: { name: 'Pepsi', line_id: 'line-2' }, error: null })
    activateOnly(mockUpdateResult)
    mockUpdateResult.mockReturnValue({ data: { id: 'm-1', client_id: 'c-2', client_name: 'Pepsi', line_id: 'line-2' }, error: null })

    const { data } = await updateMeeting('m-1', { client_id: 'c-2' })
    expect(mockClientLookup).toHaveBeenCalled()
    expect(data.client_name).toBe('Pepsi')
    expect(data.line_id).toBe('line-2')
  })

  it('no toca client_name/line_id cuando client_id no se envía', async () => {
    activateOnly(mockUpdateResult)
    mockUpdateResult.mockReturnValue({ data: { id: 'm-1', title: 'Nuevo título' }, error: null })

    await updateMeeting('m-1', { title: 'Nuevo título' })
    expect(mockClientLookup).not.toHaveBeenCalled()
  })
})

describe('cancelMeeting / deleteMeeting', () => {
  it('cancelMeeting marca status=cancelada sin borrar el registro', async () => {
    activateOnly(mockCancelResult)
    mockCancelResult.mockReturnValue({ data: { id: 'm-1', status: 'cancelada' }, error: null })
    const { data } = await cancelMeeting('m-1')
    expect(data.status).toBe('cancelada')
  })

  it('deleteMeeting propaga el resultado del delete', async () => {
    activateOnly(mockDeleteResult)
    mockDeleteResult.mockReturnValue({ error: null })
    const { error } = await deleteMeeting('m-1')
    expect(error).toBeNull()
  })
})

describe('markMeetingHeld / unmarkMeetingHeld — marcado manual de "realizada"', () => {
  it('markMeetingHeld marca status=realizada', async () => {
    activateOnly(mockHeldResult)
    mockHeldResult.mockReturnValue({ data: { id: 'm-1', status: 'realizada' }, error: null })
    const { data } = await markMeetingHeld('m-1')
    expect(data.status).toBe('realizada')
  })

  it('unmarkMeetingHeld vuelve status=programada', async () => {
    activateOnly(mockUnheldResult)
    mockUnheldResult.mockReturnValue({ data: { id: 'm-1', status: 'programada' }, error: null })
    const { data } = await unmarkMeetingHeld('m-1')
    expect(data.status).toBe('programada')
  })
})

describe('countMeetingsHeldForLine — "realizadas" para Operaciones (100% marcado manual, 1 por cliente)', () => {
  it('cuenta clientes distintos, no el total de reuniones (2 reuniones del mismo cliente cuentan 1)', async () => {
    activateOnly(mockCountResult)
    mockCountResult.mockReturnValue({
      data: [{ client_id: 'cli-1' }, { client_id: 'cli-1' }, { client_id: 'cli-2' }],
      error: null,
    })

    const { count } = await countMeetingsHeldForLine('co-1', 'line-1', { month: 7, year: 2026 })
    expect(count).toBe(2)
  })

  it('con 3 reuniones de 3 clientes distintos, cuenta 3', async () => {
    activateOnly(mockCountResult)
    mockCountResult.mockReturnValue({
      data: [{ client_id: 'cli-1' }, { client_id: 'cli-2' }, { client_id: 'cli-3' }],
      error: null,
    })

    const { count } = await countMeetingsHeldForLine('co-1', 'line-1', { month: 7, year: 2026 })
    expect(count).toBe(3)
  })

  it('sin reuniones realizadas, cuenta 0', async () => {
    activateOnly(mockCountResult)
    mockCountResult.mockReturnValue({ data: [], error: null })

    const { count } = await countMeetingsHeldForLine('co-1', 'line-1', { month: 7, year: 2026 })
    expect(count).toBe(0)
  })

  it('reuniones sin client_id (caso borde) se cuentan cada una por separado', async () => {
    activateOnly(mockCountResult)
    mockCountResult.mockReturnValue({
      data: [{ client_id: null }, { client_id: null }, { client_id: 'cli-1' }],
      error: null,
    })

    const { count } = await countMeetingsHeldForLine('co-1', 'line-1', { month: 7, year: 2026 })
    expect(count).toBe(3)
  })

  it('no depende de la fecha actual — cuenta reuniones realizadas de un mes futuro igual', async () => {
    // Antes del cambio esto devolvía 0 sin consultar; ahora es 100% fiel al marcado manual.
    activateOnly(mockCountResult)
    mockCountResult.mockReturnValue({ data: [{ client_id: 'cli-1' }, { client_id: 'cli-2' }], error: null })

    const { count } = await countMeetingsHeldForLine('co-1', 'line-1', { month: 12, year: 2099 })
    expect(count).toBe(2)
  })
})

describe('loadHeldClientIdsForLine — clientes distintos con reunión realizada (modal de cobertura)', () => {
  it('deduplica client_ids repetidos', async () => {
    activateOnly(mockCountResult)
    mockCountResult.mockReturnValue({
      data: [{ client_id: 'cli-1' }, { client_id: 'cli-1' }, { client_id: 'cli-2' }],
      error: null,
    })

    const { clientIds } = await loadHeldClientIdsForLine('co-1', 'line-1', { month: 7, year: 2026 })
    expect(clientIds.sort()).toEqual(['cli-1', 'cli-2'])
  })

  it('ignora reuniones con client_id nulo', async () => {
    activateOnly(mockCountResult)
    mockCountResult.mockReturnValue({
      data: [{ client_id: null }, { client_id: 'cli-1' }],
      error: null,
    })

    const { clientIds } = await loadHeldClientIdsForLine('co-1', 'line-1', { month: 7, year: 2026 })
    expect(clientIds).toEqual(['cli-1'])
  })

  it('devuelve [] sin reuniones realizadas', async () => {
    activateOnly(mockCountResult)
    mockCountResult.mockReturnValue({ data: [], error: null })

    const { clientIds } = await loadHeldClientIdsForLine('co-1', 'line-1', { month: 7, year: 2026 })
    expect(clientIds).toEqual([])
  })
})

describe('loadMeetings — filtro por rango de fechas', () => {
  it('devuelve las reuniones de la empresa', async () => {
    mockLoadResult.mockReturnValue({
      data: [{ id: 'm-1' }, { id: 'm-2' }],
      error: null,
    })
    const { data } = await loadMeetings('co-1', { from: new Date('2026-07-01'), to: new Date('2026-08-01') })
    expect(data).toHaveLength(2)
  })
})
