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

  it('cuenta las celdas de Chequeo de una cuenta movida por client_id, no por el line_id de la celda', () => {
    const clients = [
      {
        id: 'c-1',
        name: 'Dra. Daniella Negrette',
        line_id: 'line-sabrina',
        fixed_tasks: null,
        social_links: [{ red: 'Instagram' }],
      },
    ]
    // Semanas 1-3 registradas antes del cambio de línea (line_id viejo), la 4 después.
    const checks = [1, 2, 3].map((period_week) => ({
      client_id: 'c-1',
      line_id: 'line-old',
      network: 'Instagram',
      content_type: 'publicaciones',
      period_week,
      last_published_at: '2026-07-10',
    }))
    checks.push({
      client_id: 'c-1',
      line_id: 'line-sabrina',
      network: 'Instagram',
      content_type: 'publicaciones',
      period_week: 4,
      last_published_at: '2026-07-24',
    })

    render(
      <FixedTasksReportPreview
        lines={[LINE]}
        clients={clients}
        marks={[]}
        weeks={WEEKS}
        checks={checks}
        showMatrix={false}
        lineLabel="Team Sabrina"
      />,
    )

    const row = screen.getByText('Actualización de Plataformas').closest('.flex.items-center.gap-3')
    const realWrap = within(row).getByText('Real').parentElement
    // Sin el fix solo se contaba la celda con line_id 'line-sabrina' → 1.
    expect(realWrap.children[1].textContent).toBe('4')
  })

  // El panel recibe `weeks` desde TareasFijasPage y se lo pasa a computeProductividad y a
  // computePlataformasProductividad. Estos dos casos fijan ese cableado: sin él, el panel
  // mostraría un número distinto al del reporte para el mismo mes de 5 semanas.
  describe('mes de 5 semanas: la 5.ª semana', () => {
    const clienteConRed = [
      {
        id: 'c-1',
        name: 'Cuenta',
        line_id: 'line-sabrina',
        fixed_tasks: null,
        social_links: [{ red: 'Instagram' }],
      },
    ]

    function renderWith({ marks = [], checks = [] }) {
      render(
        <FixedTasksReportPreview
          lines={[LINE]}
          clients={clienteConRed}
          marks={marks}
          weeks={WEEKS}
          checks={checks}
          showMatrix={false}
          lineLabel="Team Sabrina"
        />,
      )
    }

    function valuesOf(label) {
      const row = screen.getByText(label).closest('.flex.items-center.gap-3')
      return {
        real: within(row).getByText('Real').parentElement.children[1].textContent,
        meta: within(row).getByText('Meta').parentElement.children[1].textContent,
      }
    }

    it('no cuenta grilla ni artes, pero sí calendario', () => {
      renderWith({
        marks: [
          { client_id: 'c-1', task_key: 'grilla', period_week: 5, status: 'si' },
          { client_id: 'c-1', task_key: 'artes', period_week: 5, status: 'si' },
          { client_id: 'c-1', task_key: 'calendario', period_week: 5, status: 'si' },
        ],
      })
      // Meta 4 (semanas 1-4) y real 0: el "si" de la 5.ª semana no suma por ningún lado.
      expect(valuesOf('Grillas Redes → Diseño')).toEqual({ real: '0', meta: '4' })
      expect(valuesOf('Grillas Diseño → Redes')).toEqual({ real: '0', meta: '4' })
      expect(valuesOf('Calendario')).toEqual({ real: '1', meta: '1' })
    })

    it('no cuenta un registro de Plataformas puesto solo en la 5.ª semana', () => {
      renderWith({
        checks: [
          {
            client_id: 'c-1',
            line_id: 'line-sabrina',
            network: 'Instagram',
            content_type: 'publicaciones',
            period_week: 5,
            last_published_at: '2026-07-29',
          },
        ],
      })
      expect(valuesOf('Actualización de Plataformas').real).toBe('0')
    })
  })
})
