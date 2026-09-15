import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { vi } from 'vitest'

const mockLoadMonth = vi.fn().mockResolvedValue({ data: null, error: null })
const mockLoadInvoices = vi.fn().mockResolvedValue({ data: [], error: null })
const mockLoadDistributions = vi.fn().mockResolvedValue({ data: [], error: null })
vi.mock('../components/finanzas/finanzasApi', () => ({
  loadMonth: (...a) => mockLoadMonth(...a),
  loadInvoices: (...a) => mockLoadInvoices(...a),
  loadDistributions: (...a) => mockLoadDistributions(...a),
  loadAllInvoices: vi.fn().mockResolvedValue({ data: [], error: null }),
}))

vi.mock('../components/metricas/metricsApi', () => ({
  loadClients: vi.fn().mockResolvedValue({ data: [], error: null }),
  loadLines: vi.fn().mockResolvedValue({ data: [], error: null }),
}))

vi.mock('../supabase', () => {
  const channel = { on: vi.fn().mockReturnThis(), subscribe: vi.fn().mockReturnThis() }
  return { supabase: { channel: vi.fn(() => channel), removeChannel: vi.fn() } }
})

vi.mock('../context/AuthContext', () => ({ useAuth: vi.fn() }))

import { useAuth } from '../context/AuthContext'
import FinanzasPage from '../pages/FinanzasPage'

function renderAt(path, can) {
  useAuth.mockReturnValue({
    userProfile: { user_id: 'u-1', company_id: 'co-1', admin: false, access_level: 4 },
    can,
  })
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/finanzas/*" element={<FinanzasPage />} />
        <Route path="/" element={<div>Inicio</div>} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('FinanzasPage — tabs por capability', () => {
  it('solo muestra las pestañas permitidas por can()', async () => {
    const can = (key) => key === 'finanzas.dashboard' || key === 'finanzas.facturacion'
    renderAt('/finanzas', can)

    await waitFor(() => expect(mockLoadMonth).toHaveBeenCalled())

    expect(screen.getByRole('button', { name: 'Dashboard' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Facturación' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Clientes' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Distribución' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Por cobrar' })).not.toBeInTheDocument()
  })

  it('redirige a la primera pestaña permitida si la ruta activa no está autorizada', async () => {
    const can = (key) => key === 'finanzas.facturacion'
    renderAt('/finanzas/clientes', can)

    await waitFor(() => {
      expect(screen.queryByText(/Este mes todavía no se ha abierto/)).not.toBeInTheDocument()
    })
    // Sin acceso a 'clientes' ni 'dashboard', debe caer en Facturación (única permitida).
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Facturación' })).toHaveClass('bg-[#111]'),
    )
  })

  it('con el mes sin abrir, Dashboard muestra el aviso correspondiente', async () => {
    const can = () => true
    renderAt('/finanzas', can)
    await waitFor(() =>
      expect(screen.getByText(/Este mes todavía no se ha abierto/)).toBeInTheDocument(),
    )
  })
})
