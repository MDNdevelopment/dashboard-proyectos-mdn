import { timingSafeEqual, createHash } from 'crypto'

export function requireBearer(event) {
  const header = event.headers?.authorization ?? event.headers?.Authorization ?? ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : ''
  const expected = process.env.MCP_API_TOKEN ?? ''

  if (!token || !expected) {
    return { statusCode: 401, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Unauthorized' }) }
  }

  // constant-time comparison via fixed-length hashes
  const a = createHash('sha256').update(token).digest()
  const b = createHash('sha256').update(expected).digest()
  if (!timingSafeEqual(a, b)) {
    return { statusCode: 401, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Unauthorized' }) }
  }

  return null
}
