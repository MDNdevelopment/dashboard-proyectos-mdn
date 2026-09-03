import { supabase } from './_lib/supabase.js'
import { requireAdmin } from './_lib/requireAdmin.js'
import { buildAvWorkloadSnapshot } from './_lib/avWorkloadSnapshot.js'
import { normalizeDatesToDDMMYYYY } from './_lib/dateFormat.js'

const json = (statusCode, body) => ({
  statusCode,
  headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  body: JSON.stringify(body),
})

// Caché diaria: mismo patrón que ceo-analysis.js — si ya se generó hoy, se sirve tal cual
// salvo refresh manual.
const CACHE_TTL_MS = 24 * 60 * 60 * 1000
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions'
const OPENROUTER_MODEL = 'openrouter/free'
const REQUEST_TIMEOUT_MS = 20000

const SYSTEM_INSTRUCTION = `
Eres MAPPI, el asistente de MDN Publicidad (agencia de publicidad venezolana). Escribes una
recomendación breve para César sobre la carga de trabajo del equipo de Audiovisual, que la
lee en segundos desde el Home del dashboard.

Contexto importante: que un recurso haya salido a 3 o más pautas (grabaciones) en un mismo
día NO es necesariamente un problema ni una falla del recurso. Es solo una señal para que
César hable con esa persona, vea cómo se siente y si necesita apoyo. Nunca uses tono de
regaño, alarma ni de evaluación de desempeño.

Español de Venezuela, directo, sin relleno. Recibirás un JSON con "sobrecargas": una lista
de { persona, fecha, cantidad, pautas } — cada una es una persona que en una fecha concreta
tiene "cantidad" pautas, listadas en "pautas" como { cliente, tema, estado }. No inventes
nombres, fechas ni clientes que no estén en esa lista.

Tiempo verbal según "estado" de CADA pauta — no asumas que todas ya pasaron:
- "realizada": ya ocurrió. Usa pasado ("fue a", "asistió a", "grabó").
- "programada": todavía no ocurrió (puede ser hoy más tarde o un día futuro). Usa futuro o
  presente ("tiene programadas", "va a", "le tocan"). NUNCA digas que "fue" o "asistió" a
  una pauta programada — sería una afirmación falsa.
Si las pautas de una persona mezclan estados, dilo explícitamente en el detalle (ej. "ya fue
a 2 y tiene 1 más programada").

Fechas: te llegan en formato YYYY-MM-DD (ej. "2026-09-02"). En tu respuesta escríbelas SIEMPRE
como dd/mm/aaaa usando barras "/" — ej. "02/09/2026". Nunca uses guiones ("02-09-2026") ni el
formato original.

Responde ÚNICAMENTE un JSON con esta forma exacta:
{
  "resumen": "1 frase: cuántas personas y en qué días tuvieron carga alta",
  "hallazgos": [
    { "persona": "nombre tal como viene en sobrecargas",
      "detalle": "1-2 frases: qué día, cuántas pautas y de qué clientes",
      "sugerencia": "1 frase: qué conviene hacer (ej. conversar con la persona)" }
  ]
}

"hallazgos" debe tener exactamente un ítem por cada entrada de "sobrecargas", ni más ni
menos. Responde solo el JSON, sin texto adicional ni markdown.
`

async function callOpenRouter(apiKey, snapshot) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    const res = await fetch(OPENROUTER_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        'X-Title': 'MDN Publicidad - MAPPI',
      },
      body: JSON.stringify({
        model: OPENROUTER_MODEL,
        max_tokens: 1200,
        temperature: 0.4,
        messages: [
          { role: 'system', content: SYSTEM_INSTRUCTION },
          {
            role: 'user',
            content: `Analiza esta carga de trabajo y genera la recomendación: ${JSON.stringify(snapshot)}`,
          },
        ],
      }),
      signal: controller.signal,
    })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new Error(`OpenRouter ${res.status}: ${text.slice(0, 300)}`)
    }
    return res.json()
  } finally {
    clearTimeout(timer)
  }
}

