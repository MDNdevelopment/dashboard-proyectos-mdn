import { supabase } from './_lib/supabase.js'
import { requireBearer } from './_lib/auth.js'

const json = (statusCode, body) => ({
  statusCode,
  headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  body: JSON.stringify(body),
})

const normalize = (row) => ({ ...row, createdAt: row.created_at })

export const handler = async (event) => {
  if (event.httpMethod !== 'GET') return json(405, { error: 'Method Not Allowed' })

  const authError = requireBearer(event)
  if (authError) return authError

  // extract optional :id from path — supports /api/projects or /api/projects/:id
  const segments = event.path.replace(/\/$/, '').split('/')
  const lastSegment = segments[segments.length - 1]
  const isDetail = lastSegment && lastSegment !== 'projects'

  if (isDetail) {
    const { data, error } = await supabase
      .from('projects')
      .select('*')
      .eq('id', lastSegment)
      .single()

    if (error || !data) return json(404, { error: 'Not found' })
    return json(200, normalize(data))
  }

  // list with optional filters
  const params = event.queryStringParameters ?? {}
  let query = supabase.from('projects').select('*').order('created_at', { ascending: false })

  if (params.status) query = query.eq('status', params.status)
  if (params.department) query = query.contains('departments', [params.department])

  const { data, error } = await query
  if (error) return json(500, { error: error.message })

  return json(200, data.map(normalize))
}
