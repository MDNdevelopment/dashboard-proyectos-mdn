import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { vi } from 'vitest'
import CapturaSection from '../components/pautas/CapturaSection'

const users = new Map([
  ['r1', { user_id: 'r1', first_name: 'Rafa', last_name: 'Cam' }],
  ['r2', { user_id: 'r2', first_name: 'Sol', last_name: 'Luz' }],
])
const recursos = [...users.values()]

const pauta = {
  id: 'p1',
  formats: ['R', 'F'],
  recurso_ids: ['r1'],
  grabacion_por_formato: { R: { r1: 3 } },
  piezas_por_formato: { R: { salieron: 3, editadas: 1 }, F: { salieron: 0, editadas: 0 } },
}

function setup(props = {}) {
  const onFields = vi.fn().mockResolvedValue({ error: null })
  render(
    <CapturaSection
      pauta={pauta}
      recursoUsers={recursos}
      usersById={users}
      canEdit
      onFields={onFields}
      {...props}
    />,
  )
  return { onFields }
}

describe('CapturaSection', () => {
  it('muestra salieron por formato derivado de la captura', () => {
    setup()
    const reel = screen.getByText('🎞️ Reel').closest('div').parentElement
    expect(reel).toHaveTextContent('salieron 3')
    expect(reel).toHaveTextContent('Rafa Cam')
    const foto = screen.getByText('📷 Foto').closest('div').parentElement
    expect(foto).toHaveTextContent('salieron 0')
    expect(foto).toHaveTextContent('Nadie ha registrado capturas')
  })

  it('subir el contador escribe grabación y salieron en la misma llamada', async () => {
    const { onFields } = setup()
    fireEvent.click(screen.getByRole('button', { name: /Agregar grabadas de Reel por Rafa Cam/ }))
    await waitFor(() => expect(onFields).toHaveBeenCalled())
    expect(onFields.mock.calls[0][1]).toEqual({
      grabacion_por_formato: { R: { r1: 4 }, F: {} },
      piezas_por_formato: { R: { salieron: 4, editadas: 1 }, F: { salieron: 0, editadas: 0 } },
    })
  })

  it('agregar un recurso nuevo lo suma también a recurso_ids', async () => {
    const { onFields } = setup()
    fireEvent.click(screen.getAllByText('+ agregar recurso')[1])
    fireEvent.change(screen.getByLabelText('Agregar recurso de Foto'), { target: { value: 'r2' } })
    await waitFor(() => expect(onFields).toHaveBeenCalled())
    expect(onFields.mock.calls[0][1]).toMatchObject({
      grabacion_por_formato: { R: { r1: 3 }, F: { r2: 1 } },
      piezas_por_formato: { F: { salieron: 1, editadas: 0 } },
      recurso_ids: ['r1', 'r2'],
    })
  })

  it('sin permiso solo muestra números', () => {
    setup({ canEdit: false })
    expect(screen.queryByText('+ agregar recurso')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Agregar grabadas/ })).not.toBeInTheDocument()
    expect(screen.getByRole('listitem')).toHaveTextContent('Rafa Cam3')
  })

  it('muestra el error traducido si falla el guardado', async () => {
    const onFields = vi.fn().mockResolvedValue({ error: { code: '42501', message: 'rls' } })
    setup({ onFields })
    fireEvent.click(screen.getByRole('button', { name: /Agregar grabadas de Reel por/ }))
    await screen.findByRole('alert')
    expect(screen.getByRole('alert')).toHaveTextContent(/No tienes permiso/)
  })
})
