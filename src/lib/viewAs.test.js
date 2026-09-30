import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  VIEW_AS_STORAGE_KEY,
  canUseViewAs,
  clearStoredViewAs,
  isReadOnlyRpc,
  isViewOnly,
  readStoredViewAs,
  setViewOnly,
  storeViewAs,
} from './viewAs'

const JUAN = '2d50a4e5-35db-4be5-b27a-a24d1282ce82'

describe('canUseViewAs', () => {
  it('acepta solo el user_id del desarrollador', () => {
    expect(canUseViewAs({ user_id: JUAN })).toBe(true)
  })

  it('rechaza a otro admin', () => {
    expect(canUseViewAs({ user_id: '9e19bd71-e72c-419a-9919-c154e4e573d7', admin: true })).toBe(
      false,
    )
  })

  it('rechaza perfil nulo o sin user_id', () => {
    expect(canUseViewAs(null)).toBe(false)
    expect(canUseViewAs(undefined)).toBe(false)
    expect(canUseViewAs({})).toBe(false)
  })
})

describe('isReadOnlyRpc', () => {
  it('permite los RPC de lectura conocidos', () => {
    expect(isReadOnlyRpc('employee_score_inputs')).toBe(true)
    expect(isReadOnlyRpc('users_on_vacation_today')).toBe(true)
  })

  it('bloquea cualquier otro RPC (allowlist, no denylist)', () => {
    expect(isReadOnlyRpc('move_client_line_reports')).toBe(false)
    expect(isReadOnlyRpc('reassign_client_open_tasks')).toBe(false)
    expect(isReadOnlyRpc('rpc_inventado_manana')).toBe(false)
  })
})

describe('flag de solo lectura', () => {
  afterEach(() => setViewOnly(false))

  it('arranca apagado y se enciende/apaga', () => {
    expect(isViewOnly()).toBe(false)
    setViewOnly(true)
    expect(isViewOnly()).toBe(true)
    setViewOnly(false)
    expect(isViewOnly()).toBe(false)
  })
})

describe('persistencia en sessionStorage', () => {
  beforeEach(() => {
    window.sessionStorage.clear()
  })

  it('guarda, lee y borra el user_id suplantado', () => {
    expect(readStoredViewAs()).toBeNull()
    storeViewAs('abc-123')
    expect(window.sessionStorage.getItem(VIEW_AS_STORAGE_KEY)).toBe('abc-123')
    expect(readStoredViewAs()).toBe('abc-123')
    clearStoredViewAs()
    expect(readStoredViewAs()).toBeNull()
  })

  it('no rompe si sessionStorage lanza (navegación privada / storage bloqueado)', () => {
    const boom = () => {
      throw new Error('SecurityError')
    }
    const getSpy = vi.spyOn(window.sessionStorage, 'getItem').mockImplementation(boom)
    const setSpy = vi.spyOn(window.sessionStorage, 'setItem').mockImplementation(boom)
    const removeSpy = vi.spyOn(window.sessionStorage, 'removeItem').mockImplementation(boom)

    expect(readStoredViewAs()).toBeNull()
    expect(() => storeViewAs('x')).not.toThrow()
    expect(() => clearStoredViewAs()).not.toThrow()

    getSpy.mockRestore()
    setSpy.mockRestore()
    removeSpy.mockRestore()
  })
})
