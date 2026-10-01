import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { vi } from 'vitest'
import { createSupabaseMock, makeQuery } from './helpers/supabaseMock'

const TODAY = new Date()
const dateStr = (d) => {
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}
const DAY_10 = dateStr(new Date(TODAY.getFullYear(), TODAY.getMonth(), 10))

const MOCK_PAUTAS = [
  {
    id: 'p1',
    company_id: 'co-1',
    client_id: 'c1',
    client_name: 'Cliente Georgina',
    line_id: 'line-1',
    tema: '',
    place: '',
    pauta_date: null,
    salida: null,
    llegada: null,
    formats: [],
    graba_user_id: null,
    graba_other: null,
    edita_user_id: null,
    edita_other: null,
    attendee_ids: [],
    link: 'https://drive.google.com/x',
    grilla_delivered_at: null,
    piezas_desc: '',
    status: 'solicitada',
    submitted: true,
    piezas_totales: 0,
    piezas_editadas: 0,
  },
  {
    id: 'p2',
    company_id: 'co-1',
    client_id: 'c2',
    client_name: 'Cliente Sabrina',
    line_id: 'line-2',
    tema: '',
    place: '',
    pauta_date: null,
    salida: null,
    llegada: null,
    formats: [],
    graba_user_id: null,
    graba_other: null,
    edita_user_id: null,
    edita_other: null,
    attendee_ids: [],
    link: 'https://drive.google.com/y',
    grilla_delivered_at: null,
    piezas_desc: '',
    status: 'solicitada',
    submitted: true,
    piezas_totales: 0,
    piezas_editadas: 0,
  },
  {
    id: 'p3',
    company_id: 'co-1',
    client_id: 'c1',
    client_name: 'Cliente Agendada',
    line_id: 'line-1',
    tema: '',
    place: '',
    pauta_date: DAY_10,
    salida: null,
    llegada: null,
    formats: [],
    graba_user_id: null,
    graba_other: null,
    edita_user_id: null,
    edita_other: null,
    attendee_ids: [],
    link: '',
    grilla_delivered_at: null,
    piezas_desc: '',
    status: 'programada',
    submitted: true,
    piezas_totales: 0,
    piezas_editadas: 0,
  },
  {
    id: 'p4',
    company_id: 'co-1',
    client_id: 'c1',
    client_name: 'Cliente Realizada',
    line_id: 'line-1',
    tema: '',
    place: '',
    pauta_date: DAY_10,
    salida: null,
    llegada: null,
    formats: ['V'],
    recurso_ids: ['editor-1'],
    graba_user_id: null,
    graba_other: null,
    edita_user_id: null,
    edita_other: null,
    attendee_ids: [],
    link: '',
    grilla_delivered_at: null,
    piezas_desc: '',
    status: 'realizada',
    submitted: true,
    piezas_totales: 0,
    piezas_editadas: 0,
  },
]

const MOCK_USERS = [
  {
    user_id: 'coord-1',
    first_name: 'Lizdania',
    last_name: 'Pérez',
    avatar_url: null,
    deleted_at: null,
    department_id: 2,
    access_level: 2,
  },
  {
    user_id: 'jefa-1',
    first_name: 'Georgina',
    last_name: '',
    avatar_url: null,
    deleted_at: null,
    department_id: 1,
  },
]

const MOCK_CLIENTS = [
  { id: 'c1', name: 'Cliente Georgina', line_id: 'line-1' },
  { id: 'c2', name: 'Cliente Sabrina', line_id: 'line-2' },
]

// `lead_user_id` lo deriva `loadLines` de `metric_line_members.is_lead` — habilita a la jefa
// a gestionar recursos/piezas de las pautas de SU línea (ver canEditPiezasForPauta).
const LINES = [
  { id: 'line-1', name: 'Georgina', lead_user_id: 'jefa-1' },
  { id: 'line-2', name: 'Sabrina', lead_user_id: 'jefa-2' },
]

vi.mock('../supabase', () => ({
  supabase: createSupabaseMock({
    tables: {
      av_pautas: () => makeQuery(MOCK_PAUTAS),
      users: () => makeQuery(MOCK_USERS),
    },
  }),
}))

