import { describe, it, expect } from 'vitest'
import { computeReunionesMeta } from '../utils/reunionesMeta'

const CLIENTS = [{ id: 'c1' }, { id: 'c2' }, { id: 'c3' }]

describe('computeReunionesMeta', () => {
  it('sin justificativos, la meta es 1 por cada marca', () => {
    expect(computeReunionesMeta(CLIENTS, {})).toBe(3)
  })

  it('descuenta las marcas justificadas como "no_aplica"', () => {
    expect(computeReunionesMeta(CLIENTS, { c1: 'no_aplica' })).toBe(2)
  })

  it('NO descuenta otros justificativos (reprogramado_cliente, no_cumplio)', () => {
    expect(computeReunionesMeta(CLIENTS, { c1: 'reprogramado_cliente', c2: 'no_cumplio' })).toBe(3)
  })

  it('todas en "no_aplica" da meta 0', () => {
    expect(
      computeReunionesMeta(CLIENTS, { c1: 'no_aplica', c2: 'no_aplica', c3: 'no_aplica' }),
    ).toBe(0)
  })

  it('ignora justificativos de ids que no están en el roster', () => {
    expect(computeReunionesMeta(CLIENTS, { fantasma: 'no_aplica' })).toBe(3)
  })

  it('roster vacío da meta 0', () => {
    expect(computeReunionesMeta([], { c1: 'no_aplica' })).toBe(0)
  })

  it('defaults: sin argumentos da meta 0', () => {
    expect(computeReunionesMeta()).toBe(0)
  })
})
