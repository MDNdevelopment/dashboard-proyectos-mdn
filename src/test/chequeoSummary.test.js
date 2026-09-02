import { describe, it, expect } from 'vitest'
import { computeChequeoSummary } from '../utils/chequeo'

// Todos los checks caen "hoy" (verde) salvo que se pase last_published_at explícito viejo.
const TODAY = new Date('2026-08-20')

function client(overrides = {}) {
  return {
    id: 'c1',
    name: 'Encco',
    line_id: 'line-1',
    social_links: [{ red: 'TikTok' }],
    ...overrides,
  }
}

function check(overrides = {}) {
  return {
    client_id: 'c1',
    network: 'TikTok',
    content_type: 'publicaciones',
    last_published_at: '2026-08-19',
    period_week: 3,
    ...overrides,
  }
}

describe('computeChequeoSummary', () => {
  it('cuenta con todas sus casillas aplicables registradas → actualizada', () => {
    const summary = computeChequeoSummary([client()], [check()], { weekN: 3, today: TODAY })
    expect(summary.totalCuentas).toBe(1)
    expect(summary.actualizadas).toBe(1)
    expect(summary.parciales).toBe(0)
    expect(summary.sinRegistrar).toBe(0)
  })

  it('Instagram tiene 3 casillas aplicables (Publicaciones/Reels/Highlights): registrar solo una es parcial', () => {
    const ig = client({ social_links: [{ red: 'Instagram' }] })
    const summary = computeChequeoSummary(
      [ig],
      [check({ network: 'Instagram', content_type: 'publicaciones' })],
      { weekN: 3, today: TODAY },
    )
    expect(summary.parciales).toBe(1)
    expect(summary.actualizadas).toBe(0)
  })

  it('cuenta sin ninguna casilla registrada en el período → sin registrar', () => {
    const summary = computeChequeoSummary([client()], [], { weekN: 3, today: TODAY })
    expect(summary.sinRegistrar).toBe(1)
    expect(summary.actualizadas).toBe(0)
    expect(summary.parciales).toBe(0)
  })

  it('cuenta sin redes sociales cargadas no entra en actualizadas/parciales/sinRegistrar', () => {
    const summary = computeChequeoSummary([client({ social_links: [] })], [], {
      weekN: 3,
      today: TODAY,
    })
    expect(summary.sinRedes).toBe(1)
    expect(summary.totalCuentas).toBe(0)
  })

  it('weekN filtra por period_week; weekN=null (vista "más reciente") usa la fecha más reciente del mes', () => {
    const checks = [check({ period_week: 1, last_published_at: '2026-08-05' })]
    const bySemana = computeChequeoSummary([client()], checks, { weekN: 3, today: TODAY })
    expect(bySemana.sinRegistrar).toBe(1) // S3 no tiene registro

    const masReciente = computeChequeoSummary([client()], checks, { weekN: null, today: TODAY })
    expect(masReciente.actualizadas).toBe(1) // ignora period_week, toma la fecha más reciente
  })

  it('enAlerta cuando alguna casilla lleva 12+ días, porVencer cuando el peor caso es 6-11 días', () => {
    const rojo = computeChequeoSummary(
      [client()],
      [check({ last_published_at: '2026-08-01' })], // 19 días
      { weekN: 3, today: TODAY },
    )
    expect(rojo.enAlerta).toBe(1)
    expect(rojo.porVencer).toBe(0)

    const naranja = computeChequeoSummary(
      [client()],
      [check({ last_published_at: '2026-08-12' })], // 8 días
      { weekN: 3, today: TODAY },
    )
    expect(naranja.porVencer).toBe(1)
    expect(naranja.enAlerta).toBe(0)
  })

  it('Mailchimp/YouTube exentas: sin registro no cuentan como en alerta hasta ~30 días', () => {
    const yt = client({ social_links: [{ red: 'YouTube' }] })
    const summary = computeChequeoSummary(
      [yt],
      [check({ network: 'YouTube', last_published_at: '2026-08-12' })], // 8 días
      { weekN: 3, today: TODAY },
    )
    expect(summary.enAlerta).toBe(0)
    expect(summary.porVencer).toBe(0)
    expect(summary.actualizadas).toBe(1)
  })

  it('respeta fixed_tasks.plataformas === false: NO excluye la cuenta (a diferencia de computePlataformasProductividad)', () => {
    const optedOut = client({ fixed_tasks: { plataformas: false } })
    const summary = computeChequeoSummary([optedOut], [check()], { weekN: 3, today: TODAY })
    expect(summary.totalCuentas).toBe(1)
    expect(summary.actualizadas).toBe(1)
  })

  it('lista vacía de cuentas devuelve todos los contadores en cero', () => {
    const summary = computeChequeoSummary([], [], { weekN: 3, today: TODAY })
    expect(summary).toEqual({
      totalCuentas: 0,
      sinRedes: 0,
      actualizadas: 0,
      parciales: 0,
      sinRegistrar: 0,
      enAlerta: 0,
      porVencer: 0,
      celdasTotal: 0,
      celdasConFecha: 0,
    })
  })
})
