import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'

const api = vi.hoisted(() => ({
  upsertLote: vi.fn(),
  deleteLote: vi.fn(),
  updatePieza: vi.fn(),
  setFechaEntregaPauta: vi.fn(),
}))
vi.mock('../components/pautas/avPautasApi', () => api)

import EdicionSection from '../components/pautas/EdicionSection'
import { alertas, pautaErrorMessage, pautaPermissions } from '../utils/audiovisual'
import { ALERTA_META, alertaCount } from '../components/pautas/AlertasStrip'

const HOY = '2026-11-10'
const pauta = (o = {}) => ({
  id: 'p1',
  status: 'realizada',
  pauta_date: '2026-11-05',
  line_id: 'l1',
  formats: ['V'],
  piezas_por_formato: { V: { salieron: 4, editadas: 0 } },
  ...o,
})
const lote = (o = {}) => ({
  id: 'z1',
  pauta_id: 'p1',
  editor_user_id: 'e1',
  formato: 'V',
  es_lote: true,
  cantidad: 4,
  listas: 1,
  status: 'en_edicion',
  fecha_entrega: null,
  ...o,
})
const map = (...ls) => new Map([['p1', ls]])

describe('alertas() con fecha de entrega', () => {
  it('atrasada si un lote con fecha vencida tiene listas < cantidad', () => {
    const a = alertas([pauta()], map(lote({ fecha_entrega: '2026-11-09' })), HOY)
    expect(a.piezasAtrasadas).toHaveLength(1)
  })
  it('con fecha futura no está atrasada aunque pasen más de 7 días de la pauta', () => {
    const a = alertas(
      [pauta({ pauta_date: '2026-10-01' })],
      map(lote({ fecha_entrega: '2026-11-15' })),
      HOY,
    )
    expect(a.piezasAtrasadas).toHaveLength(0)
  })
  it('lote vencido pero completo no cuenta', () => {
    const a = alertas([pauta()], map(lote({ fecha_entrega: '2026-11-09', listas: 4 })), HOY)
    expect(a.piezasAtrasadas).toHaveLength(0)
  })
  it('sin ninguna fecha conserva la regla de 7 días', () => {
    const p = pauta({ pauta_date: '2026-10-01' })
    expect(alertas([p], map(lote()), HOY).piezasAtrasadas).toHaveLength(1)
    const reciente = pauta({ pauta_date: '2026-11-08' })
    expect(alertas([reciente], map(lote()), HOY).piezasAtrasadas).toHaveLength(0)
  })
})

describe('alerta sinFechaEntrega', () => {
  it('lista pautas realizadas con piezas por editar y sin fecha, ordenadas por pauta, y suma al total', () => {
    const ps = [
      pauta({ id: 'a', pauta_date: '2026-11-08' }),
      pauta({ id: 'b', pauta_date: '2026-11-03' }),
      pauta({ id: 'c' }),
    ]
    const m = new Map([
      ['a', [lote({ pauta_id: 'a' })]],
      ['b', [lote({ pauta_id: 'b' })]],
      ['c', [lote({ pauta_id: 'c', fecha_entrega: '2026-11-20' })]], // ya tiene fecha
    ])
    const a = alertas(ps, m, HOY)
    expect(a.sinFechaEntrega.map((p) => p.id)).toEqual(['b', 'a'])
    expect(a.total).toBe(2 + a.piezasAtrasadas.length)
  })
  it('ignora pautas con todo editado, no realizadas y borradas', () => {
    const ps = [
      pauta({ id: 'a' }),
      pauta({ id: 'b', status: 'programada' }),
      pauta({ id: 'c', deleted_at: '2026-11-01' }),
    ]
    const m = new Map([
      ['a', [lote({ pauta_id: 'a', listas: 4, status: 'listo' })]], // nada por editar
      ['b', [lote({ pauta_id: 'b' })]],
      ['c', [lote({ pauta_id: 'c' })]],
    ])
    expect(alertas(ps, m, HOY).sinFechaEntrega).toHaveLength(0)
  })
  it('no avisa de pautas viejas (más de 45 días): ya no hay qué medir', () => {
    const vieja = pauta({ id: 'v', pauta_date: '2026-09-01' }) // HOY 2026-11-10: 70 días
    const m = new Map([['v', [lote({ pauta_id: 'v' })]]])
    expect(alertas([vieja], m, HOY).sinFechaEntrega).toHaveLength(0)
  })
  it('solo cuenta las pautas que quien mira puede fijar', () => {
    const a = alertas([pauta()], map(lote()), HOY, { puedeFijarFecha: () => false })
    expect(a.sinFechaEntrega).toHaveLength(0)
  })
  it('tiene metadatos para el chip', () => {
    expect(ALERTA_META.sinFechaEntrega.label(2)).toBe('2 pautas sin fecha de entrega')
    expect(alertaCount({ sinFechaEntrega: [1] }, 'sinFechaEntrega')).toBe(1)
  })
})

