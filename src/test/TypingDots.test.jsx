import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import TypingDots from '../components/ai/TypingDots'

describe('TypingDots', () => {
  it('renderiza 3 puntos', () => {
    const { container } = render(<TypingDots />)
    expect(container.querySelectorAll('span')).toHaveLength(3)
  })

  it('es accesible con un label descriptivo', () => {
    render(<TypingDots />)
    expect(screen.getByLabelText(/mappi está escribiendo/i)).toBeInTheDocument()
  })
})
