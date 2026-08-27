import { describe, it, expect } from 'vitest'
import { parseRecoveryParams } from '../utils/parseRecoveryParams'

describe('parseRecoveryParams', () => {
  it('detecta un enlace de recovery válido con token en el hash', () => {
    const url =
      'https://mdngestion.netlify.app/reset-password#access_token=abc123&type=recovery&refresh_token=xyz'
    const result = parseRecoveryParams(url)
    expect(result.hasToken).toBe(true)
    expect(result.error).toBeNull()
    expect(result.errorCode).toBeNull()
  })

  it('detecta enlace expirado (otp_expired en query params)', () => {
    const url =
      'https://mdngestion.netlify.app/reset-password?error=access_denied&error_code=otp_expired'
    const result = parseRecoveryParams(url)
    expect(result.hasToken).toBe(false)
    expect(result.error).toBe('access_denied')
    expect(result.errorCode).toBe('otp_expired')
  })

  it('detecta enlace expirado cuando el error está en el hash', () => {
    const url =
      'https://mdngestion.netlify.app/reset-password#error=access_denied&error_code=otp_expired'
    const result = parseRecoveryParams(url)
    expect(result.hasToken).toBe(false)
    expect(result.error).toBe('access_denied')
    expect(result.errorCode).toBe('otp_expired')
  })

  it('devuelve hasToken false si el tipo no es recovery', () => {
    const url = 'https://mdngestion.netlify.app/reset-password#access_token=abc&type=signup'
    const result = parseRecoveryParams(url)
    expect(result.hasToken).toBe(false)
    expect(result.error).toBeNull()
  })

  it('devuelve todo vacío en una URL sin parámetros relevantes', () => {
    const result = parseRecoveryParams('https://mdngestion.netlify.app/reset-password')
    expect(result.hasToken).toBe(false)
    expect(result.error).toBeNull()
    expect(result.errorCode).toBeNull()
  })

  it('acepta un string de hash directo (sin URL completa)', () => {
    const hash = '#access_token=tok&type=recovery'
    const result = parseRecoveryParams(hash)
    expect(result.hasToken).toBe(true)
    expect(result.error).toBeNull()
  })

  it('acepta un string de query directo', () => {
    const qs = '?error=access_denied&error_code=otp_expired'
    const result = parseRecoveryParams(qs)
    expect(result.error).toBe('access_denied')
    expect(result.errorCode).toBe('otp_expired')
  })

  it('detecta un enlace de invitación (type=invite) vía type y hasAccessToken', () => {
    const url =
      'https://mdngestion.netlify.app/reset-password#access_token=abc123&type=invite&refresh_token=xyz'
    const result = parseRecoveryParams(url)
    expect(result.type).toBe('invite')
    expect(result.hasAccessToken).toBe(true)
    // hasToken conserva su semántica original: solo true para type=recovery
    expect(result.hasToken).toBe(false)
  })

  it('hasAccessToken es false cuando no hay access_token en la URL', () => {
    const result = parseRecoveryParams('https://mdngestion.netlify.app/reset-password')
    expect(result.hasAccessToken).toBe(false)
    expect(result.type).toBeNull()
  })
})
