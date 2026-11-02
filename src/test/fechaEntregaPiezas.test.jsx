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
  fecha_entrega_confirmada: false,
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

describe('alerta fechaEntregaSinConfirmar', () => {
  it('lista pautas realizadas con fecha futura sin confirmar, ordenadas, y suma al total', () => {
    const ps = [pauta({ id: 'a' }), pauta({ id: 'b' }), pauta({ id: 'c' })]
    const m = new Map([
      ['a', [lote({ pauta_id: 'a', fecha_entrega: '2026-11-20' })]],
      ['b', [lote({ pauta_id: 'b', fecha_entrega: '2026-11-12' })]],
      ['c', [lote({ pauta_id: 'c', fecha_entrega: '2026-11-12', fecha_entrega_confirmada: true })]],
    ])
    const a = alertas(ps, m, HOY)
    expect(a.fechaEntregaSinConfirmar.map((p) => p.id)).toEqual(['b', 'a'])
    expect(a.total).toBe(2)
  })
  it('ignora fechas ya vencidas, pautas no realizadas y borradas', () => {
    const ps = [
      pauta({ id: 'a' }),
      pauta({ id: 'b', status: 'programada' }),
      pauta({ id: 'c', deleted_at: '2026-11-01' }),
    ]
    const m = new Map(
      ['a', 'b', 'c'].map((id) => [
        id,
        [lote({ pauta_id: id, fecha_entrega: id === 'a' ? '2026-11-09' : '2026-11-20' })],
      ]),
    )
    expect(alertas(ps, m, HOY).fechaEntregaSinConfirmar).toHaveLength(0)
  })
  it('solo cuenta las pautas que quien mira puede fijar', () => {
    const m = map(lote({ fecha_entrega: '2026-11-20' }))
    const a = alertas([pauta()], m, HOY, { puedeFijarFecha: () => false })
    expect(a.fechaEntregaSinConfirmar).toHaveLength(0)
    expect(a.total).toBe(0)
  })
  it('tiene metadatos para el chip', () => {
    expect(ALERTA_META.fechaEntregaSinConfirmar.label(2)).toBe(
      '2 pautas con fecha de entrega sin confirmar',
    )
    expect(alertaCount({ fechaEntregaSinConfirmar: [1] }, 'fechaEntregaSinConfirmar')).toBe(1)
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
  it('traduce los errores del trigger', () => {
    expect(
      pautaErrorMessage({
        code: '22023',
        message: 'La fecha de entrega ya venció y no se puede mover',
      }),
    ).toMatch(/ya venció/)
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
    expect(screen.getAllByText('sin confirmar').length).toBeGreaterThan(0)
    fireEvent.change(screen.getByLabelText('Fecha de entrega de las piezas'), {
      target: { value: '2026-11-18' },
    })
    await waitFor(() => expect(api.setFechaEntregaPauta).toHaveBeenCalledWith('p1', '2026-11-18'))
    expect(onPiezaChanged).toHaveBeenCalledWith({ id: 'z1' })
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

  it('solo lectura sin permiso: sin inputs de fecha, con chip', () => {
    renderSec({ canSetFecha: false })
    expect(screen.queryByLabelText('Fecha de entrega de las piezas')).toBeNull()
    expect(screen.queryByLabelText(/Fecha de entrega de .* de Eva Ed/)).toBeNull()
    expect(screen.getAllByText('sin confirmar').length).toBeGreaterThan(0)
  })

  it('vencida: bloqueada con el motivo aunque tenga permiso', () => {
    renderSec({ piezas: [lote({ fecha_entrega: '2026-11-09', fecha_entrega_confirmada: true })] })
    expect(screen.queryByLabelText('Fecha de entrega de las piezas')).toBeNull()
    expect(screen.queryByLabelText(/Fecha de entrega de .* de Eva Ed/)).toBeNull()
    expect(screen.getByText(/Ya venció/)).toBeInTheDocument()
  })

  it('pauta no realizada: no muestra fecha', () => {
    renderSec({ pauta: pauta({ status: 'programada' }) })
    expect(screen.queryByTestId('fecha-entrega-pauta')).toBeNull()
  })

  it('confirmar la fecha por defecto reenvía la misma fecha', async () => {
    api.setFechaEntregaPauta.mockResolvedValue({ data: [], error: null })
    renderSec()
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar fecha' }))
    await waitFor(() => expect(api.setFechaEntregaPauta).toHaveBeenCalledWith('p1', '2026-11-12'))
  })
})
