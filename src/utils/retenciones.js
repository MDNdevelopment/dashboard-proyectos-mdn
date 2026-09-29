/**
 * Retenciones de impuestos sobre la facturación (lógica pura, sin React).
 *
 * En Venezuela el cliente no paga el total facturado: retiene una parte y la
 * entera al fisco por cuenta de la agencia. MDN aplica tres retenciones, cada
 * una opcional, de las que cada factura guarda un snapshot
 * (`fin_invoices.ret_*`) para que un mes ya cerrado siga cuadrando aunque
 * después se corrija la configuración.
 *
 * Dónde se marcan: al REGISTRAR EL COBRO (`CobroModal.jsx`), que es cuando el
 * cliente entrega el comprobante de retención. No se configuran en el perfil de
 * la marca: un mismo cliente varía el ISLR entre 2% y 5% de un mes a otro, así
 * que un valor fijo en su ficha envejece mal y se acaba aplicando la tasa
 * equivocada. Ver migración 20260929180000.
 *
 *   - ISL         5% o 2% sobre la base imponible
 *   - IVA         75% o 100% del IVA contenido en el monto
 *   - Municipal   1% sobre la base imponible
 *
 * CONVENCIÓN CLAVE: `amount` es el monto facturado y YA INCLUYE el IVA. Las
 * retenciones se RESTAN de él — nunca se le suma nada. El resultado es el
 * "neto a cobrar", que es contra lo que se salda la factura (ver pendienteDe()
 * y estadoFactura() en utils/finanzas.js).
 *
 * Lo que NO toca este módulo: la distribución en partidas, Movimientos y el
 * cuadre de Divisas se alimentan de `fin_payments` reales, que ya entraron
 * netos de retención. Descontarles las retenciones otra vez las contaría dos
 * veces y descuadraría el reparto contra la caja.
 */

/** Alícuota del IVA contenida en el monto facturado. */
export const IVA_RATE = 0.16

/** Tasas de retención de ISL admitidas (cerradas por ley, no configurables). */
export const ISL_OPCIONES = [0.05, 0.02]

/** Porcentaje del IVA que el cliente retiene (cerrado por ley). */
export const IVA_RET_OPCIONES = [0.75, 1.0]

/** El impuesto municipal no tiene opciones: es 1% sobre la base. */
export const MUNICIPAL_RATE = 0.01

const EPS = 0.0001

function round2(n) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100
}

function num(v) {
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

/**
 * Configuración vacía: ninguna retención activa. Es lo que devuelve
 * `normalizarRetenciones` ante `null`, un objeto sin campos conocidos o una
 * factura anterior a esta feature — de ahí sale la retrocompatibilidad total
 * (neto = amount, comportamiento idéntico al que tenía el módulo antes).
 */
export const RETENCIONES_VACIAS = Object.freeze({
  isl: false,
  islRate: null,
  iva: false,
  ivaRate: null,
  municipal: false,
})

/**
 * Normaliza a una config canónica desde cualquier origen: una fila snake_case
 * de `metric_clients` / `fin_invoices` (`ret_isl`, `ret_isl_rate`…), el objeto
 * ya normalizado de finanzasApi (`isl`, `islRate`…) o null.
 *
 * Una retención marcada sin tasa se considera INACTIVA: la BD lo impide con un
 * CHECK, pero el formulario puede pasar por ese estado intermedio mientras se
 * edita y no queremos que muestre un desglose a medias.
 *
 * @returns {{isl: boolean, islRate: number|null, iva: boolean, ivaRate: number|null, municipal: boolean}}
 */
export function normalizarRetenciones(raw) {
  if (!raw || typeof raw !== 'object') return { ...RETENCIONES_VACIAS }

  const islRate = num(raw.islRate ?? raw.ret_isl_rate)
  const ivaRate = num(raw.ivaRate ?? raw.ret_iva_rate)
  const isl = !!(raw.isl ?? raw.ret_isl) && islRate != null
  const iva = !!(raw.iva ?? raw.ret_iva) && ivaRate != null

  return {
    isl,
    islRate: isl ? islRate : null,
    iva,
    ivaRate: iva ? ivaRate : null,
    municipal: !!(raw.municipal ?? raw.ret_municipal),
  }
}

/** ¿Hay al menos una retención activa? Sirve para no mostrar desgloses vacíos. */
export function hayRetenciones(raw) {
  const c = normalizarRetenciones(raw)
  return c.isl || c.iva || c.municipal
}

/**
 * Desglose completo de un monto facturado que ya incluye IVA.
 *
 * CADA CIFRA SE REDONDEA A CÉNTIMOS EN SU PROPIO PASO (base, IVA y cada
 * retención), porque todas son líneas impresas del comprobante de retención
 * que entrega el cliente, no intermedios de cálculo: el desglose que muestra la
 * app tiene que poder cotejarse línea por línea contra ese papel. Encadenar
 * todo en una sola expresión daría un neto que a veces coincide y a veces
 * difiere en un céntimo, y un desglose cuyas partes no suman el total mostrado.
 * Con $1.000 (ISL 5%, IVA 75%, municipal) el neto es 844,83.
 *
 * @param {number} amount  monto facturado, IVA incluido
 * @param {object|null} raw  config de retenciones (cualquier formato aceptado
 *   por normalizarRetenciones)
 * @returns {{base: number, iva: number, retIva: number, retIsl: number,
 *   retMunicipal: number, totalRetenido: number, neto: number}}
 */
export function retencionesDe(amount, raw) {
  const monto = num(amount)
  if (monto == null || monto <= EPS) {
    const n = monto == null ? 0 : monto
    return { base: 0, iva: 0, retIva: 0, retIsl: 0, retMunicipal: 0, totalRetenido: 0, neto: n }
  }

  const c = normalizarRetenciones(raw)
  const base = round2(monto / (1 + IVA_RATE))
  const iva = round2(monto - base)

  const retIva = c.iva ? round2(iva * c.ivaRate) : 0
  const retIsl = c.isl ? round2(base * c.islRate) : 0
  const retMunicipal = c.municipal ? round2(base * MUNICIPAL_RATE) : 0

  const totalRetenido = round2(retIva + retIsl + retMunicipal)
  return {
    base,
    iva,
    retIva,
    retIsl,
    retMunicipal,
    totalRetenido,
    neto: round2(monto - totalRetenido),
  }
}

/**
 * Neto a cobrar de una factura ya normalizada por finanzasApi (usa su snapshot
 * `invoice.retenciones`). Una factura sin snapshot — toda la facturación
 * anterior a esta feature — devuelve su `amount` tal cual.
 */
export function netoDe(invoice) {
  const monto = num(invoice?.amount) ?? 0
  if (!hayRetenciones(invoice?.retenciones)) return monto
  return retencionesDe(monto, invoice.retenciones).neto
}

/** Σ de lo retenido en un conjunto de facturas (KPI "Retenido del mes"). */
export function totalRetenido(invoices) {
  return round2(
    (invoices ?? []).reduce(
      (a, inv) => a + retencionesDe(inv?.amount, inv?.retenciones).totalRetenido,
      0,
    ),
  )
}
