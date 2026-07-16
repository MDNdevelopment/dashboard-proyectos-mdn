/**
 * Tests de LineMetasModal — configuración de metas por defecto de una línea
 * (Empresa → Líneas → "Configurar metas"). Cubre el tope de la meta de reuniones
 * a la cantidad de marcas activas de la línea (clientCount), tanto al tipear
 * como al guardar.
 */
import { render, screen, fireEvent } from '@testing-library/react'
import { vi } from 'vitest'

const mockUpdateLine = vi.fn()

vi.mock('../components/metricas/metricsApi', () => ({
  updateLine: (...a) => mockUpdateLine(...a),
}))

import LineMetasModal from '../components/empresa/LineMetasModal'

const LINE = { id: 'line-1', name: 'Georgina', color: '#FAB51A', metas: { reuniones: 15 } }

function renderModal(props = {}) {
  return render(
    <LineMetasModal line={LINE} clientCount={3} onClose={() => {}} onSaved={() => {}} {...props} />
  )
}

describe('LineMetasModal — meta de reuniones topada a clientCount', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUpdateLine.mockResolvedValue({ data: null, error: null })
  })

  it('al abrir, clampa un valor guardado que excede la cantidad de marcas', () => {
    renderModal({ clientCount: 3 }) // line.metas.reuniones = 15, pero solo hay 3 marcas
    const metaInput = document.querySelectorAll('input[type="number"]')[0]
    expect(metaInput.value).toBe('3')
  })

  it('clampa un valor tipeado por encima del límite', () => {
    renderModal({ clientCount: 3 })
    const metaInput = document.querySelectorAll('input[type="number"]')[0]
    fireEvent.change(metaInput, { target: { value: '9' } })
    expect(metaInput.value).toBe('3')
  })

  it('permite un valor dentro del límite', () => {
    renderModal({ clientCount: 3 })
    const metaInput = document.querySelectorAll('input[type="number"]')[0]
    fireEvent.change(metaInput, { target: { value: '2' } })
    expect(metaInput.value).toBe('2')
  })

  it('muestra el hint con el máximo permitido', () => {
    renderModal({ clientCount: 3 })
    expect(screen.getByText('Máx. 3 (1 por marca activa de la línea)')).toBeInTheDocument()
  })

  it('al guardar, envía la meta ya clampada a updateLine', async () => {
    renderModal({ clientCount: 3 })
    fireEvent.click(screen.getByText('Guardar metas'))
    await vi.waitFor(() => {
      expect(mockUpdateLine).toHaveBeenCalledWith('line-1', {
        metas: expect.objectContaining({ reuniones: 3 }),
      })
    })
  })
})
