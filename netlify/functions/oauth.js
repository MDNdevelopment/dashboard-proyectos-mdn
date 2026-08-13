import { issueToken, verifyToken, secureCompare, pkceMatches } from './_lib/oauthCrypto.js'

const CODE_TTL_MS = 5 * 60 * 1000 // 5 min, igual que un code OAuth normal
const ACCESS_TOKEN_TTL_MS = 90 * 24 * 60 * 60 * 1000 // 90 días — sin refresh_token (uso interno, 2-3 personas)

const json = (statusCode, body, extraHeaders = {}) => ({
  statusCode,
  headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...extraHeaders },
  body: JSON.stringify(body),
})

const html = (statusCode, bodyHtml) => ({
  statusCode,
  headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
  body: bodyHtml,
})

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}

function getOrigin(event) {
  const host = event.headers?.['x-forwarded-host'] ?? event.headers?.host ?? event.headers?.Host
  const proto = event.headers?.['x-forwarded-proto'] ?? 'https'
  return `${proto}://${host}`
}

function escapeHtml(str) {
  return String(str ?? '').replace(
    /[&<>"']/g,
    (c) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
      })[c],
  )
}

function parseBody(event) {
  const contentType = event.headers?.['content-type'] ?? event.headers?.['Content-Type'] ?? ''
  const raw = event.body ?? ''
  if (contentType.includes('application/json')) {
    try {
      return JSON.parse(raw || '{}')
    } catch {
      return {}
    }
  }
  return Object.fromEntries(new URLSearchParams(raw))
}

// --- .well-known ------------------------------------------------------

function protectedResourceMetadata(event) {
  const origin = getOrigin(event)
  return json(200, { resource: `${origin}/mcp`, authorization_servers: [origin] })
}

function authorizationServerMetadata(event) {
  const origin = getOrigin(event)
  return json(200, {
    issuer: origin,
    authorization_endpoint: `${origin}/oauth/authorize`,
    token_endpoint: `${origin}/oauth/token`,
    registration_endpoint: `${origin}/oauth/register`,
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code'],
    code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: ['none'],
  })
}

// --- Dynamic Client Registration (RFC 7591) ---------------------------

function registerClient(event) {
  const body = parseBody(event)
  const redirectUris = Array.isArray(body.redirect_uris)
    ? body.redirect_uris.filter((u) => typeof u === 'string')
    : []
  if (redirectUris.length === 0) {
    return json(400, {
      error: 'invalid_client_metadata',
      error_description: 'redirect_uris es requerido',
    })
  }

  const clientId = issueToken({
    type: 'client',
    redirect_uris: redirectUris,
    name: body.client_name ?? 'MCP client',
  })

  return json(201, {
    client_id: clientId,
    client_id_issued_at: Math.floor(Date.now() / 1000),
    redirect_uris: redirectUris,
    grant_types: ['authorization_code'],
    response_types: ['code'],
    token_endpoint_auth_method: 'none',
  })
}

// --- Authorize (consent) -----------------------------------------------

function renderAuthorizeForm({ clientId, redirectUri, state, codeChallenge, error }) {
  return html(
    200,
    `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Conectar con MDN Gestión</title>
  <style>
    body { font-family: -apple-system, sans-serif; background: #f2f0e8; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; }
    form { background: #fff; padding: 2rem; border-radius: 12px; box-shadow: 0 2px 12px rgba(0,0,0,.1); width: 100%; max-width: 360px; }
    h1 { font-size: 1.1rem; margin: 0 0 1rem; }
    input[type=password] { width: 100%; box-sizing: border-box; padding: .6rem; border: 1px solid #ccc; border-radius: 6px; font-size: 1rem; }
    button { margin-top: 1rem; width: 100%; padding: .7rem; background: #FFB800; border: none; border-radius: 6px; font-weight: 600; cursor: pointer; }
    .error { color: #c0392b; font-size: .85rem; margin-top: .5rem; }
  </style>
</head>
<body>
  <form method="POST" action="/oauth/authorize">
    <h1>Acceso de solo lectura a la base de datos de MDN</h1>
    <p>Ingresa la contraseña de acceso que te dio el administrador.</p>
    <input type="password" name="passphrase" placeholder="Contraseña" autofocus required />
    <input type="hidden" name="client_id" value="${escapeHtml(clientId)}" />
    <input type="hidden" name="redirect_uri" value="${escapeHtml(redirectUri)}" />
    <input type="hidden" name="state" value="${escapeHtml(state ?? '')}" />
    <input type="hidden" name="code_challenge" value="${escapeHtml(codeChallenge)}" />
    <button type="submit">Autorizar acceso</button>
    ${error ? `<p class="error">${escapeHtml(error)}</p>` : ''}
  </form>
</body>
</html>`,
  )
}

