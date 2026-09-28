import { useState, useEffect, useCallback } from 'react'
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../supabase'
import { loadClients, loadLines } from '../components/metricas/metricsApi'
import {
  loadMonth,
  loadInvoices,
  loadDistributions,
  loadMonthTotals,
  loadFxOperationsUpTo,
  loadBsLedgerUpTo,
  loadRates,
  resolveRateBcv,
} from '../components/finanzas/finanzasApi'
import MonthPeriodPicker, {
  thisMonthStr,
  monthStrToDate,
} from '../components/common/MonthPeriodPicker'
import DashboardView from '../components/finanzas/DashboardView'
import FacturacionView from '../components/finanzas/FacturacionView'
import ClientesView from '../components/finanzas/ClientesView'
import DistribucionView from '../components/finanzas/DistribucionView'
import PartidaView from '../components/finanzas/PartidaView'
import PorCobrarView from '../components/finanzas/PorCobrarView'
import CajaBsView from '../components/finanzas/CajaBsView'

const ALL_TABS = [
  { key: 'dashboard', label: 'Dashboard', path: '/finanzas' },
  { key: 'facturacion', label: 'Facturación', path: '/finanzas/facturacion' },
  { key: 'clientes', label: 'Clientes', path: '/finanzas/clientes' },
  { key: 'distribucion', label: 'Distribución', path: '/finanzas/distribucion' },
  { key: 'porcobrar', label: 'Por cobrar', path: '/finanzas/por-cobrar' },
  { key: 'cajabs', label: 'Caja Bs', path: '/finanzas/caja-bs' },
]

function tabCapability(key) {
  return `finanzas.${key}`
}

function pathToKey(pathname) {
  if (pathname.startsWith('/finanzas/facturacion')) return 'facturacion'
  if (pathname.startsWith('/finanzas/clientes')) return 'clientes'
  if (pathname.startsWith('/finanzas/distribucion')) return 'distribucion'
  if (pathname.startsWith('/finanzas/por-cobrar')) return 'porcobrar'
  if (pathname.startsWith('/finanzas/caja-bs')) return 'cajabs'
  return 'dashboard'
}

/**
 * Orquestador multi-tab del módulo Finanzas, calcado de EmpresaPage.jsx: filtra
 * tabs por capability y redirige si la ruta activa no está permitida. A
 * diferencia de Empresa, centraliza aquí la carga de datos del periodo activo
 * (mes seleccionado, facturas, distribuciones, cartera) porque todas las
 * pestañas — salvo Clientes — comparten el mismo mes de trabajo.
 */
