import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import InfoTip from '../components/common/InfoTip'
import { INDICATOR_KEYS, INDICATOR_DESCRIPTIONS } from '../utils/employeeScoreProfiles'

describe('InfoTip', () => {
  it('muestra la explicación al pasar el cursor y la oculta al salir', () => {
    render(<InfoTip text="Explica el indicador" label="Qué evalúa: Tareas" />)
    const btn = screen.getByRole('button', { name: 'Qué evalúa: Tareas' })
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
    fireEvent.mouseEnter(btn)
    expect(screen.getByRole('tooltip')).toHaveTextContent('Explica el indicador')
    fireEvent.mouseLeave(btn)
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
  })

  it('también se abre con el foco del teclado', () => {
    render(<InfoTip text="Texto" />)
    fireEvent.focus(screen.getByRole('button'))
    expect(screen.getByRole('tooltip')).toBeInTheDocument()
  })

  it('no renderiza nada sin texto', () => {
    const { container } = render(<InfoTip text="" />)
    expect(container).toBeEmptyDOMElement()
  })
})

describe('INDICATOR_DESCRIPTIONS', () => {
  it('tiene explicación para cada indicador del catálogo', () => {
    INDICATOR_KEYS.forEach((k) => expect(INDICATOR_DESCRIPTIONS[k]).toBeTruthy())
  })
})
