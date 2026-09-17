import { render, screen } from '@testing-library/react'
import AvAnalytics from '../components/pautas/AvAnalytics'

const LINES = [{ id: 'l1', name: 'Georgina' }]

const USERS_BY_ID = new Map([
  ['u1', { user_id: 'u1', first_name: 'Diego', last_name: '' }],
  ['u2', { user_id: 'u2', first_name: 'Nadia', last_name: '' }],
])

function pauta(overrides = {}) {
  return {
    id: 'p1',
    status: 'realizada',
    line_id: 'l1',
    formats: [],
    recurso_ids: [],
    piezas_totales: 0,
    piezas_editadas: 0,
    ...overrides,
  }
}

describe('AvAnalytics', () => {
  it('estado vacío: sin pautas, muestra los dos mensajes vacíos', () => {
    render(
      <AvAnalytics pautas={[]} lines={LINES} usersById={USERS_BY_ID} piezasByPauta={new Map()} />,
    )
    expect(screen.getByText('Sin piezas registradas este mes.')).toBeInTheDocument()
    expect(screen.getByText('Aún no hay pautas realizadas.')).toBeInTheDocument()
  })

  it('con reparto por formato, el recurso muestra EXACTAMENTE lo repartido, no el total por cabeza', () => {
    const pautas = [
      pauta({
        recurso_ids: ['u1', 'u2'],
        formats: ['V'],
        piezas_por_formato: { V: { salieron: 10, editadas: 0 } },
        grabacion_por_formato: { V: { u1: 6, u2: 4 } },
        piezas_totales: 10,
      }),
    ]
    render(
      <AvAnalytics
        pautas={pautas}
        lines={LINES}
        usersById={USERS_BY_ID}
        piezasByPauta={new Map()}
      />,
    )
    const rows = screen.getAllByRole('row')
    const diegoRow = rows.find((r) => r.textContent.includes('Diego'))
    const nadiaRow = rows.find((r) => r.textContent.includes('Nadia'))
    expect(diegoRow.textContent).toContain('6')
    expect(nadiaRow.textContent).toContain('4')
    // La suma repartida (6+4=10) es la del total real, no 10+10=20 (el bug del total por cabeza).
    expect(diegoRow.textContent).not.toContain('10')
  })

  it('pauta sin reparto (legacy) muestra el total estimado con ≈ y la nota al pie', () => {
    const pautas = [pauta({ recurso_ids: ['u1'], piezas_totales: 5 })]
    render(
      <AvAnalytics
        pautas={pautas}
        lines={LINES}
        usersById={USERS_BY_ID}
        piezasByPauta={new Map()}
      />,
    )
    expect(screen.getAllByText(/≈\s*5/).length).toBeGreaterThan(0)
    expect(screen.getByText(/pauta sin reparto de captura por formato/)).toBeInTheDocument()
  })

  it('la línea "Piezas por línea" muestra el mismo total/editadas que antes (no cambia el feed del indicador 6)', () => {
    const pautas = [pauta({ piezas_totales: 8, piezas_editadas: 7 })]
    render(
      <AvAnalytics
        pautas={pautas}
        lines={LINES}
        usersById={USERS_BY_ID}
        piezasByPauta={new Map()}
      />,
    )
    expect(screen.getByText('7 / 8 ed.')).toBeInTheDocument()
  })

  it('con desglose por formato, agrega una sub-línea "Video/Reel a/b · Foto c/d"', () => {
    const pautas = [
      pauta({
        formats: ['V', 'F'],
        piezas_por_formato: { V: { salieron: 3, editadas: 2 }, F: { salieron: 40, editadas: 32 } },
        piezas_totales: 43,
        piezas_editadas: 34,
      }),
    ]
    render(
      <AvAnalytics
        pautas={pautas}
        lines={LINES}
        usersById={USERS_BY_ID}
        piezasByPauta={new Map()}
      />,
    )
    expect(screen.getByText('Video/Reel 2/3 · Foto 32/40')).toBeInTheDocument()
  })

  it('edición separada por grupo: video/reel y foto no se suman en la misma columna', () => {
    const pautas = [pauta({ id: 'p1', formats: ['V', 'F'], piezas_totales: 2 })]
    const piezasByPauta = new Map([
      [
        'p1',
        [
          { editor_user_id: 'u1', status: 'listo', formato: 'V' },
          { editor_user_id: 'u1', status: 'listo', formato: 'F' },
        ],
      ],
    ])
    render(
      <AvAnalytics
        pautas={pautas}
        lines={LINES}
        usersById={USERS_BY_ID}
        piezasByPauta={piezasByPauta}
      />,
    )
    const rows = screen.getAllByRole('row')
    const diegoRow = rows.find((r) => r.textContent.includes('Diego'))
    // Editó 1 video y 1 foto — el total de "Editadas" debe ser 2, con el desglose
    // separado por formato (no sumado en una sola columna sin distinguir).
    const editaCell = diegoRow.querySelectorAll('td')[2]
    expect(editaCell.textContent).toContain('2')
    expect(editaCell.textContent).toContain('1 video')
    expect(editaCell.textContent).toContain('1 foto')
  })

  it('una persona con reparto real en una pauta y sin reparto en otra muestra AMBOS (no se oculta uno al otro)', () => {
    const pautas = [
      pauta({
        id: 'p1',
        recurso_ids: ['u1'],
        formats: ['V'],
        piezas_por_formato: { V: { salieron: 6, editadas: 0 } },
        grabacion_por_formato: { V: { u1: 6 } },
        piezas_totales: 6,
      }),
      pauta({ id: 'p2', recurso_ids: ['u1'], piezas_totales: 4 }),
    ]
    render(
      <AvAnalytics
        pautas={pautas}
        lines={LINES}
        usersById={USERS_BY_ID}
        piezasByPauta={new Map()}
      />,
    )
    const rows = screen.getAllByRole('row')
    const diegoRow = rows.find((r) => r.textContent.includes('Diego'))
    const capturaCell = diegoRow.querySelectorAll('td')[1]
    // Total = 6 (reparto real) + 4 (legacy) = 10, marcado con ≈ por tener parte estimada.
    expect(capturaCell.textContent).toContain('10')
    expect(capturaCell.textContent).toContain('≈')
    // El desglose muestra el reparto real de video Y el bloque estimado, no solo uno.
    expect(capturaCell.textContent).toContain('6 video')
    expect(capturaCell.textContent).toContain('4 sin desglosar')
  })
})
