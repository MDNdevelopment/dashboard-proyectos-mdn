import { describe, it, expect, beforeEach } from 'vitest'

describe('oauthCrypto', () => {
  let issueToken, verifyToken, secureCompare, pkceMatches, randomId

  beforeEach(async () => {
    process.env.MCP_OAUTH_SIGNING_SECRET = 'test-signing-secret'
    ;({ issueToken, verifyToken, secureCompare, pkceMatches, randomId } =
      await import('./oauthCrypto.js'))
  })

  describe('issueToken / verifyToken', () => {
    it('hace roundtrip de un payload simple', () => {
      const token = issueToken({ type: 'client', redirect_uris: ['https://x.test/cb'] })
      expect(verifyToken(token)).toEqual({ type: 'client', redirect_uris: ['https://x.test/cb'] })
    })

    it('rechaza un token sin punto separador', () => {
      expect(verifyToken('not-a-token')).toBeNull()
    })

    it('rechaza null/undefined/no-string', () => {
      expect(verifyToken(null)).toBeNull()
      expect(verifyToken(undefined)).toBeNull()
      expect(verifyToken(42)).toBeNull()
    })

    it('rechaza un token con la firma alterada', () => {
      const token = issueToken({ type: 'access' })
      const [body] = token.split('.')
      expect(verifyToken(`${body}.tamperedSignature`)).toBeNull()
    })

    it('rechaza un token con el body alterado (firma ya no coincide)', () => {
      const token = issueToken({ type: 'access' })
      const [, sig] = token.split('.')
      const forgedBody = Buffer.from(JSON.stringify({ type: 'access', admin: true })).toString(
        'base64url',
      )
      expect(verifyToken(`${forgedBody}.${sig}`)).toBeNull()
    })

    it('rechaza un token firmado con otro secreto', () => {
      const token = issueToken({ type: 'access' })
      process.env.MCP_OAUTH_SIGNING_SECRET = 'a-different-secret'
      expect(verifyToken(token)).toBeNull()
    })

    it('respeta exp: token vigente se acepta', () => {
      const token = issueToken({ type: 'code', exp: Date.now() + 60_000 })
      expect(verifyToken(token)).not.toBeNull()
    })

    it('respeta exp: token expirado se rechaza', () => {
      const token = issueToken({ type: 'code', exp: Date.now() - 1 })
      expect(verifyToken(token)).toBeNull()
    })
  })

  describe('secureCompare', () => {
    it('acepta valores iguales', () => {
      expect(secureCompare('abc123', 'abc123')).toBe(true)
    })

    it('rechaza valores distintos', () => {
      expect(secureCompare('abc123', 'xyz789')).toBe(false)
    })

    it('rechaza si falta alguno de los dos valores', () => {
      expect(secureCompare('', 'abc123')).toBe(false)
      expect(secureCompare('abc123', '')).toBe(false)
      expect(secureCompare(undefined, 'abc123')).toBe(false)
    })
  })

  describe('pkceMatches', () => {
    it('acepta el par verifier/challenge correcto (S256)', async () => {
      const { createHash } = await import('crypto')
      const verifier = 'a-random-code-verifier-value-1234567890'
      const challenge = createHash('sha256').update(verifier).digest('base64url')
      expect(pkceMatches(verifier, challenge)).toBe(true)
    })

    it('rechaza un verifier que no corresponde al challenge', () => {
      expect(pkceMatches('wrong-verifier', 'some-challenge')).toBe(false)
    })

    it('rechaza si falta verifier o challenge', () => {
      expect(pkceMatches('', 'challenge')).toBe(false)
      expect(pkceMatches('verifier', '')).toBe(false)
    })
  })

  describe('randomId', () => {
    it('genera valores distintos en llamadas sucesivas', () => {
      expect(randomId()).not.toBe(randomId())
    })
  })
})
