import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { vi } from 'vitest'
import { createSupabaseMock } from './helpers/supabaseMock'

const { UPDATED_CHECK } = vi.hoisted(() => ({
  UPDATED_CHECK: {
    id: 'chk-new',
    client_id: 'c1',
    network: 'Instagram',
    content_type: 'reels',
    last_published_at: '2026-08-19',
  },
}))

vi.mock('../supabase', () => ({
  supabase: createSupabaseMock({
    tables: { publication_checks: [UPDATED_CHECK] },
  }),
}))

import ChequeoGrid from '../components/chequeo/ChequeoGrid'

const LINES = [
  { id: 'line-1', name: 'Team Danielly' },
  { id: 'line-2', name: 'Team Ana' },
]

function client(overrides = {}) {
  return {
    id: 'c1',
    name: 'Encco',
    line_id: 'line-1',
    logo_url: null,
    social_links: [
      { red: 'Instagram', link: 'https://instagram.com/encco' },
      { red: 'TikTok', link: 'https://tiktok.com/@encco' },
    ],
    ...overrides,
  }
}

function check(overrides = {}) {
  return {
    id: 'chk-1',
    client_id: 'c1',
    network: 'Instagram',
    content_type: 'publicaciones',
    last_published_at: '2026-08-15',
    ...overrides,
  }
}

