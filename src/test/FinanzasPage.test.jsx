import { render, screen, waitFor, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { vi } from 'vitest'

const mockLoadMonth = vi.fn().mockResolvedValue({ data: null, error: null })
const mockLoadInvoices = vi.fn().mockResolvedValue({ data: [], error: null })
const mockLoadDistributions = vi.fn().mockResolvedValue({ data: [], error: null })
const mockLoadMonthTotals = vi.fn().mockResolvedValue({ data: null, error: null })
vi.mock('../components/finanzas/finanzasApi', () => ({
  loadMonth: (...a) => mockLoadMonth(...a),
  loadInvoices: (...a) => mockLoadInvoices(...a),
  loadDistributions: (...a) => mockLoadDistributions(...a),
  loadMonthTotals: (...a) => mockLoadMonthTotals(...a),
  loadAllInvoices: vi.fn().mockResolvedValue({ data: [], error: null }),
  loadAllMonthTotals: vi.fn().mockResolvedValue({ data: [], error: null }),
  loadFxOperationsUpTo: vi.fn().mockResolvedValue({ data: [], error: null }),
  loadBsLedgerUpTo: vi.fn().mockResolvedValue({ data: [], error: null }),
  // Los usa MovimientosView, que carga lo suyo acumulado (la pertenencia al mes la
  // decide la fecha del movimiento, no su month_id).
  loadInvoicesUpTo: vi.fn().mockResolvedValue({ data: [], error: null }),
  loadDistributionsUpTo: vi.fn().mockResolvedValue({ data: [], error: null }),
  loadRates: vi.fn().mockResolvedValue({ data: [], error: null }),
  resolveRateBcv: vi
    .fn()
    .mockResolvedValue({ data: { rate: null, rateDate: null, source: 'missing' }, error: null }),
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
import { supabase } from '../supabase'
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
    expect(screen.queryByRole('button', { name: 'Divisas' })).not.toBeInTheDocument()
  })

  it('ya no existe la pestaña "Por cobrar", ni siquiera con todos los permisos', async () => {
    renderAt('/finanzas', () => true)
    await waitFor(() => expect(mockLoadMonth).toHaveBeenCalled())
    expect(screen.queryByRole('button', { name: 'Por cobrar' })).not.toBeInTheDocument()
  })

  it('al cambiar de pestaña conserva el mes seleccionado en la URL, no salta al mes actual', async () => {
    const can = () => true
    renderAt('/finanzas?mes=2026-05', can)

    await waitFor(() => expect(mockLoadMonth).toHaveBeenLastCalledWith('co-1', 2026, 5))

    await userEvent.click(screen.getByRole('button', { name: 'Facturación' }))

    await waitFor(() => expect(mockLoadMonth).toHaveBeenLastCalledWith('co-1', 2026, 5))
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
      expect(screen.getByText(/Este mes todavía no tiene datos/)).toBeInTheDocument(),
    )
  })

  it('con un mes summary_only, el Dashboard usa los totales cargados y avisa que es un resumen', async () => {
    const can = () => true
    mockLoadMonth.mockResolvedValueOnce({
      data: {
        id: 'm-2',
        companyId: 'co-1',
        year: 2026,
        month: 9,
        closed: true,
        pctGastos: 0.72,
        pctSocios: 0.18,
        pctGanancia: 0.1,
        summaryOnly: true,
      },
      error: null,
    })
    mockLoadMonthTotals.mockResolvedValueOnce({
      data: {
        monthId: 'm-2',
        totalFacturado: 5000,
        totalCobrado: 4800,
        totalGastos: 3456,
        totalSocios: 864,
        totalGanancia: 480,
        note: 'del sheet',
      },
      error: null,
    })
    renderAt('/finanzas', can)

    await waitFor(() => expect(screen.getByText(/del sheet/)).toBeInTheDocument())
    expect(screen.getAllByText(/Mes cargado como resumen/).length).toBeGreaterThan(0)
    expect(screen.getByText('$5,000.00')).toBeInTheDocument() // Facturado
  })

  it('Dashboard: no muestra "Top por facturación" y las barras de partida traen su % sobre lo cobrado', async () => {
    const can = () => true
    mockLoadMonth.mockResolvedValueOnce({
      data: {
        id: 'm-3',
        companyId: 'co-1',
        year: 2026,
        month: 9,
        closed: false,
        pctGastos: 0.72,
        pctSocios: 0.18,
        pctGanancia: 0.1,
        summaryOnly: false,
      },
      error: null,
    })
    mockLoadInvoices.mockResolvedValueOnce({
      data: [
        {
          id: 'inv-1',
          clientId: 'c-1',
          clientName: 'Turbopre',
          concept: 'Gestión de redes',
          amount: 1000,
          currency: 'USD',
          recurring: true,
          payments: [{ id: 'p-1', amount: 1000 }],
        },
      ],
      error: null,
    })
    mockLoadDistributions.mockResolvedValueOnce({
      data: [
        { id: 'd-1', partida: 'gastos', kind: 'in', amount: 720 },
        { id: 'd-2', partida: 'socios', kind: 'in', amount: 180 },
        { id: 'd-3', partida: 'ganancia', kind: 'in', amount: 100 },
      ],
      error: null,
    })
    renderAt('/finanzas', can)

    await waitFor(() => expect(screen.getByText(/Gastos operativos · 72%/)).toBeInTheDocument())
    expect(screen.getByText(/Socios · 18%/)).toBeInTheDocument()
    expect(screen.getByText(/Ganancia · 10%/)).toBeInTheDocument()
    expect(screen.queryByText('Top por facturación')).not.toBeInTheDocument()
    // Movimiento de cartera y Cobranza por línea van lado a lado, mitad y mitad —
    // sin movimiento de cartera este mes, la card igual se muestra (con su aviso).
    expect(screen.getByText('Movimiento de cartera')).toBeInTheDocument()
    expect(screen.getByText('Sin movimiento este mes.')).toBeInTheDocument()
    expect(screen.getByText('Cobranza por línea')).toBeInTheDocument()
  })

  it('Dashboard: un traspaso entre partidas no infla el % por encima de 100%', async () => {
    const can = () => true
    mockLoadMonth.mockResolvedValueOnce({
      data: {
        id: 'm-4',
        companyId: 'co-1',
        year: 2026,
        month: 9,
        closed: false,
        pctGastos: 0.72,
        pctSocios: 0.18,
        pctGanancia: 0.1,
        summaryOnly: false,
      },
      error: null,
    })
    mockLoadInvoices.mockResolvedValueOnce({
      data: [
        {
          id: 'inv-1',
          clientId: 'c-1',
          clientName: 'Turbopre',
          concept: 'Gestión de redes',
          amount: 820,
          currency: 'USD',
          recurring: true,
          payments: [{ id: 'p-1', amount: 820 }],
        },
      ],
      error: null,
    })
    mockLoadDistributions.mockResolvedValueOnce({
      data: [
        // Reparto normal desde el cobro: 72/18/10 exacto de 820.
        { id: 'd-1', partida: 'gastos', kind: 'in', amount: 590.4, note: null },
        { id: 'd-2', partida: 'socios', kind: 'in', amount: 147.6, note: null },
        { id: 'd-3', partida: 'ganancia', kind: 'in', amount: 82, note: null },
        // Gastos pagó de más y tomó $9.60 de Ganancia vía "Pagar con traspaso"
        // (ver PagoPartidaModal) — no es dinero nuevo, no debe contarse en el %.
        {
          id: 'd-4',
          partida: 'ganancia',
          kind: 'out',
          amount: 9.6,
          note: 'traspaso_entre_partidas',
        },
        {
          id: 'd-5',
          partida: 'gastos',
          kind: 'in',
          amount: 9.6,
          note: 'traspaso_entre_partidas',
        },
      ],
      error: null,
    })
    renderAt('/finanzas', can)

    // Con el traspaso excluido, sigue siendo exactamente 72/18/10 (no 73/18/10 = 101%).
    await waitFor(() => expect(screen.getByText(/Gastos operativos · 72%/)).toBeInTheDocument())
    expect(screen.getByText(/Socios · 18%/)).toBeInTheDocument()
    expect(screen.getByText(/Ganancia · 10%/)).toBeInTheDocument()
  })

  it('Dashboard: la barra marca la meta y pinta distinto el excedente al pasarla', async () => {
    const can = () => true
    mockLoadMonth.mockResolvedValueOnce({
      data: {
        id: 'm-5',
        companyId: 'co-1',
        year: 2026,
        month: 9,
        closed: false,
        pctGastos: 0.72,
        pctSocios: 0.18,
        pctGanancia: 0.1,
        summaryOnly: false,
      },
      error: null,
    })
    mockLoadInvoices.mockResolvedValueOnce({
      data: [
        {
          id: 'inv-1',
          clientId: 'c-1',
          clientName: 'Turbopre',
          concept: 'Gestión de redes',
          amount: 1000,
          currency: 'USD',
          recurring: true,
          payments: [{ id: 'p-1', amount: 1000 }],
        },
      ],
      error: null,
    })
    mockLoadDistributions.mockResolvedValueOnce({
      data: [
        // Meta de gastos: 72% de 1000 = 720. Se le asignó 800 → pasa la meta.
        { id: 'd-1', partida: 'gastos', kind: 'in', amount: 800, note: null },
        // Meta de socios: 180. Se le asignó justo 180 → no pasa la meta.
        { id: 'd-2', partida: 'socios', kind: 'in', amount: 180, note: null },
        // Meta de ganancia: 100. Se le asignó 50 → tampoco pasa la meta.
        { id: 'd-3', partida: 'ganancia', kind: 'in', amount: 50, note: null },
      ],
      error: null,
    })
    renderAt('/finanzas', can)

    const excedenteGastos = await screen.findByTestId('excedente-gastos')
    expect(excedenteGastos.style.left).toBe('72%')
    expect(excedenteGastos.style.width).toBe('8%') // 80% real − 72% meta
    expect(excedenteGastos.style.border).toContain('rgb(249, 115, 22)') // #F97316

    expect(screen.queryByTestId('excedente-socios')).not.toBeInTheDocument()
    expect(screen.queryByTestId('excedente-ganancia')).not.toBeInTheDocument()

    // La línea de meta se marca para las 3 partidas, hayan pasado o no de su meta.
    expect(screen.getByTestId('meta-linea-gastos')).toBeInTheDocument()
    expect(screen.getByTestId('meta-linea-socios')).toBeInTheDocument()
    expect(screen.getByTestId('meta-linea-ganancia')).toBeInTheDocument()
  })
})

