import { render, screen, fireEvent, within } from '@testing-library/react'
import { vi } from 'vitest'
import AvSemanaView from '../components/pautas/AvSemanaView'

// Hoy = miércoles 7 de octubre de 2026 → semana lun 5 – sáb 10.
const TODAY = new Date(2026, 9, 7)

const users = new Map([
  ['r1', { user_id: 'r1', first_name: 'Rafa', last_name: 'Cam', access_level: 1 }],
  ['r2', { user_id: 'r2', first_name: 'Sol', last_name: 'Luz', access_level: 1 }],
  ['j1', { user_id: 'j1', first_name: 'Georgina', last_name: '', access_level: 2 }],
])
const recursos = [users.get('r1'), users.get('r2')]

const pauta = (o = {}) => ({
  id: 'p',
  client_id: 'c1',
  client_name: 'Cliente',
  line_id: 'l1',
  status: 'programada',
  lugar_tipo: 'locacion',
  place: 'Calle',
  pauta_date: '2026-10-07',
  salida: '09:00:00',
  llegada: null,
  formats: ['R'],
  recurso_ids: ['r1'],
  attendee_ids: [],
  created_by: 'j1',
  created_at: '2026-10-01T10:00:00Z',
  submitted: true,
  deleted_at: null,
  grabacion_por_formato: {},
  piezas_por_formato: {},
  grilla_delivered_at: null,
  link: 'https://drive.google.com/x',
  ...o,
})

const PAUTAS = [
  // Esta semana, capturada y a medio editar (Reel: 10 salieron, 4 listas).
  pauta({
    id: 'a',
    client_name: 'Smashack',
    pauta_date: '2026-10-06',
    grabacion_por_formato: { R: { r1: 10 } },
    piezas_por_formato: { R: { salieron: 10, editadas: 0 } },
  }),
  // Hoy en el estudio, sin captura todavía (es hoy → NO alerta de "sin captura").
  pauta({
    id: 'b',
    client_name: 'Fein Kaffee',
    lugar_tipo: 'estudio',
    place: '',
    salida: '13:00:00',
    llegada: '15:00:00',
  }),
  // Solicitud pendiente con fecha deseada esta semana.
  pauta({
    id: 's',
    client_name: 'Push',
    status: 'solicitada',
    pauta_date: '2026-10-09',
    recurso_ids: [],
  }),
  // Semana pasada, realizada y sin captura → alerta.
  pauta({ id: 'c', client_name: 'Alpitech', status: 'realizada', pauta_date: '2026-09-30' }),
  // Semana que viene.
  pauta({ id: 'd', client_name: 'Futura', pauta_date: '2026-10-14' }),
]
const PIEZAS = new Map([
  [
    'a',
    [
      {
        id: 'z1',
        pauta_id: 'a',
        editor_user_id: 'r1',
        formato: 'R',
        es_lote: true,
        cantidad: 10,
        listas: 4,
      },
    ],
  ],
])

function setup(props = {}) {
  const onFields = vi.fn().mockResolvedValue({ error: null })
  const onPautaClick = vi.fn()
  const onGoDatos = vi.fn()
  render(
    <AvSemanaView
      pautas={PAUTAS}
      piezasByPauta={PIEZAS}
      usersById={users}
      recursoUsers={recursos}
      allEmployees={recursos}
      canApprove
      today={TODAY}
      onFields={onFields}
      onPautaClick={onPautaClick}
      onGoDatos={onGoDatos}
      {...props}
    />,
  )
  return { onFields, onPautaClick, onGoDatos }
}

const grid = () => screen.getByTestId('semana-grid')

