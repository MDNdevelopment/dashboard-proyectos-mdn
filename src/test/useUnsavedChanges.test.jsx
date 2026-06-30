import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useUnsavedChanges } from '../hooks/useUnsavedChanges'

describe('useUnsavedChanges', () => {
  const baseline = { name: 'Proyecto original', status: 'Pendiente' }
  let onClose

  beforeEach(() => {
    onClose = vi.fn()
    vi.stubGlobal('confirm', vi.fn())
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // ─── dirty detection ────────────────────────────────────────────────────────

  it('dirty es false cuando value === baseline', () => {
    const { result } = renderHook(() =>
      useUnsavedChanges({ value: { ...baseline }, baseline, onClose }),
    )
    expect(result.current.dirty).toBe(false)
  })

  it('dirty es true cuando value difiere del baseline', () => {
    const { result } = renderHook(() =>
      useUnsavedChanges({
        value: { ...baseline, name: 'Modificado' },
        baseline,
        onClose,
      }),
    )
    expect(result.current.dirty).toBe(true)
  })

  // ─── requestClose sin cambios ────────────────────────────────────────────────

  it('requestClose llama onClose directamente si no hay cambios', () => {
    const { result } = renderHook(() =>
      useUnsavedChanges({ value: { ...baseline }, baseline, onClose }),
    )
    act(() => result.current.requestClose())
    expect(window.confirm).not.toHaveBeenCalled()
    expect(onClose).toHaveBeenCalledOnce()
  })

  // ─── requestClose con cambios ────────────────────────────────────────────────

  it('requestClose NO llama onClose si confirm devuelve false', () => {
    window.confirm.mockReturnValue(false)
    const { result } = renderHook(() =>
      useUnsavedChanges({
        value: { ...baseline, name: 'Modificado' },
        baseline,
        onClose,
      }),
    )
    act(() => result.current.requestClose())
    expect(window.confirm).toHaveBeenCalledOnce()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('requestClose SÍ llama onClose si confirm devuelve true', () => {
    window.confirm.mockReturnValue(true)
    const { result } = renderHook(() =>
      useUnsavedChanges({
        value: { ...baseline, name: 'Modificado' },
        baseline,
        onClose,
      }),
    )
    act(() => result.current.requestClose())
    expect(window.confirm).toHaveBeenCalledOnce()
    expect(onClose).toHaveBeenCalledOnce()
  })

  // ─── beforeunload ────────────────────────────────────────────────────────────

  it('registra beforeunload cuando dirty=true y lo elimina al limpiar', () => {
    const addSpy = vi.spyOn(window, 'addEventListener')
    const removeSpy = vi.spyOn(window, 'removeEventListener')

    const { unmount } = renderHook(() =>
      useUnsavedChanges({
        value: { ...baseline, name: 'Modificado' },
        baseline,
        onClose,
      }),
    )

    expect(addSpy).toHaveBeenCalledWith('beforeunload', expect.any(Function))
    unmount()
    expect(removeSpy).toHaveBeenCalledWith('beforeunload', expect.any(Function))
  })

  it('NO registra beforeunload cuando dirty=false', () => {
    const addSpy = vi.spyOn(window, 'addEventListener')

    renderHook(() =>
      useUnsavedChanges({ value: { ...baseline }, baseline, onClose }),
    )

    const calls = addSpy.mock.calls.filter(([evt]) => evt === 'beforeunload')
    expect(calls).toHaveLength(0)
  })
})
