import { describe, it, expect, vi, beforeEach } from 'vitest'

const requireUserMock = vi.fn()
const fromMock = vi.fn()
const generateContentMock = vi.fn()

vi.mock('./requireUser.js', () => ({ requireUser: requireUserMock }))
vi.mock('./supabase.js', () => ({ supabase: { from: (...args) => fromMock(...args) } }))
vi.mock('@google/genai', () => ({
  GoogleGenAI: vi.fn().mockImplementation(function () {
    this.models = { generateContent: generateContentMock }
  }),
}))

const { handler } = await import('../evaluation-analysis.js')

function makeEvent(body) {
  return { httpMethod: 'POST', body: JSON.stringify(body), headers: { authorization: 'Bearer t' } }
}

// users.select().eq().single() (lookup del empleado objetivo o del fullCaller)
function singleChain(result) {
  const builder = { select: () => builder, eq: () => builder, single: async () => result }
  return builder
}

// evaluation_sessions.select().eq().eq().limit() (chequeo de manager)
function managerChain(result) {
  const builder = { select: () => builder, eq: () => builder, limit: async () => result }
  return builder
}

// module_permissions.select().eq().eq().maybeSingle()
function permRowChain(result) {
  const builder = { select: () => builder, eq: () => builder, maybeSingle: async () => result }
  return builder
}

// evaluation_sessions.select().eq().order() (historial final para la IA)
function sessionsChain(result) {
  const builder = { select: () => builder, eq: () => builder, order: async () => result }
  return builder
}

const SESSIONS_OK = {
  data: [
    { period: '2026-01-01', total_score: 4, evaluation_responses: [], evaluation_comments: [] },
  ],
  error: null,
}

describe('evaluation-analysis.js handler — autorización (Bloque 1.9)', () => {
  beforeEach(() => {
    fromMock.mockReset()
    requireUserMock.mockReset()
    generateContentMock.mockReset()
    process.env.GEMINI_API_KEY = 'test-key'
    generateContentMock.mockResolvedValue({
      text: JSON.stringify({ summary: 'ok', strengths: [], weaknesses: [], recommendations: [] }),
    })
  })

  it('permite (sin fila de capability = abierto, misma convención que el resto de la app)', async () => {
    requireUserMock.mockResolvedValue({ caller: { user_id: 'compañero-1', company_id: 'c1' } })
    fromMock
      .mockReturnValueOnce(
        singleChain({ data: { user_id: 'emp-1', company_id: 'c1' }, error: null }),
      ) // empleado objetivo
      .mockReturnValueOnce(managerChain({ data: [], error: null })) // no es su manager
      .mockReturnValueOnce(
        singleChain({
          data: { user_id: 'compañero-1', admin: false, access_level: 1, company_id: 'c1' },
          error: null,
        }),
      ) // fullCaller
      .mockReturnValueOnce(permRowChain({ data: null, error: null })) // sin fila = abierto
      .mockReturnValueOnce(sessionsChain(SESSIONS_OK))

    const res = await handler(makeEvent({ employeeId: 'emp-1' }))
    expect(res.statusCode).toBe(200)
  })

  it('deniega (403) cuando evaluaciones.empleados está restringida a nivel 4 y el caller es nivel 1', async () => {
    requireUserMock.mockResolvedValue({ caller: { user_id: 'compañero-1', company_id: 'c1' } })
    fromMock
      .mockReturnValueOnce(
        singleChain({ data: { user_id: 'emp-1', company_id: 'c1' }, error: null }),
      )
      .mockReturnValueOnce(managerChain({ data: [], error: null }))
      .mockReturnValueOnce(
        singleChain({
          data: { user_id: 'compañero-1', admin: false, access_level: 1, company_id: 'c1' },
          error: null,
        }),
      )
      .mockReturnValueOnce(
        permRowChain({
          data: {
            rules: { deny: [], rules: [{ all: [{ type: 'min_level', value: 4, ids: [] }] }] },
          },
          error: null,
        }),
      )

    const res = await handler(makeEvent({ employeeId: 'emp-1' }))
    expect(res.statusCode).toBe(403)
  })

  it('permite al propio empleado pedir su análisis sin más chequeos', async () => {
    requireUserMock.mockResolvedValue({ caller: { user_id: 'emp-1', company_id: 'c1' } })
    fromMock
      .mockReturnValueOnce(
        singleChain({ data: { user_id: 'emp-1', company_id: 'c1' }, error: null }),
      )
      .mockReturnValueOnce(sessionsChain(SESSIONS_OK))

    const res = await handler(makeEvent({ employeeId: 'emp-1' }))
    expect(res.statusCode).toBe(200)
    expect(fromMock).toHaveBeenCalledTimes(2)
  })

  it('permite al manager (evaluador) de ese empleado', async () => {
    requireUserMock.mockResolvedValue({ caller: { user_id: 'manager-1', company_id: 'c1' } })
    fromMock
      .mockReturnValueOnce(
        singleChain({ data: { user_id: 'emp-1', company_id: 'c1' }, error: null }),
      )
      .mockReturnValueOnce(managerChain({ data: [{ id: 1 }], error: null })) // sí es su manager
      .mockReturnValueOnce(sessionsChain(SESSIONS_OK))

    const res = await handler(makeEvent({ employeeId: 'emp-1' }))
    expect(res.statusCode).toBe(200)
  })
})
