import { needsPasswordSetup } from '../utils/needsPasswordSetup'

describe('needsPasswordSetup', () => {
  it('devuelve false si no hay sesión', () => {
    expect(needsPasswordSetup(null)).toBe(false)
    expect(needsPasswordSetup(undefined)).toBe(false)
  })

  it('devuelve false si la sesión no tiene user_metadata', () => {
    expect(needsPasswordSetup({ user: { id: '1' } })).toBe(false)
  })

  it('devuelve false si must_set_password es false', () => {
    expect(
      needsPasswordSetup({ user: { id: '1', user_metadata: { must_set_password: false } } }),
    ).toBe(false)
  })

  it('devuelve true si must_set_password es true', () => {
    expect(
      needsPasswordSetup({ user: { id: '1', user_metadata: { must_set_password: true } } }),
    ).toBe(true)
  })
})
