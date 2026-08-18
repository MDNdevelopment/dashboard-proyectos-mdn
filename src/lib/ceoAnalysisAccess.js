// Lista de acceso al recuadro "Análisis IA" del Home (resumen ejecutivo generado por
// Gemini, ver netlify/functions/ceo-analysis.js). No se puede derivar de `admin` ni de
// `access_level`: hay admins que no deben verlo y al menos un usuario nivel 2 que sí,
// así que la restricción es una lista explícita de user_id.
// Se comparte entre el frontend (gate de UI, solo estético) y el backend (autorización
// real, ver ceo-analysis.js) para no duplicar la lista.
export const CEO_ANALYSIS_USER_IDS = [
  '9e19bd71-e72c-419a-9919-c154e4e573d7', // César Aldana
  '5bdbb4f1-833a-4b85-953a-e2d9d31d6d4c', // Jesús García
  '2d50a4e5-35db-4be5-b27a-a24d1282ce82', // Juan Lauretta
]

/** @param {{ user_id?: string }|null|undefined} profile */
export function canSeeCeoAnalysis(profile) {
  return !!profile?.user_id && CEO_ANALYSIS_USER_IDS.includes(profile.user_id)
}
