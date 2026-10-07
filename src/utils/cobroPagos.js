/**
 * Lógica pura de la lista de pagos de `CobroModal.jsx` (sin React).
 *
 * Un cobro puede repartirse en varios pagos ("split tender"): cada pago tiene su
 * forma (USD, Bs o Intercambio), su monto en USD, su método y su nota, y cada uno
 * termina siendo UNA fila de `fin_payments`. El monto SIEMPRE se escribe en USD;
 * si el pago es en Bs solo se aplica la tasa para derivar el equivalente.
 *
 * Shape de un pago (estado del formulario, no del servidor):
 *   { id, forma: 'USD'|'Bs'|'Intercambio', monto: string, metodo, nota, tocado }
 *   - `monto` es el texto del input.
 *   - `tocado` = el usuario escribió en él. Solo el ÚLTIMO pago sin tocar se
 *     autocompleta con lo que falta (ver `montoMostrado`).
 *
 * Todo es puro y se prueba en `src/test/cobroPagos.test.js`: son reglas de dinero
 * y, dentro del componente, solo se podrían verificar renderizando.
 */
import {
  METODOS_PAGO_USD,
  METODOS_PAGO_BS,
  METODOS_PAGO_INTERCAMBIO,
} from '../components/finanzas/constants'

/** Tolerancia de redondeo del módulo (la misma que `EPS` en utils/finanzas.js). */
const EPS = 0.5

/** Tope de pagos por cobro: más allá de esto la lista deja de ser un formulario. */
export const MAX_PAGOS = 6

/** Orden en el desplegable de forma de pago. */
export const FORMAS_PAGO = ['USD', 'Bs', 'Intercambio']

/**
 * Orden en que se sugiere la forma de un pago nuevo: el caso que motiva la lista
 * es dinero + intercambio, así que tras USD sigue Intercambio y luego Bs.
 */
const ORDEN_SUGERIDO = ['USD', 'Intercambio', 'Bs']

export const FORMA_LABELS = {
  USD: 'Dinero USD',
  Bs: 'Dinero Bs',
  Intercambio: 'Intercambio',
}

/** Métodos del desplegable según la forma de pago. */
export const METODOS_POR_FORMA = {
  USD: METODOS_PAGO_USD,
  Bs: METODOS_PAGO_BS,
  Intercambio: METODOS_PAGO_INTERCAMBIO,
}

const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100

/** Un pago vacío de la forma dada, con el primer método de esa forma. */
export function nuevoPago(id, forma = 'USD') {
  return { id, forma, monto: '', metodo: METODOS_POR_FORMA[forma][0], nota: '', tocado: false }
}

/**
 * Monto que se muestra en el input del pago `i`.
 *
 * Solo el ÚLTIMO pago sin tocar se autocompleta con lo que falta
 * (`pendiente − Σ montos de los demás`, nunca negativo); el resto muestra el que
 * escribió el usuario. Es un valor DERIVADO al renderizar, no un efecto: así
 * marcar una retención (que mueve el `pendiente`) o editar otro pago lo ajusta en
 * el mismo render, sin estado duplicado.
 */
export function montoMostrado(pagos, i, pendiente) {
  const p = pagos[i]
  if (!p) return ''
  if (i !== pagos.length - 1 || p.tocado) return p.monto
  const otros = pagos.reduce((a, q, j) => (j === i ? a : a + (Number(q.monto) || 0)), 0)
  const auto = Math.max(round2(pendiente - otros), 0)
  return auto > 0 ? String(auto) : ''
}

/** Monto numérico efectivo de cada pago (el mostrado, ya con el autocompletado). */
export function montosNumericos(pagos, pendiente) {
  return pagos.map((_, i) => Number(montoMostrado(pagos, i, pendiente)) || 0)
}

/**
 * Totales de la lista: lo asignado, lo que falta por cobrar y si algún pago en Bs
 * tiene monto (para decidir si hay que pedir la tasa).
 */
export function totalesDePagos(pagos, pendiente) {
  const montos = montosNumericos(pagos, pendiente)
  const asignado = round2(montos.reduce((a, m) => a + m, 0))
  return {
    asignado,
    falta: round2(pendiente - asignado),
    hayBs: pagos.some((p, i) => p.forma === 'Bs' && montos[i] > 0),
  }
}

