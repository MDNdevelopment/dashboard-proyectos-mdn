import { createHmac, createHash, timingSafeEqual, randomBytes } from 'crypto'

/**
 * Firma/verifica payloads opacos (client_id, authorization code, access
 * token) con HMAC-SHA256, sin persistir nada en una base de datos: cada
 * token se auto-valida (firma + expiración embebida). Encaja con Netlify
 * Functions, que son stateless entre invocaciones.
 */
function getSigningSecret() {
  const secret = process.env.MCP_OAUTH_SIGNING_SECRET
  if (!secret) throw new Error('MCP_OAUTH_SIGNING_SECRET no configurada')
  return secret
}

function sign(body) {
  return createHmac('sha256', getSigningSecret()).update(body).digest('base64url')
}

export function issueToken(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url')
  return `${body}.${sign(body)}`
}

export function verifyToken(token) {
  if (typeof token !== 'string' || !token.includes('.')) return null
  const [body, sig] = token.split('.')
  if (!body || !sig) return null

  const expectedSig = sign(body)
  const a = Buffer.from(sig)
  const b = Buffer.from(expectedSig)
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null

  let payload
  try {
    payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'))
  } catch {
    return null
  }
  if (typeof payload.exp === 'number' && Date.now() > payload.exp) return null
  return payload
}

/** Comparación en tiempo constante de dos strings de igual longitud lógica (via hash). */
export function secureCompare(provided, expected) {
  if (!provided || !expected) return false
  const a = createHash('sha256').update(provided).digest()
  const b = createHash('sha256').update(expected).digest()
  return timingSafeEqual(a, b)
}

export function pkceMatches(codeVerifier, codeChallenge) {
  if (!codeVerifier || !codeChallenge) return false
  const hash = createHash('sha256').update(codeVerifier).digest('base64url')
  return hash === codeChallenge
}

export function randomId(bytes = 16) {
  return randomBytes(bytes).toString('base64url')
}
