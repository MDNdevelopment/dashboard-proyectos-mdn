/**
 * Tests del modal de recordatorio de cierre de reportes (días 1-5 del mes):
 * - No renderiza nada si `show` es false.
 * - Con líneas pendientes, muestra una fila por línea con link al mes correcto.
 * - "Después" llama a onClose (dismiss), que persiste la fecha vista.
 */
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, it, expect, vi } from 'vitest'
import ReportCloseReminderModal from '../components/ReportCloseReminderModal'

const pending = [
  { id: 'line-1', name: 'Redes', color: '#FFB800' },
  { id: 'line-2', name: 'Diseño', color: '#4F46E5' },
]
const period = { year: 2026, month: 8 }

function renderModal(props = {}) {
  const onClose = vi.fn()
  render(
    <MemoryRouter>
      <ReportCloseReminderModal
        show
        pending={pending}
        period={period}
        daysLeft={2}
        onClose={onClose}
        {...props}
      />
    </MemoryRouter>,
  )
  return { onClose }
}

describe('ReportCloseReminderModal', () => {
  it('no renderiza nada si show es false', () => {
    render(
      <MemoryRouter>
        <ReportCloseReminderModal
          show={false}
          pending={pending}
          period={period}
          daysLeft={2}
          onClose={vi.fn()}
        />
      </MemoryRouter>,
    )
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('muestra una fila por línea pendiente con link al mes correcto', () => {
    renderModal()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText('Redes')).toBeInTheDocument()
    expect(screen.getByText('Diseño')).toBeInTheDocument()

    const link = screen.getByText('Redes').closest('a')
    expect(link).toHaveAttribute('href', '/reportes/linea/line-1?tab=operaciones&year=2026&month=8')
  })

  it('el título indica "cierra hoy" cuando daysLeft es 0', () => {
    renderModal({ daysLeft: 0 })
    expect(screen.getByText('Tu reporte cierra hoy')).toBeInTheDocument()
  })

  it('"Después" llama a onClose', async () => {
    const { onClose } = renderModal()
    await userEvent.click(screen.getByRole('button', { name: 'Después' }))
    expect(onClose).toHaveBeenCalled()
  })
})
