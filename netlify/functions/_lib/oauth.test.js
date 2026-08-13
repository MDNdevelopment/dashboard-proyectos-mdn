import { describe, it, expect, beforeEach } from 'vitest'
import { createHash } from 'crypto'

process.env.MCP_OAUTH_SIGNING_SECRET = 'test-signing-secret'
process.env.MCP_URL_SECRET = 'the-shared-passphrase'

const { handler } = await import('../oauth.js')
const { verifyToken } = await import('./oauthCrypto.js')

const HEADERS = { host: 'gestion.mdnpublicidad.com', 'x-forwarded-proto': 'https' }

function makeEvent({
  method = 'GET',
  path,
  query,
  body,
  headers = HEADERS,
  contentType = 'application/json',
} = {}) {
  return {
    httpMethod: method,
    path,
    headers: body !== undefined ? { ...headers, 'content-type': contentType } : headers,
    queryStringParameters: query,
    body:
      body === undefined
        ? undefined
        : contentType === 'application/json'
          ? JSON.stringify(body)
          : new URLSearchParams(body).toString(),
  }
}

function pkcePair() {
  const codeVerifier = 'a-fixed-code-verifier-string-that-is-long-enough-1234567890'
  const codeChallenge = createHash('sha256').update(codeVerifier).digest('base64url')
  return { codeVerifier, codeChallenge }
}

async function registerClient(redirectUri = 'https://claude.ai/api/mcp/callback') {
  const res = await handler(
    makeEvent({
      method: 'POST',
      path: '/oauth/register',
      body: { redirect_uris: [redirectUri], client_name: 'Claude' },
    }),
  )
  return JSON.parse(res.body)
}

