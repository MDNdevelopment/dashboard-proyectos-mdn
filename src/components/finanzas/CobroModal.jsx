import { useState, useEffect, useRef } from 'react'
import { fmtUSD } from '../../utils/metricsFinance'
import { fmtDate } from '../../utils/formatDate'
import { cobradoDe, canjeadoDe, esIntercambio, hoyISO } from '../../utils/finanzas'
import { hayRetenciones, normalizarRetenciones, retencionesDe } from '../../utils/retenciones'
import {
  FORMAS_PAGO,
  FORMA_LABELS,
  METODOS_POR_FORMA,
  MAX_PAGOS,
  nuevoPago,
  montoMostrado,
  totalesDePagos,
  usdEnBs,
  pagosReducer,
  validarPagos,
  filasParaGuardar,
} from '../../utils/cobroPagos'
import {
  addPaymentsBatch,
  deletePayment,
  deleteDistributionsForInvoice,
  resolveRateBcv,
  updateInvoice,
  loadUltimasRetenciones,
} from './finanzasApi'
import RetencionesFields from './RetencionesFields'

function fmtBs(n) {
  return Number(n ?? 0).toLocaleString('es-VE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

/**
 * Modal de registro de cobro y abonos de una factura, más "quitar cobro"
 * (revierte todo). Mismo patrón que InvoiceModal.jsx: el monto SIEMPRE se
 * escribe en USD; si algún pago es en Bs solo se pide/confirma la tasa (BCV
 * auto-resuelta o personalizada). El equivalente en Bs (fin_payments.amount_bs)
 * se deriva de `amount × tasa`, nunca se escribe a mano. Una tasa personalizada
 * nunca se sube a fin_rates (eso contaminaría la BCV oficial del día que usan
 * otros cobros/pagos) — se guarda solo en el pago (`rate` + `rate_source='manual'`).
 *
 * Un cobro es una LISTA de pagos ("+ Agregar pago"): cada uno con su forma (USD,
 * Bs o Intercambio), monto, método y nota, y todos se guardan juntos en un solo
 * insert (`addPaymentsBatch`). Los pagos en Bs comparten UNA tasa (la fecha del
 * cobro es una, así que la BCV del día también). El intercambio es un abono
 * `currency='Intercambio'`, sin tasa ni Bs; salda la factura pero no es caja (ver
 * `cobradoDe` vs `saldadoDe`). Toda la aritmética de la lista (autocompletado,
 * validación, filas a guardar) vive en `utils/cobroPagos.js`; aquí solo se pinta.
 */
export default function CobroModal({ invoice, companyId, canManage, onClose, onSaved }) {
  // Las retenciones se marcan AQUÍ, no en el perfil del cliente ni al emitir la
  // factura: el ISLR de una misma marca varía entre 2% y 5% de un mes a otro y
  // la retención real se conoce cuando el cliente paga y entrega su
  // comprobante. Se guardan en la factura (`fin_invoices.ret_*`) porque son de
  // la factura, no de cada abono.
  const [ret, setRet] = useState(() => normalizarRetenciones(invoice?.retenciones))
  const idRef = useRef(1)
  const siguienteId = () => ++idRef.current
  const [pagos, setPagos] = useState(() => [nuevoPago(1)])
  // `hoyISO()` y no `toISOString()`: este último da el día siguiente en Caracas
  // pasadas las 8 pm (ver "Fechas" en docs/arquitectura/finanzas.md).
  const [date, setDate] = useState(hoyISO())
  const [rateInfo, setRateInfo] = useState(null) // { rate, rateDate, source }
  const [customRate, setCustomRate] = useState(false)
  const [manualRate, setManualRate] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const cobrado = cobradoDe(invoice)
  const canjeado = canjeadoDe(invoice)
  const saldado = cobrado + canjeado
  // Contra el estado del FORMULARIO, no contra lo guardado en la factura: al
  // marcar un impuesto la cifra sugerida tiene que moverse ya, que es lo que el
  // usuario necesita ver para decidir cuánto cobrar.
  const desglose = retencionesDe(invoice?.amount, ret)
  const pendiente = desglose.neto - saldado
  const guardadas = normalizarRetenciones(invoice?.retenciones)
  const retCambiaron =
    ret.isl !== guardadas.isl ||
    ret.islRate !== guardadas.islRate ||
    ret.iva !== guardadas.iva ||
    ret.ivaRate !== guardadas.ivaRate ||
    ret.municipal !== guardadas.municipal
  const { asignado, falta, hayBs: bsActivo } = totalesDePagos(pagos, pendiente)
  const effectiveRate = customRate ? Number(manualRate) || null : (rateInfo?.rate ?? null)
  const totalBs =
    bsActivo && effectiveRate
      ? Math.round(usdEnBs(pagos, pendiente) * effectiveRate * 100) / 100
      : null

  // Precarga desde el historial: lo que esa marca retuvo la última vez. Solo si
  // la factura no trae ya las suyas (segundo abono, o consultar un cobro hecho)
  // y solo mientras nadie haya tocado los checks.
  useEffect(() => {
    if (hayRetenciones(invoice?.retenciones) || !invoice?.clientId) return
    let cancelled = false
    loadUltimasRetenciones(invoice.clientId).then(({ data }) => {
      if (cancelled || !data) return
      setRet(data)
    })
    return () => {
      cancelled = true
    }
    // Solo al montar: después manda lo que elija el usuario.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invoice?.id])

  /** Cambia una retención; el monto sugerido del último pago la sigue solo (es derivado). */
  function cambiarRet(patch) {
    setRet((prev) => ({ ...prev, ...patch }))
  }

  // Resuelve la BCV vigente para la fecha elegida en cuanto algún pago es en Bs.
  useEffect(() => {
    if (!bsActivo || !companyId) return
    let cancelled = false
    resolveRateBcv(companyId, date).then(({ data }) => {
      if (!cancelled) setRateInfo(data)
    })
    return () => {
      cancelled = true
    }
  }, [bsActivo, companyId, date])

  /** Aplica una acción a la lista de pagos (reducer puro de utils/cobroPagos.js). */
  function aplicar(accion) {
    const next = pagosReducer(pagos, accion)
    setPagos(next)
    if (!totalesDePagos(next, pendiente).hayBs) {
      // Sin ningún pago en Bs, una tasa personalizada vieja no debe reaparecer.
      setManualRate('')
      setCustomRate(false)
    }
  }

  function toggleCustomRate() {
    setCustomRate((prev) => {
      // Por defecto muestra la BCV: al activar la tasa personalizada, se precarga
      // con la BCV vigente en vez de arrancar vacía.
      if (!prev) setManualRate(rateInfo?.rate ?? '')
      return !prev
    })
  }

  async function handleAddPayment() {
    const invalido = validarPagos(pagos, pendiente, { tasa: effectiveRate })
    if (invalido) {
      setError(invalido)
      return
    }
    setSaving(true)
    setError(null)

    // El ORDEN importa: si se registrara el pago primero y fallara la escritura
    // de las retenciones, quedaría un cobro contra un neto equivocado y la
    // factura aparecería "Abonado" con una deuda fantasma igual a lo retenido.
    if (retCambiaron) {
      const { error: retErr } = await updateInvoice(invoice.id, { retenciones: ret })
      if (retErr) {
        setSaving(false)
        setError(`No se pudieron guardar las retenciones: ${retErr.message}`)
        return
      }
    }

    // Todos los pagos entran en un solo insert: o se guardan todos o ninguno.
    const filas = filasParaGuardar(pagos, pendiente, {
      fecha: date,
      tasa: effectiveRate,
      tasaManual: customRate,
    })
    const { error: err } = await addPaymentsBatch(invoice.id, filas)
    setSaving(false)
    if (err) {
      setError(err.message)
      return
    }
    onSaved()
    if (falta > 0.5) {
      // Cobro parcial: sigue abierto con un pago nuevo que ya trae lo que falta
      // (el autocompletado), para registrar el resto más adelante.
      setPagos([nuevoPago(siguienteId())])
      setCustomRate(false)
      setManualRate('')
      return
    }
    onClose()
  }

  async function handleRemovePayment(paymentId) {
    setSaving(true)
    await deletePayment(paymentId)
    setSaving(false)
    onSaved()
  }

  async function handleQuitarCobro() {
    if (!window.confirm('Se quitarán todos los abonos y la distribución registrada. ¿Continuar?'))
      return
    setSaving(true)
    for (const p of invoice.payments) await deletePayment(p.id)
    await deleteDistributionsForInvoice(invoice.id)
    setSaving(false)
    onSaved()
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/25 backdrop-blur-[3px]">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
        <div className="px-6 pt-5 pb-3 border-b border-[#ece9df]">
          <h2 className="text-[18px] font-bold text-[#111]">
            {saldado > 0.5 ? 'Cobro y abonos' : 'Registrar cobro'}
          </h2>
          <p className="text-[13px] text-[#888] mt-0.5">
            {invoice.clientName} · {invoice.concept} · facturado {fmtUSD(invoice.amount)}
            {/* Con retenciones, lo que se espera cobrar es el neto: decirlo aquí
                evita que parezca que la factura quedó corta de pago. */}
            {hayRetenciones(ret) && <> · neto {fmtUSD(desglose.neto)}</>}
          </p>
        </div>

        <div className="px-6 py-5 space-y-4">
          {error && <p className="text-[13px] text-[#D6453F]">{error}</p>}

          <div className="flex gap-2">
            <div className="flex-1 bg-[#f5f3eb] rounded-lg px-3 py-2">
              <p className="text-[11px] text-[#999]">Cobrado</p>
              <p className="font-bold text-[#1F9D57]">{fmtUSD(cobrado)}</p>
            </div>
            {canjeado > 0.5 && (
              <div className="flex-1 bg-[#f5f3eb] rounded-lg px-3 py-2">
                <p className="text-[11px] text-[#999]">Intercambio</p>
                <p className="font-bold text-[#9a6800]">{fmtUSD(canjeado)}</p>
              </div>
            )}
            <div className="flex-1 bg-[#f5f3eb] rounded-lg px-3 py-2">
              <p className="text-[11px] text-[#999]">Pendiente</p>
              <p className={`font-bold ${pendiente > 0.5 ? 'text-[#D6453F]' : 'text-[#999]'}`}>
                {fmtUSD(pendiente)}
              </p>
            </div>
          </div>

          {invoice.payments.length > 0 && (
            <div>
              <p className="text-[12px] text-[#888] mb-1.5">Abonos registrados</p>
              <div className="space-y-1.5">
                {invoice.payments.map((p) => (
                  <div
                    key={p.id}
                    className="flex items-center justify-between bg-[#faf9f5] rounded-lg px-3 py-2 text-[12.5px]"
                  >
                    <div>
                      <span className="font-bold text-[#111]">{fmtUSD(p.amount)}</span>{' '}
                      {esIntercambio(p) && (
                        <span className="px-1.5 py-0.5 rounded-full text-[10.5px] font-semibold bg-[#fff3d1] text-[#9a6800]">
                          Intercambio
                        </span>
                      )}{' '}
                      {p.amountBs != null && (
                        <span className="text-[#999]">
                          (Bs {fmtBs(p.amountBs)} · tasa {p.rate}){' '}
                        </span>
                      )}
                      <span className="text-[#999]">
                        · {p.method || '—'} · {fmtDate(p.paidOn)}
                      </span>
                      {p.note && <span className="text-[#999]"> · {p.note}</span>}
                    </div>
                    {canManage && (
                      <button
                        type="button"
                        onClick={() => handleRemovePayment(p.id)}
                        disabled={saving}
                        className="text-[#D6453F] hover:underline"
                      >
                        Quitar
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Retenciones — se marcan al cobrar, con el comprobante del cliente
              delante. Visibles también con la factura saldada, para consultar
              qué se retuvo. */}
          <div className="rounded-xl border border-[#e0ddd4] p-3 space-y-2.5">
            <p className="text-[12px] font-mono font-bold uppercase tracking-wide text-[#888]">
              Retenciones del cliente
            </p>
            <RetencionesFields
              value={ret}
              onChange={cambiarRet}
              disabled={!canManage}
              idPrefix="cobro"
            />
            {hayRetenciones(ret) && (
              <div className="pt-2 border-t border-[#f0ede3] space-y-0.5">
                <Fila label="Base imponible" valor={fmtUSD(desglose.base)} tenue />
                <Fila label="IVA 16%" valor={fmtUSD(desglose.iva)} tenue />
                {ret.iva && (
                  <Fila
                    label={`Retención IVA ${Math.round(ret.ivaRate * 100)}%`}
                    valor={`− ${fmtUSD(desglose.retIva)}`}
                    tenue
                  />
                )}
                {ret.isl && (
                  <Fila
                    label={`Retención ISL ${ret.islRate * 100}%`}
                    valor={`− ${fmtUSD(desglose.retIsl)}`}
                    tenue
                  />
                )}
                {ret.municipal && (
                  <Fila
                    label="Impuesto municipal 1%"
                    valor={`− ${fmtUSD(desglose.retMunicipal)}`}
                    tenue
                  />
                )}
                <div className="flex items-center justify-between pt-1">
                  <span className="text-[13px] font-bold text-[#111]">Neto a cobrar</span>
                  <span className="font-mono text-[14px] font-bold text-[#111]">
                    {fmtUSD(desglose.neto)}
                  </span>
                </div>
              </div>
            )}
            {invoice?.clientId && (
              <p className="text-[11.5px] text-[#999]">
                Sugerido por lo que se le retuvo la última vez. Confírmalo contra el comprobante.
              </p>
            )}
          </div>

          {canManage && pendiente > 0.5 && (
            <>
              <div>
                <label
                  htmlFor="cobro-fecha"
                  className="block text-[12px] font-mono font-bold uppercase tracking-wide text-[#888] mb-1.5"
                >
                  Fecha
                </label>
                <input
                  id="cobro-fecha"
                  type="date"
                  className="input-base"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
              </div>

              {/* Lista de pagos: cada uno es un abono. El monto siempre en USD. */}
              <div className="space-y-2.5">
                <p className="text-[12px] font-mono font-bold uppercase tracking-wide text-[#888]">
                  Pagos (monto en USD)
                </p>
                {pagos.map((p, i) => {
                  const n = i + 1
                  return (
                    <div key={p.id} className="rounded-xl border border-[#e0ddd4] p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[12px] font-semibold text-[#333]">Pago {n}</span>
                        {pagos.length > 1 && (
                          <button
                            type="button"
                            aria-label={`Quitar pago ${n}`}
                            onClick={() => aplicar({ tipo: 'quitar', id: p.id })}
                            className="text-[12px] font-semibold text-[#D6453F] hover:underline"
                          >
                            ✕
                          </button>
                        )}
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        <select
                          aria-label={`Forma de pago ${n}`}
                          className="input-base"
                          value={p.forma}
                          onChange={(e) =>
                            aplicar({
                              tipo: 'editar',
                              id: p.id,
                              campo: 'forma',
                              valor: e.target.value,
                            })
                          }
                        >
                          {FORMAS_PAGO.map((f) => (
                            <option key={f} value={f}>
                              {FORMA_LABELS[f]}
                            </option>
                          ))}
                        </select>
                        <input
                          type="number"
                          min="0"
                          aria-label={`Monto pago ${n}`}
                          className="input-base"
                          placeholder="0.00"
                          value={montoMostrado(pagos, i, pendiente)}
                          onChange={(e) =>
                            aplicar({
                              tipo: 'editar',
                              id: p.id,
                              campo: 'monto',
                              valor: e.target.value,
                            })
                          }
                        />
                        <select
                          aria-label={`Método pago ${n}`}
                          className="input-base"
                          value={p.metodo}
                          onChange={(e) =>
                            aplicar({
                              tipo: 'editar',
                              id: p.id,
                              campo: 'metodo',
                              valor: e.target.value,
                            })
                          }
                        >
                          {METODOS_POR_FORMA[p.forma].map((m) => (
                            <option key={m}>{m}</option>
                          ))}
                        </select>
                      </div>
                      <input
                        type="text"
                        aria-label={`Nota pago ${n}`}
                        className="input-base"
                        value={p.nota}
                        onChange={(e) =>
                          aplicar({
                            tipo: 'editar',
                            id: p.id,
                            campo: 'nota',
                            valor: e.target.value,
                          })
                        }
                        placeholder={
                          p.forma === 'Intercambio'
                            ? 'Qué se recibió a cambio (ej. 3 sesiones de fotos)'
                            : 'Nota (opcional): referencia, banco…'
                        }
                      />
                    </div>
                  )
                })}
                <div className="flex items-center justify-between gap-3">
                  <button
                    type="button"
                    onClick={() => aplicar({ tipo: 'agregar', id: siguienteId(), pendiente })}
                    disabled={pagos.length >= MAX_PAGOS}
                    className="px-3 py-1.5 rounded-lg text-[13px] font-semibold text-[#111] border border-[#e0ddd4] hover:bg-[#f5f3eb] disabled:opacity-40"
                  >
                    + Agregar pago
                  </button>
                  <p className={`text-[12px] ${falta < -0.5 ? 'text-[#D6453F]' : 'text-[#666]'}`}>
                    Asignado {fmtUSD(asignado)} de {fmtUSD(pendiente)} ·{' '}
                    {falta < -0.5
                      ? `Excede por ${fmtUSD(-falta)}`
                      : `Falta ${fmtUSD(Math.max(falta, 0))}`}
                  </p>
                </div>
              </div>

              {bsActivo && (
                <div className="rounded-xl border border-[#e0ddd4] p-3 space-y-3">
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="block text-[12px] font-mono font-bold uppercase tracking-wide text-[#888]">
                        Tasa BCV
                      </label>
                      <button
                        type="button"
                        onClick={toggleCustomRate}
                        className="text-[11.5px] font-semibold text-[#666] hover:text-[#111] hover:underline"
                      >
                        {customRate ? 'Usar tasa BCV' : 'Usar tasa personalizada'}
                      </button>
                    </div>
                    {customRate ? (
                      <input
                        type="number"
                        step="0.0001"
                        aria-label="Tasa personalizada"
                        className="input-base"
                        value={manualRate}
                        onChange={(e) => setManualRate(e.target.value)}
                      />
                    ) : (
                      <>
                        {rateInfo?.source === 'bcv' && (
                          <p className="text-[12px] text-[#666]">
                            BCV {fmtDate(rateInfo.rateDate)}:{' '}
                            <span className="font-mono">{fmtBs(rateInfo.rate)}</span>
                          </p>
                        )}
                        {rateInfo?.source === 'stale' && (
                          <p className="text-[12px] text-[#9a6800]">
                            No se pudo obtener la tasa de hoy — se usa la del{' '}
                            {fmtDate(rateInfo.rateDate)}:{' '}
                            <span className="font-mono">{fmtBs(rateInfo.rate)}</span>
                          </p>
                        )}
                        {rateInfo?.source === 'missing' && (
                          <p className="text-[12px] text-[#9a6800]">
                            No hay tasa BCV disponible — usa una tasa personalizada.
                          </p>
                        )}
                        {!rateInfo && <p className="text-[12px] text-[#999]">Cargando tasa…</p>}
                      </>
                    )}
                  </div>
                  {totalBs != null && (
                    <p className="text-[12px] text-[#666]">
                      Equivale a Bs <span className="font-mono">{fmtBs(totalBs)}</span>
                    </p>
                  )}
                </div>
              )}
            </>
          )}

          {canManage && pendiente <= 0.5 && (
            <div className="bg-[#e6f4ec] text-[#1F9D57] p-3 rounded-lg text-center text-[13px] font-semibold">
              Cobro completo ✓
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-[14px] font-semibold text-[#555] border border-[#e0ddd4] hover:bg-[#f5f3eb]"
            >
              Cerrar
            </button>
            {canManage && saldado > 0.5 && (
              <button
                type="button"
                onClick={handleQuitarCobro}
                disabled={saving}
                className="px-4 py-2 rounded-xl text-[14px] font-semibold text-[#D6453F] border border-[#e0ddd4] hover:bg-[#fbe9e8] disabled:opacity-50"
              >
                Quitar cobro
              </button>
            )}
            {canManage && pendiente > 0.5 && (
              <button
                type="button"
                onClick={handleAddPayment}
                disabled={saving}
                className="px-4 py-2 rounded-xl text-[14px] font-bold bg-[#111] text-white hover:bg-[#333] disabled:opacity-50"
              >
                {saving ? 'Guardando…' : 'Registrar cobro'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function Fila({ label, valor, tenue }) {
  return (
    <div className="flex items-center justify-between text-[12.5px]">
      <span className={tenue ? 'text-[#888]' : 'text-[#333]'}>{label}</span>
      <span className={`font-mono ${tenue ? 'text-[#888]' : 'text-[#333]'}`}>{valor}</span>
    </div>
  )
}
