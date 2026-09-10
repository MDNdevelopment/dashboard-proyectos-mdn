import { render, screen, waitFor } from '@testing-library/react'
import { vi } from 'vitest'
import { makeQuery } from './helpers/supabaseMock'

vi.mock('../supabase', () => ({
  supabase: { from: vi.fn() },
}))

import { supabase } from '../supabase'
import MappiLogsView from '../components/empresa/MappiLogsView'

function mockLogs(rows) {
  supabase.from.mockImplementation((table) => {
    if (table === 'mappi_chat_logs') return makeQuery(rows)
    return makeQuery([])
  })
}

describe('MappiLogsView', () => {
  it('agrupa por pregunta (sin distinguir mayúsculas) y ordena por frecuencia', async () => {
    mockLogs([
      {
        question: '¿Cuántos tickets hay?',
        outcome: 'sin_cobertura',
        tools_used: [],
        created_at: '2026-09-01T10:00:00Z',
      },
      {
        question: '¿cuántos tickets hay?',
        outcome: 'sin_cobertura',
        tools_used: [],
        created_at: '2026-09-02T10:00:00Z',
      },
      {
        question: '¿Quién está de vacaciones?',
        outcome: 'error',
        tools_used: ['consultar_personal'],
        created_at: '2026-09-01T10:00:00Z',
      },
    ])

    render(<MappiLogsView companyId="c1" />)

    await waitFor(() => expect(screen.getByText('¿Cuántos tickets hay?')).toBeInTheDocument())
    expect(screen.getByText('2')).toBeInTheDocument()
    expect(screen.getByText('¿Quién está de vacaciones?')).toBeInTheDocument()
  })

  it('filtra solo filas con outcome distinto de "respondida" (vía .neq en la query)', async () => {
    let neqArgs = null
    supabase.from.mockImplementation((table) => {
      const q = makeQuery([])
      if (table === 'mappi_chat_logs') {
        q.neq = vi.fn((...args) => {
          neqArgs = args
          return q
        })
      }
      return q
    })

    render(<MappiLogsView companyId="c1" />)

    await waitFor(() => expect(neqArgs).toEqual(['outcome', 'respondida']))
  })

  it('muestra el estado vacío cuando no hay huecos registrados', async () => {
    mockLogs([])
    render(<MappiLogsView companyId="c1" />)
    await waitFor(() => expect(screen.getByText('Sin huecos registrados')).toBeInTheDocument())
  })

  it('muestra el error si falla la consulta', async () => {
    supabase.from.mockImplementation(() => makeQuery([], { error: { message: 'boom' } }))
    render(<MappiLogsView companyId="c1" />)
    await waitFor(() => expect(screen.getByText('boom')).toBeInTheDocument())
  })
})