describe('oauth.js handler', () => {
  beforeEach(() => {
    process.env.MCP_OAUTH_SIGNING_SECRET = 'test-signing-secret'
    process.env.MCP_URL_SECRET = 'the-shared-passphrase'
  })

  it('responde 204 con headers CORS a OPTIONS', async () => {
    const res = await handler(makeEvent({ method: 'OPTIONS', path: '/oauth/token' }))
    expect(res.statusCode).toBe(204)
    expect(res.headers['Access-Control-Allow-Origin']).toBe('*')
  })

  it('responde 404 para una ruta desconocida', async () => {
    const res = await handler(makeEvent({ path: '/not/a/route' }))
    expect(res.statusCode).toBe(404)
  })

  describe('.well-known', () => {
    it('protected-resource devuelve resource y authorization_servers con el origen del request', async () => {
      const res = await handler(makeEvent({ path: '/.well-known/oauth-protected-resource' }))
      const parsed = JSON.parse(res.body)
      expect(parsed.resource).toBe('https://gestion.mdnpublicidad.com/mcp')
      expect(parsed.authorization_servers).toEqual(['https://gestion.mdnpublicidad.com'])
    })

    it('protected-resource también responde en la variante /mcp', async () => {
      const res = await handler(makeEvent({ path: '/.well-known/oauth-protected-resource/mcp' }))
      expect(res.statusCode).toBe(200)
    })

    it('authorization-server metadata incluye los endpoints y PKCE S256', async () => {
      const res = await handler(makeEvent({ path: '/.well-known/oauth-authorization-server' }))
      const parsed = JSON.parse(res.body)
      expect(parsed.authorization_endpoint).toBe(
        'https://gestion.mdnpublicidad.com/oauth/authorize',
      )
      expect(parsed.token_endpoint).toBe('https://gestion.mdnpublicidad.com/oauth/token')
      expect(parsed.registration_endpoint).toBe('https://gestion.mdnpublicidad.com/oauth/register')
      expect(parsed.code_challenge_methods_supported).toEqual(['S256'])
    })
  })

  describe('/oauth/register', () => {
    it('rechaza sin redirect_uris', async () => {
      const res = await handler(makeEvent({ method: 'POST', path: '/oauth/register', body: {} }))
      expect(res.statusCode).toBe(400)
    })

    it('emite un client_id auto-verificable con los redirect_uris registrados', async () => {
      const client = await registerClient('https://claude.ai/cb')
      expect(client.token_endpoint_auth_method).toBe('none')
      const decoded = verifyToken(client.client_id)
      expect(decoded).toMatchObject({ type: 'client', redirect_uris: ['https://claude.ai/cb'] })
    })
  })

  describe('/oauth/authorize', () => {
    it('GET rechaza response_type distinto de code', async () => {
      const client = await registerClient()
      const res = await handler(
        makeEvent({
          path: '/oauth/authorize',
          query: {
            response_type: 'token',
            client_id: client.client_id,
            redirect_uri: client.redirect_uris[0],
          },
        }),
      )
      expect(res.statusCode).toBe(400)
    })

    it('GET rechaza sin code_challenge (PKCE obligatorio)', async () => {
      const client = await registerClient()
      const res = await handler(
        makeEvent({
          path: '/oauth/authorize',
          query: {
            response_type: 'code',
            client_id: client.client_id,
            redirect_uri: client.redirect_uris[0],
          },
        }),
      )
      expect(res.statusCode).toBe(400)
    })

    it('GET rechaza un client_id inválido', async () => {
      const { codeChallenge } = pkcePair()
      const res = await handler(
        makeEvent({
          path: '/oauth/authorize',
          query: {
            response_type: 'code',
            client_id: 'not-a-valid-token',
            redirect_uri: 'https://claude.ai/cb',
            code_challenge: codeChallenge,
            code_challenge_method: 'S256',
          },
        }),
      )
      expect(res.statusCode).toBe(400)
    })

    it('GET rechaza un redirect_uri no registrado para ese client', async () => {
      const client = await registerClient('https://claude.ai/cb')
      const { codeChallenge } = pkcePair()
      const res = await handler(
        makeEvent({
          path: '/oauth/authorize',
          query: {
            response_type: 'code',
            client_id: client.client_id,
            redirect_uri: 'https://evil.example/cb',
            code_challenge: codeChallenge,
            code_challenge_method: 'S256',
          },
        }),
      )
      expect(res.statusCode).toBe(400)
    })

    it('GET válido renderiza el formulario de consentimiento con los campos ocultos', async () => {
      const client = await registerClient('https://claude.ai/cb')
      const { codeChallenge } = pkcePair()
      const res = await handler(
        makeEvent({
          path: '/oauth/authorize',
          query: {
            response_type: 'code',
            client_id: client.client_id,
            redirect_uri: 'https://claude.ai/cb',
            state: 'xyz',
            code_challenge: codeChallenge,
            code_challenge_method: 'S256',
          },
        }),
      )
      expect(res.statusCode).toBe(200)
      expect(res.headers['Content-Type']).toContain('text/html')
      expect(res.body).toContain('name="passphrase"')
      expect(res.body).toContain(client.client_id)
    })

    it('POST con contraseña incorrecta re-renderiza el form con error, sin redirigir', async () => {
      const client = await registerClient('https://claude.ai/cb')
      const { codeChallenge } = pkcePair()
      const res = await handler(
        makeEvent({
          method: 'POST',
          path: '/oauth/authorize',
          contentType: 'application/x-www-form-urlencoded',
          body: {
            client_id: client.client_id,
            redirect_uri: 'https://claude.ai/cb',
            state: 'xyz',
            code_challenge: codeChallenge,
            passphrase: 'wrong-password',
          },
        }),
      )
      expect(res.statusCode).toBe(200)
      expect(res.body).toMatch(/incorrecta/i)
    })

    it('POST con contraseña correcta redirige con un code y el state original', async () => {
      const client = await registerClient('https://claude.ai/cb')
      const { codeChallenge } = pkcePair()
      const res = await handler(
        makeEvent({
          method: 'POST',
          path: '/oauth/authorize',
          contentType: 'application/x-www-form-urlencoded',
          body: {
            client_id: client.client_id,
            redirect_uri: 'https://claude.ai/cb',
            state: 'xyz',
            code_challenge: codeChallenge,
            passphrase: 'the-shared-passphrase',
          },
        }),
      )
      expect(res.statusCode).toBe(302)
      const location = new URL(res.headers.Location)
      expect(location.origin + location.pathname).toBe('https://claude.ai/cb')
      expect(location.searchParams.get('state')).toBe('xyz')
      expect(location.searchParams.get('code')).toBeTruthy()
      expect(verifyToken(location.searchParams.get('code'))).toMatchObject({ type: 'code' })
    })
  })

  describe('/oauth/token', () => {
    async function getAuthorizationCode(redirectUri = 'https://claude.ai/cb') {
      const client = await registerClient(redirectUri)
      const { codeVerifier, codeChallenge } = pkcePair()
      const authRes = await handler(
        makeEvent({
          method: 'POST',
          path: '/oauth/authorize',
          contentType: 'application/x-www-form-urlencoded',
          body: {
            client_id: client.client_id,
            redirect_uri: redirectUri,
            code_challenge: codeChallenge,
            passphrase: 'the-shared-passphrase',
          },
        }),
      )
      const code = new URL(authRes.headers.Location).searchParams.get('code')
      return { client, code, codeVerifier, redirectUri }
    }

    it('rechaza un grant_type distinto de authorization_code', async () => {
      const res = await handler(
        makeEvent({
          method: 'POST',
          path: '/oauth/token',
          contentType: 'application/x-www-form-urlencoded',
          body: { grant_type: 'client_credentials' },
        }),
      )
      expect(res.statusCode).toBe(400)
    })

    it('rechaza un code inválido', async () => {
      const res = await handler(
        makeEvent({
          method: 'POST',
          path: '/oauth/token',
          contentType: 'application/x-www-form-urlencoded',
          body: {
            grant_type: 'authorization_code',
            code: 'garbage',
            redirect_uri: 'https://claude.ai/cb',
            client_id: 'x',
            code_verifier: 'y',
          },
        }),
      )
      expect(res.statusCode).toBe(400)
    })

    it('rechaza si el client_id o redirect_uri no coinciden con los del code', async () => {
      const { code, codeVerifier } = await getAuthorizationCode()
      const res = await handler(
        makeEvent({
          method: 'POST',
          path: '/oauth/token',
          contentType: 'application/x-www-form-urlencoded',
          body: {
            grant_type: 'authorization_code',
            code,
            redirect_uri: 'https://distinto.example/cb',
            client_id: 'otro-client',
            code_verifier: codeVerifier,
          },
        }),
      )
      expect(res.statusCode).toBe(400)
    })

    it('rechaza si el code_verifier no coincide con el code_challenge (PKCE)', async () => {
      const { client, code, redirectUri } = await getAuthorizationCode()
      const res = await handler(
        makeEvent({
          method: 'POST',
          path: '/oauth/token',
          contentType: 'application/x-www-form-urlencoded',
          body: {
            grant_type: 'authorization_code',
            code,
            redirect_uri: redirectUri,
            client_id: client.client_id,
            code_verifier: 'wrong-verifier',
          },
        }),
      )
      expect(res.statusCode).toBe(400)
    })

    it('flujo completo: register → authorize → token emite un access_token Bearer válido', async () => {
      const { client, code, codeVerifier, redirectUri } = await getAuthorizationCode()
      const res = await handler(
        makeEvent({
          method: 'POST',
          path: '/oauth/token',
          contentType: 'application/x-www-form-urlencoded',
          body: {
            grant_type: 'authorization_code',
            code,
            redirect_uri: redirectUri,
            client_id: client.client_id,
            code_verifier: codeVerifier,
          },
        }),
      )
      const parsed = JSON.parse(res.body)
      expect(res.statusCode).toBe(200)
      expect(parsed.token_type).toBe('Bearer')
      expect(verifyToken(parsed.access_token)).toMatchObject({ type: 'access' })
    })
  })
})
