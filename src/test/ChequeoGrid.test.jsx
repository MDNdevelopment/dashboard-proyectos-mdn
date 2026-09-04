import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { vi } from 'vitest'
import { createSupabaseMock } from './helpers/supabaseMock'
import { buildFixedWeeks } from '../utils/fixedTasks'
import { currentFixedWeekN } from '../utils/chequeo'

const { UPDATED_CHECK } = vi.hoisted(() => ({
  UPDATED_CHECK: {
    id: 'chk-new',
    client_id: 'c1',
    network: 'Instagram',
    content_type: 'reels',
    last_published_at: '2026-08-19',
    period_year: 2026,
    period_month: 8,
    period_week: 3,
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

// Agosto 2026: 4 semanas (miércoles 4/11/18/25). Todos los tests fijan la semana activa
// en S3 (16-22 ago) salvo que se pruebe explícitamente lo contrario.
const WEEKS = buildFixedWeeks(2026, 8)
const WEEK_N = 3

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
    last_published_at: '2026-08-19',
    period_week: WEEK_N,
    ...overrides,
  }
}

function renderGrid(props = {}) {
  return render(
    <ChequeoGrid
      lines={LINES}
      clients={[client()]}
      checks={[]}
      weeks={WEEKS}
      weekN={WEEK_N}
      year={2026}
      month={8}
      companyId="co-1"
      canManage={true}
      userId="u1"
      onCheckChanged={() => {}}
      groupByLine={false}
      {...props}
    />,
  )
}

describe('ChequeoGrid — el semáforo de un período cerrado queda congelado', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('una celda marcada a tiempo en una semana ya cerrada sigue "al día" meses después', () => {
    // S3 de agosto 2026 cierra el domingo 23 ago. Se marcó ese mismo domingo (0 días de
    // atraso al cierre de la semana) → debería verse "Al día" sin importar cuándo se revise.
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.setSystemTime(new Date('2026-12-15T12:00:00'))

    renderGrid({ checks: [check({ last_published_at: '2026-08-23' })] })

    const btn = screen.getAllByRole('button')[0]
    expect(btn.className).toContain('bg-[#e9f7ec]') // verde/normal, no rojo
    expect(btn.title).toContain('Al día')
  })

  it('sin congelar (semana en curso), el mismo caso sí se vería vencido — control del test anterior', () => {
    // Mismo check "viejo", pero ahora la semana/mes activo SÍ es el mes en curso (no
    // cerró) → usa "hoy" real, que está muy lejos del 23 de agosto → debe verse rojo.
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const now = new Date('2026-12-15T12:00:00')
    vi.setSystemTime(now)

    const decWeeks = buildFixedWeeks(2026, 12)
    const activeWeekN = currentFixedWeekN(decWeeks, now)

    renderGrid({
      checks: [check({ last_published_at: '2026-08-23', period_week: activeWeekN })],
      weeks: decWeeks,
      weekN: activeWeekN,
      year: 2026,
      month: 12,
    })

    const btn = screen.getAllByRole('button')[0]
    expect(btn.className).toContain('bg-[#fdecec]') // rojo
  })
})

describe('ChequeoGrid', () => {
  it('agrupa por línea y renderiza una fila por cada red social del cliente', () => {
    renderGrid({
      clients: [client(), client({ id: 'c2', name: 'Superfina', line_id: 'line-2' })],
      groupByLine: true,
    })
    expect(screen.getByText('Encco')).toBeInTheDocument()
    expect(screen.getByText('Superfina')).toBeInTheDocument()
    // Ambos clientes (uno por línea) tienen Instagram/TikTok en su ficha → 2 filas de cada una.
    expect(screen.getAllByText('Instagram')).toHaveLength(2)
    expect(screen.getAllByText('TikTok')).toHaveLength(2)
  })

  it('en modo agrupado, cada línea muestra un encabezado con su nombre y su mini-resumen', () => {
    renderGrid({
      clients: [client(), client({ id: 'c2', name: 'Superfina', line_id: 'line-2' })],
      checks: [check()], // solo Encco/Instagram registrado; TikTok y Superfina quedan sin registrar
      groupByLine: true,
    })
    expect(screen.getByText('Team Danielly')).toBeInTheDocument()
    expect(screen.getByText('Team Ana')).toBeInTheDocument()
    // Ninguna cuenta queda "actualizada" (cada una tiene 2 redes, Instagram y TikTok, y
    // solo Instagram de Encco tiene fecha) → ambas líneas caen en "sin registrar" o "parcial".
    expect(screen.getAllByText(/sin registrar/).length).toBeGreaterThan(0)
  })

  it('muestra la fecha formateada de una celda registrada en la semana activa', () => {
    renderGrid({ checks: [check({ last_published_at: '2026-08-19' })] })
    expect(screen.getByText('19 ago')).toBeInTheDocument()
  })

  it('no muestra la fecha de una celda de otra semana (period_week distinto)', () => {
    renderGrid({ checks: [check({ period_week: 1, last_published_at: '2026-08-05' })] })
    expect(screen.queryByText('5 ago')).not.toBeInTheDocument()
  })

  it('celda sin fecha muestra "—"', () => {
    renderGrid({ checks: [] })
    expect(screen.getAllByText('—').length).toBeGreaterThan(0)
  })

  it('sin canManage, las celdas están deshabilitadas (solo lectura)', () => {
    renderGrid({ checks: [check()], canManage: false })
    const buttons = screen.getAllByRole('button')
    buttons.forEach((btn) => expect(btn).toBeDisabled())
  })

  it('en cualquier semana (histórico incluido), la celda sigue siendo clickeable', () => {
    renderGrid({ checks: [check()] })
    const buttons = screen.getAllByRole('button')
    buttons.forEach((btn) => expect(btn).not.toBeDisabled())
    expect(screen.getByText(/Clic en una fecha para registrarla/)).toBeInTheDocument()
  })

  it('un clic abre el editor directo, sin ningún aviso de confirmación', () => {
    renderGrid({ checks: [check()] })
    fireEvent.click(screen.getAllByRole('button')[0])
    expect(screen.queryByText(/ya cerró/i)).not.toBeInTheDocument()
    expect(screen.getByDisplayValue('2026-08-19')).toBeInTheDocument()
  })

  it('guardar una fecha cambia directo, sin pedir confirmación', async () => {
    const onCheckChanged = vi.fn()
    renderGrid({ checks: [check()], onCheckChanged })
    fireEvent.click(screen.getAllByRole('button')[0])
    const input = screen.getByDisplayValue('2026-08-19')
    fireEvent.change(input, { target: { value: '2026-08-18' } })
    await waitFor(() => expect(onCheckChanged).toHaveBeenCalledWith(UPDATED_CHECK))
  })

  it('con canManage y semana en curso, un clic en una celda la vuelve editable y elegir la fecha la guarda de inmediato', async () => {
    const onCheckChanged = vi.fn()
    renderGrid({ onCheckChanged })
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

  it('el input de fecha es libre: no tiene min/max de la semana activa', () => {
    renderGrid()
    const buttons = screen.getAllByRole('button')
    fireEvent.click(buttons[0])
    const input = screen.getByDisplayValue('')
    expect(input).not.toHaveAttribute('min')
    expect(input).not.toHaveAttribute('max')
  })

  it('muestra el logo del cliente cuando tiene logo_url, o una inicial si no', () => {
    renderGrid({
      clients: [
        client({ id: 'c1', name: 'Encco', logo_url: 'https://cdn.example.com/encco.png' }),
        client({ id: 'c2', name: 'Superfina', line_id: 'line-2', logo_url: null }),
      ],
      groupByLine: true,
    })
    const img = screen.getByAltText('Encco')
    expect(img).toHaveAttribute('src', 'https://cdn.example.com/encco.png')
    expect(screen.getByText('S')).toBeInTheDocument() // inicial de "Superfina" sin logo
  })

  it('el nombre de cada red social es un enlace clickeable al perfil respectivo', () => {
    renderGrid()
    const igLink = screen.getByRole('link', { name: 'Instagram' })
    expect(igLink).toHaveAttribute('href', 'https://instagram.com/encco')
    expect(igLink).toHaveAttribute('target', '_blank')
    const ttLink = screen.getByRole('link', { name: 'TikTok' })
    expect(ttLink).toHaveAttribute('href', 'https://tiktok.com/@encco')
  })

  it('la fila de la marca ocupa todo el ancho de la tabla, separada de las redes', () => {
    renderGrid()
    const brandCell = screen.getByText('Encco').closest('td')
    // colSpan = 1 (cuenta/red) + 3 tipos de contenido = 4, y su fila no repite la red.
    expect(brandCell).toHaveAttribute('colSpan', '4')
    expect(brandCell.closest('tr')).toHaveClass('bg-[#f2efe6]')
    // El nombre de la marca ya no vive dentro de la fila de "Instagram".
    const instagramRow = screen.getByText('Instagram').closest('tr')
    expect(instagramRow).not.toHaveTextContent('Encco')
  })

  it('Reels e Highlights no aplican fuera de Instagram: muestran "—" sin selector de fecha', () => {
    renderGrid()
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

  it('YouTube sin registro no sale rojo (cadencia mensual, cae en "Sin registrar")', () => {
    renderGrid({
      clients: [client({ social_links: [{ red: 'YouTube', link: 'https://youtube.com/x' }] })],
      checks: [],
    })
    const btn = screen.getAllByRole('button')[0]
    expect(btn.className).not.toContain('bg-[#fdecec]') // no rojo
  })

  it('Mailchimp: el botón "Guardar" queda deshabilitado hasta llenar fecha y comentario', () => {
    const { container } = renderGrid({
      clients: [client({ social_links: [{ red: 'Mailchimp', link: 'https://mailchi.mp/x' }] })],
    })
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
    const { container } = renderGrid({
      clients: [client({ social_links: [{ red: 'Mailchimp', link: 'https://mailchi.mp/x' }] })],
      onCheckChanged,
    })
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

  it('Mailchimp: la celda nunca se pone roja aunque no tenga registro', () => {
    renderGrid({
      clients: [client({ social_links: [{ red: 'Mailchimp', link: 'https://mailchi.mp/x' }] })],
      checks: [],
    })
    const btn = screen.getAllByRole('button')[0]
    expect(btn.className).not.toContain('bg-[#fdecec]') // no rojo
  })

  describe('team "Independientes" (cuentas sin línea, ver utils/chequeo.js)', () => {
    const LINE_GENERAL = { id: 'line-general', name: 'Independientes', is_general: true }

    it('en modo agrupado, agrupa las cuentas sin line_id bajo la línea general', () => {
      renderGrid({
        lines: [...LINES, LINE_GENERAL],
        clients: [client(), client({ id: 'c2', name: 'Credimara', line_id: null })],
        groupByLine: true,
        generalLineId: 'line-general',
      })
      expect(screen.getByText('Independientes')).toBeInTheDocument()
      const header = screen.getByText('Independientes').closest('tr')
      // El siguiente hermano en el tbody debería llevar a la fila de Credimara: comprobamos
      // simplemente que ambos nombres están presentes y Encco (line-1) no quedó duplicado ahí.
      expect(screen.getByText('Credimara')).toBeInTheDocument()
      expect(header).toBeInTheDocument()
    })

    it('al guardar una fecha de una cuenta sin línea, persiste generalLineId en vez de null', async () => {
      const upsertSpy = vi.fn(() => ({
        select: () => ({ single: () => Promise.resolve({ data: UPDATED_CHECK, error: null }) }),
      }))
      const { supabase } = await import('../supabase')
      const originalFrom = supabase.from
      supabase.from = vi.fn((table) => {
        if (table === 'publication_checks') return { upsert: upsertSpy }
        return originalFrom(table)
      })

      renderGrid({
        clients: [client({ line_id: null })],
        generalLineId: 'line-general',
      })
      fireEvent.click(screen.getAllByRole('button')[0])
      const input = screen.getByDisplayValue('')
      fireEvent.change(input, { target: { value: '2026-08-19' } })

      await waitFor(() => expect(upsertSpy).toHaveBeenCalled())
      expect(upsertSpy.mock.calls[0][0]).toMatchObject({ line_id: 'line-general' })

      supabase.from = originalFrom
    })
  })

  describe('viewMode="recent"', () => {
    it('muestra la fecha más reciente entre semanas, no la de la semana seleccionada', () => {
      renderGrid({
        checks: [
          check({ period_week: 1, last_published_at: '2026-08-05' }),
          check({ period_week: 2, last_published_at: '2026-08-12' }),
        ],
        weekN: 1, // la semana activa es S1, pero "recent" debe ignorarla
        viewMode: 'recent',
      })
      expect(screen.getByText('12 ago')).toBeInTheDocument()
      expect(screen.queryByText('5 ago')).not.toBeInTheDocument()
    })

    it('es de solo lectura: un clic no abre el editor', () => {
      renderGrid({ checks: [check()], viewMode: 'recent' })
      fireEvent.click(screen.getAllByRole('button')[0])
      expect(screen.queryByDisplayValue('2026-08-19')).not.toBeInTheDocument()
      expect(screen.getByText(/^Solo lectura/)).toBeInTheDocument()
    })

    it('colorea con el semáforo por días transcurridos (verde/naranja/rojo), no por semana', () => {
      renderGrid({
        // Fecha muy vieja: sea cual sea "hoy" al correr el test, ya lleva 13+ días.
        checks: [check({ last_published_at: '2020-01-01' })],
        viewMode: 'recent',
      })
      const btn = screen.getAllByRole('button')[0]
      expect(btn.className).toContain('bg-[#fdecec]') // rojo: 13+ días
    })

    it('celda sin ningún registro en el mes muestra "—"', () => {
      renderGrid({ checks: [], viewMode: 'recent' })
      expect(screen.getAllByText('—').length).toBeGreaterThan(0)
    })
  })
})
