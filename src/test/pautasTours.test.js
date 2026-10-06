import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { PAUTAS_TOURS, toursFor } from '../components/pautas/pautasTours'

const ids = (ctx) => toursFor(ctx).map((t) => t.id)
const BASE = {
  coordina: false,
  manage: false,
  canViewAll: false,
  esRecurso: false,
  tieneTrabajo: false,
}

describe('pautasTours — qué ve cada rol', () => {
  it('coordinación: básico, coordinar y datos; no "pedir una pauta"', () => {
    expect(ids({ ...BASE, coordina: true, manage: true, canViewAll: true })).toEqual([
      'basico',
      'coordinar',
      'datos',
    ])
  })

  it('jefa de línea: básico, pedir una pauta y datos; nada de coordinación', () => {
    expect(ids({ ...BASE, manage: true })).toEqual(['basico', 'pedir', 'datos'])
  })

  it('recurso audiovisual: además ve "Registrar captura y edición"', () => {
    expect(ids({ ...BASE, esRecurso: true })).toEqual(['basico', 'captura', 'datos'])
  })

  it('quien tiene trabajo propio sin ser recurso también ve captura', () => {
    expect(ids({ ...BASE, tieneTrabajo: true })).toContain('captura')
  })

  it('solo lectura: únicamente lo básico y los datos', () => {
    expect(ids(BASE)).toEqual(['basico', 'datos'])
  })

  it('el paso de filtrar por línea solo aparece con alcance sobre todas las líneas', () => {
    const targets = (ctx) =>
      toursFor(ctx)
        .find((t) => t.id === 'basico')
        .steps.map((s) => s.target)
    expect(targets(BASE)).not.toContain('scope')
    expect(targets({ ...BASE, canViewAll: true })).toContain('scope')
  })

  it('ningún paso de coordinación llega a quien no coordina', () => {
    const visibles = toursFor(BASE).flatMap((t) => t.steps)
    expect(visibles.some((s) => /agenda cada solicitud|reagendar/i.test(s.texto))).toBe(false)
  })
})

describe('pautasTours — integridad', () => {
  it('cada recorrido tiene pasos con título y texto, e ids únicos', () => {
    expect(new Set(PAUTAS_TOURS.map((t) => t.id)).size).toBe(PAUTAS_TOURS.length)
    for (const tour of PAUTAS_TOURS) {
      expect(tour.steps.length).toBeGreaterThan(0)
      for (const step of tour.steps) {
        expect(step.titulo).toBeTruthy()
        expect(step.texto).toBeTruthy()
      }
    }
  })

  it('todo target declarado existe como data-tour en los componentes de Pautas', () => {
    const dir = join(__dirname, '../components/pautas')
    const source = readdirSync(dir)
      .filter((f) => f.endsWith('.jsx'))
      .map((f) => readFileSync(join(dir, f), 'utf8'))
      .join('\n')
    // `tour="x"` es la prop que Seccion convierte en data-tour.
    const targets = new Set(
      PAUTAS_TOURS.flatMap((t) => t.steps.map((s) => s.target)).filter(Boolean),
    )
    for (const target of targets) {
      const declared =
        source.includes(`data-tour="${target}"`) || source.includes(`tour="${target}"`)
      expect(declared, `falta data-tour="${target}"`).toBe(true)
    }
  })
})
