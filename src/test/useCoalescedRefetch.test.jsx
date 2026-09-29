import { renderHook, act } from '@testing-library/react'
import { vi } from 'vitest'
import { useCoalescedRefetch } from '../hooks/useCoalescedRefetch'

// Fake timers en todo el archivo: aquí no hay UI, solo el temporizador.
beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

/** Promesa que se resuelve a mano, para simular una recarga lenta. */
function deferred() {
  let resolve
  const promise = new Promise((r) => {
    resolve = r
  })
  return { promise, resolve }
}

describe('useCoalescedRefetch', () => {
  it('agrupa una ráfaga de 67 eventos en una sola ejecución', async () => {
    const fn = vi.fn()
    const { result } = renderHook(() => useCoalescedRefetch(fn, 500))

    // Los 67 inserts de la facturación de un mes, uno por factura.
    for (let i = 0; i < 67; i++) result.current()
    expect(fn).not.toHaveBeenCalled() // nada antes de que venza la espera

    await act(() => vi.advanceTimersByTimeAsync(500))
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('no ejecuta nada si no se cumple la espera', async () => {
    const fn = vi.fn()
    const { result } = renderHook(() => useCoalescedRefetch(fn, 500))
    result.current()
    await act(() => vi.advanceTimersByTimeAsync(499))
    expect(fn).not.toHaveBeenCalled()
  })

  it('dos ráfagas separadas por más de la espera son dos ejecuciones', async () => {
    const fn = vi.fn()
    const { result } = renderHook(() => useCoalescedRefetch(fn, 500))
    result.current()
    await act(() => vi.advanceTimersByTimeAsync(500))
    result.current()
    await act(() => vi.advanceTimersByTimeAsync(500))
    expect(fn).toHaveBeenCalledTimes(2)
  })

  it('con una recarga en vuelo, deja UNA pendiente por muchos eventos que lleguen', async () => {
    const d = deferred()
    const fn = vi.fn().mockReturnValueOnce(d.promise)
    const { result } = renderHook(() => useCoalescedRefetch(fn, 500))

    result.current()
    await act(() => vi.advanceTimersByTimeAsync(500))
    expect(fn).toHaveBeenCalledTimes(1) // primera, todavía sin resolver

    // Llegan 10 eventos mientras la primera sigue viva.
    for (let i = 0; i < 10; i++) result.current()
    await act(() => vi.advanceTimersByTimeAsync(500))
    expect(fn).toHaveBeenCalledTimes(1) // no se lanza otra en paralelo

    await act(async () => {
      d.resolve()
    })
    await act(() => vi.advanceTimersByTimeAsync(500))
    expect(fn).toHaveBeenCalledTimes(2) // exactamente una más, no diez
  })

  it('si la recarga falla, la siguiente ráfaga sigue disparando', async () => {
    const fn = vi.fn().mockRejectedValueOnce(new Error('red caída'))
    const { result } = renderHook(() => useCoalescedRefetch(fn, 500))

    result.current()
    await act(() => vi.advanceTimersByTimeAsync(500))
    expect(fn).toHaveBeenCalledTimes(1)

    // Sin el finally, la bandera de "en vuelo" quedaría en true y esta segunda
    // ráfaga —y todas las de la sesión— no volverían a ejecutarse nunca.
    result.current()
    await act(() => vi.advanceTimersByTimeAsync(500))
    expect(fn).toHaveBeenCalledTimes(2)
  })

  it('ejecuta la función vigente, no la capturada al agendar', async () => {
    const vieja = vi.fn()
    const nueva = vi.fn()
    const { result, rerender } = renderHook(({ fn }) => useCoalescedRefetch(fn, 500), {
      initialProps: { fn: vieja },
    })

    result.current()
    rerender({ fn: nueva }) // p. ej. cambió el mes activo
    await act(() => vi.advanceTimersByTimeAsync(500))

    expect(vieja).not.toHaveBeenCalled()
    expect(nueva).toHaveBeenCalledTimes(1)
  })

  it('cancel() descarta lo agendado', async () => {
    const fn = vi.fn()
    const { result } = renderHook(() => useCoalescedRefetch(fn, 500))
    result.current()
    result.current.cancel()
    await act(() => vi.advanceTimersByTimeAsync(500))
    expect(fn).not.toHaveBeenCalled()
  })

  it('al desmontar no ejecuta lo que quedaba agendado', async () => {
    const fn = vi.fn()
    const { result, unmount } = renderHook(() => useCoalescedRefetch(fn, 500))
    result.current()
    unmount()
    await act(() => vi.advanceTimersByTimeAsync(500))
    expect(fn).not.toHaveBeenCalled()
  })
})
