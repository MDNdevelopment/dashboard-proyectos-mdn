import { renderHook, act, waitFor } from '@testing-library/react'
import { vi } from 'vitest'

// driver.js mockeado: capturamos su config y simulamos los clics de sus botones.
const driverState = { config: null, instance: null }
vi.mock('driver.js', () => ({
  driver: vi.fn((config) => {
    let active = -1
    const instance = {
      drive: vi.fn((i = 0) => {
        active = i
      }),
      moveTo: vi.fn((i) => {
        active = i
      }),
      getActiveIndex: () => active,
      destroy: vi.fn(() => config.onDestroyed?.()),
    }
    driverState.config = config
    driverState.instance = instance
    return instance
  }),
}))
vi.mock('driver.js/dist/driver.css', () => ({}))

import { useModuleTour } from '../components/common/onboarding/useModuleTour'

const TOUR = {
  id: 't1',
  steps: [
    { titulo: 'Intro', texto: 'Hola', view: 'semana' },
    { target: 'a', titulo: 'A', texto: 'Elemento A', view: 'semana' },
    { target: 'falta', titulo: 'Falta', texto: 'No existe', view: 'datos' },
    { target: 'b', titulo: 'B', texto: 'Elemento B', view: 'datos' },
  ],
}

function addTarget(name) {
  const el = document.createElement('div')
  el.setAttribute('data-tour', name)
  document.body.appendChild(el)
  return el
}

afterEach(() => {
  document.body.innerHTML = ''
  driverState.config = null
  driverState.instance = null
})

describe('useModuleTour', () => {
  it('traduce los pasos a driver.js señalando el elemento por data-tour', async () => {
    addTarget('a')
    addTarget('b')
    const { result } = renderHook(() => useModuleTour())
    await act(() => result.current.start(TOUR))
    const { steps } = driverState.config
    expect(steps).toHaveLength(4)
    expect(steps[0].element).toBeUndefined()
    expect(steps[1].element).toBe('[data-tour="a"]')
    expect(steps[1].popover).toMatchObject({ title: 'A', description: 'Elemento A' })
    expect(driverState.instance.drive).toHaveBeenCalledWith(0)
  })

  it('avisa a onBeforeStep antes de cada paso y salta los pasos cuyo elemento no aparece', async () => {
    addTarget('a')
    addTarget('b')
    const onBeforeStep = vi.fn()
    const { result } = renderHook(() => useModuleTour({ onBeforeStep }))
    await act(() => result.current.start(TOUR))
    expect(onBeforeStep).toHaveBeenCalledWith(TOUR.steps[0])

    // Del paso 1 al siguiente: "falta" no existe → salta directo al 3.
    driverState.instance.drive(1)
    await act(() => driverState.config.onNextClick())
    expect(onBeforeStep).toHaveBeenCalledWith(TOUR.steps[2])
    expect(driverState.instance.moveTo).toHaveBeenCalledWith(3)
  }, 10000)

  it('al pasar del último paso termina y marca el recorrido como terminado', async () => {
    addTarget('a')
    addTarget('b')
    const onFinish = vi.fn()
    const { result } = renderHook(() => useModuleTour({ onFinish }))
    await act(() => result.current.start(TOUR))
    driverState.instance.drive(3)
    await act(() => driverState.config.onNextClick())
    expect(onFinish).toHaveBeenCalledWith(TOUR, { finished: true })
  })

  it('abandonarlo a la mitad también avisa, sin marcarlo como terminado', async () => {
    addTarget('a')
    addTarget('b')
    const onFinish = vi.fn()
    const { result } = renderHook(() => useModuleTour({ onFinish }))
    await act(() => result.current.start(TOUR))
    act(() => driverState.config.onDestroyed())
    expect(onFinish).toHaveBeenCalledWith(TOUR, { finished: false })
  })

  it('no arranca si ningún paso se puede mostrar', async () => {
    const { result } = renderHook(() => useModuleTour())
    const solo = { id: 't2', steps: [{ target: 'nada', titulo: 'x', texto: 'y' }] }
    await act(() => result.current.start(solo))
    await waitFor(() => expect(driverState.instance.drive).not.toHaveBeenCalled())
  }, 10000)
})