describe('FinanzasPage — tab Movimientos', () => {
  it('la tab "Movimientos" solo aparece con la capability finanzas.movimientos', async () => {
    const can = (key) => key === 'finanzas.dashboard' || key === 'finanzas.movimientos'
    renderAt('/finanzas', can)
    await waitFor(() => expect(mockLoadMonth).toHaveBeenCalled())
    expect(screen.getByRole('button', { name: 'Movimientos' })).toBeInTheDocument()
  })

  it('sin la capability, la tab no aparece y /finanzas/movimientos redirige', async () => {
    const can = (key) => key === 'finanzas.dashboard'
    renderAt('/finanzas/movimientos', can)
    await waitFor(() => expect(mockLoadMonth).toHaveBeenCalled())
    expect(screen.queryByRole('button', { name: 'Movimientos' })).not.toBeInTheDocument()
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Dashboard' })).toHaveClass('bg-[#111]'),
    )
  })

  it('renderiza la tabla de Movimientos, sin columna de acciones (es solo lectura)', async () => {
    mockLoadMonth.mockResolvedValueOnce({
      data: { id: 'm-1', closed: false, pctGastos: 0.72, pctSocios: 0.18, pctGanancia: 0.1 },
      error: null,
    })
    renderAt('/finanzas/movimientos', () => true)

    await waitFor(() => expect(screen.getByText('Entradas del mes')).toBeInTheDocument())
    expect(screen.getByLabelText('Tipo')).toBeInTheDocument()
    expect(screen.queryByText('Acciones')).not.toBeInTheDocument()
  })
})

