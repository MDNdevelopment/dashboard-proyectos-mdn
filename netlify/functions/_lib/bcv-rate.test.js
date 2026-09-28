import { describe, it, expect, vi } from 'vitest'

// bcv-rate.js importa requireCapability.js -> supabase.js, que instancia un
// cliente real con las env vars de Supabase (ausentes en test) — se mockea para
// poder importar el módulo y probar sus 2 funciones puras sin red ni credenciales.
// Vive en _lib/ (no junto a bcv-rate.js) para que Netlify no lo escanee como si
// fuera una función más — nombre de archivo con "." no es válido para eso.
vi.mock('./supabase.js', () => ({ supabase: {} }))

const { extractPydolarveRate, extractDolarApiRate } = await import('../bcv-rate.js')

// El handler completo (fetch a 2 APIs externas + requireCapability) no se testea
// end-to-end aquí — mismo criterio que av-workload-insight.js/ceo-analysis.js, sin
// test propio en el repo por depender de servicios externos reales. Lo que sí se
// puede probar sin red es la extracción del precio de cada forma de respuesta.

describe('extractPydolarveRate', () => {
  it('lee monitors.bcv.price (forma documentada)', () => {
    expect(extractPydolarveRate({ monitors: { bcv: { price: 197.6 } } })).toBe(197.6)
  })

  it('cae a payload.price si no hay monitors', () => {
    expect(extractPydolarveRate({ price: 200 })).toBe(200)
  })

  it('devuelve null con un precio inválido o ausente', () => {
    expect(extractPydolarveRate({ monitors: { bcv: { price: 0 } } })).toBeNull()
    expect(extractPydolarveRate({})).toBeNull()
    expect(extractPydolarveRate(null)).toBeNull()
  })
})

describe('extractDolarApiRate', () => {
  it('lee "promedio" (forma verificada en vivo de ve.dolarapi.com)', () => {
    expect(extractDolarApiRate({ promedio: 857.0058 })).toBe(857.0058)
  })

  it('devuelve null con un precio inválido o ausente', () => {
    expect(extractDolarApiRate({ promedio: null })).toBeNull()
    expect(extractDolarApiRate({})).toBeNull()
  })
})
