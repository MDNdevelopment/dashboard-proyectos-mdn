import { GoogleGenAI } from '@google/genai'
import { supabase } from './_lib/supabase.js'
import { requireUser } from './_lib/requireUser.js'

const json = (statusCode, body) => ({
  statusCode,
  headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  body: JSON.stringify(body),
})

const SYSTEM_INSTRUCTION = `
In the given data there will be evaluations from many months, you must take into account all the evaluations in order to give a summary of the employee's performance. Don't mention a specific month, just give a summary of the employee's performance.

The response must be in JSON format where the keys are in english but the values are in spanish, the response must be a summary of the evaluations and the employee's performance, the response must be a JSON object with the following keys: 'summary', 'strengths', 'weaknesses', 'recommendations'
Return: {{summary: response}, {strengths: Array<strengths>}, {weaknesses: Array<weaknesses>}, {recommendations: Array<recommendations>}} if for some reason you can't provide the information for a key, just return the following: for summary: "No se puede proporcionar información", for the other keys, return an array with a single string "No se puede proporcionar información". In the strengths, weaknesses and recommendations don't just put the questions related to that key but give insights about what makes that key important, for example: "El empleado tiene una gran capacidad de trabajo en equipo, lo que le permite colaborar eficazmente con sus compañeros y contribuir al éxito del equipo." and "El empleado tiene dificultades para trabajar en equipo, lo que le impide colaborar eficazmente con sus compañeros y contribuir al éxito del equipo." and "El empleado debe mejorar su capacidad de trabajo en equipo para poder colaborar eficazmente con sus compañeros y contribuir al éxito del equipo.".

When speaking about comments, only take into account only the ones made in the latest evaluation period, don't take into account the comments made in the previous evaluation periods other than the last one.
`

export const handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method Not Allowed' })

  // Verificar que la API key de Gemini esté configurada
  if (!process.env.GEMINI_API_KEY) return json(500, { error: 'IA no configurada' })

  // Autenticar al caller (cualquier usuario autenticado, no solo admin)
  const { error: authError, caller } = await requireUser(event)
  if (authError) return authError

  // Parsear body
  let body
  try {
    body = JSON.parse(event.body ?? '{}')
  } catch {
    return json(400, { error: 'Body JSON inválido' })
  }

  const { employeeId } = body
  if (!employeeId) return json(400, { error: 'employeeId es requerido' })

  // Verificación de tenant: confirmar que el empleado pertenece a la misma empresa
  // (el service-role bypassa RLS, así que esta comprobación es obligatoria)
  const { data: employee, error: empErr } = await supabase
    .from('users')
    .select('user_id, company_id')
    .eq('user_id', employeeId)
    .single()

  if (empErr || !employee) return json(404, { error: 'Empleado no encontrado' })
  if (employee.company_id !== caller.company_id) return json(403, { error: 'Forbidden' })

  // Cargar historial completo de evaluaciones con texto de preguntas
  const { data: sessions, error: sessErr } = await supabase
    .from('evaluation_sessions')
    .select('period, total_score, evaluation_responses(response, questions(text)), evaluation_comments(comment)')
    .eq('employee_id', employeeId)
    .order('period', { ascending: false })

  if (sessErr) return json(500, { error: sessErr.message })
  if (!sessions || sessions.length === 0) {
    return json(400, { error: 'El empleado no tiene evaluaciones' })
  }

  // Construir payload agrupado por período (igual que el original)
  // Los comentarios solo se incluyen del período más reciente (el primero, orden desc)
  const evaluations = sessions.map((session, index) => ({
    period: session.period,
    totalScore: session.total_score,
    questions: (session.evaluation_responses ?? [])
      .filter(r => r.questions?.text)
      .map(r => ({
        text: r.questions.text,
        response: r.response,
      })),
    // Solo incluir comentarios del período más reciente
    comments: index === 0
      ? (session.evaluation_comments ?? []).map(c => c.comment).filter(Boolean)
      : [],
  }))

  // Llamar a Gemini
  try {
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY })
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: 'I need you to give me an analysis on the employee performance based on his evaluations ' + JSON.stringify(evaluations),
      config: {
        maxOutputTokens: 5000,
        temperature: 1,
        responseMimeType: 'application/json',
        systemInstruction: SYSTEM_INSTRUCTION,
      },
    })

    if (!response.text) throw new Error('Sin respuesta de texto de Gemini')

    const parsed = JSON.parse(response.text)
    return json(200, parsed)
  } catch (err) {
    console.error('Error Gemini:', err)
    return json(502, { error: 'Error al generar el análisis' })
  }
}
