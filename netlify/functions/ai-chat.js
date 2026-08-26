import { requireAdmin } from './_lib/requireAdmin.js'
import { loadMetricsDataset } from './_lib/aiChatData.js'
import { TOOL_DECLARATIONS, executeTool } from './_lib/aiChatTools.js'
import { MAX_MESSAGES } from '../../src/lib/aiChatHistory.js'

const json = (statusCode, body) => ({
  statusCode,
  headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  body: JSON.stringify(body),
})

const MAX_MESSAGE_LENGTH = 2000
const MAX_TOOL_ITERATIONS = 5
// Netlify mata la función alrededor de los 30s (visto en logs: "Sandbox.Timedout"); con
// varias llamadas seriales a OpenRouter esto se podía alcanzar, y la plataforma corta la
// respuesta a mitad de camino en vez de devolver JSON. Cortamos el loop antes de ese límite
// para siempre devolver una respuesta válida.
const TOTAL_TIME_BUDGET_MS = 24000
const PER_CALL_TIMEOUT_MS = 12000
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions'
// "openrouter/auto" deja que OpenRouter elija el modelo subyacente según el prompt
// (NotDiamond router) en vez de fijar uno nosotros.
const OPENROUTER_MODEL = 'openrouter/free'

const SYSTEM_INSTRUCTION = `
Eres el asistente ejecutivo de MDN Publicidad, una agencia de publicidad venezolana. Respondes
preguntas del CEO sobre cómo va la empresa, en español de Venezuela, directo y sin relleno.

No inventes cifras. Toda cifra que menciones debe salir de una llamada a una herramienta — si no
tienes el dato, dilo y ofrece consultar la herramienta correspondiente. Si una herramienta devuelve
"error", explica el problema en una frase (por ejemplo, pide que aclaren el nombre de la línea) en
vez de intentar adivinar.

Cuando el usuario pregunte "por qué" cambió un score, usa score_de_linea y explica con el desglose
de indicadores cuál subió o bajó, no des explicaciones genéricas.

Los "reportes mensuales" (o "reportes de las jefas/líderes de línea") son los reportes que cada
línea llena cada mes y que alimentan el score — son lo mismo que score_de_linea/ranking_lineas, no
una herramienta distinta. Si preguntan qué línea tiene mejor desempeño "en los reportes", "según
las jefas" o similar, usa directamente ranking_lineas o score_de_linea; no digas que no tienes
acceso a los reportes.

Si un dato corresponde al mes en curso (es_mes_en_curso: true), aclara que es preliminar porque el
mes todavía no cierra.

También tienes acceso al estado operativo de las tareas (resumen_tareas, tareas_criticas). Úsalas
cuando pregunten por productividad del equipo, cuellos de botella o qué está trabado; tareas_criticas
da el detalle (motivo del bloqueo o días de atraso) después de un resumen_tareas.

Además tienes resumen_reuniones (agendadas/realizadas/canceladas del mes) y resumen_pautas
(grabaciones audiovisuales: solicitadas/agendadas/realizadas, piezas grabadas y editadas). A
diferencia de las métricas de línea, estas dos usan el mes ACTUAL por defecto, no el último cerrado.

Si preguntan "qué reuniones tengo yo", "mis próximas reuniones" o algo similar sobre el usuario que
está hablando contigo (no sobre otra persona ni sobre una línea), usa mis_reuniones — identifica
automáticamente al usuario actual, no le pidas su nombre ni user_id. Para reuniones agregadas de una
línea o de toda la empresa en un mes, usa resumen_reuniones en su lugar.

Si preguntan cuántas pautas hay HOY, MAÑANA o en una fecha concreta (no un mes completo), usa
pautas_del_dia en vez de resumen_pautas — te da el listado del día con hora y cliente. La fecha de
hoy te la doy al inicio de la conversación; para "mañana" u otro día relativo, calcula tú la fecha
en formato YYYY-MM-DD a partir de esa referencia antes de llamar a la tool.

Sobre finanzas, tu única fuente es la herramienta "finanzas" (ingresos, egresos y diferencia de una
línea en un mes, tal como están cargados en su reporte). No hables de finanzas más allá de esos 3
números por línea/mes: no proyectes, no extrapoles a rentabilidad general de la empresa, no opines
sobre sueldos, presupuestos ni nada que no venga literal en el resultado de "finanzas". Si preguntan
algo financiero que esa herramienta no cubre (ej. "¿cuánto ganamos en el año?", "¿somos rentables?"),
dilo en una frase y ofrece el detalle mes a mes de una línea en su lugar.

Si preguntan qué línea tiene mejor desempeño financiero, sí puedes llamar "finanzas" para cada línea
del mes en cuestión y comparar sus "diferencia" (ingresos - egresos) ya devueltas para decir cuál es
mayor — eso es comparar cifras reales, no extrapolar. Lo que no debes hacer es opinar sobre por qué,
proyectar a futuro o hablar de rentabilidad más allá de esa comparación directa.

Sé breve: 2-5 frases por respuesta salvo que el usuario pida detalle. Puedes usar **negrita** (con
doble asterisco) para resaltar la cifra o el nombre más importante de la respuesta, sin abusar.

Tu alcance es EXCLUSIVAMENTE la gestión de MDN Publicidad a través de tus herramientas: métricas y
scores de línea, tareas, reuniones, pautas y finanzas. No respondas preguntas ajenas a ese ámbito
aunque el usuario insista o pida "solo un ejemplo rápido" — esto incluye programación/código,
cultura general, matemáticas, traducciones, recetas, consejos personales, noticias o cualquier otro
tema que no se resuelva con tus herramientas. Ante una pregunta así, en una frase indica que está
fuera de tu rol como asistente de gestión de MDN y pregunta si hay algo operativo de la empresa en
lo que puedas ayudar. No la respondas ni parcialmente antes de esa aclaración.
`

