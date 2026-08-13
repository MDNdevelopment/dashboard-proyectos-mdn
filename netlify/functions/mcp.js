import { runReadOnlyQuery, listTables } from './_lib/db.js'
import { verifyToken } from './_lib/oauthCrypto.js'

const json = (statusCode, body, extraHeaders = {}) => ({
  statusCode,
  headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...extraHeaders },
  body: JSON.stringify(body),
})

function getOrigin(event) {
  const host = event.headers?.['x-forwarded-host'] ?? event.headers?.host ?? event.headers?.Host
  const proto = event.headers?.['x-forwarded-proto'] ?? 'https'
  return `${proto}://${host}`
}

/**
 * El cliente MCP se autentica con un access_token Bearer emitido por
 * netlify/functions/oauth.js (flujo OAuth 2.1 + PKCE con Dynamic Client
 * Registration, el único modelo de auth que hoy soporta el conector remoto
 * de Claude). El token es auto-verificable (HMAC + expiración), sin sesión
 * ni tabla de tokens que mantener.
 */
export function checkBearerToken(event) {
  const header = event.headers?.authorization ?? event.headers?.Authorization ?? ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : ''
  const payload = verifyToken(token)
  return payload?.type === 'access'
}

const TOOLS = [
  {
    name: 'list_tables',
    description:
      'Lista las tablas y columnas disponibles en la base de datos (schema public) para saber qué se puede consultar con query_database.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'query_database',
    description:
      'Ejecuta una consulta SQL de solo lectura (SELECT o WITH...SELECT) sobre la base de datos y devuelve las filas resultantes. Usa list_tables primero para conocer el esquema.',
    inputSchema: {
      type: 'object',
      properties: {
        sql: { type: 'string', description: 'Consulta SQL: un único SELECT o WITH...SELECT' },
        limit: {
          type: 'number',
          description: 'Máximo de filas a devolver (por defecto 500, tope 1000)',
        },
      },
      required: ['sql'],
      additionalProperties: false,
    },
  },
]

async function callTool(name, args) {
  if (name === 'list_tables') {
    const rows = await listTables()
    return { content: [{ type: 'text', text: JSON.stringify(rows, null, 2) }] }
  }
  if (name === 'query_database') {
    if (!args?.sql) throw new Error('sql es requerido')
    const { rows, rowCount } = await runReadOnlyQuery(args.sql, args.limit)
    return { content: [{ type: 'text', text: JSON.stringify({ rowCount, rows }, null, 2) }] }
  }
  throw new Error(`Unknown tool: ${name}`)
}

const rpcResult = (id, result) => ({ jsonrpc: '2.0', id, result })
const rpcError = (id, code, message) => ({ jsonrpc: '2.0', id, error: { code, message } })

/**
 * Servidor MCP remoto, stateless, sobre HTTP (Netlify Function). Implementa a
 * mano la superficie mínima de JSON-RPC 2.0 que necesita un cliente MCP
 * (initialize / notifications/initialized / ping / tools/list / tools/call)
 * en vez de usar StreamableHTTPServerTransport del SDK, que asume objetos
 * req/res de Node y no la firma event→response de Netlify Functions.
 */
export const handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method Not Allowed' })
  if (!checkBearerToken(event)) {
    const origin = getOrigin(event)
    return json(
      401,
      { error: 'Unauthorized' },
      {
        'WWW-Authenticate': `Bearer resource_metadata="${origin}/.well-known/oauth-protected-resource"`,
      },
    )
  }

  let body
  try {
    body = JSON.parse(event.body ?? '{}')
  } catch {
    return json(400, rpcError(null, -32700, 'Parse error'))
  }

  const { id = null, method, params } = body ?? {}

  try {
    if (method === 'initialize') {
      return json(
        200,
        rpcResult(id, {
          protocolVersion: '2024-11-05',
          capabilities: { tools: {} },
          serverInfo: { name: 'mdn-db-mcp', version: '1.0.0' },
        }),
      )
    }

    if (method === 'notifications/initialized') {
      // Es una notificación (sin id): no requiere cuerpo de respuesta.
      return { statusCode: 202, headers: {}, body: '' }
    }

    if (method === 'ping') {
      return json(200, rpcResult(id, {}))
    }

    if (method === 'tools/list') {
      return json(200, rpcResult(id, { tools: TOOLS }))
    }

    if (method === 'tools/call') {
      const { name, arguments: args } = params ?? {}
      try {
        const result = await callTool(name, args)
        return json(200, rpcResult(id, result))
      } catch (err) {
        // Los errores de ejecución de una tool van como resultado con isError,
        // no como error de transporte JSON-RPC (así lo espera el protocolo MCP).
        return json(
          200,
          rpcResult(id, { content: [{ type: 'text', text: err.message }], isError: true }),
        )
      }
    }

    return json(200, rpcError(id, -32601, `Method not found: ${method}`))
  } catch (err) {
    console.error('MCP error:', err)
    return json(200, rpcError(id, -32603, 'Internal error'))
  }
}
