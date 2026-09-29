/**
 * Selector con descripción por opción. Lo que importa cubrir es lo que un `<select>`
 * nativo no puede dar y por lo que se escribió a mano: que cada opción muestre su
 * nombre Y su descripción, y que el menú se abra/cierre bien.
 */
import { render, screen, fireEvent } from '@testing-library/react'
import { vi } from 'vitest'

import DescribedSelect from '../components/common/DescribedSelect'

const OPTIONS = [
  { key: 'nomina', label: 'Nómina y personal', description: 'Sueldos, quincenas, bonos.' },
  { key: 'sede', label: 'Sede y servicios', description: 'Alquiler, electricidad, agua.' },
]

function setup(props) {
  const onChange = vi.fn()
  render(
    <DescribedSelect
      options={OPTIONS}
      onChange={onChange}
      placeholder="Elige un rubro…"
      ariaLabel="¿En qué?"
      {...props}
    />,
  )
  return { onChange }
}

describe('DescribedSelect', () => {
  it('sin selección muestra el placeholder y el menú cerrado', () => {
    setup()
    expect(screen.getByRole('button', { name: '¿En qué?' })).toHaveTextContent('Elige un rubro…')
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })

  it('abre el menú con nombre y descripción de cada opción', () => {
    setup()
    fireEvent.click(screen.getByRole('button', { name: '¿En qué?' }))

    const menu = screen.getByRole('listbox')
    expect(menu).toBeInTheDocument()
    expect(screen.getAllByRole('option')).toHaveLength(2)
    // El nombre y la descripción conviven en la misma opción — es el punto del componente.
    const opcion = screen.getByRole('option', { name: /Nómina y personal/ })
    expect(opcion).toHaveTextContent('Nómina y personal')
    expect(opcion).toHaveTextContent('Sueldos, quincenas, bonos.')
  })

  it('elegir una opción dispara onChange con su key y cierra el menú', () => {
    const { onChange } = setup()
    fireEvent.click(screen.getByRole('button', { name: '¿En qué?' }))
    fireEvent.click(screen.getByRole('option', { name: /Sede y servicios/ }))

    expect(onChange).toHaveBeenCalledWith('sede')
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })

  it('con valor elegido, el botón muestra su nombre y su descripción', () => {
    setup({ value: 'sede' })
    const boton = screen.getByRole('button', { name: '¿En qué?' })
    expect(boton).toHaveTextContent('Sede y servicios')
    expect(boton).toHaveTextContent('Alquiler, electricidad, agua.')
  })

  it('marca la opción activa con aria-selected', () => {
    setup({ value: 'sede' })
    fireEvent.click(screen.getByRole('button', { name: '¿En qué?' }))
    expect(screen.getByRole('option', { name: /Sede y servicios/ })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    expect(screen.getByRole('option', { name: /Nómina y personal/ })).toHaveAttribute(
      'aria-selected',
      'false',
    )
  })

  it('no vuelve a disparar onChange si se elige la opción ya activa', () => {
    const { onChange } = setup({ value: 'sede' })
    fireEvent.click(screen.getByRole('button', { name: '¿En qué?' }))
    fireEvent.click(screen.getByRole('option', { name: /Sede y servicios/ }))
    expect(onChange).not.toHaveBeenCalled()
  })

  it('cierra con Escape y con un click afuera', () => {
    setup()
    const boton = screen.getByRole('button', { name: '¿En qué?' })

    fireEvent.click(boton)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()

    fireEvent.click(boton)
    fireEvent.mouseDown(document.body)
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })

  it('deshabilitado no abre el menú', () => {
    setup({ disabled: true })
    fireEvent.click(screen.getByRole('button', { name: '¿En qué?' }))
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })
})