/** Quita un posible cerco ```json ... ``` antes de parsear (algunos modelos lo agregan). */
function parseModelJson(content) {
  const cleaned = content
    .trim()
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```\s*$/i, '')
  return JSON.parse(cleaned)
}

/** "YYYY-MM-DD" -> "DD/MM/YYYY" (formato pedido para todo lo que ve César en el dashboard). */
function toDDMMYYYY(isoDate) {
  const [y, m, d] = isoDate.split('-')
  return `${d}/${m}/${y}`
}

export const handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method Not Allowed' })
  if (!process.env.OPENROUTER_API_KEY) return json(500, { error: 'IA no configurada' })

  const { error: authError, caller } = await requireAdmin(event)
  if (authError) return authError

  let body
  try {
    body = JSON.parse(event.body ?? '{}')
  } catch {
    return json(400, { error: 'Body JSON inválido' })
  }
  const forceRefresh = body.refresh === true
  const companyId = caller.company_id

  // 1. Caché.
  const { data: cached, error: cacheErr } = await supabase
    .from('av_workload_insight')
    .select('data, generated_at')
    .eq('company_id', companyId)
    .maybeSingle()
  if (cacheErr) return json(500, { error: cacheErr.message })

  if (
    !forceRefresh &&
    cached &&
    Date.now() - new Date(cached.generated_at).getTime() < CACHE_TTL_MS
  ) {
    return json(200, { ...cached.data, generated_at: cached.generated_at, cached: true })
  }

  // 2. Datos crudos: pautas de la ventana ±3 días (recortado en SQL, no en memoria) +
  // empleados de la empresa (para resolver recurso_ids a nombres de Audiovisual).
  const today = new Date()
  const desde = new Date(today)
  desde.setDate(desde.getDate() - 3)
  const hasta = new Date(today)
  hasta.setDate(hasta.getDate() + 3)
  const dateKey = (d) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

  const [pautasRes, employeesRes] = await Promise.all([
    supabase
      .from('av_pautas')
      .select('id, client_name, tema, pauta_date, salida, llegada, status, recurso_ids')
      .eq('company_id', companyId)
      .is('deleted_at', null)
      .gte('pauta_date', dateKey(desde))
      .lte('pauta_date', dateKey(hasta)),
    supabase
      .from('users')
      .select('user_id, first_name, last_name, department_id, deleted_at')
      .eq('company_id', companyId),
  ])
  if (pautasRes.error) return json(500, { error: pautasRes.error.message })
  if (employeesRes.error) return json(500, { error: employeesRes.error.message })

  const snapshot = buildAvWorkloadSnapshot({
    pautas: pautasRes.data ?? [],
    employees: employeesRes.data ?? [],
    today,
  })

  let parsed
  if (snapshot.sobrecargas.length === 0) {
    // Atajo sin IA: el caso más frecuente (nadie con 3+ pautas en un día) no necesita
    // redacción — ahorra tokens y latencia, y no hay riesgo de que el modelo alucine.
    parsed = {
      resumen: `Ningún recurso de Audiovisual acumuló 3 o más pautas en un mismo día entre el ${toDDMMYYYY(snapshot.ventana.desde)} y el ${toDDMMYYYY(snapshot.ventana.hasta)}.`,
      hallazgos: [],
    }
  } else {
    try {
      const data = await callOpenRouter(process.env.OPENROUTER_API_KEY, snapshot)
      const content = data.choices?.[0]?.message?.content
      if (!content) throw new Error('Sin respuesta de texto de OpenRouter')
      parsed = parseModelJson(content)
      // Red de seguridad: `openrouter/free` no siempre respeta el formato dd/mm/aaaa pedido
      // en el SYSTEM_INSTRUCTION (se ha visto devolver dd-mm-aaaa con guiones).
      parsed.resumen = normalizeDatesToDDMMYYYY(parsed.resumen)
      parsed.hallazgos = (parsed.hallazgos ?? []).map((h) => ({
        ...h,
        detalle: normalizeDatesToDDMMYYYY(h.detalle),
        sugerencia: normalizeDatesToDDMMYYYY(h.sugerencia),
      }))
    } catch (err) {
      console.error('Error OpenRouter (av-workload-insight):', err)
      return json(502, { error: 'Error al generar las recomendaciones' })
    }
  }

  // 3. Persistir en caché.
  const generatedAt = new Date().toISOString()
  const { error: upsertErr } = await supabase
    .from('av_workload_insight')
    .upsert(
      {
        company_id: companyId,
        data: parsed,
        generated_at: generatedAt,
        generated_by: caller.user_id,
      },
      { onConflict: 'company_id' },
    )
  if (upsertErr) console.error('Error guardando caché de av_workload_insight:', upsertErr)

  return json(200, { ...parsed, generated_at: generatedAt, cached: false })
}