/** Suma, en USD, de los pagos en Bs (la base para mostrar su equivalente en bolívares). */
export function usdEnBs(pagos, pendiente) {
  const montos = montosNumericos(pagos, pendiente)
  return round2(pagos.reduce((a, p, i) => (p.forma === 'Bs' ? a + montos[i] : a), 0))
}

/**
 * Transiciones de la lista (reducer puro). Acciones:
 *   { tipo: 'agregar', id, pendiente }  añade un pago nuevo
 *   { tipo: 'quitar', id }              quita el pago (siempre queda al menos uno)
 *   { tipo: 'editar', id, campo, valor } cambia monto / forma / metodo / nota
 *   { tipo: 'reiniciar', id }           vuelve a un solo pago autocompletado
 */
export function pagosReducer(pagos, accion) {
  switch (accion.tipo) {
    case 'agregar': {
      if (pagos.length >= MAX_PAGOS) return pagos
      // El que era último deja de seguir al saldo: se "congela" en lo que mostraba
      // para que el nuevo tome el resto. Sin esto, al dejar de ser último pasaría a
      // mostrar su `monto` vacío y se perdería la cifra.
      const ultimo = pagos.length - 1
      const congelados = pagos.map((p, i) =>
        i === ultimo ? { ...p, monto: montoMostrado(pagos, i, accion.pendiente), tocado: true } : p,
      )
      const usadas = new Set(pagos.map((p) => p.forma))
      const forma = ORDEN_SUGERIDO.find((f) => !usadas.has(f)) ?? 'USD'
      return [...congelados, nuevoPago(accion.id, forma)]
    }
    case 'quitar':
      return pagos.length <= 1 ? pagos : pagos.filter((p) => p.id !== accion.id)
    case 'editar':
      return pagos.map((p) => {
        if (p.id !== accion.id) return p
        if (accion.campo === 'monto') {
          // Tocado SIEMPRE, incluso al vaciar el campo: si un input vacío volviera al
          // autocompletado, al borrar el último dígito reaparecería el monto sugerido
          // y no se podría escribir otro (borrar el 9 de 900 lo devolvía a 900).
          return { ...p, monto: accion.valor, tocado: true }
        }
        if (accion.campo === 'forma') {
          // El método depende de la forma: se reinicia al primero de la nueva.
          return { ...p, forma: accion.valor, metodo: METODOS_POR_FORMA[accion.valor][0] }
        }
        return { ...p, [accion.campo]: accion.valor }
      })
    case 'reiniciar':
      return [nuevoPago(accion.id)]
    default:
      return pagos
  }
}

/**
 * Valida la lista antes de guardar. Devuelve el mensaje de error o `null`.
 * `tasa` es la tasa efectiva (BCV o personalizada) o `null` si no hay.
 */
export function validarPagos(pagos, pendiente, { tasa } = {}) {
  const montos = montosNumericos(pagos, pendiente)
  if (montos.some((m) => m < 0)) return 'Los montos no pueden ser negativos'
  const { asignado, hayBs } = totalesDePagos(pagos, pendiente)
  if (asignado <= 0) return 'El monto debe ser mayor a 0'
  if (asignado > pendiente + EPS) return 'No puedes cobrar más de lo pendiente'
  if (hayBs && !(tasa > 0)) return 'Ingresa o confirma la tasa BCV'
  return null
}

/**
 * Filas para `addPaymentsBatch()`: una por pago con monto > 0, en el orden de la
 * lista. Solo las filas en Bs llevan equivalente (`monto × tasa`), tasa y origen
 * de la tasa; USD e Intercambio llevan nulos explícitos (el CHECK
 * `fin_payments_intercambio_sin_bs` los exige para el canje).
 * @param {{ fecha: string, tasa: number|null, tasaManual: boolean }} opts
 */
export function filasParaGuardar(pagos, pendiente, { fecha, tasa = null, tasaManual = false }) {
  const montos = montosNumericos(pagos, pendiente)
  return pagos.flatMap((p, i) => {
    if (!(montos[i] > 0)) return []
    const fila = {
      paidOn: fecha,
      amount: montos[i],
      amountBs: null,
      rate: null,
      rateSource: null,
      method: p.metodo,
      note: p.nota.trim() || null,
      currency: p.forma,
    }
    if (p.forma === 'Bs') {
      fila.amountBs = round2(montos[i] * tasa)
      fila.rate = tasa
      fila.rateSource = tasaManual ? 'manual' : 'bcv'
    }
    return [fila]
  })
}
