import { useState } from 'react'
import { fmtUSD } from '../../utils/metricsFinance'
import {
  cobradoDe,
  pendienteDe,
  estadoFactura,
  totalFacturado,
  totalCobrado,
} from '../../utils/finanzas'
import { loadOrCreateMonth, deleteInvoice } from './finanzasApi'
import InvoiceModal from './InvoiceModal'
import CobroModal from './CobroModal'
import ConfirmDeleteDialog from '../common/ConfirmDeleteDialog'

const ESTADO_LABEL = {
  pendiente: { label: 'Pendiente', cls: 'bg-[#fbe9e8] text-[#c0392b]' },
  abonado: { label: 'Abonado', cls: 'bg-[#fff4d6] text-[#9a6800]' },
  cobrado: { label: 'Cobrado', cls: 'bg-[#e6f4ec] text-[#1f9d57]' },
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
}) {
  const [modal, setModal] = useState(undefined) // undefined=cerrado, null=crear, obj=editar
  const [cobroInvoice, setCobroInvoice] = useState(null)
  const [toDelete, setToDelete] = useState(null)
  const [opening, setOpening] = useState(false)
  const [sort, setSort] = useState({ key: '', dir: 1 })

  async function handleOpenMonth() {
    setOpening(true)
    await loadOrCreateMonth(companyId, year, month)
    setOpening(false)
    refetch()
  }

  function sortBy(key) {
    setSort((s) => ({ key, dir: s.key === key ? -s.dir : 1 }))
  }

  const closed = !!finMonth?.closed
  const facturado = totalFacturado(invoices)
  const cobrado = totalCobrado(invoices)
  const pct = facturado ? Math.round((cobrado / facturado) * 100) : 0

  let rows = [...invoices]
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

  if (!finMonth) {
    return (
      <div className="bg-white border border-[#e0ddd4] rounded-xl p-10 text-center">
        <p className="text-[15px] font-semibold text-[#888] mb-3">Este mes aún no se ha abierto</p>
        {canManage ? (
          <button
            type="button"
            onClick={handleOpenMonth}
            disabled={opening}
            className="px-4 py-2 rounded-xl text-[14px] font-semibold bg-[#111] text-white hover:bg-[#333] disabled:opacity-50"
          >
            {opening ? 'Abriendo…' : 'Abrir mes'}
          </button>
        ) : (
          <p className="text-[13.5px] text-[#bbb]">Pide a un administrador que lo abra.</p>
        )}
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
        {canManage && !closed && (
          <button
            type="button"
            onClick={() => setModal(null)}
            className="px-3 py-2 rounded-xl text-[13.5px] font-semibold bg-[#111] text-white hover:bg-[#333]"
          >
            + Agregar facturación
          </button>
        )}
      </div>

      {rows.length === 0 ? (
        <div className="bg-white border border-[#e0ddd4] rounded-xl p-8 text-center text-[13.5px] text-[#999]">
          Sin facturación este mes. Usa &ldquo;Agregar facturación&rdquo;.
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
                <th className="text-right px-4 py-2">Cobrado</th>
                <th className="text-right px-4 py-2">Pendiente</th>
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
                const cob = cobradoDe(inv)
                const pend = pendienteDe(inv)
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
                    <td className="text-right px-4 py-2.5 font-mono">{fmtUSD(inv.amount)}</td>
                    <td className="text-right px-4 py-2.5 font-mono text-[#1F9D57]">
                      {cob > 0.5 ? fmtUSD(cob) : '—'}
                    </td>
                    <td className="text-right px-4 py-2.5 font-mono text-[#D6453F]">
                      {pend > 0.5 ? fmtUSD(pend) : '—'}
                    </td>
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
                      {canManage && !closed && (
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
          clients={clients}
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
            setToDelete(null)
            refetch()
          }}
        />
      )}
    </div>
  )
}
