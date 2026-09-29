/**
 * Tests del aviso bloqueante de recursos archivados todavía asignados.
 *
 * Lo importante que protegen: el botón está deshabilitado 5 segundos, y el modal
 * NO se cierra con Escape ni con clic fuera (a diferencia de los otros modales
 * globales). Si alguien "normaliza" este modal al molde habitual, estos tests
 * fallan.
 */
import { render, screen, fireEvent, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import StaleClientResourcesModal from '../components/StaleClientResourcesModal'

const line = { id: 'line-1', name: 'Team Bianca', color: '#FFB800', member_user_ids: ['u-ana'] }

const employees = [
  { user_id: 'u-ana', first_name: 'Ana', last_name: 'Pérez', department_id: 3, deleted_at: null },
  {
    user_id: 'u-osnel',
    first_name: 'Osnel',
    last_name: 'Pacheco',
    department_id: 3,
    deleted_at: '2026-08-01T00:00:00Z',
  },
]

const items = [
  {
    client: { id: 'c-1', name: 'Agrolago' },
    line,
    stale: [
      {
        field: 'designer_id',
        label: 'Diseñador',
        multi: false,
        departmentId: 3,
        archived: [employees[1]],
        keepIds: [],
      },
    ],
  },
  {
    client: { id: 'c-2', name: 'Alpitech' },
    line,
    stale: [
      {
        field: 'designer_id',
        label: 'Diseñador',
        multi: false,
        departmentId: 3,
        archived: [employees[1]],
        keepIds: [],
      },
      {
        field: 'audiovisual_ids',
        label: 'Audiovisual',
        multi: true,
        departmentId: 2,
        archived: [employees[1]],
        keepIds: ['u-ana'],
      },
    ],
  },
]

function renderModal(props = {}) {
  const onClose = vi.fn()
  const onReassign = vi.fn()
  render(
    <StaleClientResourcesModal
      show
      items={items}
      employees={employees}
      lines={[line]}
      onReassign={onReassign}
      onClose={onClose}
      {...props}
    />,
  )
  return { onClose, onReassign }
}

describe('StaleClientResourcesModal', () => {
  it('no renderiza nada si show es false', () => {
    renderModal({ show: false })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('pinta un bloque por cuenta y una fila por recurso archivado', () => {
    renderModal()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText('Agrolago')).toBeInTheDocument()
    expect(screen.getByText('Alpitech')).toBeInTheDocument()
    // 3 recursos obsoletos en total (1 + 2)
    expect(screen.getAllByText('Osnel Pacheco')).toHaveLength(3)
    expect(screen.getAllByText('Diseñador')).toHaveLength(2)
    expect(screen.getByText('Audiovisual')).toBeInTheDocument()
  })

  it('muestra el logo de la marca junto al nombre, o su inicial si no tiene', () => {
    render(
      <StaleClientResourcesModal
        show
        items={[
          { ...items[0], client: { ...items[0].client, logo_url: 'https://cdn/agrolago.png' } },
          items[1],
        ]}
        employees={employees}
        lines={[line]}
        onReassign={vi.fn()}
        onClose={vi.fn()}
      />,
    )
    const logo = screen.getByAltText('Agrolago')
    expect(logo).toHaveAttribute('src', 'https://cdn/agrolago.png')
    // Alpitech no tiene logo_url: cae al placeholder con su inicial.
    expect(screen.getByText('A')).toBeInTheDocument()
  })

  it('el encabezado cuenta las cuentas y las asignaciones afectadas', () => {
    renderModal()
    expect(screen.getByText(/2 cuentas con gente que ya no trabaja aquí/)).toBeInTheDocument()
    expect(screen.getByText(/Hay 3 asignaciones/)).toBeInTheDocument()
  })

  it('muestra el error de guardado cuando lo hay', () => {
    renderModal({ error: 'No se pudo guardar el cambio.' })
    expect(screen.getByText('No se pudo guardar el cambio.')).toBeInTheDocument()
  })

  describe('bloqueo de 5 segundos', () => {
    beforeEach(() => vi.useFakeTimers())
    afterEach(() => vi.useRealTimers())

    it('arranca deshabilitado con cuenta atrás y se habilita a los 5 s', () => {
      const onClose = vi.fn()
      render(
        <StaleClientResourcesModal
          show
          items={items}
          employees={employees}
          lines={[line]}
          onReassign={vi.fn()}
          onClose={onClose}
        />,
      )

      const btn = screen.getByRole('button', { name: 'Entendido (5)' })
      expect(btn).toBeDisabled()
      fireEvent.click(btn)
      expect(onClose).not.toHaveBeenCalled()

      act(() => vi.advanceTimersByTime(3000))
      expect(screen.getByRole('button', { name: 'Entendido (2)' })).toBeDisabled()

      act(() => vi.advanceTimersByTime(2000))
      const enabled = screen.getByRole('button', { name: 'Entendido' })
      expect(enabled).toBeEnabled()
      fireEvent.click(enabled)
      expect(onClose).toHaveBeenCalled()
    })
  })

  it('NO se cierra con Escape ni con clic en el fondo (aviso bloqueante)', () => {
    const { onClose } = renderModal()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).not.toHaveBeenCalled()

    // El overlay es el padre del panel role="dialog".
    fireEvent.mouseDown(screen.getByRole('dialog').parentElement)
    fireEvent.click(screen.getByRole('dialog').parentElement)
    expect(onClose).not.toHaveBeenCalled()
  })

  it('elegir un reemplazo llama onReassign con el valor resuelto', async () => {
    const user = userEvent.setup()
    const { onReassign } = renderModal()

    // Primer picker simple (Diseñador de Agrolago): candidatos = miembros de la
    // línea del departamento 3, o sea Ana (Osnel no aparece: está archivado).
    await user.click(screen.getAllByText('Reasignar diseñador...')[0])
    await user.click(screen.getByText('Ana Pérez'))

    expect(onReassign).toHaveBeenCalledWith('c-1', 'designer_id', 'u-ana')
  })

  it('el empleado archivado no figura como candidato', async () => {
    const user = userEvent.setup()
    renderModal()
    await user.click(screen.getAllByText('Reasignar diseñador...')[0])
    // Solo las 3 menciones tachadas de las filas, ninguna dentro del dropdown.
    expect(screen.getAllByText('Osnel Pacheco')).toHaveLength(3)
  })

  it('el picker múltiple muestra los asignados que se conservan aunque no estén en el pool de la línea', () => {
    // Michell es AV activa pero NO es miembro de esta línea: sin el refuerzo de
    // `pickerUsers` su chip no se pintaría y parecería que nadie está asignado.
    const externa = {
      user_id: 'u-michell',
      first_name: 'Michell',
      last_name: 'Aguilera',
      department_id: 2,
      deleted_at: null,
    }
    render(
      <StaleClientResourcesModal
        show
        items={[
          {
            client: { id: 'c-3', name: 'Comesaña' },
            line,
            stale: [
              {
                field: 'audiovisual_ids',
                label: 'Audiovisual',
                multi: true,
                departmentId: 2,
                archived: [employees[1]],
                keepIds: ['u-michell'],
              },
            ],
          },
        ]}
        employees={[...employees, externa]}
        lines={[line]}
        onReassign={vi.fn()}
        onClose={vi.fn()}
      />,
    )
    // UserPickerMulti pinta el chip con el nombre de pila.
    expect(screen.getByText('Michell')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Quitar Michell' })).toBeInTheDocument()
  })

  it('muestra "Guardando..." en la fila que se está guardando', () => {
    renderModal({ savingKey: 'c-1:designer_id' })
    expect(screen.getByText('Guardando...')).toBeInTheDocument()
  })
})
