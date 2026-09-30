import { render, screen, waitFor } from '@testing-library/react'
import { vi } from 'vitest'
import userEvent from '@testing-library/user-event'
import { buildFixedWeeks } from '../utils/fixedTasks'

// Al ciclar una marca YA existente, FixedTasksGrid debe hacer un `update` por id
// (sin volver a mandar line_id) en vez de un `upsert` sobre el payload completo —
// ver 20260930000000_fixed_task_marks_owner_rls: el line_id de una marca es el
// snapshot histórico de quién hizo el trabajo y no debe reescribirse solo porque
// la cuenta cambió de línea entretanto.
const updateSpy = vi.fn()
const upsertSpy = vi.fn()
const chain = {
  eq: vi.fn(() => chain),
  select: vi.fn(() => chain),
  single: vi.fn().mockResolvedValue({ data: { id: 'mark-1', status: 'no' }, error: null }),
}

vi.mock('../supabase', () => ({
  supabase: {
    from: vi.fn(() => ({
      update: (payload) => {
        updateSpy(payload)
        return chain
      },
      upsert: (payload, opts) => {
        upsertSpy(payload, opts)
        return chain
      },
    })),
  },
}))

import FixedTasksGrid from '../components/tareas-fijas/FixedTasksGrid'

const YEAR = 2026
const MONTH = 9
const WEEKS = buildFixedWeeks(YEAR, MONTH)

const CLIENT = {
  id: 'c-1',
  name: 'Dra. Daniella Negrette',
  line_id: 'line-sabrina', // línea dueña actual
  social_manager_id: null,
  designer_id: null,
  fixed_tasks: null,
}

function renderGrid(marks) {
  return render(
    <FixedTasksGrid
      lines={[{ id: 'line-sabrina', name: 'Team Sabrina' }]}
      clients={[CLIENT]}
      companyUsers={[]}
      marks={marks}
      weeks={WEEKS}
      weekN={1}
      year={YEAR}
      month={MONTH}
      companyId="co-1"
      canManage
      userId="u-sabrina"
      onMarkChanged={() => {}}
      groupByLine={false}
    />,
  )
}

describe('FixedTasksGrid', () => {
  beforeEach(() => {
    updateSpy.mockClear()
    upsertSpy.mockClear()
  })

  it('al tildar una marca existente (aunque sea de una línea anterior), actualiza por id sin reescribir line_id', async () => {
    const existingMark = {
      id: 'mark-1',
      client_id: 'c-1',
      task_key: 'metricas',
      period_week: 1,
      status: 'si',
      line_id: 'line-daniellys', // snapshot: la línea que hizo el trabajo, ya no es la dueña
      link: null,
    }
    renderGrid([existingMark])

    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: /Entregado/i }))

    await waitFor(() => expect(updateSpy).toHaveBeenCalled())
    expect(upsertSpy).not.toHaveBeenCalled()
    const payload = updateSpy.mock.calls[0][0]
    expect(payload).not.toHaveProperty('line_id')
    expect(payload).not.toHaveProperty('client_id')
    expect(payload.status).toBe('no')
  })

  it('al tildar una celda sin marca previa, sigue creando con upsert (payload completo)', async () => {
    renderGrid([])

    const user = userEvent.setup()
    await user.click(screen.getAllByRole('button', { name: /Pendiente/i })[0])

    await waitFor(() => expect(upsertSpy).toHaveBeenCalled())
    expect(updateSpy).not.toHaveBeenCalled()
    const [payload, opts] = upsertSpy.mock.calls[0]
    expect(payload.client_id).toBe('c-1')
    expect(payload.line_id).toBe('line-sabrina')
    expect(opts.onConflict).toBe('client_id,task_key,period_year,period_month,period_week,network')
  })
})
