import { useEffect, useState } from 'react'
import { loadLotesListasAFecha } from '../components/pautas/avPautasApi'
import { usaEditadasFinDeMes, finDeMesISO } from '../utils/audiovisual'

const pad = (n) => String(n).padStart(2, '0')

/** 'YYYY-MM' de un (year, month 1-12). */
export const ymKey = (year, month) => `${year}-${pad(month)}`

/** Hoy en hora local del navegador como 'YYYY-MM-DD' (sin pasar por UTC). */
function localTodayISO(now = new Date()) {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

/**
 * Meses a congelar para una vista mensual: el mostrado y el anterior (el que usa el delta), solo
 * si rigen por «editadas al último día del mes» (desde nov-2026) Y ya terminaron. El mes en curso
 * no se consulta: su valor vivo ya es el de «hoy», y además se actualiza en tiempo real.
 * @param {Array} pautas — pautas del alcance (con `id`, `pauta_date`, `deleted_at`)
 * @returns {Array<{ key:string, fecha:string, ids:string[] }>}
 */
export function mesesACongelar(pautas, year, month, hoy = localTodayISO()) {
  const prev = month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 }
  return [{ year, month }, prev]
    .filter((t) => usaEditadasFinDeMes(t.year, t.month) && finDeMesISO(t.year, t.month) < hoy)
    .map((t) => {
      const key = ymKey(t.year, t.month)
      const ids = (pautas ?? [])
        .filter((p) => !p.deleted_at && p.pauta_date && String(p.pauta_date).slice(0, 7) === key)
        .map((p) => p.id)
        .sort()
      return { key, fecha: finDeMesISO(t.year, t.month), ids }
    })
}

/**
 * Audiovisual → Datos: lotes con sus `listas` como estaban el último día de cada mes terminado
 * (desde nov-2026), para que el número de un mes pasado no cambie aunque después se edite más.
 *
 * Devuelve `rowsByMonth` ('YYYY-MM' → filas de la RPC) solo para los meses ya resueltos; los demás
 * (mes en curso, anteriores a noviembre, o aún cargando) se muestran con el valor vivo. Si la
 * consulta falla, `error` viene lleno y `rowsByMonth` vacío: se cae al valor vivo y se avisa.
 *
 * @param {{ pautas: Array, year: number, month: number }} params
 * @returns {{ rowsByMonth: Record<string, Array>, error: any, loading: boolean }}
 */
export function useListasFinDeMes({ pautas, year, month }) {
  const targets = mesesACongelar(pautas, year, month)
  // Clave estable: `pautas` cambia de identidad en cada render/realtime, pero solo importa
  // cuáles ids entran a cada mes.
  const signature = JSON.stringify(targets.map((t) => [t.key, t.ids]))
  const [state, setState] = useState({ signature: '', rowsByMonth: {}, error: null })

  useEffect(() => {
    const wanted = JSON.parse(signature)
    if (wanted.length === 0) {
      setState({ signature, rowsByMonth: {}, error: null })
      return undefined
    }
    let cancelled = false
    const fechas = Object.fromEntries(targets.map((t) => [t.key, t.fecha]))
    Promise.all(
      wanted.map(async ([key, ids]) => {
        const { data, error } = await loadLotesListasAFecha(ids, fechas[key])
        return { key, data, error }
      }),
    ).then((results) => {
      if (cancelled) return
      const error = results.find((r) => r.error)?.error ?? null
      setState({
        signature,
        rowsByMonth: error ? {} : Object.fromEntries(results.map((r) => [r.key, r.data ?? []])),
        error,
      })
    })
    return () => {
      cancelled = true
    }
    // `targets` se deriva de `signature` (+ fechas fijas por mes): no hace falta como dependencia.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature])

  const ready = state.signature === signature
  return {
    rowsByMonth: ready ? state.rowsByMonth : {},
    error: ready ? state.error : null,
    loading: targets.length > 0 && !ready,
  }
}
