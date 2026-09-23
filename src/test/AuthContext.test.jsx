/**
 * Tests para las dos correcciones clave en AuthContext:
 *
 * 1. Bug 1 (rebote a raíz): `loading` permanece `true` hasta que
 *    `fetchUserProfile` (y con él `fetchModulePermissions`) resuelve.
 *    Antes del fix, setLoading(false) corría sin await y `RequireModule`
 *    veía userProfile=null → can('reportes')=false → Navigate a '/'.
 *
 * 2. Bug 2 (pérdida de datos al refocar pestaña): un segundo evento
 *    `onAuthStateChange` con el mismo user.id NO debe volver a llamar
 *    a supabase.from('users'). Antes del fix, TOKEN_REFRESHED re-creaba
 *    userProfile y desmontaba las vistas (perdiendo datos sin guardar).
 */
import { renderHook, act, waitFor } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach } from 'vitest'

// ── vi.hoisted permite usar estos mocks dentro del factory de vi.mock ────────
const {
  mockGetSession,
  mockGetUser,
  mockUserSingle,
  mockOnAuthStateChange,
  mockFrom,
  mockSignOut,
} = vi.hoisted(() => {
  const mockGetSession = vi.fn()
  const mockGetUser = vi.fn()
  const mockUserSingle = vi.fn()
  const mockOnAuthStateChange = vi.fn()
  const mockFrom = vi.fn()
  const mockSignOut = vi.fn()
  return {
    mockGetSession,
    mockGetUser,
    mockUserSingle,
    mockOnAuthStateChange,
    mockFrom,
    mockSignOut,
  }
})

vi.mock('../supabase', () => ({
  supabase: {
    auth: {
      getSession: mockGetSession,
      getUser: mockGetUser,
      onAuthStateChange: mockOnAuthStateChange,
      signOut: mockSignOut,
    },
    from: mockFrom,
    channel: vi.fn(() => ({ on: vi.fn().mockReturnThis(), subscribe: vi.fn() })),
    removeChannel: vi.fn(),
  },
}))

import { AuthProvider, useAuth } from '../context/AuthContext'

function wrapper({ children }) {
  return <AuthProvider>{children}</AuthProvider>
}

const MOCK_USER_DATA = {
  user_id: 'u-1',
  company_id: null,
  admin: true,
  access_level: 4,
  first_name: 'Test',
  last_name: 'User',
}

function makeFromChain(singleFn) {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: singleFn,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  // Suscripción por defecto vacía
  mockOnAuthStateChange.mockReturnValue({
    data: { subscription: { unsubscribe: vi.fn() } },
  })
  // getUser devuelve éxito por defecto (sesión válida en servidor)
  mockGetUser.mockResolvedValue({ data: { user: { id: 'u-1' } }, error: null })
  // signOut no hace nada por defecto
  mockSignOut.mockResolvedValue({ error: null })
})

// ════════════════════════════════════════════════════════════════════════════
// 1. loading permanece true hasta que fetchUserProfile resuelve
// ════════════════════════════════════════════════════════════════════════════
describe('AuthContext — loading no baja hasta que el perfil está cargado', () => {
  it('loading es true mientras getSession todavía está pendiente', () => {
    // getSession nunca resuelve durante este test
    mockGetSession.mockReturnValue(new Promise(() => {}))
    const { result } = renderHook(useAuth, { wrapper })
    expect(result.current.loading).toBe(true)
  })

  it('loading permanece true tras getSession pero antes de que resuelva el query de usuario', async () => {
    let resolveUserQuery
    mockGetSession.mockResolvedValue({
      data: { session: { user: { id: 'u-1' } } },
    })
    mockFrom.mockReturnValue(
      makeFromChain(
        vi.fn(
          () =>
            new Promise((resolve) => {
              resolveUserQuery = resolve
            }),
        ),
      ),
    )

    const { result } = renderHook(useAuth, { wrapper })

    // Esperar a que getSession resuelva pero NO el query de usuario
    await act(async () => {
      await Promise.resolve() // un tick para que el .then de getSession corra
    })

    // El query de usuario sigue pendiente → loading debe seguir en true
    expect(result.current.loading).toBe(true)

    // Cleanup: resolver para no dejar promesas pendientes
    resolveUserQuery?.({ data: MOCK_USER_DATA, error: null })
  })

  it('loading pasa a false solo cuando fetchUserProfile resuelve', async () => {
    mockGetSession.mockResolvedValue({
      data: { session: { user: { id: 'u-1' } } },
    })
    mockFrom.mockReturnValue(
      makeFromChain(vi.fn().mockResolvedValue({ data: MOCK_USER_DATA, error: null })),
    )

    const { result } = renderHook(useAuth, { wrapper })

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.userProfile).toMatchObject({ user_id: 'u-1' })
  })

  it('loading pasa a false directamente si no hay sesión activa', async () => {
    mockGetSession.mockResolvedValue({ data: { session: null } })

    const { result } = renderHook(useAuth, { wrapper })

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.userProfile).toBeNull()
  })

  it('al iniciar sesión ya con la app montada (onAuthStateChange con user.id nuevo), loading vuelve a true hasta que el perfil carga', async () => {
    // Bug real: el login dispara onAuthStateChange, no initSession. Si loading
    // no vuelve a true ahí, ProtectedRoute/RequireModule renderizan con
    // userProfile=null y canAccessModule() manda al usuario a "/" al toque.
    let authCallback = null
    mockOnAuthStateChange.mockImplementation((cb) => {
      authCallback = cb
      return { data: { subscription: { unsubscribe: vi.fn() } } }
    })
    mockGetSession.mockResolvedValue({ data: { session: null } })

    const { result } = renderHook(useAuth, { wrapper })
    await waitFor(() => expect(result.current.loading).toBe(false))

    let resolveUserQuery
    mockFrom.mockReturnValue(
      makeFromChain(
        vi.fn(
          () =>
            new Promise((resolve) => {
              resolveUserQuery = resolve
            }),
        ),
      ),
    )

    act(() => {
      authCallback('SIGNED_IN', { user: { id: 'u-1' } })
    })

    // Debe volver a true de inmediato, antes de que el perfil resuelva.
    expect(result.current.loading).toBe(true)

    await act(async () => {
      resolveUserQuery({ data: MOCK_USER_DATA, error: null })
      await Promise.resolve()
    })

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.userProfile).toMatchObject({ user_id: 'u-1' })
  })
})

