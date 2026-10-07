import { useState, useEffect } from 'react'
import { fmtUSD } from '../../utils/metricsFinance'
import { fmtDate } from '../../utils/formatDate'
import { cobradoDe, canjeadoDe, esIntercambio } from '../../utils/finanzas'
import { hayRetenciones, normalizarRetenciones, retencionesDe } from '../../utils/retenciones'
import {
  addPaymentsBatch,
  deletePayment,
  deleteDistributionsForInvoice,
  resolveRateBcv,
  updateInvoice,
  loadUltimasRetenciones,
} from './finanzasApi'
import RetencionesFields from './RetencionesFields'
import { METODOS_PAGO_USD, METODOS_PAGO_BS, METODOS_PAGO_INTERCAMBIO } from './constants'

// Una fila por forma de pago: un mismo cobro puede repartirse entre dinero en
// USD, dinero en Bs e intercambio. Máximo una línea por forma, así hay un solo
// estado de tasa (la fila Bs) y cada fila es un abono de `fin_payments`.
const FORMAS = [
  { key: 'USD', label: 'Dinero USD', metodos: METODOS_PAGO_USD },
  { key: 'Bs', label: 'Dinero Bs', metodos: METODOS_PAGO_BS },
  { key: 'Intercambio', label: 'Intercambio', metodos: METODOS_PAGO_INTERCAMBIO },
]

const round2 = (n) => Math.round(n * 100) / 100

function todayISO() {
  return new Date().toISOString().slice(0, 10)
}

