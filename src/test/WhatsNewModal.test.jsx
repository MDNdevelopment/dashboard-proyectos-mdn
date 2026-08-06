import { render, screen, fireEvent } from '@testing-library/react'
import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import WhatsNewModal from '../components/WhatsNewModal'
import { useWhatsNew } from '../hooks/useWhatsNew'
import { LATEST_VERSION, CHANGELOG } from '../data/changelog'

const sampleEntries = [
  {
    version: '1.1.0',
    date: '2026-08-05',
    title: 'Reportes por línea',
    changes: ['Nuevo desglose de métricas por línea de negocio.', 'Mes unificado.'],
  },
]

describe('WhatsNewModal — render', () => {
  it('con entries=[] no renderiza nada', () => {
    const { container } = render(<WhatsNewModal entries={[]} onClose={vi.fn()} />)
    expect(container.firstChild).toBeNull()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('muestra títulos y los items de changes', () => {
    render(<WhatsNewModal entries={sampleEntries} onClose={vi.fn()} />)
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText('v1.1.0')).toBeInTheDocument()
    expect(screen.getByText('Reportes por línea')).toBeInTheDocument()
    expect(screen.getByText('Nuevo desglose de métricas por línea de negocio.')).toBeInTheDocument()
    expect(screen.getByText('Mes unificado.')).toBeInTheDocument()
  })
})

describe('WhatsNewModal — cierre', () => {
  it('el botón "Entendido" llama onClose', () => {
    const onClose = vi.fn()
    render(<WhatsNewModal entries={sampleEntries} onClose={onClose} />)
    fireEvent.click(screen.getByRole('button', { name: 'Entendido' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('la tecla Escape llama onClose', () => {
    const onClose = vi.fn()
    render(<WhatsNewModal entries={sampleEntries} onClose={onClose} />)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('el botón X llama onClose', () => {
    const onClose = vi.fn()
    render(<WhatsNewModal entries={sampleEntries} onClose={onClose} />)
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar novedades' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})

describe('useWhatsNew — integración con localStorage', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('primer login: no muestra el modal y escribe LATEST_VERSION', () => {
    const { result } = renderHook(() => useWhatsNew())
    expect(result.current.entries).toEqual([])
    expect(localStorage.getItem('mdn_whatsnew_seen_version')).toBe(LATEST_VERSION)
  })

  it('segunda visita con versión vieja guardada: muestra solo las no vistas', () => {
    localStorage.setItem('mdn_whatsnew_seen_version', '1.0.0')
    const { result } = renderHook(() => useWhatsNew())
    const versions = result.current.entries.map((e) => e.version)
    expect(versions).toContain('1.1.0')
    expect(versions).not.toContain('1.0.0')
  })

  it('dismiss marca LATEST_VERSION y limpia las entradas', () => {
    localStorage.setItem('mdn_whatsnew_seen_version', '1.0.0')
    const { result } = renderHook(() => useWhatsNew())
    expect(result.current.entries).toHaveLength(2)
    act(() => result.current.dismiss())
    expect(result.current.entries).toEqual([])
    expect(localStorage.getItem('mdn_whatsnew_seen_version')).toBe(LATEST_VERSION)
  })

  it('la lista de novedades del changelog está ordenada de más nueva a más vieja', () => {
    const versions = CHANGELOG.map((e) => e.version)
    const sorted = [...versions].sort((a, b) => (a > b ? -1 : a < b ? 1 : 0))
    expect(versions).toEqual(sorted)
  })
})
