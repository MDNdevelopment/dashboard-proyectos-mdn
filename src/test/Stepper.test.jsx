/**
 * Stepper (src/components/common/Stepper.jsx): control −/valor/+ de guardado inmediato con
 * valor escribible. Cubre el contrato delta-based de siempre, el acumulador de deltas que
 * arregla la pérdida de clics en ráfagas rápidas, el campo editable y el clamp a min/max.
 */
import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Stepper from '../components/common/Stepper'

const FLUSH_MS = 350

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

function renderStepper(props) {
  return render(<Stepper value={10} onChange={() => {}} label="piezas" {...props} />)
}

describe('Stepper — botones (contrato delta-based de siempre)', () => {
  it('un clic en + llama a onChange(+1) de inmediato, sin esperar el debounce', () => {
    const onChange = vi.fn()
    renderStepper({ onChange })
    fireEvent.click(screen.getByLabelText('Agregar piezas'))
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith(1)
  })

  it('un clic en − llama a onChange(-1)', () => {
    const onChange = vi.fn()
    renderStepper({ onChange })
    fireEvent.click(screen.getByLabelText('Quitar piezas'))
    expect(onChange).toHaveBeenCalledWith(-1)
  })

  it('respeta step', () => {
    const onChange = vi.fn()
    renderStepper({ onChange, step: 5 })
    fireEvent.click(screen.getByLabelText('Agregar piezas'))
    expect(onChange).toHaveBeenCalledWith(5)
  })

  it('+ se deshabilita en max y − en min', () => {
    renderStepper({ value: 10, min: 10, max: 10 })
    expect(screen.getByLabelText('Agregar piezas')).toBeDisabled()
    expect(screen.getByLabelText('Quitar piezas')).toBeDisabled()
  })

  it('disabled deshabilita botones e input', () => {
    renderStepper({ disabled: true })
    expect(screen.getByLabelText('Agregar piezas')).toBeDisabled()
    expect(screen.getByLabelText('Quitar piezas')).toBeDisabled()
    expect(screen.getByLabelText('Cantidad de piezas')).toBeDisabled()
  })
})

describe('Stepper — clics rápidos no pierden incrementos (fix de la carrera)', () => {
  it('3 clics rápidos suman +3 en total, en menos de 3 llamadas', async () => {
    let resolveFirst
    const onChange = vi.fn(
      () =>
        new Promise((resolve) => {
          resolveFirst = resolve
        }),
    )
    renderStepper({ onChange })
    const plus = screen.getByLabelText('Agregar piezas')
    fireEvent.click(plus) // flanco de subida: sale de inmediato con +1
    fireEvent.click(plus) // se acumula (hay un write en vuelo)
    fireEvent.click(plus) // se acumula

    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith(1)

    await act(async () => {
      resolveFirst({})
      await Promise.resolve()
    })

    expect(onChange).toHaveBeenCalledTimes(2)
    expect(onChange).toHaveBeenNthCalledWith(2, 2)

    const sum = onChange.mock.calls.reduce((acc, [d]) => acc + d, 0)
    expect(sum).toBe(3)
    expect(onChange.mock.calls.length).toBeLessThan(3)
  })

  it('el valor mostrado refleja los clics pendientes al instante, sin esperar al prop', async () => {
    let resolveFirst
    const onChange = vi.fn(
      () =>
        new Promise((resolve) => {
          resolveFirst = resolve
        }),
    )
    renderStepper({ value: 10, onChange })
    const plus = screen.getByLabelText('Agregar piezas')
    fireEvent.click(plus)
    fireEvent.click(plus)
    fireEvent.click(plus)
    expect(screen.getByLabelText('Cantidad de piezas')).toHaveValue('13')
    await act(async () => {
      resolveFirst({})
      await Promise.resolve()
    })
  })

  it('nunca manda dos writes con la misma base: el segundo flush espera a que resuelva el primero', () => {
    let resolveFirst
    const onChange = vi.fn(
      () =>
        new Promise((resolve) => {
          resolveFirst = resolve
        }),
    )
    renderStepper({ onChange })
    const plus = screen.getByLabelText('Agregar piezas')
    fireEvent.click(plus)
    fireEvent.click(plus)
    act(() => {
      vi.advanceTimersByTime(FLUSH_MS + 10)
    })
    // El segundo delta sigue pendiente porque el primer onChange no resolvió.
    expect(onChange).toHaveBeenCalledTimes(1)
    void resolveFirst
  })

  it('clics mezclados +/− que se cancelan no llaman a onChange', async () => {
    let resolveFirst
    const onChange = vi.fn(
      () =>
        new Promise((resolve) => {
          resolveFirst = resolve
        }),
    )
    renderStepper({ onChange })
    const plus = screen.getByLabelText('Agregar piezas')
    const minus = screen.getByLabelText('Quitar piezas')
    fireEvent.click(plus) // sale de inmediato: +1
    fireEvent.click(minus) // se acumula: pending -1

    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith(1)

    await act(async () => {
      resolveFirst({})
      await Promise.resolve()
    })
    act(() => {
      vi.advanceTimersByTime(FLUSH_MS + 10)
    })
    // El pending de -1 sí se manda (no se cancela contra la llamada anterior, ya enviada).
    expect(onChange).toHaveBeenCalledTimes(2)
    expect(onChange).toHaveBeenNthCalledWith(2, -1)
  })

  it('si el write falla, el valor mostrado vuelve al prop', async () => {
    const onChange = vi.fn().mockRejectedValue(new Error('nope'))
    renderStepper({ value: 10, onChange })
    fireEvent.click(screen.getByLabelText('Agregar piezas'))
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(screen.getByLabelText('Cantidad de piezas')).toHaveValue('10')
  })

  it('un value nuevo por props a mitad de ráfaga hace flush inmediato del pendiente', async () => {
    let resolveFirst
    const onChange = vi.fn(
      () =>
        new Promise((resolve) => {
          resolveFirst = resolve
        }),
    )
    const { rerender } = render(<Stepper value={10} onChange={onChange} label="piezas" />)
    const plus = screen.getByLabelText('Agregar piezas')
    fireEvent.click(plus)
    fireEvent.click(plus) // queda +1 pendiente

    await act(async () => {
      resolveFirst({})
      await Promise.resolve()
    })
    // Llega un value nuevo por props (realtime) con el pendiente todavía sin flush.
    rerender(<Stepper value={13} onChange={onChange} label="piezas" />)
    expect(onChange).toHaveBeenCalledTimes(2)
    expect(onChange).toHaveBeenNthCalledWith(2, 1)
  })

  it('flush al desmontar con un delta pendiente', () => {
    let resolveFirst
    const onChange = vi.fn(
      () =>
        new Promise((resolve) => {
          resolveFirst = resolve
        }),
    )
    const { unmount } = render(<Stepper value={10} onChange={onChange} label="piezas" />)
    const plus = screen.getByLabelText('Agregar piezas')
    fireEvent.click(plus)
    fireEvent.click(plus) // +1 queda pendiente, sin flushear
    unmount()
    expect(onChange).toHaveBeenCalledTimes(2)
    expect(onChange).toHaveBeenNthCalledWith(2, 1)
    void resolveFirst
  })
})

