import { useState, useMemo, useEffect, useRef } from 'react'
import { fmtUSD } from '../../utils/metricsFinance'
import {
  cobrosPorMonedaDe,
  pendienteDe,
  estadoFactura,
  totalFacturado,
  totalCobrado,
  cobradoPorMoneda,
  facturadoPorMoneda,
  sinMonto,
  esMesPreparable,
} from '../../utils/finanzas'
import {
  loadOrCreateMonth,
  syncMonthInvoices,
  deleteInvoice,
  addInvoiceExclusion,
} from './finanzasApi'
import InvoiceModal from './InvoiceModal'
import CobroModal from './CobroModal'
import ConfirmDeleteDialog from '../common/ConfirmDeleteDialog'

const ESTADO_LABEL = {
  pendiente: { label: 'Pendiente', cls: 'bg-[#fbe9e8] text-[#c0392b]' },
  abonado: { label: 'Abonado', cls: 'bg-[#fff4d6] text-[#9a6800]' },
  cobrado: { label: 'Cobrado', cls: 'bg-[#e6f4ec] text-[#1f9d57]' },
}

const MONEDA_FILTROS = ['Todas', 'USD', 'Bs']

const VISTAS = [
  { key: 'facturacion', label: 'Facturación' },
  { key: 'cobros', label: 'Cobros' },
]

