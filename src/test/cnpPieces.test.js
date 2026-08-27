import { describe, it, expect } from 'vitest'
import { autoPieceLabel, resizePieces, relabelAutoPieces } from '../components/cnp/constants'

describe('autoPieceLabel', () => {
  it('appends a 1-based index to the title', () => {
    expect(autoPieceLabel('Historias parada Energon', 0)).toBe('Historias parada Energon 1')
    expect(autoPieceLabel('Historias parada Energon', 1)).toBe('Historias parada Energon 2')
  })

  it('falls back to "Pieza" when the title is empty', () => {
    expect(autoPieceLabel('', 0)).toBe('Pieza 1')
    expect(autoPieceLabel('   ', 2)).toBe('Pieza 3')
  })
})

describe('resizePieces', () => {
  it('returns [] when count is 1 or less', () => {
    expect(resizePieces([], 1, 'Título')).toEqual([])
    expect(resizePieces([{ id: '1', label: 'x', done: true }], 1, 'Título')).toEqual([])
    expect(resizePieces([], 0, 'Título')).toEqual([])
  })

  it('grows the list generating new pieces with autoPieceLabel', () => {
    const result = resizePieces([], 3, 'Título')
    expect(result).toHaveLength(3)
    expect(result.map((p) => p.label)).toEqual(['Título 1', 'Título 2', 'Título 3'])
    expect(result.every((p) => p.done === false && p.custom === false)).toBe(true)
  })

  it('generates new pieces with an empty per-piece content field', () => {
    const result = resizePieces([], 2, 'Título')
    expect(result.every((p) => p.content === '')).toBe(true)
  })

  it('preserves existing pieces (done and edited labels) when growing', () => {
    const existing = [{ id: 'a', label: 'Editada a mano', done: true, custom: true }]
    const result = resizePieces(existing, 2, 'Título')
    expect(result[0]).toEqual(existing[0])
    expect(result[1]).toMatchObject({ label: 'Título 2', done: false, custom: false })
  })

  it('shrinks the list keeping the first N pieces', () => {
    const existing = [
      { id: 'a', label: 'A', done: true, custom: false },
      { id: 'b', label: 'B', done: false, custom: false },
      { id: 'c', label: 'C', done: false, custom: false },
    ]
    const result = resizePieces(existing, 2, 'Título')
    expect(result).toEqual(existing.slice(0, 2))
  })
})

describe('relabelAutoPieces', () => {
  it('regenerates the label of non-custom pieces to follow the new title', () => {
    const pieces = [
      { id: 'a', label: 'Viejo título 1', done: false, custom: false },
      { id: 'b', label: 'Editada a mano', done: false, custom: true },
    ]
    const result = relabelAutoPieces(pieces, 'Nuevo título')
    expect(result[0].label).toBe('Nuevo título 1')
    expect(result[1].label).toBe('Editada a mano')
  })
})