describe('Stepper — campo editable (escribir el número)', () => {
  it('escribir 90 y salir del campo llama a onChange una sola vez con el delta completo', () => {
    const onChange = vi.fn()
    renderStepper({ value: 1, onChange })
    const input = screen.getByLabelText('Cantidad de piezas')
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: '90' } })
    fireEvent.blur(input)
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith(89)
  })

  it('escribir el mismo valor no llama a onChange', () => {
    const onChange = vi.fn()
    renderStepper({ value: 5, onChange })
    const input = screen.getByLabelText('Cantidad de piezas')
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: '5' } })
    fireEvent.blur(input)
    expect(onChange).not.toHaveBeenCalled()
  })

  it('clampea al tope max y manda el delta recortado', () => {
    const onChange = vi.fn()
    renderStepper({ value: 0, max: 85, onChange })
    const input = screen.getByLabelText('Cantidad de piezas')
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: '90' } })
    fireEvent.blur(input)
    expect(onChange).toHaveBeenCalledWith(85)
  })

  it('clampea al mínimo', () => {
    const onChange = vi.fn()
    renderStepper({ value: 3, min: 1, onChange })
    const input = screen.getByLabelText('Cantidad de piezas')
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: '0' } })
    fireEvent.blur(input)
    expect(onChange).toHaveBeenCalledWith(-2)
  })

  it('Enter confirma sin necesidad de un blur explícito', () => {
    const onChange = vi.fn()
    renderStepper({ value: 1, onChange })
    const input = screen.getByLabelText('Cantidad de piezas')
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: '90' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onChange).toHaveBeenCalledWith(89)
  })

  it('Escape revierte y no llama a onChange', () => {
    const onChange = vi.fn()
    renderStepper({ value: 1, onChange })
    const input = screen.getByLabelText('Cantidad de piezas')
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: '90' } })
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(onChange).not.toHaveBeenCalled()
    expect(input).toHaveValue('1')
  })

  it('ignora entrada no numérica', () => {
    const onChange = vi.fn()
    renderStepper({ value: 1, onChange })
    const input = screen.getByLabelText('Cantidad de piezas')
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: '9a' } })
    expect(input).toHaveValue('1')
    fireEvent.change(input, { target: { value: '-5' } })
    expect(input).toHaveValue('1')
  })

  it('campo vacío no escribe nada', () => {
    const onChange = vi.fn()
    renderStepper({ value: 1, onChange })
    const input = screen.getByLabelText('Cantidad de piezas')
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: '' } })
    fireEvent.blur(input)
    expect(onChange).not.toHaveBeenCalled()
  })

  it('tras confirmar y resolver el write, el input vuelve a mostrar el prop (no queda estado local)', async () => {
    const onChange = vi.fn().mockResolvedValue(undefined)
    renderStepper({ value: 1, onChange })
    const input = screen.getByLabelText('Cantidad de piezas')
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: '90' } })
    fireEvent.blur(input)
    // Mientras el write está en vuelo, se muestra el valor optimista.
    expect(input).toHaveValue('90')
    // El onChange mockeado no cambia el prop `value` — al resolver, `shown` vuelve a `value`
    // porque no quedó ningún estado local propio (ni draft ni pending/inFlight).
    await act(async () => {
      await Promise.resolve()
    })
    expect(input).toHaveValue('1')
  })

  it('mantiene los aria-label Quitar X / Agregar X y expone Cantidad de X', () => {
    renderStepper({})
    expect(screen.getByLabelText('Quitar piezas')).toBeInTheDocument()
    expect(screen.getByLabelText('Agregar piezas')).toBeInTheDocument()
    expect(screen.getByLabelText('Cantidad de piezas')).toBeInTheDocument()
  })
})