describe('ChequeoGrid', () => {
  it('agrupa por línea y renderiza una fila por cada red social del cliente', () => {
    render(
      <ChequeoGrid
        lines={LINES}
        clients={[client(), client({ id: 'c2', name: 'Superfina', line_id: 'line-2' })]}
        checks={[]}
        companyId="co-1"
        canManage={true}
        userId="u1"
        onCheckChanged={() => {}}
        groupByLine
      />,
    )
    expect(screen.getByText('Encco')).toBeInTheDocument()
    expect(screen.getByText('Superfina')).toBeInTheDocument()
    // Ambos clientes (uno por línea) tienen Instagram/TikTok en su ficha → 2 filas de cada una.
    expect(screen.getAllByText('Instagram')).toHaveLength(2)
    expect(screen.getAllByText('TikTok')).toHaveLength(2)
  })

  it('muestra la fecha formateada de una celda registrada', () => {
    render(
      <ChequeoGrid
        lines={LINES}
        clients={[client()]}
        checks={[check({ last_published_at: '2026-07-18' })]}
        companyId="co-1"
        canManage={true}
        userId="u1"
        onCheckChanged={() => {}}
        groupByLine={false}
      />,
    )
    expect(screen.getByText('18 jul')).toBeInTheDocument()
  })

  it('celda sin fecha muestra "—"', () => {
    render(
      <ChequeoGrid
        lines={LINES}
        clients={[client()]}
        checks={[]}
        companyId="co-1"
        canManage={true}
        userId="u1"
        onCheckChanged={() => {}}
        groupByLine={false}
      />,
    )
    expect(screen.getAllByText('—').length).toBeGreaterThan(0)
  })

  it('sin canManage, las celdas están deshabilitadas (solo lectura)', () => {
    render(
      <ChequeoGrid
        lines={LINES}
        clients={[client()]}
        checks={[check()]}
        companyId="co-1"
        canManage={false}
        userId="u1"
        onCheckChanged={() => {}}
        groupByLine={false}
      />,
    )
    expect(screen.getByText('Solo lectura')).toBeInTheDocument()
    const buttons = screen.getAllByRole('button')
    buttons.forEach((btn) => expect(btn).toBeDisabled())
  })

  it('con canManage, un clic en una celda la vuelve editable y elegir la fecha la guarda de inmediato', async () => {
    const onCheckChanged = vi.fn()
    render(
      <ChequeoGrid
        lines={LINES}
        clients={[client()]}
        checks={[]}
        companyId="co-1"
        canManage={true}
        userId="u1"
        onCheckChanged={onCheckChanged}
        groupByLine={false}
      />,
    )
    const buttons = screen.getAllByRole('button')
    fireEvent.click(buttons[0])
    const input = screen.getByDisplayValue('')
    // Guarda con onChange (al elegir del calendario), sin esperar a perder el foco.
    fireEvent.change(input, { target: { value: '2026-08-19' } })

    // El componente no guarda `checks` como estado propio (lo recibe por props, igual
    // que FixedTasksGrid): tras guardar, delega la fila actualizada al padre vía
    // onCheckChanged — es la página quien la refleja de vuelta como prop.
    await waitFor(() => expect(onCheckChanged).toHaveBeenCalledWith(UPDATED_CHECK))
  })

  it('muestra el logo del cliente cuando tiene logo_url, o una inicial si no', () => {
    render(
      <ChequeoGrid
        lines={LINES}
        clients={[
          client({ id: 'c1', name: 'Encco', logo_url: 'https://cdn.example.com/encco.png' }),
          client({ id: 'c2', name: 'Superfina', line_id: 'line-2', logo_url: null }),
        ]}
        checks={[]}
        companyId="co-1"
        canManage={true}
        userId="u1"
        onCheckChanged={() => {}}
        groupByLine
      />,
    )
    const img = screen.getByAltText('Encco')
    expect(img).toHaveAttribute('src', 'https://cdn.example.com/encco.png')
    expect(screen.getByText('S')).toBeInTheDocument() // inicial de "Superfina" sin logo
  })

  it('el nombre de cada red social es un enlace clickeable al perfil respectivo', () => {
    render(
      <ChequeoGrid
        lines={LINES}
        clients={[client()]}
        checks={[]}
        companyId="co-1"
        canManage={true}
        userId="u1"
        onCheckChanged={() => {}}
        groupByLine={false}
      />,
    )
    const igLink = screen.getByRole('link', { name: 'Instagram' })
    expect(igLink).toHaveAttribute('href', 'https://instagram.com/encco')
    expect(igLink).toHaveAttribute('target', '_blank')
    const ttLink = screen.getByRole('link', { name: 'TikTok' })
    expect(ttLink).toHaveAttribute('href', 'https://tiktok.com/@encco')
  })

  it('la fila de la marca ocupa todo el ancho de la tabla, separada de las redes', () => {
    render(
      <ChequeoGrid
        lines={LINES}
        clients={[client()]}
        checks={[]}
        companyId="co-1"
        canManage={true}
        userId="u1"
        onCheckChanged={() => {}}
        groupByLine={false}
      />,
    )
    const brandCell = screen.getByText('Encco').closest('td')
    // colSpan = 1 (cuenta/red) + 3 tipos de contenido = 4, y su fila no repite la red.
    expect(brandCell).toHaveAttribute('colSpan', '4')
    expect(brandCell.closest('tr')).toHaveClass('bg-[#f2efe6]')
    // El nombre de la marca ya no vive dentro de la fila de "Instagram".
    const instagramRow = screen.getByText('Instagram').closest('tr')
    expect(instagramRow).not.toHaveTextContent('Encco')
  })

  it('Reels e Highlights no aplican fuera de Instagram: muestran "—" sin selector de fecha', () => {
    render(
      <ChequeoGrid
        lines={LINES}
        clients={[client()]}
        checks={[]}
        companyId="co-1"
        canManage={true}
        userId="u1"
        onCheckChanged={() => {}}
        groupByLine={false}
      />,
    )
    const tiktokRow = screen.getByText('TikTok').closest('tr')
    const cells = tiktokRow.querySelectorAll('td')
    // cells[1] = Publicaciones (editable), cells[2] = Reels, cells[3] = Highlights (no aplica).
    expect(cells[2]).toHaveTextContent('—')
    expect(cells[2].querySelector('button')).not.toBeInTheDocument()
    expect(cells[3]).toHaveTextContent('—')
    expect(cells[3].querySelector('button')).not.toBeInTheDocument()
    // Publicaciones sigue siendo un botón editable para cualquier red.
    expect(cells[1].querySelector('button')).toBeInTheDocument()
  })

  it('Mailchimp: el botón "Guardar" queda deshabilitado hasta llenar fecha y comentario', () => {
    const { container } = render(
      <ChequeoGrid
        lines={LINES}
        clients={[client({ social_links: [{ red: 'Mailchimp', link: 'https://mailchi.mp/x' }] })]}
        checks={[]}
        companyId="co-1"
        canManage={true}
        userId="u1"
        onCheckChanged={() => {}}
        groupByLine={false}
      />,
    )
    fireEvent.click(screen.getAllByRole('button')[0])
    const saveBtn = screen.getByRole('button', { name: 'Guardar' })
    expect(saveBtn).toBeDisabled()

    fireEvent.change(container.querySelector('input[type="date"]'), {
      target: { value: '2026-08-19' },
    })
    expect(saveBtn).toBeDisabled() // falta el comentario

    fireEvent.change(screen.getByPlaceholderText('Comentario…'), {
      target: { value: 'Enviado a toda la base' },
    })
    expect(saveBtn).toBeEnabled()
  })

  it('Mailchimp: al guardar fecha + comentario, delega la fila al padre', async () => {
    const onCheckChanged = vi.fn()
    const { container } = render(
      <ChequeoGrid
        lines={LINES}
        clients={[client({ social_links: [{ red: 'Mailchimp', link: 'https://mailchi.mp/x' }] })]}
        checks={[]}
        companyId="co-1"
        canManage={true}
        userId="u1"
        onCheckChanged={onCheckChanged}
        groupByLine={false}
      />,
    )
    fireEvent.click(screen.getAllByRole('button')[0])
    fireEvent.change(container.querySelector('input[type="date"]'), {
      target: { value: '2026-08-19' },
    })
    fireEvent.change(screen.getByPlaceholderText('Comentario…'), {
      target: { value: 'Enviado a toda la base' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }))

    await waitFor(() => expect(onCheckChanged).toHaveBeenCalled())
  })

  it('Mailchimp: la celda nunca se pone naranja/roja aunque la fecha sea muy vieja', () => {
    render(
      <ChequeoGrid
        lines={LINES}
        clients={[client({ social_links: [{ red: 'Mailchimp', link: 'https://mailchi.mp/x' }] })]}
        checks={[
          check({
            network: 'Mailchimp',
            last_published_at: '2020-01-01',
            comment: 'Campaña vieja',
          }),
        ]}
        companyId="co-1"
        canManage={true}
        userId="u1"
        onCheckChanged={() => {}}
        groupByLine={false}
      />,
    )
    const btn = screen.getByText('1 ene').closest('button')
    expect(btn.className).toContain('bg-[#e9f7ec]') // clase de estado "normal"
    expect(btn.className).not.toContain('bg-[#fdecec]') // no rojo
    expect(btn).toHaveAttribute('title', expect.stringContaining('Campaña vieja'))
  })
})
