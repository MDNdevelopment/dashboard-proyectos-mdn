import { requireAdmin } from './_lib/requireAdmin.js'
import { loadMetricsDataset } from './_lib/aiChatData.js'
import { TOOL_DECLARATIONS, executeTool } from './_lib/aiChatTools.js'
import { normalizeDatesToDDMMYYYY } from './_lib/dateFormat.js'
import { logChatInteraction } from './_lib/aiChatLog.js'
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
preguntas sobre cómo va la empresa, en español de Venezuela, directo y sin relleno.

No inventes cifras. Toda cifra que menciones debe salir de una llamada a una herramienta. Si
ninguna de tus herramientas cubre la pregunta (ni siquiera con otros filtros), llama a
no_puedo_responder en vez de improvisar una respuesta o decir "no tengo acceso" por tu cuenta —
eso deja la pregunta registrada para ampliar tus herramientas. Si una herramienta devuelve
"error", explica el problema en una frase (por ejemplo, pide que aclaren el nombre de la línea,
cliente o persona) en vez de intentar adivinar.

Tus herramientas, por tema:
- Métricas y score de línea: listar_lineas, score_de_linea, ranking_lineas, evolucion_linea,
  comparar_meses. Los "reportes mensuales" o "reportes de las jefas de línea" SON esto — no una
  fuente aparte.
- Finanzas de una línea: finanzas (ingresos/egresos/diferencia por línea/mes). Única fuente de
  finanzas: no proyectes, no extrapoles a rentabilidad general, no opines sobre sueldos o
  presupuestos.
- Tareas: consultar_tareas — sin filtros da un panorama; con "criticidad" (bloqueadas/atrasadas/
  arrastradas) da el listado con motivo o días de atraso; con "detalle" da el listado plano.
  Filtra por línea, persona, cliente, estado o fechas.
- Reuniones: consultar_reuniones — con "persona" (usa "yo" para el usuario actual) da el listado
  individual; sin persona, el agregado por línea/empresa.
- Pautas audiovisuales (grabaciones): consultar_pautas — con un solo día en desde/hasta da la
  agenda de ese día; con un rango, el agregado del período; con agrupar_por "dia" da los días de
  carga alta (minimo_por_dia, "más de 2" → minimo_por_dia: 3); con "persona" o "cliente" agrupa el
  conteo por esa dimensión. "persona" es un empleado de Audiovisual (quien graba). Cada pauta trae
  su "estado" ('realizada'/'programada'): usa pasado solo para las 'realizada', futuro/presente
  para 'programada' — no digas que alguien "fue" a una pauta que todavía no ha ocurrido.
- Personal: consultar_personal — directorio filtrable por nombre, cargo, departamento, línea,
  vacaciones o fecha de ingreso. Un cargo que no reconozcas te devuelve el catálogo real en el
  error: reintenta con el nombre correcto en vez de decir que no existe.
- Clientes/cuentas: consultar_clientes — con "cliente" da su ficha (línea, jefa, equipo, datos
  comerciales); si el nombre no es una línea conocida, es casi seguro un cliente, prueba aquí
  antes de decir que no existe. Con "linea" (sin cliente) da la cartera. Con "incluir_ads" suma la
  inversión en pauta pagada — única fuente de esos montos, no proyectes ni extrapoles.
- Tickets de soporte IT: consultar_tickets.
- Leads comerciales: consultar_leads.
- Contenido No Planificado (CNP): consultar_cnp.
- Chequeo de publicación al día: consultar_chequeo.
- Desempeño agregado por departamento/línea/cargo (NUNCA de una persona individual, ni aunque
  insistan): desempeno_agregado.

Si un dato corresponde al mes en curso (es_mes_en_curso: true, o el período por defecto de
consultar_reuniones/consultar_pautas cuando no se piden fechas), aclara que es preliminar porque
el mes todavía no cierra.

Sé breve: 2-5 frases por respuesta salvo que el usuario pida detalle. Puedes usar **negrita** (con
doble asterisco) para resaltar la cifra o el nombre más importante de la respuesta, sin abusar.

