// Normaliza fechas dentro de texto libre generado por el modelo a dd/mm/aaaa. El
// SYSTEM_INSTRUCTION de ai-chat.js/av-workload-insight.js ya se lo pide, pero
// `openrouter/free` (auto-router de modelos gratuitos) no siempre lo respeta al pie de la
// letra — esto es una red de seguridad determinística que no depende de que el modelo
// obedezca la instrucción.
const ISO_DATE = /\b(\d{4})-(\d{2})-(\d{2})\b/g
const DASHED_DMY = /\b(\d{2})-(\d{2})-(\d{4})\b/g

export function normalizeDatesToDDMMYYYY(text) {
  if (!text) return text
  return text
    .replace(ISO_DATE, (_, y, m, d) => `${d}/${m}/${y}`)
    .replace(DASHED_DMY, (_, d, m, y) => `${d}/${m}/${y}`)
}