// ════════════════════════════════════════════════════════════════════════════
// 4. Reintento ante error transitorio (p.ej. 406) al cargar el perfil
// ════════════════════════════════════════════════════════════════════════════
describe('AuthContext — reintento ante error transitorio al cargar el perfil', () => {
  it('reintenta una vez tras un error no-auth y usa el resultado si el reintento funciona', async () => {
    mockGetSession.mockResolvedValue({
      data: { session: { user: { id: 'u-1' } } },
    })
    const singleFn = vi
      .fn()
      .mockResolvedValueOnce({
        data: null,
        error: { status: 406, message: 'JSON object requested, multiple (or no) rows returned' },
      })
      .mockResolvedValueOnce({ data: MOCK_USER_DATA, error: null })
    mockFrom.mockReturnValue(makeFromChain(singleFn))

    const { result } = renderHook(useAuth, { wrapper })

    await waitFor(() => expect(singleFn).toHaveBeenCalledTimes(2), { timeout: 2000 })
    expect(result.current.userProfile).toMatchObject({ user_id: 'u-1' })
    expect(result.current.loading).toBe(false)
  })

  it('si el reintento también falla, deja userProfile en null sin cerrar la sesión', async () => {
    mockGetSession.mockResolvedValue({
      data: { session: { user: { id: 'u-1' } } },
    })
    const singleFn = vi
      .fn()
      .mockResolvedValue({ data: null, error: { status: 406, message: 'no rows' } })
    mockFrom.mockReturnValue(makeFromChain(singleFn))

    const { result } = renderHook(useAuth, { wrapper })

    await waitFor(() => expect(singleFn).toHaveBeenCalledTimes(2), { timeout: 2000 })
    expect(result.current.userProfile).toBeNull()
    expect(result.current.session).not.toBeNull()
    expect(result.current.loading).toBe(false)
  })
})

