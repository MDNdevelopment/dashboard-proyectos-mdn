/**
 * Tests de ScoreDial y el helper scoreDialColor.
 */
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import ScoreDial, { scoreDialColor } from '../components/metricas/ScoreDial'

// ── scoreDialColor ─────────────────────────────────────────────────────────────
describe('scoreDialColor', () => {
  it('devuelve verde para score >= 80', () => {
    expect(scoreDialColor(80)).toBe('#10B981')
    expect(scoreDialColor(100)).toBe('#10B981')
    expect(scoreDialColor(99)).toBe('#10B981')
  })

  it('devuelve ámbar para score 60–79', () => {
    expect(scoreDialColor(60)).toBe('#FAB51A')
    expect(scoreDialColor(79)).toBe('#FAB51A')
  })

  it('devuelve rojo para score < 60', () => {
    expect(scoreDialColor(0)).toBe('#EF4444')
    expect(scoreDialColor(59)).toBe('#EF4444')
  })

  it('clampea correctamente: score > 100 → verde; score < 0 → rojo', () => {
    expect(scoreDialColor(150)).toBe('#10B981')
    expect(scoreDialColor(-10)).toBe('#EF4444')
  })
})

// ── ScoreDial — showScale ──────────────────────────────────────────────────────
describe('ScoreDial — prop showScale', () => {
  it('con showScale=true (default) muestra el número Y el /100', () => {
    render(<ScoreDial score={75} />)
    expect(screen.getByText('75.0')).toBeInTheDocument()
    expect(screen.getByText('/100')).toBeInTheDocument()
  })

  it('con showScale=false muestra el número pero NO el /100', () => {
    render(<ScoreDial score={75} showScale={false} />)
    expect(screen.getByText('75.0')).toBeInTheDocument()
    expect(screen.queryByText('/100')).not.toBeInTheDocument()
  })

  it('el número escala con size (inline style, no clase Tailwind fija)', () => {
    render(<ScoreDial score={50} size={80} showScale={false} />)
    const span = screen.getByText('50.0')
    // fontSize debería ser 80 * 0.175 = 14px (expresado en px o como número)
    expect(span.style.fontSize).toBe(`${80 * 0.175}px`)
  })
})