import AudiovisualView from '../components/pautas/AudiovisualView'

function renderView({ userProfile, can, lines = LINES, initialEntries = ['/tareas/pautas'] }) {
  return render(
    <AudiovisualView
      companyId="co-1"
      userProfile={userProfile}
      can={can}
      lines={lines}
      clients={MOCK_CLIENTS}
    />,
    {
      wrapper: ({ children }) => (
        <MemoryRouter initialEntries={initialEntries}>{children}</MemoryRouter>
      ),
    },
  )
}

const tab = (name) => screen.getByRole('tab', { name: new RegExp(`^${name}`) })
const goLista = () => fireEvent.click(tab('Lista'))

const COORD = {
  user_id: 'coord-1',
  company_id: 'co-1',
  access_level: 2,
  admin: false,
  department_id: 2,
}
const JEFA = {
  user_id: 'jefa-1',
  company_id: 'co-1',
  access_level: 3,
  admin: false,
  department_id: 1,
}

describe('AudiovisualView — alcance por línea y permisos', () => {
  it('jefa de línea (audiovisual.manage): ve solo su línea fija, sin selector, y puede solicitar', async () => {
    renderView({ userProfile: JEFA, can: (key) => key === 'audiovisual.manage', lines: [LINES[0]] })
    await waitFor(() => expect(screen.getByText('Georgina')).toBeInTheDocument())
    expect(screen.queryByText('Todos')).not.toBeInTheDocument()
    expect(screen.getByText('+ Solicitar pauta')).toBeInTheDocument()
    goLista()
    expect(screen.getByText('Cliente Georgina')).toBeInTheDocument()
    expect(screen.queryByText('Cliente Sabrina')).not.toBeInTheDocument()
  })

  it('coordinadora SIN ver_todo: sin selector de líneas, pero agrega pautas y aprueba', async () => {
    renderView({ userProfile: COORD, can: (key) => key === 'audiovisual.coordina', lines: [] })
    await waitFor(() => expect(screen.getByText('+ Agregar pauta')).toBeInTheDocument())
    expect(screen.queryByText('Todos')).not.toBeInTheDocument()
    goLista()
    expect(screen.getByText('Cliente Georgina')).toBeInTheDocument()
    expect(screen.getByText('Cliente Sabrina')).toBeInTheDocument()
    fireEvent.click(screen.getByText('Cliente Georgina'))
    expect(screen.getByRole('button', { name: 'Aprobar y agendar' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Declinar' })).toBeInTheDocument()
  })

  it('coordinador CON línea propia y SIN ver_todo solo ve pautas de su línea', async () => {
    renderView({
      userProfile: COORD,
      can: (key) => key === 'audiovisual.coordina',
      lines: [LINES[0]],
    })
    await waitFor(() => expect(screen.getByText('Georgina')).toBeInTheDocument())
    goLista()
    expect(screen.getByText('Cliente Georgina')).toBeInTheDocument()
    expect(screen.queryByText('Cliente Sabrina')).not.toBeInTheDocument()
  })

  it('con audiovisual.ver_todo ve "Todos" + cada línea y todas las pautas', async () => {
    renderView({
      userProfile: { ...COORD, access_level: 1 },
      can: (key) => key === 'audiovisual.ver_todo',
      lines: [],
    })
    await waitFor(() => expect(screen.getByText('Todos')).toBeInTheDocument())
    goLista()
    expect(screen.getByText('Cliente Georgina')).toBeInTheDocument()
    expect(screen.getByText('Cliente Sabrina')).toBeInTheDocument()
  })

  it('dirección: filtrar por el pill de una línea oculta las pautas de las otras', async () => {
    renderView({
      userProfile: { user_id: 'dir-1', company_id: 'co-1', access_level: 4, admin: false },
      can: () => true,
    })
    await waitFor(() => expect(screen.getByText('Todos')).toBeInTheDocument())
    goLista()
    expect(screen.getByText('Cliente Sabrina')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Georgina' }))
    await waitFor(() => expect(screen.queryByText('Cliente Sabrina')).not.toBeInTheDocument())
    expect(screen.getByText('Cliente Georgina')).toBeInTheDocument()
  })

  it('sin capabilities de audiovisual: solo lectura, sin crear ni acciones en el detalle', async () => {
    renderView({ userProfile: { ...JEFA, user_id: 'lector' }, can: () => false, lines: [LINES[0]] })
    await waitFor(() => expect(screen.getByText('Georgina')).toBeInTheDocument())
    expect(screen.queryByText('+ Solicitar pauta')).not.toBeInTheDocument()
    expect(screen.queryByText('+ Agregar pauta')).not.toBeInTheDocument()
    goLista()
    fireEvent.click(screen.getByText('Cliente Georgina'))
    expect(screen.queryByLabelText('Acciones')).not.toBeInTheDocument()
  })

  it('la pestaña Lista muestra cuántas solicitudes esperan aprobación', async () => {
    renderView({ userProfile: COORD, can: () => true, lines: [] })
    await waitFor(() => expect(screen.getByText('Todos')).toBeInTheDocument())
    expect(screen.getByLabelText('2 solicitudes por aprobar')).toBeInTheDocument()
  })
})

describe('AudiovisualView — permisos sobre captura/edición en el detalle', () => {
  const open = async (opts) => {
    renderView({ ...opts, initialEntries: ['/tareas/pautas?pautaId=p4'] })
    await waitFor(() => expect(screen.getByText('quién edita cuántas piezas')).toBeInTheDocument())
  }
  const AV = {
    user_id: 'editor-1',
    company_id: 'co-1',
    access_level: 1,
    admin: false,
    department_id: 2,
  }

  it('recurso asignado (sin coordina) edita piezas, pero no agenda/declina', async () => {
    await open({ userProfile: AV, can: (key) => key === 'audiovisual.piezas', lines: [] })
    expect(screen.getByText('+ agregar editor')).toBeInTheDocument()
    expect(screen.queryByText('Aprobar y agendar')).not.toBeInTheDocument()
    expect(screen.queryByText('Declinar')).not.toBeInTheDocument()
  })

  it('depto Audiovisual sin ser el recurso NO edita piezas', async () => {
    await open({
      userProfile: { ...AV, user_id: 'otro-editor' },
      can: (key) => key === 'audiovisual.piezas',
      lines: [],
    })
    expect(screen.queryByText('+ agregar editor')).not.toBeInTheDocument()
  })

  it('con audiovisual.pautas.gestion edita piezas de cualquier pauta', async () => {
    await open({
      userProfile: { ...AV, user_id: 'gestor-1' },
      can: (key) => key === 'audiovisual.pautas.gestion',
      lines: [],
    })
    expect(screen.getByText('+ agregar editor')).toBeInTheDocument()
    expect(screen.queryByText('Aprobar y agendar')).not.toBeInTheDocument()
  })

  it('la jefa de la línea edita las piezas de SU línea', async () => {
    await open({ userProfile: JEFA, can: (key) => key === 'audiovisual.manage', lines: [LINES[0]] })
    expect(screen.getByText('+ agregar editor')).toBeInTheDocument()
  })

  it('la jefa de OTRA línea no puede editar las piezas', async () => {
    await open({
      userProfile: { ...JEFA, user_id: 'jefa-2' },
      can: (key) => key === 'audiovisual.manage',
      lines: [LINES[1]],
    })
    expect(screen.queryByText('+ agregar editor')).not.toBeInTheDocument()
  })
})

describe('AudiovisualView — vista Calendario', () => {
  const calendarPill = (name) => screen.getByTitle(new RegExp(name))
  const queryCalendarPill = (name) => screen.queryByTitle(new RegExp(name))
  const chip = (label) => screen.getByRole('button', { name: `Filtrar por ${label}` })

  async function renderCoordinadora() {
    renderView({ userProfile: COORD, can: (key) => key === 'audiovisual.coordina', lines: [] })
    await waitFor(() => expect(calendarPill('Cliente Agendada')).toBeInTheDocument())
  }

  it('por defecto muestra agendadas y realizadas; los chips filtran', async () => {
    await renderCoordinadora()
    expect(chip('Todas')).toHaveClass('border-[#FFB800]')
    expect(calendarPill('Cliente Realizada')).toBeInTheDocument()
    fireEvent.click(chip('Agendadas'))
    await waitFor(() => expect(queryCalendarPill('Cliente Realizada')).not.toBeInTheDocument())
    expect(calendarPill('Cliente Agendada')).toBeInTheDocument()
    fireEvent.click(chip('Realizadas'))
    await waitFor(() => expect(queryCalendarPill('Cliente Agendada')).not.toBeInTheDocument())
    fireEvent.click(chip('Todas'))
    await waitFor(() => expect(calendarPill('Cliente Agendada')).toBeInTheDocument())
  })

  it('el chip "Solicitadas" muestra solo solicitudes con fecha (ninguna en los mocks)', async () => {
    await renderCoordinadora()
    fireEvent.click(chip('Solicitadas'))
    await waitFor(() => expect(queryCalendarPill('Cliente Agendada')).not.toBeInTheDocument())
    expect(queryCalendarPill('Cliente Georgina')).not.toBeInTheDocument()
  })
})

describe('AudiovisualView — la Lista sigue al mes del calendario', () => {
  it('al navegar a otro mes, la agendada desaparece de la lista; las solicitudes sin fecha siguen', async () => {
    renderView({ userProfile: COORD, can: (key) => key === 'audiovisual.coordina', lines: [] })
    await waitFor(() => expect(screen.getByTitle(/Cliente Agendada/)).toBeInTheDocument())
    fireEvent.click(screen.getByLabelText('Mes siguiente'))
    goLista()
    fireEvent.click(screen.getByRole('button', { name: /Agendadas/ }))
    expect(screen.queryByText('Cliente Agendada')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Solicitadas/ }))
    expect(screen.getByText('Cliente Georgina')).toBeInTheDocument()
    expect(screen.getByText('Cliente Sabrina')).toBeInTheDocument()
  })
})

describe('AudiovisualView — vista Rendimiento', () => {
  it('muestra pendientes por editar y los dos rankings', async () => {
    renderView({ userProfile: COORD, can: () => true, lines: [] })
    await waitFor(() => expect(screen.getByText('Todos')).toBeInTheDocument())
    fireEvent.click(tab('Rendimiento'))
    expect(screen.getByText('Pendiente por editar')).toBeInTheDocument()
    expect(screen.getByText('Videos 4K + Reels')).toBeInTheDocument()
    expect(screen.getByText('Fotos')).toBeInTheDocument()
  })
})

// ── Deep-link ?pautaId= (abierto desde la campanita de notificaciones) ──────────

function LocationProbe() {
  const location = useLocation()
  return <div data-testid="loc-search">{location.search}</div>
}

function renderWithPautaId(pautaId, { userProfile, can, lines = LINES } = {}) {
  return render(
    <MemoryRouter initialEntries={[`/tareas/pautas?pautaId=${pautaId}`]}>
      <LocationProbe />
      <AudiovisualView
        companyId="co-1"
        userProfile={userProfile}
        can={can}
        lines={lines}
        clients={MOCK_CLIENTS}
      />
    </MemoryRouter>,
  )
}

describe('AudiovisualView — deep-link ?pautaId=', () => {
  const ADMIN_PROFILE = { user_id: 'coord-1', company_id: 'co-1', access_level: 4, admin: true }
  const CAN_ALL = () => true

  it('abre el detalle de la pauta indicada y limpia el param de la URL', async () => {
    renderWithPautaId('p1', { userProfile: ADMIN_PROFILE, can: CAN_ALL })
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Cliente Georgina' })).toBeInTheDocument(),
    )
    await waitFor(() => expect(screen.getByTestId('loc-search').textContent).toBe(''))
  })

  it('mueve el mes al de una pauta agendada', async () => {
    renderWithPautaId('p3', { userProfile: ADMIN_PROFILE, can: CAN_ALL })
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Cliente Agendada' })).toBeInTheDocument(),
    )
  })

  it('un pautaId inexistente no rompe la vista y limpia igual el param', async () => {
    renderWithPautaId('no-existe', { userProfile: ADMIN_PROFILE, can: CAN_ALL })
    await waitFor(() => expect(screen.getByTestId('loc-search').textContent).toBe(''))
    expect(screen.queryByLabelText('Cerrar')).not.toBeInTheDocument()
  })
})
