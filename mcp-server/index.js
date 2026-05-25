import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js'

const BASE_URL = process.env.MDN_API_BASE_URL
const TOKEN = process.env.MDN_API_TOKEN

if (!BASE_URL || !TOKEN) {
  process.stderr.write('Error: MDN_API_BASE_URL and MDN_API_TOKEN env vars are required\n')
  process.exit(1)
}

async function apiFetch(path) {
  const url = `${BASE_URL.replace(/\/$/, '')}${path}`
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${TOKEN}` },
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`API error ${res.status}: ${text}`)
  }
  return res.json()
}

const server = new Server(
  { name: 'mdn-projects-mcp', version: '1.0.0' },
  { capabilities: { tools: {} } }
)

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'list_projects',
      description: 'List all projects from the MDN Publicidad dashboard. Optionally filter by status or department.',
      inputSchema: {
        type: 'object',
        properties: {
          status: {
            type: 'string',
            description: 'Filter by project status: "Pendiente", "En proceso", or "Completado"',
            enum: ['Pendiente', 'En proceso', 'Completado'],
          },
          department: {
            type: 'string',
            description: 'Filter to projects that include this department: "Redes", "Diseño", "Audiovisual", or "Tecnología"',
            enum: ['Redes', 'Diseño', 'Audiovisual', 'Tecnología'],
          },
        },
        additionalProperties: false,
      },
    },
    {
      name: 'get_project',
      description: 'Get full details of a single project by its ID, including all phases and tasks.',
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'The UUID of the project' },
        },
        required: ['id'],
        additionalProperties: false,
      },
    },
  ],
}))

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params

  if (name === 'list_projects') {
    const params = new URLSearchParams()
    if (args?.status) params.set('status', args.status)
    if (args?.department) params.set('department', args.department)
    const qs = params.toString()
    const projects = await apiFetch(`/api/projects${qs ? `?${qs}` : ''}`)
    return {
      content: [{ type: 'text', text: JSON.stringify(projects, null, 2) }],
    }
  }

  if (name === 'get_project') {
    if (!args?.id) throw new Error('id is required')
    const project = await apiFetch(`/api/projects/${args.id}`)
    return {
      content: [{ type: 'text', text: JSON.stringify(project, null, 2) }],
    }
  }

  throw new Error(`Unknown tool: ${name}`)
})

const transport = new StdioServerTransport()
await server.connect(transport)