function fmtBs(n) {
  return Number(n ?? 0).toLocaleString('es-VE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

export default function FacturacionView({
  companyId,
  year,
  month,
  finMonth,
  invoices,
  clients,
  loading,
  refetch,
  canManage,
  canManageCobros,
  userId = null,
}) {
  const [modal, setModal] = useState(undefined) // undefined=cerrado, null=crear, obj=editar
  const [cobroInvoice, setCobroInvoice] = useState(null)
  const [toDelete, setToDelete] = useState(null)
  const [sort, setSort] = useState({ key: '', dir: 1 })
  const [vista, setVista] = useState('facturacion') // 'facturacion' | 'cobros'
  const [monedaFiltro, setMonedaFiltro] = useState('Todas')
  const enCobros = vista === 'cobros'

  // El mes se prepara solo al entrar: se crea su fila en `fin_months` si no
  // existe y se reconcilia su facturación con la cartera activa. Antes esto era
  // un botón "Abrir mes", un paso manual que no decidía nada (los meses pasan
  // igual) y que además solo corría una vez: un mes creado por otro camino — el
  // que abre `closeMonth()`, o una visita a otra tab — se quedaba vacío para
  // siempre, sin botón que lo llenara porque el mes ya existía.
  //
  // Las dos operaciones son seguras de repetir: `loadOrCreateMonth` no duplica
  // (unique por company/year/month) y `syncMonthInvoices` solo INSERTA lo que
  // falta. Aun así el ref corta el reintento mientras no cambie el periodo,
  // porque los refetch de realtime rehacen `clients`/`invoices` sin parar.
  // Crear el mes exige `finanzas.facturacion.manage` desde la migración
  // `20260929150000`; cerrarlo sigue siendo de `finanzas.cerrar_mes`.
  const preparedRef = useRef(null)
  useEffect(() => {
    if (!companyId || !canManage || loading || !clients?.length) return
    if (finMonth === undefined) return // aún cargando el mes
    if (finMonth?.closed || finMonth?.summaryOnly) return
    // Solo el mes en curso y los anteriores. Sin esto, pasear por el selector
    // materializaba meses futuros con la facturación completa: así aparecieron
    // solos noviembre 2026, enero 2027 y marzo 2027. Va ANTES de marcar el ref,
    // para que un mes futuro que pase a ser el actual sí se prepare.
    if (!esMesPreparable(year, month)) return
    const key = `${year}-${month}`
    if (preparedRef.current === key) return
    preparedRef.current = key
    let cancelled = false
    ;(async () => {
      let mes = finMonth
      if (!mes) {
        const { data: creado } = await loadOrCreateMonth(companyId, year, month)
        mes = creado
      }
      // Sin fila de mes no hay dónde colgar la facturación: se sale y la vista
      // queda en su estado vacío (p. ej. si el insert lo rechazó la RLS).
      if (!mes) return
      const { inserted } = await syncMonthInvoices({
        companyId,
        monthId: mes.id,
        year,
        month,
        clients,
        userId,
      })
      if (cancelled) return
      // `finMonth` nulo implica recargar sí o sí: la fila del mes es nueva y la
      // página todavía la tiene como "no abierto".
      //
      // Va con `false` (sin spinner) y es red de seguridad, no el camino
      // normal: el realtime ya refresca tras los inserts. Se mantiene porque si
      // el websocket no conecta (proxy, pestaña dormida) la vista se quedaría
      // en "Preparando el mes…" sin causa visible. Con `true` pondría
      // `loading`, y eso desmonta el contenido de la vista y cualquier modal
      // abierto.
      if (inserted > 0 || !finMonth) refetch(false)
    })()
    return () => {
      cancelled = true
    }
  }, [companyId, finMonth, canManage, loading, clients, year, month, userId, refetch])

  function sortBy(key) {
    setSort((s) => ({ key, dir: s.key === key ? -s.dir : 1 }))
  }

  const closed = !!finMonth?.closed
  const facturado = totalFacturado(invoices)
  const cobrado = totalCobrado(invoices)
  const pct = facturado ? Math.round((cobrado / facturado) * 100) : 0
  // Siempre sobre el total real (invoices), sin filtrar — el filtro de moneda de
  // abajo solo afecta las filas mostradas en la tabla, no estos resúmenes.
  const { usd: facturadoUsd, bs: facturadoBs } = useMemo(
    () => facturadoPorMoneda(invoices),
    [invoices],
  )
  const { bs: cobradoBs, divisa: cobradoDivisa } = useMemo(
    () => cobradoPorMoneda(invoices),
    [invoices],
  )
  // Marcas que entraron por la reconciliación sin monto que copiar (ni en su
  // perfil ni en el mes anterior): facturan 0 hasta que alguien las edite.
  const faltanMonto = useMemo(() => invoices.filter(sinMonto), [invoices])

  // En Facturación se listan TODAS las facturas del mes, sin filtro de moneda:
  // `invoice.currency` es la moneda configurada del cliente (casi siempre USD),
  // así que filtrar por ella no responde nada útil. En Cobros, en cambio, solo
  // salen las facturas con dinero cobrado y el filtro mira la moneda en la que
  // ENTRÓ el pago, incluyendo a las de cobro mixto en ambas monedas.
  let rows = enCobros
    ? invoices.filter((inv) => {
        const { monedas } = cobrosPorMonedaDe(inv)
        if (monedas.length === 0) return false
        return monedaFiltro === 'Todas' || monedas.includes(monedaFiltro)
      })
    : invoices.slice()
  if (sort.key) {
    rows.sort((a, b) => {
      let x, y
      if (sort.key === 'amount') return (a.amount - b.amount) * sort.dir
      if (sort.key === 'estado') {
        x = estadoFactura(a)
        y = estadoFactura(b)
      } else {
        x = (a.clientName || '').toLowerCase()
        y = (b.clientName || '').toLowerCase()
      }
      return x < y ? -sort.dir : x > y ? sort.dir : 0
    })
  }

  if (loading) return <div className="text-[14px] text-[#999] py-10 text-center">Cargando…</div>

  // Sin fila de mes se llega aquí en tres casos: el mes todavía no llegó,
  // mientras el efecto de arriba lo está preparando, o sin permiso para crearlo
  // (la lectura del módulo no alcanza). Ya no hay botón: el mes se abre solo.
  //
  // El aviso de mes futuro exige `!finMonth` a propósito: un mes futuro que SÍ
  // tiene fila —el siguiente, que crea `closeMonth()` al cerrar— se sigue
  // viendo normal, con su facturación.
  if (!finMonth && !esMesPreparable(year, month)) {
    return (
      <div className="bg-white border border-[#e0ddd4] rounded-xl p-10 text-center">
        <p className="text-[15px] font-semibold text-[#888] mb-3">Este mes todavía no llegó</p>
        <p className="text-[13.5px] text-[#bbb]">
          Su facturación se prepara sola cuando empiece el mes, con los clientes activos que haya
          entonces.
        </p>
      </div>
    )
  }

  if (!finMonth) {
    return (
      <div className="bg-white border border-[#e0ddd4] rounded-xl p-10 text-center">
        {canManage ? (
          <p className="text-[15px] font-semibold text-[#888]">Preparando el mes…</p>
        ) : (
          <>
            <p className="text-[15px] font-semibold text-[#888] mb-3">
              Este mes todavía no tiene facturación
            </p>
            <p className="text-[13.5px] text-[#bbb]">
              Se carga sola cuando entra alguien con permiso para gestionar la facturación.
            </p>
          </>
        )}
      </div>
    )
  }

  if (finMonth.summaryOnly) {
    return (
      <div className="bg-white border border-[#e0ddd4] rounded-xl p-10 text-center text-[13.5px] text-[#999]">
        Este mes se cargó como resumen (solo totales, sin factura por cliente) — no tiene
        facturación fila por fila que mostrar aquí.
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {closed && (
        <div className="bg-white border border-[#e0ddd4] rounded-xl p-3 text-[13.5px] text-[#888]">
          Este mes está cerrado — solo lectura.
        </div>
      )}

      {!enCobros && faltanMonto.length > 0 && (
        <div className="bg-[#fff8e6] border border-[#f0dfae] rounded-xl p-3 text-[13.5px] text-[#9a6800]">
          <span className="font-semibold">
            {faltanMonto.length === 1
              ? '1 marca sin monto asignado'
              : `${faltanMonto.length} marcas sin monto asignado`}
          </span>{' '}
          — no tienen mensualidad en su perfil ni facturación el mes pasado. Edita cada una para
          ponerle el monto: {faltanMonto.map((inv) => inv.clientName).join(', ')}.
        </div>
      )}

      <div className="grid grid-cols-3 gap-3">
        {enCobros ? (
          <>
            <div className="bg-white border border-[#e0ddd4] rounded-xl p-3">
              <p className="text-[11px] uppercase text-[#999]">Total cobrado</p>
              <p className="font-bold text-[#111] text-[16px]">{fmtUSD(cobrado)}</p>
            </div>
            <div className="bg-white border border-[#e0ddd4] rounded-xl p-3">
              <p className="text-[11px] uppercase text-[#999]">Cobrado en divisa</p>
              <p className="font-bold text-[#111] text-[16px]">{fmtUSD(cobradoDivisa)}</p>
            </div>
            <div className="bg-white border border-[#e0ddd4] rounded-xl p-3">
              <p className="text-[11px] uppercase text-[#999]">Cobrado en Bs</p>
              <p className="font-bold text-[#111] text-[16px]">{fmtUSD(cobradoBs)}</p>
            </div>
          </>
        ) : (
          <>
            <div className="bg-white border border-[#e0ddd4] rounded-xl p-3">
              <p className="text-[11px] uppercase text-[#999]">Total facturado</p>
              <p className="font-bold text-[#111] text-[16px]">{fmtUSD(facturado)}</p>
            </div>
            <div className="bg-white border border-[#e0ddd4] rounded-xl p-3">
              <p className="text-[11px] uppercase text-[#999]">Facturado en USD</p>
              <p className="font-bold text-[#111] text-[16px]">{fmtUSD(facturadoUsd)}</p>
            </div>
            <div className="bg-white border border-[#e0ddd4] rounded-xl p-3">
              <p className="text-[11px] uppercase text-[#999]">Facturado en Bs</p>
              <p className="font-bold text-[#111] text-[16px]">{fmtUSD(facturadoBs)}</p>
            </div>
          </>
        )}
      </div>

      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex-1 min-w-[240px]">
          <div className="flex justify-between text-[13px] text-[#666] mb-1">
            <span>
              {fmtUSD(cobrado)} cobrado de {fmtUSD(facturado)} facturado
            </span>
            <span>
              {pct}% · faltan {fmtUSD(facturado - cobrado)}
            </span>
          </div>
          <div className="h-2 rounded-full bg-[#f0ede3] overflow-hidden">
            <div className="h-full bg-[#1F9D57]" style={{ width: `${pct}%` }} />
          </div>
        </div>
        {canManage && !closed && !enCobros && (
          <button
            type="button"
            onClick={() => setModal(null)}
            className="px-3 py-2 rounded-xl text-[13.5px] font-semibold bg-[#111] text-white hover:bg-[#333]"
          >
            + Agregar facturación
          </button>
        )}
      </div>

      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex rounded-lg border border-[#e0ddd4] bg-white overflow-hidden">
          {VISTAS.map((v) => (
            <button
              key={v.key}
              type="button"
              onClick={() => setVista(v.key)}
              className={`px-3 py-1.5 text-[12.5px] font-semibold ${
                vista === v.key ? 'bg-[#111] text-white' : 'text-[#666] hover:bg-[#f5f3eb]'
              }`}
            >
              {v.label}
            </button>
          ))}
        </div>

        {enCobros && (
          <div className="flex items-center gap-2">
            <span className="text-[12px] text-[#888]">Moneda:</span>
            <div className="flex rounded-lg border border-[#e0ddd4] bg-white overflow-hidden">
              {MONEDA_FILTROS.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMonedaFiltro(m)}
                  className={`px-3 py-1.5 text-[12.5px] font-semibold ${
                    monedaFiltro === m ? 'bg-[#111] text-white' : 'text-[#666] hover:bg-[#f5f3eb]'
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {rows.length === 0 ? (
        <div className="bg-white border border-[#e0ddd4] rounded-xl p-8 text-center text-[13.5px] text-[#999]">
          {!enCobros
            ? 'Sin facturación este mes. Usa "Agregar facturación".'
            : monedaFiltro === 'Todas'
              ? 'Aún no hay cobros registrados este mes.'
              : `Ningún cobro en ${monedaFiltro} este mes.`}
        </div>
      ) : (
        <div className="bg-white border border-[#e0ddd4] rounded-xl overflow-x-auto">
          <table className="w-full text-[13.5px]">
            <thead>
              <tr className="border-b border-[#f0ede3] text-[11px] uppercase tracking-wide text-[#999]">
                <th className="text-left px-4 py-2 cursor-pointer" onClick={() => sortBy('client')}>
                  Cliente / concepto
                </th>
                <th
                  className="text-right px-4 py-2 cursor-pointer"
                  onClick={() => sortBy('amount')}
                >
                  Facturado
                </th>
                {enCobros ? (
                  <>
                    <th className="text-right px-4 py-2">Cobrado</th>
                    <th className="text-center px-4 py-2">Moneda</th>
                  </>
                ) : (
                  <th className="text-right px-4 py-2">Pendiente</th>
                )}
                <th
                  className="text-center px-4 py-2 cursor-pointer"
                  onClick={() => sortBy('estado')}
                >
                  Estado
                </th>
                <th className="text-center px-4 py-2">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((inv) => {
                const estado = estadoFactura(inv)
                const pend = pendienteDe(inv)
                // Solo en Cobros: el badge y el monto reflejan la moneda en la que
                // ENTRÓ el pago, no la de facturación — un cliente puede facturar
                // en USD y pagar en Bs, o abonar una parte en cada una.
                const { usd, bs, monedas } = cobrosPorMonedaDe(inv)
                const mixto = monedas.length > 1
                const soloBs = monedas.length === 1 && monedas[0] === 'Bs'
                return (
                  <tr key={inv.id} className="border-b border-[#f5f3eb] last:border-0">
                    <td className="px-4 py-2.5">
                      <div className="font-medium text-[#111]">{inv.clientName}</div>
                      <div className="text-[12px] text-[#999]">
                        {inv.concept}
                        {inv.recurring && ' · Recurrente'}
                        {!inv.clientId && ' · externo'}
                      </div>
                    </td>
                    <td className="text-right px-4 py-2.5 font-mono">
                      {sinMonto(inv) ? (
                        <span className="inline-block px-2 py-0.5 rounded-full text-[11.5px] font-semibold bg-[#fff4d6] text-[#9a6800]">
                          Sin monto
                        </span>
                      ) : (
                        fmtUSD(inv.amount)
                      )}
                    </td>
                    {enCobros ? (
                      <>
                        <td className="text-right px-4 py-2.5 font-mono text-[#1F9D57]">
                          {mixto
                            ? `${fmtUSD(usd)} + Bs ${fmtBs(bs)}`
                            : soloBs
                              ? `Bs ${fmtBs(bs)}`
                              : fmtUSD(usd)}
                        </td>
                        <td className="text-center px-4 py-2.5">
                          <span
                            className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                              soloBs || mixto
                                ? 'bg-[#eef0ff] text-[#4c3fd0]'
                                : 'bg-[#f0ede3] text-[#666]'
                            }`}
                          >
                            {monedas.join(' + ')}
                          </span>
                        </td>
                      </>
                    ) : (
                      <td className="text-right px-4 py-2.5 font-mono text-[#D6453F]">
                        {pend > 0.5 ? fmtUSD(pend) : '—'}
                      </td>
                    )}
                    <td className="text-center px-4 py-2.5">
                      <span
                        className={`inline-block px-2 py-0.5 rounded-full text-[11.5px] font-semibold ${ESTADO_LABEL[estado].cls}`}
                      >
                        {ESTADO_LABEL[estado].label}
                      </span>
                    </td>
                    <td className="text-center px-4 py-2.5 whitespace-nowrap">
                      {canManageCobros && (
                        <button
                          type="button"
                          onClick={() => setCobroInvoice(inv)}
                          className="text-[12.5px] font-semibold text-[#111] hover:underline mr-3"
                        >
                          {estado === 'pendiente'
                            ? 'Registrar cobro'
                            : estado === 'abonado'
                              ? 'Abonar'
                              : 'Ver cobro'}
                        </button>
                      )}
                      {canManage && !closed && !enCobros && (
                        <>
                          <button
                            type="button"
                            onClick={() => setModal(inv)}
                            className="text-[12.5px] text-[#666] hover:text-[#111] hover:underline mr-3"
                          >
                            Editar
                          </button>
                          <button
                            type="button"
                            onClick={() => setToDelete(inv)}
                            className="text-[12.5px] text-[#D6453F] hover:underline"
                          >
                            Eliminar
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {modal !== undefined && (
        <InvoiceModal
          invoice={modal}
          monthId={finMonth.id}
          companyId={companyId}
          clients={clients}
          year={year}
          month={month}
          onClose={() => setModal(undefined)}
          onSaved={() => {
            setModal(undefined)
            refetch()
          }}
        />
      )}

      {cobroInvoice && (
        <CobroModal
          invoice={cobroInvoice}
          companyId={companyId}
          canManage={canManageCobros && !closed}
          onClose={() => setCobroInvoice(null)}
          onSaved={() => {
            refetch()
          }}
        />
      )}

      {toDelete && (
        <ConfirmDeleteDialog
          itemLabel="cargo de facturación"
          itemName={toDelete.clientName}
          onCancel={() => setToDelete(null)}
          onConfirm={async () => {
            await deleteInvoice(toDelete.id)
            // Sin esto, la reconciliación volvería a crear el cargo en la
            // siguiente visita: hay que recordar que se borró a propósito. La
            // exclusión vale de este mes en adelante y se levanta sola al
            // volver a agregarle facturación a la marca (ver InvoiceModal).
            if (toDelete.clientId) {
              await addInvoiceExclusion({
                companyId,
                clientId: toDelete.clientId,
                year,
                month,
                userId,
              })
            }
            setToDelete(null)
            refetch()
          }}
        />
      )}
    </div>
  )
}
