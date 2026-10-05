import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { vi } from 'vitest'

const driverState = { config: null, drive: vi.fn() }
vi.mock('driver.js', () => ({
  driver: vi.fn((config) => {
    driverState.config = config
    return {
      drive: driverState.drive,
      moveTo: vi.fn(),
      getActiveIndex: () => 0,
      destroy: vi.fn(() => config.onDestroyed?.()),
    }
  }),
}))
vi.mock('driver.js/dist/driver.css', () => ({}))

import ModuleTourButton from '../components/common/onboarding/ModuleTourButton'

const TOURS = [
  {
    id: 'uno',
    titulo: 'Primer recorrido',
    descripcion: 'Desc uno',
    steps: [{ titulo: 'a', texto: 'b' }],
  },
  {
    id: 'dos',
    titulo: 'Segundo recorrido',
    descripcion: 'Desc dos',
    steps: [
      { titulo: 'a', texto: 'b' },
      { titulo: 'c', texto: 'd' },
    ],
  },
]

const renderButton = (props = {}) =>
  render(<ModuleTourButton moduleKey="test" userId="u1" tours={TOURS} {...props} />)
const storageKey = 'mappi.tours.test.u1'

beforeEach(() => {
  localStorage.clear()
  driverState.drive.mockClear()
})

describe('ModuleTourButton', () => {
  it('no pinta nada si no hay recorridos para esta persona', () => {
    const { container } = renderButton({ tours: [] })
    expect(container).toBeEmptyDOMElement()
  })

  it('el ⓘ abre el menú con los recorridos y su número de pasos', () => {
    renderButton()
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Guía del módulo' }))
    expect(screen.getByRole('menuitem', { name: /Primer recorrido/ })).toBeInTheDocument()
    expect(screen.getByText('2 pasos')).toBeInTheDocument()
  })

  it('la primera visita abre el menú solo (una vez) y cerrarlo cuenta como visto', async () => {
    const { unmount } = renderButton({ autoOpen: true })
    expect(await screen.findByRole('menu')).toBeInTheDocument()
    fireEvent.keyDown(document, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument())
    unmount()

    renderButton({ autoOpen: true })
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('no se abre solo mientras la página sigue cargando', () => {
    renderButton({ autoOpen: false })
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('elegir un recorrido cierra el menú y lo arranca', async () => {
    renderButton()
    fireEvent.click(screen.getByRole('button', { name: 'Guía del módulo' }))
    fireEvent.click(screen.getByRole('menuitem', { name: /Segundo recorrido/ }))
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    await waitFor(() => expect(driverState.drive).toHaveBeenCalledWith(0))
    expect(driverState.config.steps).toHaveLength(2)
  })

  it('al cerrar un recorrido queda con ✓ en el menú y se recuerda', async () => {
    renderButton()
    fireEvent.click(screen.getByRole('button', { name: 'Guía del módulo' }))
    fireEvent.click(screen.getByRole('menuitem', { name: /Primer recorrido/ }))
    await waitFor(() => expect(driverState.drive).toHaveBeenCalled())
    driverState.config.onDestroyed()
    fireEvent.click(await screen.findByRole('button', { name: 'Guía del módulo' }))
    const item = screen.getByRole('menuitem', { name: /Primer recorrido/ })
    expect(item).toHaveTextContent('✓')
    expect(screen.getByRole('menuitem', { name: /Segundo recorrido/ })).not.toContainElement(
      screen.queryByLabelText('Ya lo viste'),
    )
    expect(JSON.parse(localStorage.getItem(storageKey)).done).toEqual(['uno'])
  })
})
