import { selectAllPages, DEFAULT_PAGE_SIZE } from '../lib/supabasePaginate'

// Simula un backend con `total` filas y un tope de servidor `serverCap` por página,
// devolviendo `count: total` en cada respuesta (como hace supabase-js con `count: 'exact'`).
function makeFakeBackend(total, { serverCap = Infinity } = {}) {
  const allRows = Array.from({ length: total }, (_, i) => ({ id: `id-${i}` }))
  return (from, to) => {
    const cappedTo = Math.min(to, from + serverCap - 1)
    return Promise.resolve({ data: allRows.slice(from, cappedTo + 1), error: null, count: total })
  }
}

describe('selectAllPages', () => {
  it('concatena varias páginas hasta traer todas las filas', async () => {
    const buildPage = makeFakeBackend(2500)
    const { data, error } = await selectAllPages(buildPage, { pageSize: 1000 })
    expect(error).toBeNull()
    expect(data).toHaveLength(2500)
    expect(data[0].id).toBe('id-0')
    expect(data[2499].id).toBe('id-2499')
  })

  it('no pagina de más cuando todo cabe en la primera página', async () => {
    const buildPage = vi.fn(makeFakeBackend(50))
    const { data } = await selectAllPages(buildPage, { pageSize: 1000 })
    expect(data).toHaveLength(50)
    expect(buildPage).toHaveBeenCalledTimes(1)
  })

  it('avanza por lo realmente recibido, no por pageSize, cuando el servidor cap es menor', async () => {
    // El servidor real (ej. PostgREST) devuelve como máximo 300 filas por página aunque
    // se pida un rango de 1000: avanzar por pageSize saltaría filas.
    const buildPage = makeFakeBackend(1014, { serverCap: 300 })
    const { data, error } = await selectAllPages(buildPage, { pageSize: 1000 })
    expect(error).toBeNull()
    expect(data).toHaveLength(1014)
    expect(data.map((r) => r.id)).toEqual(Array.from({ length: 1014 }, (_, i) => `id-${i}`))
  })

  it('corta con página vacía si el servidor no informa count', async () => {
    const allRows = Array.from({ length: 120 }, (_, i) => ({ id: `id-${i}` }))
    const buildPage = (from, to) =>
      Promise.resolve({ data: allRows.slice(from, to + 1), error: null, count: undefined })
    const { data, error } = await selectAllPages(buildPage, { pageSize: 50 })
    expect(error).toBeNull()
    expect(data).toHaveLength(120)
  })

  it('deduplica por id filas que aparecen en más de una página', async () => {
    const buildPage = vi
      .fn()
      .mockResolvedValueOnce({ data: [{ id: 'a' }, { id: 'b' }], error: null, count: 3 })
      // 'b' se repite (ej. una fila nueva insertada entre páginas corrió el orden)
      .mockResolvedValueOnce({ data: [{ id: 'b' }, { id: 'c' }], error: null, count: 3 })
    const { data } = await selectAllPages(buildPage, { pageSize: 2 })
    expect(data.map((r) => r.id)).toEqual(['a', 'b', 'c'])
  })

  it('propaga el error de cualquier página sin seguir pidiendo más', async () => {
    const boom = new Error('boom')
    const buildPage = vi
      .fn()
      .mockResolvedValueOnce({ data: [{ id: 'a' }], error: null, count: 2000 })
      .mockResolvedValueOnce({ data: null, error: boom, count: null })
    const { data, error } = await selectAllPages(buildPage, { pageSize: 1 })
    expect(data).toBeNull()
    expect(error).toBe(boom)
    expect(buildPage).toHaveBeenCalledTimes(2)
  })

  it('devuelve error (no datos parciales) si se alcanza maxPages', async () => {
    // count nunca baja de "quedan más filas" y cada página trae datos, así que sin el
    // tope de maxPages este loop no terminaría nunca.
    const buildPage = vi.fn().mockResolvedValue({ data: [{ id: 'x' }], error: null, count: 999999 })
    const { data, error } = await selectAllPages(buildPage, { pageSize: 1, maxPages: 3 })
    expect(data).toBeNull()
    expect(error).toBeInstanceOf(Error)
    expect(buildPage).toHaveBeenCalledTimes(3)
  })

  it('usa DEFAULT_PAGE_SIZE = 1000 (tope por defecto de Supabase) cuando no se pasa pageSize', async () => {
    expect(DEFAULT_PAGE_SIZE).toBe(1000)
  })
})
