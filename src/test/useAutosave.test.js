import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useAutosave } from '../hooks/useAutosave'

function setup(initial = { a: 1 }, opts = {}) {
  const onSave = vi.fn().mockResolvedValue(null)
  const hook = renderHook(
    (props) =>
      useAutosave({
        value: props.value,
        enabled: props.enabled ?? true,
        onSave: props.onSave ?? onSave,
        contextKey: props.contextKey ?? 'm1',
        delay: 1000,
      }),
    { initialProps: { value: initial, ...opts } },
  )
  return { ...hook, onSave }
}

const tick = (ms) => act(async () => vi.advanceTimersByTimeAsync(ms))

describe('useAutosave', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('no guarda nada hasta que hay una línea base, ni al cargar', async () => {
    const { onSave } = setup()
    await tick(5000)
    expect(onSave).not.toHaveBeenCalled()
  })

  it('con la base fijada, un valor igual a la base no guarda', async () => {
    const { result, onSave } = setup({ a: 1 })
    act(() => result.current.reset({ a: 1 }))
    await tick(5000)
    expect(onSave).not.toHaveBeenCalled()
  })

  it('un cambio guarda tras el debounce, con el valor nuevo y el anterior', async () => {
    const { result, rerender, onSave } = setup({ a: 1 })
    act(() => result.current.reset({ a: 1 }))
    rerender({ value: { a: 2 } })
    await tick(999)
    expect(onSave).not.toHaveBeenCalled()
    expect(result.current.status).toBe('pending')
    await tick(2)
    expect(onSave).toHaveBeenCalledTimes(1)
    expect(onSave).toHaveBeenCalledWith({ a: 2 }, { a: 1 })
    expect(result.current.status).toBe('saved')
  })

  it('cambios seguidos reinician el temporizador y se guarda una sola vez', async () => {
    const { result, rerender, onSave } = setup({ a: 1 })
    act(() => result.current.reset({ a: 1 }))
    rerender({ value: { a: 2 } })
    await tick(600)
    rerender({ value: { a: 3 } })
    await tick(600)
    expect(onSave).not.toHaveBeenCalled()
    await tick(500)
    expect(onSave).toHaveBeenCalledTimes(1)
    expect(onSave).toHaveBeenCalledWith({ a: 3 }, { a: 1 })
  })

  it('si el valor vuelve a la base antes del debounce, no guarda', async () => {
    const { result, rerender, onSave } = setup({ a: 1 })
    act(() => result.current.reset({ a: 1 }))
    rerender({ value: { a: 2 } })
    await tick(500)
    rerender({ value: { a: 1 } })
    await tick(3000)
    expect(onSave).not.toHaveBeenCalled()
  })

  it('al cambiar de contexto (otro mes) guarda al instante lo pendiente en el contexto original', async () => {
    const saveMes1 = vi.fn().mockResolvedValue(null)
    const { result, rerender } = setup({ a: 1 }, { onSave: saveMes1, contextKey: 'm1' })
    act(() => result.current.reset({ a: 1 }))
    rerender({ value: { a: 2 }, onSave: saveMes1, contextKey: 'm1' })
    await tick(200)
    const saveMes2 = vi.fn().mockResolvedValue(null)
    rerender({ value: { a: 2 }, onSave: saveMes2, contextKey: 'm2' })
    await tick(0)
    expect(saveMes1).toHaveBeenCalledWith({ a: 2 }, { a: 1 })
    expect(saveMes2).not.toHaveBeenCalled()
  })

  it('al desmontar guarda lo pendiente', async () => {
    const { result, rerender, unmount, onSave } = setup({ a: 1 })
    act(() => result.current.reset({ a: 1 }))
    rerender({ value: { a: 2 } })
    await tick(100)
    unmount()
    await tick(0)
    expect(onSave).toHaveBeenCalledWith({ a: 2 }, { a: 1 })
  })

  it('deshabilitado (cerrado / solo lectura) nunca guarda', async () => {
    const { result, rerender, onSave } = setup({ a: 1 }, { enabled: false })
    act(() => result.current.reset({ a: 1 }))
    rerender({ value: { a: 2 }, enabled: false })
    await tick(5000)
    expect(onSave).not.toHaveBeenCalled()
  })

  it('un error deja el estado en error y retry vuelve a intentarlo', async () => {
    const onSave = vi.fn().mockResolvedValueOnce({ message: 'boom' }).mockResolvedValueOnce(null)
    const { result, rerender } = setup({ a: 1 }, { onSave })
    act(() => result.current.reset({ a: 1 }))
    rerender({ value: { a: 2 }, onSave })
    await tick(1100)
    expect(result.current.status).toBe('error')
    act(() => result.current.retry())
    await tick(0)
    expect(onSave).toHaveBeenCalledTimes(2)
    // Tras el error la base sigue siendo la original: `prev` no avanza.
    expect(onSave.mock.calls[1][1]).toEqual({ a: 1 })
    expect(result.current.status).toBe('saved')
  })

  it('un guardado que lanza excepción se trata como error, sin romper', async () => {
    const onSave = vi.fn().mockRejectedValue(new Error('red caída'))
    const { result, rerender } = setup({ a: 1 }, { onSave })
    act(() => result.current.reset({ a: 1 }))
    rerender({ value: { a: 2 }, onSave })
    await tick(1100)
    expect(result.current.status).toBe('error')
  })

  it('los guardados se serializan: el segundo recibe como prev lo que guardó el primero', async () => {
    let release
    const first = new Promise((r) => (release = r))
    const onSave = vi.fn().mockReturnValueOnce(first).mockResolvedValueOnce(null)
    const { result, rerender } = setup({ a: 1 }, { onSave })
    act(() => result.current.reset({ a: 1 }))
    rerender({ value: { a: 2 }, onSave })
    await tick(1100) // empieza el primer guardado (queda colgado)
    rerender({ value: { a: 3 }, onSave })
    await tick(1100) // el segundo espera al primero
    expect(onSave).toHaveBeenCalledTimes(1)
    await act(async () => release(null))
    await tick(0)
    expect(onSave).toHaveBeenCalledTimes(2)
    expect(onSave.mock.calls[1]).toEqual([{ a: 3 }, { a: 2 }])
  })
})