describe('AvSemanaView — cabecera y navegación', () => {
  it('arranca en la semana de hoy (lun 5 – sáb 10) y marca el día de hoy', () => {
    setup()
    expect(
      screen.getByRole('heading', { name: /Esta semana · 5 oct – 10 oct/ }),
    ).toBeInTheDocument()
    expect(within(grid()).getByLabelText('Mié 7')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Hoy' })).not.toBeInTheDocument()
  })

  it('‹ › navegan por semanas y "Hoy" vuelve', () => {
    setup()
    fireEvent.click(screen.getByLabelText('Semana siguiente'))
    expect(screen.getByRole('heading', { name: /Semana del 12/ })).toBeInTheDocument()
    expect(within(grid()).getByRole('button', { name: /^Futura/ })).toBeInTheDocument()
    expect(within(grid()).queryByRole('button', { name: /^Smashack/ })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Hoy' }))
    expect(screen.getByRole('heading', { name: /Esta semana/ })).toBeInTheDocument()
  })

  it('los KPIs del mes salen de las pautas: % editado, realizadas y por aprobar; clic → Datos', () => {
    const { onGoDatos } = setup()
    const kpi = screen.getByRole('button', { name: 'Ver datos del mes' })
    // Octubre: salieron 10 (a), listas 4 → 40 %. Realizadas en octubre: ninguna (c es de sept).
    expect(kpi).toHaveTextContent('40%')
    expect(kpi).toHaveTextContent(/0\s*realizadas/)
    expect(kpi).toHaveTextContent(/1\s*por aprobar/)
    fireEvent.click(kpi)
    expect(onGoDatos).toHaveBeenCalled()
  })
})

describe('AvSemanaView — grilla', () => {
  it('pinta cada pauta de la semana en su día con su estado; clic abre el detalle', () => {
    const { onPautaClick } = setup()
    const mar = within(grid()).getByLabelText('Mar 6')
    const smashack = within(mar).getByRole('button', { name: /^Smashack · 4\/10 editadas/ })
    const vie = within(grid()).getByLabelText('Vie 9')
    expect(within(vie).getByRole('button', { name: /^Push · Por aprobar/ })).toBeInTheDocument()
    const mie = within(grid()).getByLabelText('Mié 7')
    expect(
      within(mie).getByRole('button', { name: /^Fein Kaffee · Sin captura/ }),
    ).toBeInTheDocument()
    expect(within(mie).getByText('◉ Estudio')).toBeInTheDocument()
    fireEvent.click(smashack)
    expect(onPautaClick).toHaveBeenCalledWith(expect.objectContaining({ id: 'a' }))
  })

  it('no mezcla pautas de otras semanas', () => {
    setup()
    expect(within(grid()).queryByRole('button', { name: /^Alpitech/ })).not.toBeInTheDocument()
    expect(within(grid()).queryByRole('button', { name: /^Futura/ })).not.toBeInTheDocument()
  })
})

describe('AvSemanaView — alertas y panel lateral', () => {
  it('muestra un chip por tipo de alerta con su conteo', () => {
    setup()
    expect(screen.getByRole('button', { name: /1 solicitud por aprobar/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /1 pauta pasada sin captura/ })).toBeInTheDocument()
    expect(screen.queryByText(/grilla/)).not.toBeInTheDocument()
  })

  it('sin nada pendiente muestra el estado verde', () => {
    setup({ pautas: [PAUTAS[0]], piezasByPauta: PIEZAS })
    expect(screen.getByTestId('alertas-ok')).toBeInTheDocument()
  })

  it('"solicitudes por aprobar" abre la cola con Agendar/Declinar; Declinar guarda', async () => {
    const { onFields } = setup()
    fireEvent.click(screen.getByRole('button', { name: /1 solicitud por aprobar/ }))
    const panel = screen.getByRole('dialog')
    expect(within(panel).getByRole('article', { name: /Solicitud Push/ })).toBeInTheDocument()
    fireEvent.click(within(panel).getByRole('button', { name: 'Declinar' }))
    await vi.waitFor(() => expect(onFields).toHaveBeenCalled())
    expect(onFields.mock.calls[0][0].id).toBe('s')
    expect(onFields.mock.calls[0][1]).toEqual({ status: 'declinada' })
  })

  it('"sin captura" lista las pautas con fecha y al tocarlas cierra el panel y abre el detalle', () => {
    const { onPautaClick } = setup()
    fireEvent.click(screen.getByRole('button', { name: /sin captura/ }))
    const panel = screen.getByRole('dialog')
    const card = within(panel).getByRole('button', { name: /^Alpitech · Sin captura/ })
    expect(card).toHaveTextContent(/30 sep/)
    fireEvent.click(card)
    expect(onPautaClick).toHaveBeenCalledWith(expect.objectContaining({ id: 'c' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('sin permiso de aprobar, la cola no ofrece Agendar', () => {
    setup({ canApprove: false })
    fireEvent.click(screen.getByRole('button', { name: /1 solicitud por aprobar/ }))
    const panel = screen.getByRole('dialog')
    expect(within(panel).queryByRole('button', { name: 'Agendar' })).not.toBeInTheDocument()
    expect(within(panel).getByRole('button', { name: 'Ver detalle' })).toBeInTheDocument()
  })
})

describe('AvSemanaView — ocupación', () => {
  it('resume el estudio y la carga por recurso de la semana', () => {
    setup()
    // Fein Kaffee (13:00–15:00) toca los bloques 12–14 y 14–16 del miércoles.
    expect(screen.getByTitle('X 7: 2 de 5 bloques')).toBeInTheDocument()
    expect(screen.getByTitle('M 6: 0 de 5 bloques')).toBeInTheDocument()
    // Rafa está en Smashack y Fein Kaffee (la solicitud Push no cuenta).
    const carga = screen.getByLabelText('Carga de recursos')
    expect(within(carga).getByText('Rafa Cam').parentElement).toHaveTextContent('Rafa Cam2')
    expect(within(carga).queryByText('Sol Luz')).not.toBeInTheDocument()
  })
})
