import { render, screen, waitFor, act } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { vi } from 'vitest'
import { createSupabaseMock } from './helpers/supabaseMock'

// Capture the onSave prop AppLayout passes to ProjectModal
let capturedModalOnSave = null
vi.mock('../components/ProjectModal', () => ({
  default: vi.fn(({ onSave, project }) => {
    if (project === null) capturedModalOnSave = onSave
    return null
  }),
}))

// Must mock before importing AppLayout
// Este archivo reasigna `supabase.from.mockImplementation(...)` en cada test
// (vía buildFromChain) para simular el chain real de projects, así que basta
// con que el factory provea `from`/`channel`/`removeChannel` como vi.fn().
vi.mock('../supabase', () => ({
  supabase: createSupabaseMock(),
}))

vi.mock('../context/AuthContext', () => ({
  useAuth: vi.fn(() => ({ userProfile: {}, session: {}, loading: false })),
}))

import { supabase } from '../supabase'
import AppLayout from '../components/AppLayout'

const sampleProject = {
  id: 'uuid-1',
  name: 'Campaña verano',
  team: 'Diseño',
  requirements: 'Brief adjunto',
  status: 'Pendiente',
  departments: ['Diseño'],
  phases: [],
  created_at: '2026-05-25T00:00:00Z',
}

function buildFromChain({ selectData = [], selectError = null } = {}) {
  const eqMock = vi.fn().mockResolvedValue({ error: null })
  const updateMock = vi.fn().mockReturnValue({ eq: eqMock })
  const deleteMock = vi.fn().mockReturnValue({ eq: eqMock })
  const singleMock = vi.fn().mockResolvedValue({ data: selectData[0] ?? null, error: null })
  const selectMock = vi.fn().mockReturnValue({ single: singleMock })
  const insertMock = vi.fn().mockReturnValue({ select: selectMock })
  const orderMock = vi.fn().mockResolvedValue({ data: selectData, error: selectError })
  const fromSelectMock = vi.fn().mockReturnValue({ order: orderMock })

  supabase.from.mockImplementation((table) => {
    if (table !== 'projects') return {}
    return {
      select: fromSelectMock,
      insert: insertMock,
      update: updateMock,
      delete: deleteMock,
    }
  })

  return { eqMock, updateMock, deleteMock, insertMock, singleMock }
}

function renderLayout() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route element={<AppLayout />}>
          <Route index element={<div data-testid="outlet" />} />
        </Route>
      </Routes>
    </MemoryRouter>,
  )
}

describe('AppLayout — carga inicial', () => {
  it('obtiene proyectos de Supabase y marca connected=true', async () => {
    buildFromChain({ selectData: [sampleProject] })
    renderLayout()
    await waitFor(() => {
      expect(supabase.from).toHaveBeenCalledWith('projects')
    })
  })

  it('suscribe un canal de realtime al montar', async () => {
    buildFromChain()
    renderLayout()
    await waitFor(() => {
      expect(supabase.channel).toHaveBeenCalledWith('projects-changes')
    })
  })

  it('elimina el canal al desmontar', async () => {
    buildFromChain()
    const { unmount } = renderLayout()
    await waitFor(() => expect(supabase.channel).toHaveBeenCalled())
    unmount()
    expect(supabase.removeChannel).toHaveBeenCalled()
  })
})