export default function FinanzasPage() {
  const { userProfile, can = () => true } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const { partida } = useParams()
  const [searchParams, setSearchParams] = useSearchParams()
  const companyId = userProfile?.company_id

  const monthStr = searchParams.get('mes') || thisMonthStr()
  const monthDate = monthStrToDate(monthStr)
  const year = monthDate.getFullYear()
  const month = monthDate.getMonth() + 1

  function setMonthStr(next) {
    setSearchParams((prev) => {
      const p = new URLSearchParams(prev)
      p.set('mes', next)
      return p
    })
  }

  const tabs = ALL_TABS.filter((t) => can(tabCapability(t.key)))
  const activeKey = pathToKey(location.pathname)

  useEffect(() => {
    if (userProfile == null) return
    if (!can(tabCapability(activeKey))) {
      const firstAllowed = ALL_TABS.find((t) => can(tabCapability(t.key)))
      navigate(firstAllowed ? firstAllowed.path : '/', { replace: true })
    }
  }, [activeKey, can, navigate, userProfile])

  const [finMonth, setFinMonth] = useState(undefined) // undefined=cargando, null=no abierto
  const [invoices, setInvoices] = useState([])
  const [distributions, setDistributions] = useState([])
  const [monthTotals, setMonthTotals] = useState(null)
  const [clients, setClients] = useState([])
  const [lines, setLines] = useState([])
  const [loading, setLoading] = useState(true)
  // Caja Bs y divisas son ACUMULADOS (§10 de la spec): no se cierran por mes,
  // así que se cargan siempre `<= (year, month)`, aparte de invoices/distributions
  // (que sí son del mes activo). rateBcv es la tasa vigente al último día del mes.
  const [fxOperations, setFxOperations] = useState([])
  const [bsLedger, setBsLedger] = useState([])
  const [rates, setRates] = useState([])
  const [rateBcv, setRateBcv] = useState(null)

  // `showLoading=false` para los refetch disparados por realtime (incluida la
  // propia escritura a fin_rates al resolver la tasa BCV en vivo — ver
  // resolveRateBcv() en finanzasApi.js): con `loading=true`, FacturacionView
  // desmonta su contenido (early return "Cargando…", ver línea ~86), lo que
  // desmonta InvoiceModal si estaba abierto y reinicia su estado (moneda vuelve
  // a USD, tasa se pierde) — el usuario lo percibía como "se recarga el sitio"
  // justo al elegir Bs. Los refetch de fondo actualizan los datos sin bloquear
  // la vista; solo la carga inicial (mount) y las acciones explícitas del
  // usuario (abrir mes, guardar) muestran el estado de carga.
  const fetchPeriod = useCallback(
    async (showLoading = true) => {
      if (!companyId) return
      if (showLoading) setLoading(true)
      const { data: m } = await loadMonth(companyId, year, month)
      setFinMonth(m ?? null)
      if (m?.summaryOnly) {
        const { data: totals } = await loadMonthTotals(m.id)
        setMonthTotals(totals ?? null)
        setInvoices([])
        setDistributions([])
      } else if (m) {
        const [{ data: inv }, { data: dist }] = await Promise.all([
          loadInvoices(m.id),
          loadDistributions(m.id),
        ])
        setInvoices(inv ?? [])
        setDistributions(dist ?? [])
        setMonthTotals(null)
      } else {
        setInvoices([])
        setDistributions([])
        setMonthTotals(null)
      }

      const lastDayOfMonth = new Date(year, month, 0).toISOString().slice(0, 10)
      const [{ data: fx }, { data: ledger }, { data: rts }, { data: rateInfo }] = await Promise.all(
        [
          loadFxOperationsUpTo(companyId, year, month),
          loadBsLedgerUpTo(companyId, year, month),
          loadRates(companyId),
          resolveRateBcv(companyId, lastDayOfMonth),
        ],
      )
      setFxOperations(fx ?? [])
      setBsLedger(ledger ?? [])
      setRates(rts ?? [])
      setRateBcv(rateInfo ?? null)

      if (showLoading) setLoading(false)
    },
    [companyId, year, month],
  )

  const fetchBase = useCallback(async () => {
    if (!companyId) return
    const [{ data: cl }, { data: ln }] = await Promise.all([
      loadClients(companyId),
      loadLines(companyId),
    ])
    setClients(cl ?? [])
    setLines(ln ?? [])
  }, [companyId])

  useEffect(() => {
    fetchBase()
  }, [fetchBase])

  useEffect(() => {
    fetchPeriod()
  }, [fetchPeriod])

  useEffect(() => {
    if (!companyId) return
    // fetchPeriod(false): Supabase invoca el callback con el payload del cambio
    // como argumento — sin este wrapper, ese payload (truthy) caería en el
    // parámetro `showLoading` y reactivaría el "Cargando…" que se quería evitar.
    const backgroundRefetch = () => fetchPeriod(false)
    const channel = supabase
      .channel('finanzas-view')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'fin_months' },
        backgroundRefetch,
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'fin_invoices' },
        backgroundRefetch,
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'fin_payments' },
        backgroundRefetch,
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'fin_distributions' },
        backgroundRefetch,
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'fin_month_totals' },
        backgroundRefetch,
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'fin_fx_operations' },
        backgroundRefetch,
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'fin_bs_ledger' },
        backgroundRefetch,
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'fin_rates' },
        backgroundRefetch,
      )
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [companyId, fetchPeriod])

  if (!userProfile) return null

  const canManageFacturacion = can('finanzas.facturacion.manage')
  const canManageCobros = can('finanzas.cobros.manage')
  const canManageDistribucion = can('finanzas.distribucion.manage')
  const canCerrarMes = can('finanzas.cerrar_mes')
  const canManagePartidas = can('finanzas.partidas.manage')
  // Comprar/vender divisas, cargar la tasa BCV y el ajuste de cuadre de Caja Bs
  // reusan finanzas.distribucion.manage — decisión A2, sin capability nueva.
  const canManageDivisas = canManageDistribucion

  const shared = {
    companyId,
    year,
    month,
    monthStr,
    finMonth,
    invoices,
    distributions,
    monthTotals,
    clients,
    lines,
    loading,
    refetch: fetchPeriod,
    userProfile,
    fxOperations,
    bsLedger,
    rates,
    rateBcv,
  }

  return (
    <main className="flex-1 overflow-y-auto main-bg h-screen">
      <div className="max-w-7xl mx-auto px-4 py-6 sm:px-6 sm:py-8">
        <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
          <div>
            <h1 className="text-[26px] font-bold text-[#111] leading-tight">Finanzas</h1>
            <p className="text-[15px] text-[#888] mt-0.5">
              Facturación, cobranza y reparto en partidas
            </p>
          </div>
          {activeKey !== 'clientes' && activeKey !== 'porcobrar' && (
            <MonthPeriodPicker value={monthStr} onChange={setMonthStr} />
          )}
        </div>

        <div className="flex flex-wrap gap-1 bg-white border border-[#e0ddd4] rounded-xl p-1 mb-6 w-fit">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => navigate(`${tab.path}?mes=${monthStr}`)}
              className={`whitespace-nowrap px-3 py-1.5 rounded-lg text-[14px] font-semibold transition-all ${
                activeKey === tab.key
                  ? 'bg-[#111] text-white'
                  : 'text-[#666] hover:text-[#111] hover:bg-[#f5f3eb]'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {activeKey === 'dashboard' && can('finanzas.dashboard') && (
          <DashboardView
            {...shared}
            canCerrarMes={canCerrarMes}
            canManageDivisas={canManageDivisas}
          />
        )}

        {activeKey === 'facturacion' && can('finanzas.facturacion') && (
          <FacturacionView
            {...shared}
            canManage={canManageFacturacion}
            canManageCobros={canManageCobros}
          />
        )}

        {activeKey === 'clientes' && can('finanzas.clientes') && (
          <ClientesView clients={clients} lines={lines} loading={loading} />
        )}

        {activeKey === 'distribucion' &&
          can('finanzas.distribucion') &&
          (partida ? (
            <PartidaView {...shared} partida={partida} canManage={canManageDistribucion} />
          ) : (
            <DistribucionView
              {...shared}
              canManage={canManageDistribucion}
              canCerrarMes={canCerrarMes}
              canManagePartidas={canManagePartidas}
            />
          ))}

        {activeKey === 'porcobrar' && can('finanzas.porcobrar') && (
          <PorCobrarView companyId={companyId} canManageCobros={canManageCobros} />
        )}

        {activeKey === 'cajabs' && can('finanzas.cajabs') && (
          <CajaBsView {...shared} canManage={canManageDivisas} />
        )}
      </div>
    </main>
  )
}
