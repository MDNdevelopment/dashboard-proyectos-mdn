import { describe, it, expect } from 'vitest'
import { parseMarkdownLite } from '../lib/renderMarkdownLite'

describe('parseMarkdownLite', () => {
  it('devuelve un único segmento sin negrita para texto plano', () => {
    expect(parseMarkdownLite('hola mundo')).toEqual([{ bold: false, text: 'hola mundo' }])
  })

  it('detecta un segmento en negrita', () => {
    expect(parseMarkdownLite('el **score** subió')).toEqual([
      { bold: false, text: 'el ' },
      { bold: true, text: 'score' },
      { bold: false, text: ' subió' },
    ])
  })

  it('detecta varios segmentos en negrita', () => {
    expect(parseMarkdownLite('**Alfa** va mejor que **Beta**')).toEqual([
      { bold: true, text: 'Alfa' },
      { bold: false, text: ' va mejor que ' },
      { bold: true, text: 'Beta' },
    ])
  })

  it('deja ** sueltos como texto plano si no cierran', () => {
    expect(parseMarkdownLite('esto tiene ** suelto')).toEqual([
      { bold: false, text: 'esto tiene ** suelto' },
    ])
  })

  it('devuelve [] para texto vacío', () => {
    expect(parseMarkdownLite('')).toEqual([])
  })

  it('devuelve [] para null/undefined', () => {
    expect(parseMarkdownLite(null)).toEqual([])
    expect(parseMarkdownLite(undefined)).toEqual([])
  })
})