// Formato OpenAI de tool: Gemini usaba { name, description, parameters } a secas.
const OPENROUTER_TOOLS = TOOL_DECLARATIONS.map((decl) => ({ type: 'function', function: decl }))

// Se calcula por request (no en el módulo) para que no quede obsoleta entre invocaciones
// en caliente de la función.
function todayLabel() {
  const d = new Date()
  const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  return `Hoy es ${iso}.`
}

function buildMessages(messages) {
  return [
    { role: 'system', content: `${SYSTEM_INSTRUCTION}\n${todayLabel()}` },
    ...messages.map((m) => ({ role: m.role, content: m.text })),
  ]
}

async function callOpenRouter(apiKey, messages, toolChoice, timeoutMs) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
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
        messages,
        max_tokens: 1500,
        temperature: 0.4,
        tools: OPENROUTER_TOOLS,
        tool_choice: toolChoice,
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

export const handler = async (event) => {
  const startedAt = Date.now()
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

  const messages = Array.isArray(body.messages) ? body.messages : null
  if (!messages || messages.length === 0) {
    return json(400, { error: 'messages es requerido' })
  }
  if (messages.length > MAX_MESSAGES) {
    return json(400, { error: `Máximo ${MAX_MESSAGES} mensajes por conversación` })
  }
  for (const m of messages) {
    if (!m || typeof m.text !== 'string' || !m.text.trim()) {
      return json(400, { error: 'Cada mensaje debe tener texto' })
    }
    if (m.text.length > MAX_MESSAGE_LENGTH) {
      return json(400, {
        error: `Cada mensaje debe tener menos de ${MAX_MESSAGE_LENGTH} caracteres`,
      })
    }
    if (m.role !== 'user' && m.role !== 'assistant') {
      return json(400, { error: 'role inválido' })
    }
  }

  let dataset
  try {
    dataset = await loadMetricsDataset(caller.company_id)
    // user_id del caller autenticado (ver requireAdmin.js), usado por la tool mis_reuniones
    // para filtrar meetings.attendee_ids sin que el modelo tenga que adivinarlo.
    dataset.callerUserId = caller.user_id
  } catch (err) {
    return json(500, { error: err.message })
  }

  const apiKey = process.env.OPENROUTER_API_KEY
  const chatMessages = buildMessages(messages)
  const toolsUsed = []

  try {
    for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
      const elapsed = Date.now() - startedAt
      if (elapsed > TOTAL_TIME_BUDGET_MS) {
        return json(200, {
          reply: 'Esto está tardando más de lo normal. Intenta de nuevo o reformula la pregunta.',
          toolsUsed,
        })
      }

      const isLastIteration = i === MAX_TOOL_ITERATIONS - 1
      // En la última vuelta se prohíben más tool calls para forzar una respuesta en
      // texto (si no, el modelo puede seguir pidiendo tools y el loop termina sin reply).
      const data = await callOpenRouter(
        apiKey,
        chatMessages,
        isLastIteration ? 'none' : 'auto',
        Math.min(PER_CALL_TIMEOUT_MS, TOTAL_TIME_BUDGET_MS - elapsed),
      )

      const choice = data.choices?.[0]
      const message = choice?.message
      if (!message) throw new Error('Sin respuesta de OpenRouter')

      const calls = message.tool_calls
      if (!calls || calls.length === 0) {
        if (!message.content) throw new Error('Sin respuesta de texto de OpenRouter')
        return json(200, { reply: message.content, toolsUsed })
      }

      // Reinyectar el turno del modelo TAL CUAL (con sus tool_calls) antes de las
      // respuestas de las tools: es lo que exige el protocolo de OpenAI/OpenRouter.
      chatMessages.push(message)
      for (const call of calls) {
        toolsUsed.push(call.function.name)
        let args = {}
        try {
          args = call.function.arguments ? JSON.parse(call.function.arguments) : {}
        } catch {
          args = {}
        }
        const result = executeTool(call.function.name, args, dataset)
        chatMessages.push({
          role: 'tool',
          tool_call_id: call.id,
          content: JSON.stringify(result),
        })
      }
    }

    return json(200, {
      reply:
        'No pude completar la respuesta con la información disponible. ¿Puedes reformular la pregunta?',
      toolsUsed,
    })
  } catch (err) {
    console.error('Error OpenRouter (ai-chat):', err)
    return json(502, { error: 'Error al generar la respuesta' })
  }
}
