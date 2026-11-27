import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { vi } from 'vitest'
import CampaignChecklist from '../components/ads/CampaignChecklist'

// Wrapper controlado: refleja el patrón real (padre dueño del array).
function Harness({ initial = [], editable = true, canManage = true, onChangeSpy }) {
  const [value, setValue] = useState(initial)
  return (
    <CampaignChecklist
      value={value}
      onChange={(next) => {
        setValue(next)
        onChangeSpy?.(next)
      }}
      editable={editable}
      canManage={canManage}
    />
  )
}

describe('CampaignChecklist', () => {
  it('agrega una acción con "+ Agregar acción" y permite escribir su texto', async () => {
    const user = userEvent.setup()
    render(<Harness />)

    await user.click(screen.getByRole('button', { name: '+ Agregar acción' }))
    const input = screen.getByPlaceholderText('Descripción de la acción')
    await user.type(input, 'Diseñar pieza')
    expect(input).toHaveValue('Diseñar pieza')
  })

  it('el progreso X/N y el % avanza al tildar acciones', async () => {
    const user = userEvent.setup()
    render(
      <Harness
        initial={[
          { id: 'a', title: 'Uno', done: false },
          { id: 'b', title: 'Dos', done: false },
        ]}
      />,
    )
    // 0 de 2 → 0%, tramo gris "Sin comenzar"
    expect(screen.getByText('0/2 · 0%')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Avance: 0% (Sin comenzar)' })).toBeInTheDocument()

    await user.click(screen.getByRole('checkbox', { name: 'Completar Uno' }))
    expect(screen.getByText('1/2 · 50%')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Avance: 50% (En curso)' })).toBeInTheDocument()

    await user.click(screen.getByRole('checkbox', { name: 'Completar Dos' }))
    expect(screen.getByRole('img', { name: 'Avance: 100% (Completada)' })).toBeInTheDocument()
  })

  it('elimina una acción con el botón de borrar', async () => {
    const user = userEvent.setup()
    render(<Harness initial={[{ id: 'a', title: 'Borrable', done: false }]} />)
    expect(screen.getByDisplayValue('Borrable')).toBeInTheDocument()
    await user.click(screen.getByTitle('Eliminar acción'))
    expect(screen.queryByDisplayValue('Borrable')).not.toBeInTheDocument()
  })

  it('modo editable=false (detalle): permite tildar pero no editar texto ni agregar/eliminar', async () => {
    const user = userEvent.setup()
    const onChangeSpy = vi.fn()
    render(
      <Harness
        initial={[{ id: 'a', title: 'Solo tildar', done: false }]}
        editable={false}
        onChangeSpy={onChangeSpy}
      />,
    )
    // Sin input de texto ni botones de estructura.
    expect(screen.queryByPlaceholderText('Descripción de la acción')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '+ Agregar acción' })).not.toBeInTheDocument()
    expect(screen.queryByTitle('Eliminar acción')).not.toBeInTheDocument()
    // Pero sí se puede tildar.
    await user.click(screen.getByRole('checkbox', { name: 'Completar Solo tildar' }))
    expect(onChangeSpy).toHaveBeenCalledWith([{ id: 'a', title: 'Solo tildar', done: true }])
  })
})

describe('CampaignChecklist — agrupado por mes y badges', () => {
  const ITEMS = [
    { id: 'a', title: 'Reel de diciembre', done: false, month: '2026-12' },
    { id: 'b', title: 'Carrusel de noviembre', done: true, month: '2026-11' },
    { id: 'c', title: 'Acción sin mes', done: false },
  ]

  it('sin meses sigue siendo una lista plana, sin encabezados', () => {
    render(
      <Harness
        initial={[
          { id: 'a', title: 'Uno', done: false },
          { id: 'b', title: 'Dos', done: false },
        ]}
        editable={false}
      />,
    )
    expect(screen.queryByText('Sin mes')).not.toBeInTheDocument()
    expect(screen.queryByText(/2026/)).not.toBeInTheDocument()
  })

  it('con meses agrupa por mes en orden cronológico y deja las acciones sin mes al final', () => {
    render(<Harness initial={ITEMS} editable={false} />)

    const headings = screen.getAllByText(/^(Noviembre 2026|Diciembre 2026|Sin mes)$/)
    expect(headings.map((h) => h.textContent)).toEqual([
      'Noviembre 2026',
      'Diciembre 2026',
      'Sin mes',
    ])
    expect(screen.getByText('Carrusel de noviembre')).toBeInTheDocument()
  })

  it('el progreso cuenta todas las acciones, estén en el mes que estén', () => {
    render(<Harness initial={ITEMS} editable={false} />)
    expect(screen.getByText('1/3 · 33%')).toBeInTheDocument()
    expect(screen.getByText('Iniciada')).toBeInTheDocument()
  })

  it('tildar una acción agrupada persiste el cambio', async () => {
    const user = userEvent.setup()
    const spy = vi.fn()
    render(<Harness initial={ITEMS} editable={false} onChangeSpy={spy} />)

    await user.click(screen.getByRole('checkbox', { name: 'Completar Reel de diciembre' }))

    const next = spy.mock.calls.at(-1)[0]
    expect(next.find((i) => i.id === 'a')).toMatchObject({ done: true, month: '2026-12' })
  })

  it('marca con un badge las acciones arrastradas de la táctica anterior', () => {
    render(
      <Harness
        initial={[
          { id: 'b', title: 'Pendiente anterior', done: false, carried_from: 'camp-0' },
          { id: 'c', title: 'Manual', done: false },
        ]}
        editable={false}
      />,
    )
    expect(screen.getAllByText('Arrastrada')).toHaveLength(1)
  })

  it('al editar permite elegir el mes de cada acción', async () => {
    const user = userEvent.setup()
    const spy = vi.fn()
    render(<Harness initial={[{ id: 'a', title: 'Reel', done: false }]} onChangeSpy={spy} />)

    const month = screen.getByLabelText('Mes de Reel')
    await user.type(month, '2026-12')

    expect(spy.mock.calls.at(-1)[0][0]).toMatchObject({ id: 'a', month: '2026-12' })
  })

  it('en modo solo lectura no ofrece el selector de mes', () => {
    render(<Harness initial={[{ id: 'a', title: 'Reel', done: false }]} editable={false} />)
    expect(screen.queryByLabelText('Mes de Reel')).not.toBeInTheDocument()
  })
})
