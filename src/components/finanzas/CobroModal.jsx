import { useState, useEffect } from 'react'
import { fmtUSD } from '../../utils/metricsFinance'
import { fmtDate } from '../../utils/formatDate'
import { cobradoDe, canjeadoDe, saldadoDe, esIntercambio } from '../../utils/finanzas'
import { hayRetenciones, normalizarRetenciones, retencionesDe } from '../../utils/retenciones'
import {
  addPayment,
  deletePayment,
  deleteDistributionsForInvoice,
  resolveRateBcv,
  updateInvoice,
  loadUltimasRetenciones,
} from './finanzasApi'
import RetencionesFields from './RetencionesFields'
import { METODOS_PAGO_USD, METODOS_PAGO_BS, METODOS_PAGO_INTERCAMBIO } from './constants'

const MONEDAS_COBRO = ['USD', 'Bs', 'Intercambio']

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
 * escribe en USD — un toggle de moneda decide si el cobro entró en Bs, y en
 * ese caso solo se pide/confirma la tasa (BCV auto-resuelta o personalizada).
 * El equivalente en Bs (fin_payments.amount_bs) se deriva de `amount × tasa`,
 * nunca se escribe a mano. Una tasa personalizada nunca se sube a fin_rates
 * (eso contaminaría la BCV oficial del día que usan otros cobros/pagos) — se
 * guarda solo en el pago (`rate` + `rate_source='manual'`).
 *
 * Una factura puede saldarse parte en dinero y parte en intercambio (canje): la
 * tercera opción del toggle registra un abono `currency='Intercambio'`, sin tasa
 * ni Bs. Salda la factura pero no es caja (ver `cobradoDe` vs `saldadoDe`). Tras
 * un abono parcial el modal sigue abierto con el pendiente restante, para
 * registrar el siguiente.
 */
/** Neto pendiente de una factura bajo una config de retenciones dada. */
function pendienteLocalDe(invoice, ret) {
  return retencionesDe(invoice?.amount, ret).neto - saldadoDe(invoice)
}

