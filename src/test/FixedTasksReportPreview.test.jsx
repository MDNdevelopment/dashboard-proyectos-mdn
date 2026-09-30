import { render, screen, within } from '@testing-library/react'
import FixedTasksReportPreview from '../components/tareas-fijas/FixedTasksReportPreview'
import { buildFixedWeeks } from '../utils/fixedTasks'

// Cuenta que cambió de línea a mitad de mes: sus marcas de semanas anteriores al
// cambio conservan el line_id de quien las hizo (snapshot), pero deben sumar en
// el "Real" de la línea que hoy es dueña de la cuenta (misma línea que aporta la
// "Meta" vía metric_clients.line_id) — ver 20260930000000_fixed_task_marks_owner_rls
// y el punto 4 del fix de RLS de fixed_task_marks.
const YEAR = 2026
const MONTH = 7 // 5 semanas (mismo mes usado en fixedTasks.test.js)
const WEEKS = buildFixedWeeks(YEAR, MONTH)

const LINE = { id: 'line-sabrina', name: 'Team Sabrina' }
const CLIENTS = [
  { id: 'c-1', name: 'Dra. Daniella Negrette', line_id: 'line-sabrina', fixed_tasks: null },
]

function markSi(overrides) {
  return { task_key: 'grilla', period_week: 1, status: 'si', ...overrides }
}

describe('FixedTasksReportPreview', () => {
  it('cuenta las marcas de una cuenta movida por client_id, no por el line_id snapshot de la marca', () => {
    const marks = [
      // Grabada con el line_id de la línea que hizo el trabajo antes del cambio.
      markSi({ client_id: 'c-1', line_id: 'line-old' }),
    ]

    render(
      <FixedTasksReportPreview
        lines={[LINE]}
        clients={CLIENTS}
        marks={marks}
        weeks={WEEKS}
        checks={[]}
        showMatrix={false}
        lineLabel="Team Sabrina"
      />,
    )

    const row = screen.getByText('Grillas Redes → Diseño').closest('.flex.items-center.gap-3')
    const realWrap = within(row).getByText('Real').parentElement
    const realValue = realWrap.children[1].textContent
    // Sin el fix, la marca (line_id: 'line-old') no se contaría para Team Sabrina y
    // "Real" quedaría en 0 aunque la meta (1 cuenta) sí la reclame la línea.
    expect(realValue).toBe('1')
  })
})