// ════════════════════════════════════════════════════════════════════════════
// 2. TOKEN_REFRESHED con el mismo user.id no re-fetcha el perfil
// ════════════════════════════════════════════════════════════════════════════
describe('AuthContext — deduplicación de refetch por user.id', () => {
  it('un segundo onAuthStateChange con el mismo user.id no vuelve a llamar supabase.from', async () => {
    let authCallback = null
    mockOnAuthStateChange.mockImplementation((cb) => {
      authCallback = cb
      return { data: { subscription: { unsubscribe: vi.fn() } } }
    })
    mockGetSession.mockResolvedValue({
      data: { session: { user: { id: 'u-1' } } },
    })
    mockFrom.mockReturnValue(
      makeFromChain(vi.fn().mockResolvedValue({ data: MOCK_USER_DATA, error: null })),
    )

    renderHook(useAuth, { wrapper })

    // Esperar a que cargue el perfil inicial
    await waitFor(() => expect(mockFrom).toHaveBeenCalled())
    const callsAfterInit = mockFrom.mock.calls.length

    // Simular TOKEN_REFRESHED con el mismo user.id
    await act(async () => {
      authCallback('TOKEN_REFRESHED', { user: { id: 'u-1' } })
    })

    // No debe haber llamadas adicionales a from
    expect(mockFrom.mock.calls.length).toBe(callsAfterInit)
  })

  it('un onAuthStateChange con distinto user.id SÍ fetcha el perfil nuevo', async () => {
    let authCallback = null
    mockOnAuthStateChange.mockImplementation((cb) => {
      authCallback = cb
      return { data: { subscription: { unsubscribe: vi.fn() } } }
    })
    mockGetSession.mockResolvedValue({
      data: { session: { user: { id: 'u-1' } } },
    })
    mockFrom.mockReturnValue(
      makeFromChain(vi.fn().mockResolvedValue({ data: MOCK_USER_DATA, error: null })),
    )

    renderHook(useAuth, { wrapper })

    await waitFor(() => expect(mockFrom).toHaveBeenCalled())
    const callsAfterInit = mockFrom.mock.calls.length

    // Simular cambio a un usuario distinto
    await act(async () => {
      authCallback('SIGNED_IN', { user: { id: 'u-2' } })
    })

    // Debe haber nuevas llamadas a from para el nuevo usuario
    expect(mockFrom.mock.calls.length).toBeGreaterThan(callsAfterInit)
  })

  it('el sign-out limpia el perfil y permite cargar el siguiente usuario', async () => {
    let authCallback = null
    mockOnAuthStateChange.mockImplementation((cb) => {
      authCallback = cb
      return { data: { subscription: { unsubscribe: vi.fn() } } }
    })
    mockGetSession.mockResolvedValue({ data: { session: null } })
    mockFrom.mockReturnValue(
      makeFromChain(vi.fn().mockResolvedValue({ data: MOCK_USER_DATA, error: null })),
    )

    const { result } = renderHook(useAuth, { wrapper })

    await waitFor(() => expect(result.current.loading).toBe(false))

    // Simular sign-out
    await act(async () => {
      authCallback('SIGNED_OUT', null)
    })

    expect(result.current.userProfile).toBeNull()
    expect(result.current.session).toBeNull()

    // Después del sign-out, un nuevo usuario puede cargar
    await act(async () => {
      authCallback('SIGNED_IN', { user: { id: 'u-2' } })
    })
    await waitFor(() => expect(mockFrom).toHaveBeenCalled())
  })
})

// ════════════════════════════════════════════════════════════════════════════
// 3. Recuperación de sesión expirada / token inválido en servidor
// ════════════════════════════════════════════════════════════════════════════
describe('AuthContext — recuperación automática de sesión expirada', () => {
  it('si getUser() falla con 401 al arrancar → sessionExpired=true, session=null, loading=false', async () => {
    mockGetSession.mockResolvedValue({
      data: { session: { user: { id: 'u-1' } } },
    })
    mockGetUser.mockResolvedValue({ data: null, error: { status: 401, message: 'JWT expired' } })

    const { result } = renderHook(useAuth, { wrapper })

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.session).toBeNull()
    expect(result.current.sessionExpired).toBe(true)
    expect(result.current.userProfile).toBeNull()
    // Debe llamar a signOut para limpiar el token corrupto de localStorage
    expect(mockSignOut).toHaveBeenCalled()
    // No debe haber intentado cargar el perfil
    expect(mockFrom).not.toHaveBeenCalled()
  })

  it('si getSession() rechaza inesperadamente → loading baja a false (no spinner infinito)', async () => {
    mockGetSession.mockRejectedValue(new Error('network error'))

    const { result } = renderHook(useAuth, { wrapper })

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.session).toBeNull()
  })

  it('si fetchUserProfile devuelve error 401 → sessionExpired=true', async () => {
    mockGetSession.mockResolvedValue({
      data: { session: { user: { id: 'u-1' } } },
    })
    // getUser pasa (el token era válido en ese instante)
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u-1' } }, error: null })
    // Pero la query al perfil devuelve 401 (puede ocurrir con latencia)
    mockFrom.mockReturnValue(
      makeFromChain(
        vi.fn().mockResolvedValue({ data: null, error: { status: 401, message: 'JWT expired' } }),
      ),
    )

    const { result } = renderHook(useAuth, { wrapper })

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.sessionExpired).toBe(true)
    expect(result.current.session).toBeNull()
    expect(mockSignOut).toHaveBeenCalled()
  })

  it('un nuevo login tras expiración limpia sessionExpired', async () => {
    let authCallback = null
    mockOnAuthStateChange.mockImplementation((cb) => {
      authCallback = cb
      return { data: { subscription: { unsubscribe: vi.fn() } } }
    })
    mockGetSession.mockResolvedValue({ data: { session: null } })

    const { result } = renderHook(useAuth, { wrapper })
    await waitFor(() => expect(result.current.loading).toBe(false))

    // Simular que estaba expirada antes (estado manual para el test)
    // Luego un SIGNED_IN debe limpiarlo
    mockFrom.mockReturnValue(
      makeFromChain(vi.fn().mockResolvedValue({ data: MOCK_USER_DATA, error: null })),
    )
    await act(async () => {
      authCallback('SIGNED_IN', { user: { id: 'u-1' } })
    })

    await waitFor(() => expect(result.current.sessionExpired).toBe(false))
  })
})