function fmtBs(n) {
  return Number(n ?? 0).toLocaleString('es-VE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

/**
 * Modal de registro de cobro y abonos de una factura, más "quitar cobro"
 * (revierte todo). Mismo patrón que InvoiceModal.jsx: el monto SIEMPRE se
 * escribe en USD; si la fila Bs tiene monto solo se pide/confirma la tasa (BCV
 * auto-resuelta o personalizada). El equivalente en Bs (fin_payments.amount_bs)
 * se deriva de `amount × tasa`, nunca se escribe a mano. Una tasa personalizada
 * nunca se sube a fin_rates (eso contaminaría la BCV oficial del día que usan
 * otros cobros/pagos) — se guarda solo en el pago (`rate` + `rate_source='manual'`).
 *
 * Un cobro puede repartirse entre dinero (USD/Bs) e intercambio (canje): una
 * fila por forma, y todas se guardan juntas en un solo insert
 * (`addPaymentsBatch`). El intercambio es un abono `currency='Intercambio'`, sin
 * tasa ni Bs; salda la factura pero no es caja (ver `cobradoDe` vs `saldadoDe`).
 * Tras un cobro parcial el modal sigue abierto con el pendiente restante.
 */
export default function CobroModal({ invoice, companyId, canManage, onClose, onSaved }) {
  // Las retenciones se marcan AQUÍ, no en el perfil del cliente ni al emitir la
  // factura: el ISLR de una misma marca varía entre 2% y 5% de un mes a otro y
  // la retención real se conoce cuando el cliente paga y entrega su
  // comprobante. Se guardan en la factura (`fin_invoices.ret_*`) porque son de
  // la factura, no de cada abono.
  const [ret, setRet] = useState(() => normalizarRetenciones(invoice?.retenciones))
  // Lo que el usuario escribió en cada fila (texto del input). La fila USD es
  // especial: mientras `usdTocado` sea falso su valor NO se guarda aquí sino que se
  // deriva al renderizar (lo que falta por cobrar), ver `usdValue` más abajo.
  const [montos, setMontos] = useState({ USD: '', Bs: '', Intercambio: '' })
  const [usdTocado, setUsdTocado] = useState(false)
  const [metodos, setMetodos] = useState(() =>
    Object.fromEntries(FORMAS.map((f) => [f.key, f.metodos[0]])),
  )
  const [notas, setNotas] = useState({ USD: '', Bs: '', Intercambio: '' })
  const [date, setDate] = useState(todayISO())
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
  const bsNum = Number(montos.Bs) || 0
  const canjeNum = Number(montos.Intercambio) || 0
  // Mientras no escriban en la fila USD, esta sigue a lo que falta por cobrar
  // (neto − saldado − Bs − Intercambio). Es DERIVADO, no un efecto: así marcar una
  // retención o llenar otra fila la mueve en el mismo render, sin estado duplicado.
  const usdAuto = Math.max(round2(pendiente - bsNum - canjeNum), 0)
  const usdValue = usdTocado ? montos.USD : usdAuto > 0 ? String(usdAuto) : ''
  const usdNum = Number(usdValue) || 0
  const asignado = usdNum + bsNum + canjeNum
  const falta = pendiente - asignado
  const valorDe = { USD: usdValue, Bs: montos.Bs, Intercambio: montos.Intercambio }
  const bsActivo = bsNum > 0
  const effectiveRate = customRate ? Number(manualRate) || null : (rateInfo?.rate ?? null)
  const amountBs = bsActivo && effectiveRate ? round2(bsNum * effectiveRate) : null

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

  /** Cambia una retención; el monto USD sugerido la sigue solo (es derivado). */
  function cambiarRet(patch) {
    setRet((prev) => ({ ...prev, ...patch }))
  }

  // Resuelve la BCV vigente para la fecha elegida en cuanto la fila Bs tiene monto.
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

  function cambiarMonto(key, value) {
    // Vaciar la fila USD la devuelve al autocompletado.
    if (key === 'USD') setUsdTocado(value !== '')
    setMontos((prev) => ({ ...prev, [key]: value }))
    if (key === 'Bs' && !(Number(value) > 0)) {
      // Sin esto, volver a llenar Bs reutilizaría una tasa personalizada vieja.
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
    if (usdNum < 0 || bsNum < 0 || canjeNum < 0) {
      setError('Los montos no pueden ser negativos')
      return
    }
    if (asignado <= 0) {
      setError('El monto debe ser mayor a 0')
      return
    }
    if (asignado > pendiente + 0.5) {
      setError('No puedes cobrar más de lo pendiente')
      return
    }
    if (bsActivo && (!effectiveRate || effectiveRate <= 0)) {
      setError('Ingresa o confirma la tasa BCV')
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

    // Una fila por forma con monto; todas entran en un solo insert.
    const filas = []
    const base = (key, amount) => ({
      paidOn: date,
      amount,
      // Solo la fila Bs lleva equivalente y tasa; USD e Intercambio, nulos explícitos.
      amountBs: null,
      rate: null,
      rateSource: null,
      method: metodos[key],
      note: notas[key].trim() || null,
      currency: key,
    })
    if (usdNum > 0) filas.push(base('USD', usdNum))
    if (bsActivo) {
      filas.push({
        ...base('Bs', bsNum),
        amountBs,
        rate: effectiveRate,
        rateSource: customRate ? 'manual' : 'bcv',
      })
    }
    if (canjeNum > 0) filas.push(base('Intercambio', canjeNum))

    const { error: err } = await addPaymentsBatch(invoice.id, filas)
    setSaving(false)
    if (err) {
      setError(err.message)
      return
    }
    onSaved()
    if (falta > 0.5) {
      // Cobro parcial: sigue abierto con lo que falta precargado (la fila USD
      // vuelve al autocompletado) para registrar el resto más adelante.
      setMontos({ USD: '', Bs: '', Intercambio: '' })
      setUsdTocado(false)
      setNotas({ USD: '', Bs: '', Intercambio: '' })
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

              {/* Una fila por forma de pago: se llenan las que apliquen (p. ej.
                  $500 en USD y $500 en Intercambio) y un solo botón las guarda. */}
              <div className="space-y-2.5">
                <p className="text-[12px] font-mono font-bold uppercase tracking-wide text-[#888]">
                  Forma de pago (monto en USD)
                </p>
                {FORMAS.map((f) => (
                  <div key={f.key} className="space-y-1.5">
                    <div className="grid grid-cols-[88px_1fr_1fr] items-center gap-2">
                      <span className="text-[12.5px] font-semibold text-[#333]">{f.label}</span>
                      <input
                        type="number"
                        min="0"
                        aria-label={`Monto ${f.key}`}
                        className="input-base"
                        placeholder="0.00"
                        value={valorDe[f.key]}
                        onChange={(e) => cambiarMonto(f.key, e.target.value)}
                      />
                      <select
                        aria-label={`Método ${f.key}`}
                        className="input-base"
                        value={metodos[f.key]}
                        onChange={(e) =>
                          setMetodos((prev) => ({ ...prev, [f.key]: e.target.value }))
                        }
                      >
                        {f.metodos.map((m) => (
                          <option key={m}>{m}</option>
                        ))}
                      </select>
                    </div>
                    {Number(valorDe[f.key]) > 0 && (
                      <input
                        type="text"
                        aria-label={`Nota ${f.key}`}
                        className="input-base"
                        value={notas[f.key]}
                        onChange={(e) => setNotas((prev) => ({ ...prev, [f.key]: e.target.value }))}
                        placeholder={
                          f.key === 'Intercambio'
                            ? 'Qué se recibió a cambio (ej. 3 sesiones de fotos)'
                            : 'Nota (opcional): referencia, banco…'
                        }
                      />
                    )}
                  </div>
                ))}
                <p className={`text-[12px] ${falta < -0.5 ? 'text-[#D6453F]' : 'text-[#666]'}`}>
                  Asignado {fmtUSD(asignado)} de {fmtUSD(pendiente)} ·{' '}
                  {falta < -0.5
                    ? `Excede por ${fmtUSD(-falta)}`
                    : `Falta ${fmtUSD(Math.max(falta, 0))}`}
                </p>
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
                  {amountBs != null && (
                    <p className="text-[12px] text-[#666]">
                      Equivale a Bs <span className="font-mono">{fmtBs(amountBs)}</span>
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