describe('FinanzasPage — tab Divisas', () => {
  it('la tab "Divisas" solo aparece con la capability finanzas.divisas', async () => {
    const can = (key) => key === 'finanzas.dashboard' || key === 'finanzas.divisas'
    renderAt('/finanzas', can)
    await waitFor(() => expect(mockLoadMonth).toHaveBeenCalled())
    expect(screen.getByRole('button', { name: 'Divisas' })).toBeInTheDocument()
  })

  it('sin la capability, la tab no aparece y /finanzas/divisas redirige', async () => {
    const can = (key) => key === 'finanzas.dashboard'
    renderAt('/finanzas/divisas', can)
    await waitFor(() => expect(mockLoadMonth).toHaveBeenCalled())
    expect(screen.queryByRole('button', { name: 'Divisas' })).not.toBeInTheDocument()
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Dashboard' })).toHaveClass('bg-[#111]'),
    )
  })

  it('renderiza la vista de Divisas con sus 3 cards de composición', async () => {
    const can = () => true
    mockLoadMonth.mockResolvedValueOnce({
      data: { id: 'm-1', closed: false, pctGastos: 0.72, pctSocios: 0.18, pctGanancia: 0.1 },
      error: null,
    })
    renderAt('/finanzas/divisas', can)

    await waitFor(() => expect(screen.getByText('Divisa física')).toBeInTheDocument())
    // La card sigue llamándose "Caja Bs": nombra el saldo en bolívares, no la tab.
    expect(screen.getAllByText('Caja Bs').length).toBeGreaterThan(0)
    expect(screen.getByText('Resultado por cambio')).toBeInTheDocument()
    // Sin operaciones/ledger, todo debería quedar en 0 sin lanzar.
    expect(screen.getByText('Sin movimientos este mes.')).toBeInTheDocument()
  })

  /** La tab se llamaba "Caja Bs" y vivía en /finanzas/caja-bs; el alias protege enlaces guardados. */
  it('la URL vieja /finanzas/caja-bs sigue abriendo la tab Divisas', async () => {
    mockLoadMonth.mockResolvedValueOnce({
      data: { id: 'm-1', closed: false, pctGastos: 0.72, pctSocios: 0.18, pctGanancia: 0.1 },
      error: null,
    })
    renderAt('/finanzas/caja-bs', () => true)

    await waitFor(() => expect(screen.getByText('Divisa física')).toBeInTheDocument())
    expect(screen.getByRole('button', { name: 'Divisas' })).toHaveClass('bg-[#111]')
  })

  it('el Dashboard esconde Comprar/Vender dólares sin finanzas.distribucion.manage', async () => {
    const can = (key) => key !== 'finanzas.distribucion.manage'
    mockLoadMonth.mockResolvedValueOnce({
      data: { id: 'm-1', closed: false, pctGastos: 0.72, pctSocios: 0.18, pctGanancia: 0.1 },
      error: null,
    })
    renderAt('/finanzas', can)

    await waitFor(() => expect(screen.getByText('Divisa física')).toBeInTheDocument())
    expect(screen.queryByRole('button', { name: 'Comprar dólares' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Vender dólares' })).not.toBeInTheDocument()
  })

  it('el Dashboard muestra Comprar/Vender dólares con la capability y el mes abierto', async () => {
    const can = () => true
    mockLoadMonth.mockResolvedValueOnce({
      data: { id: 'm-1', closed: false, pctGastos: 0.72, pctSocios: 0.18, pctGanancia: 0.1 },
      error: null,
    })
    renderAt('/finanzas', can)

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Comprar dólares' })).toBeInTheDocument(),
    )
    expect(screen.getByRole('button', { name: 'Vender dólares' })).toBeInTheDocument()
  })
})

// Los fake timers viven SOLO en este bloque: los demás tests del archivo usan
// userEvent y waitFor con timers reales, y se colgarían si los compartieran.
describe('FinanzasPage — el realtime no dispara una recarga por fila', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  /** Los callbacks que la página registró en el canal, por tabla. */
  function callbacksDelCanal() {
    const mapa = {}
    for (const [, filtro, cb] of supabase.channel.mock.results.at(-1).value.on.mock.calls) {
      mapa[filtro.table] = cb
    }
    return mapa
  }

  it('agrupa los 67 eventos de una facturación sembrada en UNA sola recarga', async () => {
    renderAt('/finanzas', () => true)
    await vi.waitFor(() => expect(mockLoadMonth).toHaveBeenCalled())

    const { fin_invoices: onInvoice } = callbacksDelCanal()
    const antes = mockLoadMonth.mock.calls.length

    // Un `.insert([...])` de 67 facturas emite 67 eventos, uno por fila.
    for (let i = 0; i < 67; i++) onInvoice({ eventType: 'INSERT' })
    await act(() => vi.advanceTimersByTimeAsync(500))

    expect(mockLoadMonth.mock.calls.length - antes).toBe(1)
  })

  it('dos cambios separados en el tiempo sí son dos recargas', async () => {
    renderAt('/finanzas', () => true)
    await vi.waitFor(() => expect(mockLoadMonth).toHaveBeenCalled())

    const { fin_payments: onPayment } = callbacksDelCanal()
    const antes = mockLoadMonth.mock.calls.length

    onPayment({ eventType: 'INSERT' })
    await act(() => vi.advanceTimersByTimeAsync(500))
    onPayment({ eventType: 'INSERT' })
    await act(() => vi.advanceTimersByTimeAsync(500))

    expect(mockLoadMonth.mock.calls.length - antes).toBe(2)
  })

  it('no se suscribe a fin_rates: la escribe la propia recarga y se realimentaría', async () => {
    renderAt('/finanzas', () => true)
    await vi.waitFor(() => expect(mockLoadMonth).toHaveBeenCalled())

    const tablas = Object.keys(callbacksDelCanal())
    expect(tablas).not.toContain('fin_rates')
    expect(tablas).toContain('fin_invoices')
  })
})
