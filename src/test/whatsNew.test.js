import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { CHANGELOG, LATEST_VERSION } from '../data/changelog'
import {
  compareSemver,
  getUnseenEntries,
  readSeenVersion,
  writeSeenVersion,
  STORAGE_KEY,
} from '../lib/whatsNew'

describe('compareSemver', () => {
  it('detecta versiones mayores', () => {
    expect(compareSemver('1.1.0', '1.0.0')).toBe(1)
    expect(compareSemver('2.0.0', '1.9.9')).toBe(1)
    expect(compareSemver('1.2.0', '1.1.9')).toBe(1)
  })

  it('detecta versiones iguales', () => {
    expect(compareSemver('1.1.0', '1.1.0')).toBe(0)
    expect(compareSemver('1.1', '1.1.0')).toBe(0)
  })

  it('detecta versiones menores', () => {
    expect(compareSemver('1.0.0', '1.1.0')).toBe(-1)
    expect(compareSemver('1.0.0', '0.9.9')).toBe(1)
    expect(compareSemver('1.0.0', '1.1.0')).toBe(-1)
  })
})

describe('getUnseenEntries', () => {
  it('con seen=1.0.0 devuelve solo las versiones mayores', () => {
    const seen = CHANGELOG.find((e) => e.version === '1.0.0').version
    const result = getUnseenEntries(seen)
    expect(result.map((e) => e.version)).toEqual(['1.2.0', '1.1.0'])
  })

  it('con seen igual a la versión más nueva devuelve []', () => {
    expect(getUnseenEntries(LATEST_VERSION)).toEqual([])
  })

  it('con seen mayor a todas las versiones devuelve []', () => {
    expect(getUnseenEntries('99.0.0')).toEqual([])
  })

  it('con seen null (usuario nuevo) devuelve []', () => {
    expect(getUnseenEntries(null)).toEqual([])
    expect(getUnseenEntries(undefined)).toEqual([])
  })
})

describe('readSeenVersion / writeSeenVersion', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('round-trip: escribe y lee la misma versión', () => {
    writeSeenVersion('1.1.0')
    expect(readSeenVersion()).toBe('1.1.0')
    expect(localStorage.getItem(STORAGE_KEY)).toBe('1.1.0')
  })

  it('lee null si no hay nada guardado', () => {
    expect(readSeenVersion()).toBeNull()
  })

  it('un localStorage que lanza excepción no rompe (try/catch)', () => {
    vi.stubGlobal('localStorage', {
      getItem: vi.fn(() => {
        throw new Error('denied')
      }),
      setItem: vi.fn(() => {
        throw new Error('denied')
      }),
    })
    expect(readSeenVersion()).toBeNull()
    expect(() => writeSeenVersion('1.1.0')).not.toThrow()
  })
})
