import { describe, it, expect, vi, beforeEach } from 'vitest'

const queryMock = vi.fn()
const releaseMock = vi.fn()
const connectMock = vi.fn(async () => ({ query: queryMock, release: releaseMock }))

vi.mock('pg', () => ({
  default: {
    Pool: vi.fn().mockImplementation(function PoolMock() {
      return { connect: connectMock }
    }),
  },
}))

const runInternalQueryMock = vi.fn()
vi.mock('./db.js', () => ({
  runInternalQuery: (...args) => runInternalQueryMock(...args),
}))

const OWN_TASK = {
  id: 'task-1',
  status: 'Pendiente',
  assignee_id: null,
  assignee_ids: ['dev-1', 'otro-2'],
  created_by: 'jefe-9',
}

describe('mcpWriteTaskUpdates', () => {
  let updateTask, addTaskComment, todayCaracas, ValidationError

  beforeEach(async () => {
    vi.clearAllMocks()
    queryMock.mockReset()
    runInternalQueryMock.mockReset()
    runInternalQueryMock.mockResolvedValue({ rows: [OWN_TASK] })
    queryMock.mockResolvedValue({ rows: [{ id: 'task-1' }] })
    process.env.SUPABASE_WRITER_DB_URL = 'postgres://mcp_writer:x@localhost:5432/postgres'
    process.env.MCP_COMPANY_ID = 'company-1'
    vi.resetModules()
    ;({ updateTask, addTaskComment, todayCaracas } = await import('./mcpWriteTaskUpdates.js'))
    ;({ ValidationError } = await import('./mcpWrite.js'))
  })

  describe('todayCaracas', () => {
    it('usa la fecha de Venezuela (UTC-4), no la de UTC', () => {
      // 02:00 UTC del 5 de octubre = 22:00 del 4 de octubre en Caracas
      expect(todayCaracas(new Date('2026-10-05T02:00:00Z'))).toBe('2026-10-04')
    })
  })

  describe('updateTask', () => {
    it('marca Terminado con closed_date de hoy y limpia blocked_reason', async () => {
      await updateTask({ id: 'task-1', status: 'Terminado', updated_by: 'dev-1' })
      const [sql, params] = queryMock.mock.calls[0]
      expect(sql).toMatch(
        /update public\.tasks set status = \$1, closed_date = \$2, blocked_reason = \$3/,
      )
      expect(sql).toMatch(/where id = \$4 and company_id = \$5/)
      expect(params[0]).toBe('Terminado')
      expect(params[1]).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(params[2]).toBeNull()
      expect(params.slice(3)).toEqual(['task-1', 'company-1'])
      expect(releaseMock).toHaveBeenCalled()
    })

    it('al pasar a En proceso limpia closed_date', async () => {
      await updateTask({ id: 'task-1', status: 'En proceso', updated_by: 'dev-1' })
      const [, params] = queryMock.mock.calls[0]
      expect(params.slice(0, 3)).toEqual(['En proceso', null, null])
    })

    it('Paralizado exige blocked_reason y lo guarda recortado', async () => {
      await expect(
        updateTask({ id: 'task-1', status: 'Paralizado', updated_by: 'dev-1' }),
      ).rejects.toBeInstanceOf(ValidationError)
      await updateTask({
        id: 'task-1',
        status: 'Paralizado',
        blocked_reason: '  falta info del cliente ',
        updated_by: 'dev-1',
      })
      const [, params] = queryMock.mock.calls[0]
      expect(params.slice(0, 3)).toEqual(['Paralizado', null, 'falta info del cliente'])
    })

    it('rechaza estados que no existen', async () => {
      await expect(
        updateTask({ id: 'task-1', status: 'Completado', updated_by: 'dev-1' }),
      ).rejects.toThrow(/status debe ser uno de/)
      expect(queryMock).not.toHaveBeenCalled()
    })

    it('permite al creador de la tarea aunque no sea responsable', async () => {
      await updateTask({ id: 'task-1', status: 'Terminado', updated_by: 'jefe-9' })
      expect(queryMock).toHaveBeenCalledTimes(1)
    })

    it('permite al responsable legacy (assignee_id)', async () => {
      runInternalQueryMock.mockResolvedValue({
        rows: [{ ...OWN_TASK, assignee_id: 'legacy-3', assignee_ids: [] }],
      })
      await updateTask({ id: 'task-1', status: 'Terminado', updated_by: 'legacy-3' })
      expect(queryMock).toHaveBeenCalledTimes(1)
    })

    it('rechaza tareas ajenas sin escribir nada', async () => {
      await expect(
        updateTask({ id: 'task-1', status: 'Terminado', updated_by: 'ajeno-7' }),
      ).rejects.toThrow(/asignadas a ti o creadas por ti/)
      expect(connectMock).not.toHaveBeenCalled()
    })

    it('busca la tarea acotada a la empresa del MCP', async () => {
      runInternalQueryMock.mockResolvedValue({ rows: [] })
      await expect(
        updateTask({ id: 'task-x', status: 'Terminado', updated_by: 'dev-1' }),
      ).rejects.toThrow(/no existe/)
      expect(runInternalQueryMock.mock.calls[0][1]).toEqual(['task-x', 'company-1'])
    })
  })

  describe('addTaskComment', () => {
    it('inserta el comentario con company_id y author_id fijados por el servidor', async () => {
      await addTaskComment({ task_id: 'task-1', content: '  PR: https://x/1 ', author_id: 'dev-1' })
      const [sql, params] = queryMock.mock.calls[0]
      expect(sql).toMatch(/insert into public\.task_comments/)
      expect(params).toEqual(['task-1', 'company-1', 'dev-1', 'PR: https://x/1'])
    })

    it('rechaza comentarios vacíos o demasiado largos', async () => {
      await expect(
        addTaskComment({ task_id: 'task-1', content: '   ', author_id: 'dev-1' }),
      ).rejects.toBeInstanceOf(ValidationError)
      await expect(
        addTaskComment({ task_id: 'task-1', content: 'x'.repeat(4001), author_id: 'dev-1' }),
      ).rejects.toThrow(/4000/)
      expect(queryMock).not.toHaveBeenCalled()
    })

    it('rechaza comentar tareas ajenas', async () => {
      await expect(
        addTaskComment({ task_id: 'task-1', content: 'hola', author_id: 'ajeno-7' }),
      ).rejects.toThrow(/asignadas a ti o creadas por ti/)
      expect(queryMock).not.toHaveBeenCalled()
    })
  })
})
