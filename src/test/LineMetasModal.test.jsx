/**
 * Tests de LineMetasModal — configuración de metas por defecto de una línea
 * (Empresa → Líneas → "Configurar metas"). Solo configura las Tareas Fijas
 * (productividad); la meta de Reuniones ya no se captura acá — se calcula sola
 * en Operaciones (ver utils/reunionesMeta.js).
 */
import { render, screen, fireEvent } from '@testing-library/react'
import { vi } from 'vitest'

const mockUpdateLine = vi.fn()

vi.mock('../components/metricas/metricsApi', () => ({
  updateLine: (...a) => mockUpdateLine(...a),
}))

import LineMetasModal from '../components/empresa/LineMetasModal'

const LINE = {
  id: 'line-1',
  name: 'Georgina',
  color: '#FAB51A',
  metas: { tareas: [{ nombre: 'Métricas', meta: 15 }] },
}

function renderModal(props = {}) {
  return render(<LineMetasModal line={LINE} onClose={() => {}} onSaved={() => {}} {...props} />)
}

describe('LineMetasModal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUpdateLine.mockResolvedValue({ data: null, error: null })
  })

  it('no muestra ningún campo de meta de reuniones', () => {
    renderModal()
    expect(screen.queryByText(/meta de reuniones/i)).not.toBeInTheDocument()
  })

  it('muestra las tareas fijas configuradas en la línea', () => {
    renderModal()
    expect(screen.getByDisplayValue('Métricas')).toBeInTheDocument()
    expect(screen.getByDisplayValue('15')).toBeInTheDocument()
  })

  it('al guardar, envía solo las tareas a updateLine (sin clave "reuniones")', async () => {
    renderModal()
    fireEvent.click(screen.getByText('Guardar metas'))
    await vi.waitFor(() => {
      expect(mockUpdateLine).toHaveBeenCalledWith('line-1', {
        metas: { tareas: [{ nombre: 'Métricas', meta: 15 }] },
      })
    })
  })
})
