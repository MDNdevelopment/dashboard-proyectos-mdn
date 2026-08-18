import { GoogleGenAI } from '@google/genai'
import { supabase } from './_lib/supabase.js'
import { requireUser } from './_lib/requireUser.js'
import { buildCeoSnapshot } from './_lib/ceoSnapshot.js'
import { CEO_ANALYSIS_USER_IDS } from '../../src/lib/ceoAnalysisAccess.js'

const json = (statusCode, body) => ({
  statusCode,
  headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  body: JSON.stringify(body),
})

// Caché diaria: si el análisis se generó hoy, se sirve tal cual (salvo refresh manual).
const CACHE_TTL_MS = 24 * 60 * 60 * 1000

const CEO_SYSTEM_INSTRUCTION = `
Eres el analista ejecutivo de MDN Publicidad, una agencia de publicidad venezolana. Escribes
un resumen breve para el CEO, que lo revisa en segundos desde el inicio del dashboard.

Tono: directo, conciso, sin jerga técnica ni relleno. Cada bullet es una sola frase. Español
de Venezuela. Cifras en USD con el símbolo $. No inventes datos: si falta información para
una sección, omite esa sección o deja el array vacío en vez de especular.

Recibirás un JSON con indicadores agregados de la empresa del mes cerrado más reciente
(score operativo por línea, finanzas, tareas, crecimiento de seguidores, reuniones, clientes,
leads). Con eso, responde ÚNICAMENTE un JSON con esta forma exacta (valores en español):

{
  "estado_general": {
    "semaforo": "verde" | "amarillo" | "rojo",
    "titulo": "3 a 6 palabras",
    "resumen": "1-2 frases: cómo va la empresa este mes"
  },
  "metricas_clave": [
    { "label": "string corto", "valor": "string ya formateado, ej. '+$3.200'", "tendencia": "sube" | "baja" | "estable" }
  ],
  "fortalezas": ["1 frase cada una, 2-3 items, qué está funcionando bien"],
  "areas_mejora": ["1 frase cada una, 2-3 items, qué se puede mejorar (no urgente)"],
  "criticos": [
    { "area": "nombre corto", "problema": "1 frase", "accion": "1 frase: acción concreta recomendada" }
  ]
}

Reglas:
- "metricas_clave": máximo 4, prioriza rentabilidad del mes (diferencia ingresos-egresos), score
  operativo promedio, % de tareas a tiempo y crecimiento de seguidores vs meta.
- Semáforo: rojo si la diferencia financiera es negativa, o el score < 60, o más del 30% de las
  tareas activas están atrasadas. Amarillo si hay señales mixtas. Verde si las finanzas son
  positivas y el score es >= 75.
- "criticos": máximo 3, puede ser un array vacío si no hay nada urgente. Cada uno debe traer una
  acción concreta, no solo describir el problema.
- Responde solo el JSON, sin texto adicional ni markdown.
`

export const handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method Not Allowed' })

  if (!process.env.GEMINI_API_KEY) return json(500, { error: 'IA no configurada' })

  const { error: authError, caller } = await requireUser(event)
  if (authError) return authError

  if (!CEO_ANALYSIS_USER_IDS.includes(caller.user_id)) {
    return json(403, { error: 'Forbidden' })
  }

  let body
  try {
    body = JSON.parse(event.body ?? '{}')
  } catch {
    return json(400, { error: 'Body JSON inválido' })
  }
  const forceRefresh = body.refresh === true

  // 1. Revisar caché.
  const { data: cached, error: cacheErr } = await supabase
    .from('ceo_analysis')
    .select('data, generated_at')
    .eq('company_id', caller.company_id)
    .maybeSingle()
  if (cacheErr) return json(500, { error: cacheErr.message })

  if (
    !forceRefresh &&
    cached &&
    Date.now() - new Date(cached.generated_at).getTime() < CACHE_TTL_MS
  ) {
    return json(200, { ...cached.data, generated_at: cached.generated_at, cached: true })
  }

  // 2. Determinar el mes cerrado más reciente a analizar (mismo criterio que el Home: el
  // mes anterior al actual, salvo en enero donde cae a diciembre del año pasado).
  const today = new Date()
  const currentMonth = today.getMonth() + 1
  const referenceMonth = currentMonth === 1 ? 12 : currentMonth - 1
  const referenceYear = currentMonth === 1 ? today.getFullYear() - 1 : today.getFullYear()

  // 3. Cargar datos crudos de la empresa (service-role, filtrado manual por company_id).
  const companyId = caller.company_id
  const [linesRes, reportsRes, tasksRes, clientsRes, campaignsRes, leadsRes] = await Promise.all([
    supabase
      .from('metric_lines')
      .select('id, name, color')
      .eq('company_id', companyId)
      .eq('is_general', false),
    supabase
      .from('metric_reports')
      .select('line_id, year, month, data')
      .eq('company_id', companyId),
    supabase.from('tasks').select('status, due_date, closed_date').eq('company_id', companyId),
    supabase.from('metric_clients').select('deleted_at').eq('company_id', companyId),
    supabase.from('paid_campaigns').select('amount, start_date').eq('company_id', companyId),
    supabase.from('leads').select('status'),
  ])
  const firstError = [linesRes, reportsRes, tasksRes, clientsRes, campaignsRes, leadsRes].find(
    (r) => r.error,
  )
  if (firstError) return json(500, { error: firstError.error.message })

  const snapshot = buildCeoSnapshot({
    lines: linesRes.data ?? [],
    reports: reportsRes.data ?? [],
    tasks: tasksRes.data ?? [],
    clients: clientsRes.data ?? [],
    campaigns: campaignsRes.data ?? [],
    leads: leadsRes.data ?? [],
    referenceYear,
    referenceMonth,
  })

  // 4. Llamar a Gemini.
  let parsed
  try {
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY })
    const response = await ai.models.generateContent({
      model: 'gemini-3.6-flash',
      contents:
        'Analiza estos indicadores de la empresa y genera el resumen ejecutivo: ' +
        JSON.stringify(snapshot),
      config: {
        maxOutputTokens: 4000,
        temperature: 0.7,
        responseMimeType: 'application/json',
        systemInstruction: CEO_SYSTEM_INSTRUCTION,
        thinkingConfig: { thinkingLevel: 'low' },
      },
    })
    if (!response.text) throw new Error('Sin respuesta de texto de Gemini')
    parsed = JSON.parse(response.text)
  } catch (err) {
    console.error('Error Gemini:', err)
    return json(502, { error: 'Error al generar el análisis' })
  }

  // 5. Persistir en caché.
  const generatedAt = new Date().toISOString()
  const { error: upsertErr } = await supabase.from('ceo_analysis').upsert(
    {
      company_id: companyId,
      data: parsed,
      generated_at: generatedAt,
      generated_by: caller.user_id,
    },
    { onConflict: 'company_id' },
  )
  if (upsertErr) console.error('Error guardando caché de ceo_analysis:', upsertErr)

  return json(200, { ...parsed, generated_at: generatedAt, cached: false })
}