function validateClientAndRedirect({ clientId, redirectUri }) {
  const client = verifyToken(clientId)
  if (!client || client.type !== 'client') return { error: 'client_id inválido o expirado' }
  if (!client.redirect_uris.includes(redirectUri))
    return { error: 'redirect_uri no registrado para este cliente' }
  return { client }
}

function authorizeGet(event) {
  const params = new URLSearchParams(event.queryStringParameters ?? {})
  const clientId = params.get('client_id') ?? ''
  const redirectUri = params.get('redirect_uri') ?? ''
  const state = params.get('state') ?? ''
  const codeChallenge = params.get('code_challenge') ?? ''
  const codeChallengeMethod = params.get('code_challenge_method') ?? ''

  if (params.get('response_type') !== 'code') {
    return json(400, { error: 'unsupported_response_type' })
  }
  if (codeChallengeMethod !== 'S256' || !codeChallenge) {
    return json(400, { error: 'invalid_request', error_description: 'Se requiere PKCE (S256)' })
  }

  const { error } = validateClientAndRedirect({ clientId, redirectUri })
  if (error) return json(400, { error: 'invalid_request', error_description: error })

  return renderAuthorizeForm({ clientId, redirectUri, state, codeChallenge })
}

function authorizePost(event) {
  const body = parseBody(event)
  const {
    client_id: clientId,
    redirect_uri: redirectUri,
    state,
    code_challenge: codeChallenge,
    passphrase,
  } = body

  const { error } = validateClientAndRedirect({ clientId, redirectUri })
  if (error) return json(400, { error: 'invalid_request', error_description: error })

  if (!secureCompare(passphrase, process.env.MCP_URL_SECRET ?? '')) {
    return renderAuthorizeForm({
      clientId,
      redirectUri,
      state,
      codeChallenge,
      error: 'Contraseña incorrecta',
    })
  }

  const code = issueToken({
    type: 'code',
    client_id: clientId,
    redirect_uri: redirectUri,
    code_challenge: codeChallenge,
    exp: Date.now() + CODE_TTL_MS,
  })

  const redirectUrl = new URL(redirectUri)
  redirectUrl.searchParams.set('code', code)
  if (state) redirectUrl.searchParams.set('state', state)

  return { statusCode: 302, headers: { Location: redirectUrl.toString() }, body: '' }
}

// --- Token ---------------------------------------------------------------

function tokenEndpoint(event) {
  const body = parseBody(event)
  const {
    grant_type: grantType,
    code,
    redirect_uri: redirectUri,
    client_id: clientId,
    code_verifier: codeVerifier,
  } = body

  if (grantType !== 'authorization_code') {
    return json(400, { error: 'unsupported_grant_type' })
  }

  const codePayload = verifyToken(code)
  if (!codePayload || codePayload.type !== 'code') {
    return json(400, { error: 'invalid_grant', error_description: 'code inválido o expirado' })
  }
  if (codePayload.client_id !== clientId || codePayload.redirect_uri !== redirectUri) {
    return json(400, {
      error: 'invalid_grant',
      error_description: 'client_id o redirect_uri no coinciden con el code',
    })
  }
  if (!pkceMatches(codeVerifier, codePayload.code_challenge)) {
    return json(400, {
      error: 'invalid_grant',
      error_description: 'code_verifier no coincide con code_challenge',
    })
  }

  const accessToken = issueToken({ type: 'access', exp: Date.now() + ACCESS_TOKEN_TTL_MS })

  return json(200, {
    access_token: accessToken,
    token_type: 'Bearer',
    expires_in: Math.floor(ACCESS_TOKEN_TTL_MS / 1000),
    scope: 'mcp',
  })
}

// --- Router ----------------------------------------------------------------

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: CORS_HEADERS, body: '' }
  }

  const path = event.path.replace(/\/$/, '')

  try {
    if (
      path.endsWith('/.well-known/oauth-protected-resource') ||
      path.endsWith('/.well-known/oauth-protected-resource/mcp')
    ) {
      return protectedResourceMetadata(event)
    }
    if (path.endsWith('/.well-known/oauth-authorization-server')) {
      return authorizationServerMetadata(event)
    }
    if (path.endsWith('/oauth/register') && event.httpMethod === 'POST') {
      return registerClient(event)
    }
    if (path.endsWith('/oauth/authorize') && event.httpMethod === 'GET') {
      return authorizeGet(event)
    }
    if (path.endsWith('/oauth/authorize') && event.httpMethod === 'POST') {
      return authorizePost(event)
    }
    if (path.endsWith('/oauth/token') && event.httpMethod === 'POST') {
      return tokenEndpoint(event)
    }
    return json(404, { error: 'not_found' })
  } catch (err) {
    console.error('OAuth error:', err)
    return json(500, { error: 'server_error' })
  }
}