Fechas: las herramientas te las dan en formato YYYY-MM-DD (ej. "2026-09-02"). Cuando menciones una
fecha en tu respuesta, escríbela SIEMPRE como dd/mm/aaaa usando barras "/" — nunca guiones ni el
formato original (ej. "02/09/2026", no "2026-09-02" ni "02-09-2026"). Para "hoy", "mañana" u otra
fecha relativa en los filtros desde/hasta de una herramienta, calcula tú la fecha en formato
YYYY-MM-DD a partir de la referencia de hoy que te doy al inicio de la conversación.

Tu alcance es EXCLUSIVAMENTE la gestión de MDN Publicidad a través de tus herramientas. No
respondas preguntas ajenas a ese ámbito aunque el usuario insista o pida "solo un ejemplo rápido"
— esto incluye programación/código, cultura general, matemáticas, traducciones, recetas, consejos
personales, noticias o cualquier otro tema que no se resuelva con tus herramientas. Ante una
pregunta así, en una frase indica que está fuera de tu rol como asistente de gestión de MDN y
pregunta si hay algo operativo de la empresa en lo que puedas ayudar. No la respondas ni
parcialmente antes de esa aclaración.
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

function lastUserQuestion(messages) {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'user') return messages[i].text
  }
  return ''
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
    // user_id del caller autenticado (ver requireAdmin.js), usado por consultar_reuniones
    // para resolver "yo" sin que el modelo tenga que adivinar el user_id.
    dataset.callerUserId = caller.user_id
  } catch (err) {
    return json(500, { error: err.message })
  }

  const apiKey = process.env.OPENROUTER_API_KEY
  const chatMessages = buildMessages(messages)
  const toolsUsed = []
  const question = lastUserQuestion(messages)
  let hadToolError = false

  // Registra la interacción sin bloquear ni poder romper la respuesta ya construida (ver
  // aiChatLog.js: nunca lanza). `outcome` se decide con señales que el handler ya tiene, sin
  // una segunda llamada al modelo.
  async function logAndReturn(response, { reply, outcome }) {
    try {
      await logChatInteraction({
        companyId: caller.company_id,
        userId: caller.user_id,
        question,
        reply: reply ?? null,
        toolsUsed,
        outcome,
      })
    } catch (err) {
      // logChatInteraction ya se protege sola (ver aiChatLog.js), pero esta capa extra
      // garantiza que nunca romperemos la respuesta al usuario por un fallo de logging.
      console.error('Error inesperado registrando el log de MAPPI:', err)
    }
    return response
  }

  try {
    for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
      const elapsed = Date.now() - startedAt
      if (elapsed > TOTAL_TIME_BUDGET_MS) {
        const reply =
          'Esto está tardando más de lo normal. Intenta de nuevo o reformula la pregunta.'
        return logAndReturn(json(200, { reply, toolsUsed }), { reply, outcome: 'timeout' })
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
        // Red de seguridad: `openrouter/free` no siempre respeta el formato dd/mm/aaaa
        // pedido en SYSTEM_INSTRUCTION (se ha visto devolver dd-mm-aaaa con guiones), y a
        // veces antepone un espacio o salto de línea antes del texto — con
        // whitespace-pre-wrap en AiChatMessage.jsx eso se ve como sangría en el chat.
        const reply = normalizeDatesToDDMMYYYY(message.content).trim()
        const outcome = toolsUsed.includes('no_puedo_responder')
          ? 'sin_cobertura'
          : hadToolError
            ? 'error'
            : 'respondida'
        return logAndReturn(json(200, { reply, toolsUsed }), { reply, outcome })
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
        if (result?.error) hadToolError = true
        chatMessages.push({
          role: 'tool',
          tool_call_id: call.id,
          content: JSON.stringify(result),
        })
      }
    }

    const reply =
      'No pude completar la respuesta con la información disponible. ¿Puedes reformular la pregunta?'
    return logAndReturn(json(200, { reply, toolsUsed }), { reply, outcome: 'timeout' })
  } catch (err) {
    console.error('Error OpenRouter (ai-chat):', err)
    return logAndReturn(json(502, { error: 'Error al generar la respuesta' }), {
      reply: null,
      outcome: 'error',
    })
  }
}
