import { clientIdsOf, clientNamesOf, matchesClient, clientDisplayName } from '../utils/rowClients'

describe('rowClients', () => {
  const clientsById = new Map([
    ['c1', { id: 'c1', name: 'Punto Fit' }],
    ['c2', { id: 'c2', name: 'Bellezza' }],
  ])

  describe('clientIdsOf', () => {
    it('usa client_ids cuando tiene elementos', () => {
      expect(clientIdsOf({ client_ids: ['c1', 'c2'], client_id: 'c1' })).toEqual(['c1', 'c2'])
    })
    it('cae al escalar client_id si client_ids está vacío o ausente', () => {
      expect(clientIdsOf({ client_ids: [], client_id: 'c1' })).toEqual(['c1'])
      expect(clientIdsOf({ client_id: 'c1' })).toEqual(['c1'])
    })
    it('devuelve [] sin ningún cliente', () => {
      expect(clientIdsOf({ client_ids: [], client_id: null })).toEqual([])
      expect(clientIdsOf({})).toEqual([])
    })
  })

  describe('clientNamesOf', () => {
    it('resuelve los nombres de todos los ids', () => {
      expect(clientNamesOf({ client_ids: ['c1', 'c2'] }, clientsById)).toEqual([
        'Punto Fit',
        'Bellezza',
      ])
    })
    it('usa el fallback cuando no hay ningún cliente', () => {
      expect(clientNamesOf({}, clientsById, { fallback: 'Tarea heredada' })).toEqual([
        'Tarea heredada',
      ])
    })
    it('sin fallback y sin cliente devuelve []', () => {
      expect(clientNamesOf({}, clientsById)).toEqual([])
    })
  })

  describe('matchesClient', () => {
    it('true si el id está entre las marcas de la fila', () => {
      expect(matchesClient({ client_ids: ['c1', 'c2'] }, 'c2')).toBe(true)
    })
    it('false si no está', () => {
      expect(matchesClient({ client_ids: ['c1'] }, 'c2')).toBe(false)
    })
    it('sin filtro (id vacío) siempre pasa', () => {
      expect(matchesClient({ client_ids: [] }, '')).toBe(true)
      expect(matchesClient({ client_ids: [] }, null)).toBe(true)
    })
  })

  describe('clientDisplayName', () => {
    it('una sola marca: el nombre solo', () => {
      expect(clientDisplayName({ client_ids: ['c1'] }, clientsById)).toBe('Punto Fit')
    })
    it('varias marcas: primer nombre + "+N"', () => {
      expect(clientDisplayName({ client_ids: ['c1', 'c2'] }, clientsById)).toBe('Punto Fit +1')
    })
    it('sin cliente: emptyLabel por defecto', () => {
      expect(clientDisplayName({}, clientsById)).toBe('Sin cliente')
    })
    it('sin cliente con fallback', () => {
      expect(clientDisplayName({}, clientsById, { fallback: 'Favor para dirección' })).toBe(
        'Favor para dirección',
      )
    })
  })
})