export default function CobroModal({ invoice, companyId, canManage, onClose, onSaved }) {
  // Las retenciones se marcan AQUÍ, no en el perfil del cliente ni al emitir la
  // factura: el ISLR de una misma marca varía entre 2% y 5% de un mes a otro y
  // la retención real se conoce cuando el cliente paga y entrega su
  // comprobante. Se guardan en la factura (`fin_invoices.ret_*`) porque son de
  // la factura, no de cada abono.
  const [ret, setRet] = useState(() => normalizarRetenciones(invoice?.retenciones))
  // El monto sugerido sigue al neto mientras el usuario no lo haya escrito a
  // mano: sin esto, marcar un impuesto le pisaría la cifra que acaba de teclear.
  const [montoTocado, setMontoTocado] = useState(false)
  const [amount, setAmount] = useState(() => pendienteLocalDe(invoice, invoice?.retenciones))
  const [currency, setCurrency] = useState('USD')
  const [method, setMethod] = useState(METODOS_PAGO_USD[0])
  const [date, setDate] = useState(todayISO())
  const [note, setNote] = useState('')
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
  const isBs = currency === 'Bs'
  const isCanje = currency === 'Intercambio'
  const metodos = isCanje ? METODOS_PAGO_INTERCAMBIO : isBs ? METODOS_PAGO_BS : METODOS_PAGO_USD
  const effectiveRate = customRate ? Number(manualRate) || null : (rateInfo?.rate ?? null)
  const amountBs =
    isBs && effectiveRate && Number(amount) > 0
      ? Math.round(Number(amount) * effectiveRate * 100) / 100
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
      setAmount((prev) => (montoTocado ? prev : retencionesDe(invoice.amount, data).neto - saldado))
    })
    return () => {
      cancelled = true
    }
    // Solo al montar: después manda lo que elija el usuario.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invoice?.id])

  /** Cambia una retención y arrastra el monto sugerido, si no lo escribieron. */
  function cambiarRet(patch) {
    setRet((prev) => {
      const next = { ...prev, ...patch }
      if (!montoTocado) setAmount(retencionesDe(invoice?.amount, next).neto - saldado)
      return next
    })
  }

  // Resuelve la BCV vigente para la fecha elegida en cuanto la moneda es Bs.
  useEffect(() => {
    if (!isBs || !companyId) return
    let cancelled = false
    resolveRateBcv(companyId, date).then(({ data }) => {
      if (!cancelled) setRateInfo(data)
    })
    return () => {
      cancelled = true
    }
  }, [isBs, companyId, date])

  function handleSetCurrency(cur) {
    setCurrency(cur)
    if (cur !== 'Bs') {
      // Sin esto, volver a Bs mostraría datos de una elección anterior.
      setManualRate('')
      setCustomRate(false)
    }
    setMethod(
      cur === 'Intercambio'
        ? METODOS_PAGO_INTERCAMBIO[0]
        : cur === 'Bs'
          ? METODOS_PAGO_BS[0]
          : METODOS_PAGO_USD[0],
    )
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
    const amt = Number(amount)
    if (!amt || amt <= 0) {
      setError('El monto debe ser mayor a 0')
      return
    }
    if (amt > pendiente + 0.5) {
      setError('No puedes cobrar más de lo pendiente')
      return
    }
    if (isBs && (!effectiveRate || effectiveRate <= 0)) {
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

    const { error: err } = await addPayment(invoice.id, {
      paidOn: date,
      amount: amt,
      amountBs: isBs ? amountBs : null,
      rate: isBs ? effectiveRate : null,
      method,
      note,
      currency,
      rateSource: isBs ? (customRate ? 'manual' : 'bcv') : null,
    })
    setSaving(false)
    if (err) {
      setError(err.message)
      return
    }
    onSaved()
    const restante = pendiente - amt
    if (restante > 0.5) {
      // Abono parcial (p. ej. la mitad en dinero): sigue abierto con lo que falta
      // precargado para registrar el resto, que puede ser en otra forma de pago.
      setMontoTocado(false)
      setAmount(Math.round(restante * 100) / 100)
      setNote('')
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
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
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
              <div className="grid grid-cols-5 gap-3">
                <div className="col-span-2">
                  <label className="block text-[12px] font-mono font-bold uppercase tracking-wide text-[#888] mb-1.5">
                    {isCanje ? 'Valor recibido (USD)' : 'Monto cobrado (USD)'}
                  </label>
                  <input
                    type="number"
                    className="input-base"
                    value={amount}
                    onChange={(e) => {
                      setMontoTocado(true)
                      setAmount(e.target.value)
                    }}
                  />
                </div>
                <div className="col-span-3">
                  <label className="block text-[12px] font-mono font-bold uppercase tracking-wide text-[#888] mb-1.5">
                    Forma de pago
                  </label>
                  <div className="flex rounded-lg border border-[#e0ddd4] overflow-hidden">
                    {MONEDAS_COBRO.map((cur) => (
                      <button
                        key={cur}
                        type="button"
                        onClick={() => handleSetCurrency(cur)}
                        className={`flex-1 py-2 text-[13px] font-semibold ${
                          currency === cur
                            ? 'bg-[#111] text-white'
                            : 'text-[#666] hover:bg-[#f5f3eb]'
                        }`}
                      >
                        {cur}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[12px] font-mono font-bold uppercase tracking-wide text-[#888] mb-1.5">
                    Método de pago
                  </label>
                  <select
                    className="input-base"
                    value={method}
                    onChange={(e) => setMethod(e.target.value)}
                  >
                    {metodos.map((m) => (
                      <option key={m}>{m}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[12px] font-mono font-bold uppercase tracking-wide text-[#888] mb-1.5">
                    Fecha
                  </label>
                  <input
                    type="date"
                    className="input-base"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                  />
                </div>
              </div>

              {isBs && (
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

              <div>
                <label className="block text-[12px] font-mono font-bold uppercase tracking-wide text-[#888] mb-1.5">
                  Nota (opcional)
                </label>
                <input
                  type="text"
                  className="input-base"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder={
                    isCanje
                      ? 'Qué se recibió a cambio (ej. 3 sesiones de fotos)'
                      : 'Ej. referencia, banco, tasa Bs…'
                  }
                />
              </div>
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
