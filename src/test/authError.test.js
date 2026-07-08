import { describe, it, expect } from 'vitest'
import { isAuthError } from '../lib/authError'

describe('isAuthError', () => {
  it('devuelve false si error es null o undefined', () => {
    expect(isAuthError(null)).toBe(false)
    expect(isAuthError(undefined)).toBe(false)
  })

  it('reconoce errores por status 401', () => {
    expect(isAuthError({ status: 401, message: 'Unauthorized' })).toBe(true)
  })

  it('reconoce errores por status 403', () => {
    expect(isAuthError({ status: 403, message: 'Forbidden' })).toBe(true)
  })

  it('reconoce errores por código PGRST301', () => {
    expect(isAuthError({ code: 'PGRST301', message: '' })).toBe(true)
  })

  it('reconoce refresh_token_not_found', () => {
    expect(isAuthError({ code: 'refresh_token_not_found', message: '' })).toBe(true)
  })

  it('reconoce refresh_token_already_used', () => {
    expect(isAuthError({ code: 'refresh_token_already_used', message: '' })).toBe(true)
  })

  it('reconoce session_not_found', () => {
    expect(isAuthError({ code: 'session_not_found', message: '' })).toBe(true)
  })

  it('reconoce bad_jwt', () => {
    expect(isAuthError({ code: 'bad_jwt', message: '' })).toBe(true)
  })

  it('reconoce "JWT expired" en el mensaje (insensible a mayúsculas)', () => {
    expect(isAuthError({ message: 'JWT expired' })).toBe(true)
    expect(isAuthError({ message: 'jwt expired at ...' })).toBe(true)
  })

  it('reconoce "Invalid Refresh Token" en el mensaje', () => {
    expect(isAuthError({ message: 'Invalid Refresh Token: already used' })).toBe(true)
  })

  it('reconoce "invalid claim" en el mensaje', () => {
    expect(isAuthError({ message: 'invalid claim: missing sub' })).toBe(true)
  })

  it('reconoce "not authenticated" en el mensaje', () => {
    expect(isAuthError({ message: 'not authenticated' })).toBe(true)
  })

  it('NO reconoce un error normal de PostgREST (PGRST116 = fila no encontrada)', () => {
    expect(isAuthError({ code: 'PGRST116', status: 406, message: 'The result contains 0 rows' })).toBe(false)
  })

  it('NO reconoce un error genérico de red sin status ni código de auth', () => {
    expect(isAuthError({ message: 'Network request failed' })).toBe(false)
  })

  it('NO reconoce un error de validación (status 400)', () => {
    expect(isAuthError({ status: 400, message: 'Bad request' })).toBe(false)
  })
})
