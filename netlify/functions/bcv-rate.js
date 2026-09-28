import { requireCapability } from './_lib/requireCapability.js'

const json = (statusCode, body) => ({
  statusCode,
  headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  body: JSON.stringify(body),
})

const REQUEST_TIMEOUT_MS = 8000
const PYDOLARVE_URL = 'https://pydolarve.org/api/v1/dollar?page=bcv'
const DOLARAPI_URL = 'https://ve.dolarapi.com/v1/dolares/oficial'

async function fetchJson(url) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    const res = await fetch(url, { signal: controller.signal })
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  } finally {
    clearTimeout(timeout)
  }
}

/**
 * Lee el precio de la respuesta de pydolarve.org. La forma documentada es
 * `monitors.bcv.price`, pero se prueban rutas alternas por si la API cambia de
 * versión sin avisar — nunca lanza, solo devuelve `null` si no encuentra nada útil.
 */
export function extractPydolarveRate(payload) {
  const price = payload?.monitors?.bcv?.price ?? payload?.price ?? payload?.data?.price ?? null
  const rate = Number(price)
  return rate > 0 ? rate : null
}

/** Forma verificada en vivo de dolarapi.com: `{ promedio: number, ... }`. */
export function extractDolarApiRate(payload) {
  const rate = Number(payload?.promedio)
  return rate > 0 ? rate : null
}

/**
 * Tasa BCV actual desde una API pública, con fallback automático entre 2 fuentes
 * gratuitas (ver ARQUITECTURA.md §2.15 "Caja Bs y divisas" — reemplaza la carga
 * manual de `TasaBcvModal.jsx`, que se eliminó). `resolveRateBcv()`
 * (`src/components/finanzas/finanzasApi.js`) es el único consumidor: si esta
 * función falla, cae sola al histórico de `fin_rates` — nunca bloquea un flujo.
 */
export const handler = async (event) => {
  const { error: authError } = await requireCapability(event, 'finanzas')
  if (authError) return authError

  const pydolarve = await fetchJson(PYDOLARVE_URL)
  const pydolarveRate = extractPydolarveRate(pydolarve)
  if (pydolarveRate) return json(200, { rate: pydolarveRate, source: 'pydolarve' })

  const dolarapi = await fetchJson(DOLARAPI_URL)
  const dolarapiRate = extractDolarApiRate(dolarapi)
  if (dolarapiRate) return json(200, { rate: dolarapiRate, source: 'dolarapi' })

  return json(502, { error: 'No se pudo obtener la tasa BCV de ninguna fuente' })
}