describe('permisos y errores de fecha de entrega', () => {
  it('canSetFechaEntrega: coordina, gestión o jefa de la línea; el recurso no', () => {
    const p = pauta({ recurso_ids: ['u1'] })
    const base = { pauta: p, userId: 'u1' }
    expect(pautaPermissions({ ...base, canCoordinate: true }).canSetFechaEntrega).toBe(true)
    expect(pautaPermissions({ ...base, canGestionPautas: true }).canSetFechaEntrega).toBe(true)
    expect(pautaPermissions({ ...base, leadLineIds: ['l1'] }).canSetFechaEntrega).toBe(true)
    expect(pautaPermissions(base).canSetFechaEntrega).toBe(false)
  })
  it('canMoveFechaVencida: solo la jefa de la línea (ni coordinación ni gestión)', () => {
    const base = { pauta: pauta({ recurso_ids: ['u1'] }), userId: 'u1' }
    expect(pautaPermissions({ ...base, leadLineIds: ['l1'] }).canMoveFechaVencida).toBe(true)
    expect(pautaPermissions({ ...base, canCoordinate: true }).canMoveFechaVencida).toBe(false)
    expect(pautaPermissions({ ...base, canGestionPautas: true }).canMoveFechaVencida).toBe(false)
  })
  it('traduce los errores del trigger', () => {
    expect(
      pautaErrorMessage({
        code: '22023',
        message: 'Una fecha de entrega vencida solo la puede cambiar la jefa de la línea',
      }),
    ).toMatch(/jefa de la línea/)
    expect(
      pautaErrorMessage({
        code: '42501',
        message: 'No tienes permiso para cambiar la fecha de entrega de las piezas',
      }),
    ).toMatch(/fecha de entrega/)
  })
})

describe('EdicionSection: fecha de entrega', () => {
  const renderSec = (props = {}) => {
    const onPiezaChanged = vi.fn()
    render(
      <EdicionSection
        pauta={pauta()}
        piezas={[lote({ fecha_entrega: '2026-11-12' })]}
        editorUsers={[]}
        usersById={new Map([['e1', { user_id: 'e1', first_name: 'Eva', last_name: 'Ed' }]])}
        canEdit
        canSetFecha
        hoy={HOY}
        userId="liz"
        companyId="co"
        onPiezaChanged={onPiezaChanged}
        onPiezaDeleted={vi.fn()}
        {...props}
      />,
    )
    return { onPiezaChanged }
  }
  beforeEach(() => {
    Object.values(api).forEach((f) => f.mockReset())
  })

  it('editable: cambia la fecha de toda la pauta y avisa por cada lote', async () => {
    api.setFechaEntregaPauta.mockResolvedValue({ data: [{ id: 'z1' }], error: null })
    const { onPiezaChanged } = renderSec()
    fireEvent.change(screen.getByLabelText('Fecha de entrega de las piezas'), {
      target: { value: '2026-11-18' },
    })
    await waitFor(() => expect(api.setFechaEntregaPauta).toHaveBeenCalledWith('p1', '2026-11-18'))
    expect(onPiezaChanged).toHaveBeenCalledWith({ id: 'z1' })
  })

  it('sin fecha: pide llenarla a mano y no inventa ninguna', () => {
    renderSec({ piezas: [lote()] })
    expect(screen.getByLabelText('Fecha de entrega de las piezas')).toHaveValue('')
    expect(screen.getByText(/Pendiente: ponle fecha/)).toBeInTheDocument()
  })

  it('muestra el error en español si el trigger rechaza', async () => {
    api.setFechaEntregaPauta.mockResolvedValue({
      data: null,
      error: {
        code: '42501',
        message: 'No tienes permiso para cambiar la fecha de entrega de las piezas',
      },
    })
    renderSec()
    fireEvent.change(screen.getByLabelText('Fecha de entrega de las piezas'), {
      target: { value: '2026-11-18' },
    })
    expect(await screen.findByRole('alert')).toHaveTextContent(/permiso/)
  })

  it('ajuste por lote usa updatePieza', async () => {
    api.updatePieza.mockResolvedValue({ data: { id: 'z1' }, error: null })
    renderSec()
    fireEvent.change(screen.getByLabelText(/Fecha de entrega de .* de Eva Ed/), {
      target: { value: '2026-11-25' },
    })
    await waitFor(() =>
      expect(api.updatePieza).toHaveBeenCalledWith('z1', { fecha_entrega: '2026-11-25' }),
    )
  })

  it('solo lectura sin permiso: sin inputs de fecha', () => {
    renderSec({ canSetFecha: false })
    expect(screen.queryByLabelText('Fecha de entrega de las piezas')).toBeNull()
    expect(screen.queryByLabelText(/Fecha de entrega de .* de Eva Ed/)).toBeNull()
  })

  describe('fecha vencida', () => {
    const vencida = () => ({ piezas: [lote({ fecha_entrega: '2026-11-09' })] })

    it('con permiso de fechas pero sin ser jefa: bloqueada con el motivo', () => {
      renderSec(vencida())
      expect(screen.queryByLabelText('Fecha de entrega de las piezas')).toBeNull()
      expect(screen.queryByLabelText(/Fecha de entrega de .* de Eva Ed/)).toBeNull()
      expect(screen.getByText(/solo la jefa de la línea puede cambiarla/)).toBeInTheDocument()
    })

    it('la jefa de la línea sí puede moverla', async () => {
      api.setFechaEntregaPauta.mockResolvedValue({ data: [], error: null })
      renderSec({ ...vencida(), canMoveFechaVencida: true })
      fireEvent.change(screen.getByLabelText('Fecha de entrega de las piezas'), {
        target: { value: '2026-11-30' },
      })
      await waitFor(() => expect(api.setFechaEntregaPauta).toHaveBeenCalledWith('p1', '2026-11-30'))
      expect(screen.getByLabelText(/Fecha de entrega de .* de Eva Ed/)).toBeInTheDocument()
    })
  })

  it('pauta no realizada: no muestra fecha', () => {
    renderSec({ pauta: pauta({ status: 'programada' }) })
    expect(screen.queryByTestId('fecha-entrega-pauta')).toBeNull()
  })
})
