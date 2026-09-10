import { validateFeedback, buildFeedbackRow } from '../lib/feedback'

describe('validateFeedback', () => {
  it('rechaza un tipo inválido', () => {
    const result = validateFeedback({ type: 'otro', message: 'un mensaje largo de prueba' })
    expect(result.ok).toBe(false)
  })

  it('rechaza un mensaje vacío', () => {
    const result = validateFeedback({ type: 'error', message: '' })
    expect(result.ok).toBe(false)
  })

  it('rechaza un mensaje demasiado corto', () => {
    const result = validateFeedback({ type: 'recomendacion', message: 'corto' })
    expect(result.ok).toBe(false)
  })

  it('rechaza un mensaje demasiado largo', () => {
    const result = validateFeedback({ type: 'error', message: 'x'.repeat(2001) })
    expect(result.ok).toBe(false)
  })

  it('acepta un mensaje válido', () => {
    const result = validateFeedback({
      type: 'recomendacion',
      message: 'Esto es una recomendación válida de prueba.',
    })
    expect(result.ok).toBe(true)
  })
})

describe('buildFeedbackRow', () => {
  it('no incluye ningún campo que identifique al autor', () => {
    const row = buildFeedbackRow({
      type: 'error',
      area: 'Proyectos',
      message: 'Encontré un error en el módulo de proyectos.',
      companyId: 'company-1',
    })
    const keys = Object.keys(row)
    expect(keys).not.toContain('user_id')
    expect(keys).not.toContain('email')
    expect(keys).not.toContain('first_name')
    expect(keys).not.toContain('last_name')
    expect(keys).not.toContain('author')
    expect(keys.sort()).toEqual(['area', 'company_id', 'message', 'type'].sort())
  })

  it('normaliza area vacía a null', () => {
    const row = buildFeedbackRow({
      type: 'recomendacion',
      area: '   ',
      message: 'Una recomendación sin área específica.',
      companyId: 'company-1',
    })
    expect(row.area).toBeNull()
  })

  it('recorta espacios del mensaje y el área', () => {
    const row = buildFeedbackRow({
      type: 'recomendacion',
      area: '  Empresa  ',
      message: '  Un mensaje con espacios alrededor.  ',
      companyId: 'company-1',
    })
    expect(row.area).toBe('Empresa')
    expect(row.message).toBe('Un mensaje con espacios alrededor.')
  })
})