describe('AppLayout — CRUD', () => {
  it('createProject llama a insert con los datos correctos', async () => {
    const { insertMock } = buildFromChain({ selectData: [sampleProject] })
    capturedModalOnSave = null

    // Open modal in create mode (project=null) via onNewProject, then call onSave
    let capturedCtx
    render(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route element={<AppLayout />}>
            <Route
              index
              element={
                <CaptureContext
                  onCapture={(c) => {
                    capturedCtx = c
                  }}
                />
              }
            />
          </Route>
        </Routes>
      </MemoryRouter>,
    )

    await waitFor(() => expect(capturedCtx).toBeDefined())
    // Trigger modal open in create mode
    act(() => capturedCtx.onNewProject())
    await waitFor(() => expect(capturedModalOnSave).not.toBeNull())
    await act(() => capturedModalOnSave({ name: 'Nuevo', departments: [], phases: [] }))
    expect(insertMock).toHaveBeenCalledWith(expect.objectContaining({ name: 'Nuevo' }))
  })

  it('updateProject llama a update().eq(id)', async () => {
    const { updateMock, eqMock } = buildFromChain({ selectData: [sampleProject] })

    let capturedCtx
    render(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route element={<AppLayout />}>
            <Route
              index
              element={
                <CaptureContext
                  onCapture={(c) => {
                    capturedCtx = c
                  }}
                />
              }
            />
          </Route>
        </Routes>
      </MemoryRouter>,
    )

    await waitFor(() => expect(capturedCtx).toBeDefined())
    await act(() => capturedCtx.onUpdateProject('uuid-1', { status: 'Completado' }))
    expect(updateMock).toHaveBeenCalledWith({ status: 'Completado' })
    expect(eqMock).toHaveBeenCalledWith('id', 'uuid-1')
  })

  it('deleteProject llama a delete().eq(id) tras confirmar', async () => {
    const { deleteMock, eqMock } = buildFromChain({ selectData: [sampleProject] })
    vi.spyOn(window, 'confirm').mockReturnValue(true)

    let capturedCtx
    render(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route element={<AppLayout />}>
            <Route
              index
              element={
                <CaptureContext
                  onCapture={(c) => {
                    capturedCtx = c
                  }}
                />
              }
            />
          </Route>
        </Routes>
      </MemoryRouter>,
    )

    await waitFor(() => expect(capturedCtx).toBeDefined())
    await act(() => capturedCtx.onDeleteProject('uuid-1'))
    expect(deleteMock).toHaveBeenCalled()
    expect(eqMock).toHaveBeenCalledWith('id', 'uuid-1')

    vi.restoreAllMocks()
  })

  it('deleteProject NO llama a delete si el usuario cancela', async () => {
    const { deleteMock } = buildFromChain({ selectData: [sampleProject] })
    vi.spyOn(window, 'confirm').mockReturnValue(false)

    let capturedCtx
    render(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route element={<AppLayout />}>
            <Route
              index
              element={
                <CaptureContext
                  onCapture={(c) => {
                    capturedCtx = c
                  }}
                />
              }
            />
          </Route>
        </Routes>
      </MemoryRouter>,
    )

    await waitFor(() => expect(capturedCtx).toBeDefined())
    await act(() => capturedCtx.onDeleteProject('uuid-1'))
    expect(deleteMock).not.toHaveBeenCalled()

    vi.restoreAllMocks()
  })

  it('duplicateProject llama a insert con status Pendiente y sin id ni created_at', async () => {
    const insertedRow = {
      ...sampleProject,
      id: 'uuid-dup',
      status: 'Pendiente',
      created_at: '2026-05-26T00:00:00Z',
    }
    const { insertMock, singleMock } = buildFromChain({ selectData: [insertedRow] })

    const sourceProject = {
      ...sampleProject,
      status: 'Completado',
      phases: [
        {
          id: 'phase-1',
          name: 'Fase A',
          tasks: [{ id: 'task-1', name: 'Tarea 1', status: 'completada' }],
        },
      ],
    }

    let capturedCtx
    render(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route element={<AppLayout />}>
            <Route
              index
              element={
                <CaptureContext
                  onCapture={(c) => {
                    capturedCtx = c
                  }}
                />
              }
            />
          </Route>
        </Routes>
      </MemoryRouter>,
    )

    await waitFor(() => expect(capturedCtx).toBeDefined())
    await act(() => capturedCtx.onDuplicateProject(sourceProject))

    expect(insertMock).toHaveBeenCalledTimes(1)
    const inserted = insertMock.mock.calls[0][0]
    expect(inserted.status).toBe('Pendiente')
    expect(inserted.id).toBeUndefined()
    expect(inserted.created_at).toBeUndefined()
    expect(inserted.name).toBe(`Copia de ${sourceProject.name}`)
    expect(inserted.phases[0].id).not.toBe('phase-1')
    expect(inserted.phases[0].tasks[0].id).not.toBe('task-1')
    // Verifies the .select().single() chain is used to get the DB row back
    expect(singleMock).toHaveBeenCalledTimes(1)
  })
})

describe('AppLayout — realtime payload handling', () => {
  let realtimeCallback

  beforeEach(() => {
    buildFromChain({ selectData: [sampleProject] })
    supabase.channel.mockImplementation(() => ({
      on: vi.fn().mockImplementation((event, filter, cb) => {
        realtimeCallback = cb
        return { on: vi.fn().mockReturnThis(), subscribe: vi.fn().mockReturnThis() }
      }),
      subscribe: vi.fn().mockReturnThis(),
    }))
  })

  it('INSERT agrega el proyecto al estado', async () => {
    const newProject = {
      ...sampleProject,
      id: 'uuid-2',
      name: 'Nuevo proyecto',
      created_at: '2026-05-25T01:00:00Z',
    }
    renderLayout()
    await waitFor(() => expect(realtimeCallback).toBeDefined())
    act(() => realtimeCallback({ eventType: 'INSERT', new: newProject, old: null }))
    // State updated internally — no error thrown is the assertion
  })

  it('UPDATE reemplaza el proyecto en el estado', async () => {
    renderLayout()
    await waitFor(() => expect(realtimeCallback).toBeDefined())
    act(() =>
      realtimeCallback({
        eventType: 'UPDATE',
        new: { ...sampleProject, status: 'Completado' },
        old: sampleProject,
      }),
    )
  })

  it('DELETE elimina el proyecto del estado', async () => {
    renderLayout()
    await waitFor(() => expect(realtimeCallback).toBeDefined())
    act(() => realtimeCallback({ eventType: 'DELETE', new: null, old: sampleProject }))
  })

  it('INSERT con id duplicado no añade el proyecto dos veces', async () => {
    let capturedCtx
    render(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route element={<AppLayout />}>
            <Route
              index
              element={
                <CaptureContext
                  onCapture={(c) => {
                    capturedCtx = c
                  }}
                />
              }
            />
          </Route>
        </Routes>
      </MemoryRouter>,
    )
    await waitFor(() => expect(realtimeCallback).toBeDefined())
    await waitFor(() => expect(capturedCtx).toBeDefined())
    const countBefore = capturedCtx.projects.length
    act(() => realtimeCallback({ eventType: 'INSERT', new: sampleProject, old: null }))
    await waitFor(() => expect(capturedCtx.projects.length).toBe(countBefore))
  })
})

// Helper component to capture outlet context
import { useOutletContext } from 'react-router-dom'
function CaptureContext({ onCapture }) {
  const ctx = useOutletContext()
  onCapture(ctx)
  return <div data-testid="outlet" />
}
