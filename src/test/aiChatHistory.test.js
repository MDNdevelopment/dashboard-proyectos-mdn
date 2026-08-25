import { describe, it, expect } from 'vitest'
import { trimHistory, MAX_MESSAGES } from '../lib/aiChatHistory'

describe('trimHistory', () => {
  it('conserva todo si no supera el máximo', () => {
    const msgs = [
      { role: 'user', text: 'a' },
      { role: 'assistant', text: 'b' },
    ]
    expect(trimHistory(msgs, 10)).toEqual(msgs)
  })

  it('recorta a los últimos N mensajes', () => {
    const msgs = Array.from({ length: 30 }, (_, i) => ({
      role: i % 2 === 0 ? 'user' : 'assistant',
      text: `m${i}`,
    }))
    const trimmed = trimHistory(msgs, 10)
    expect(trimmed).toHaveLength(10)
    expect(trimmed[trimmed.length - 1].text).toBe('m29')
  })

  it('garantiza que el primer mensaje sea de role user', () => {
    const msgs = [
      { role: 'assistant', text: 'huerfano' },
      { role: 'user', text: 'primero real' },
      { role: 'assistant', text: 'respuesta' },
    ]
    const trimmed = trimHistory(msgs, 3)
    expect(trimmed[0].role).toBe('user')
    expect(trimmed[0].text).toBe('primero real')
  })

  it('usa MAX_MESSAGES como default', () => {
    const msgs = Array.from({ length: MAX_MESSAGES + 5 }, (_, i) => ({
      role: 'user',
      text: `m${i}`,
    }))
    expect(trimHistory(msgs)).toHaveLength(MAX_MESSAGES)
  })
})
