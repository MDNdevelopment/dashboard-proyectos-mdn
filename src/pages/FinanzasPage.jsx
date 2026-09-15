import { useState, useEffect, useCallback } from 'react'
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../supabase'
import { loadClients, loadLines } from '../components/metricas/metricsApi'
import { loadMonth, loadInvoices, loadDistributions } from '../components/finanzas/finanzasApi'
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

const ALL_TABS = [
  { key: 'dashboard', label: 'Dashboard', path: '/finanzas' },
  { key: 'facturacion', label: 'Facturación', path: '/finanzas/facturacion' },
  { key: 'clientes', label: 'Clientes', path: '/finanzas/clientes' },
  { key: 'distribucion', label: 'Distribución', path: '/finanzas/distribucion' },
  { key: 'porcobrar', label: 'Por cobrar', path: '/finanzas/por-cobrar' },
]

function tabCapability(key) {
  return `finanzas.${key}`
}

function pathToKey(pathname) {
  if (pathname.startsWith('/finanzas/facturacion')) return 'facturacion'
  if (pathname.startsWith('/finanzas/clientes')) return 'clientes'
  if (pathname.startsWith('/finanzas/distribucion')) return 'distribucion'
  if (pathname.startsWith('/finanzas/por-cobrar')) return 'porcobrar'
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
  const [clients, setClients] = useState([])
  const [lines, setLines] = useState([])
  const [loading, setLoading] = useState(true)

  const fetchPeriod = useCallback(async () => {
    if (!companyId) return
    setLoading(true)
    const { data: m } = await loadMonth(companyId, year, month)
    setFinMonth(m ?? null)
    if (m) {
      const [{ data: inv }, { data: dist }] = await Promise.all([
        loadInvoices(m.id),
        loadDistributions(m.id),
      ])
      setInvoices(inv ?? [])
      setDistributions(dist ?? [])
    } else {
      setInvoices([])
      setDistributions([])
    }
    setLoading(false)
  }, [companyId, year, month])

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
    const channel = supabase
      .channel('finanzas-view')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'fin_months' }, fetchPeriod)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'fin_invoices' }, fetchPeriod)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'fin_payments' }, fetchPeriod)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'fin_distributions' },
        fetchPeriod,
      )
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [companyId, fetchPeriod])

  if (!userProfile) return null

  const canManageFacturacion = can('finanzas.facturacion.manage')
  const canManageCobros = can('finanzas.cobros.manage')
  const canManageDistribucion = can('finanzas.distribucion.manage')
  const canCerrarMes = can('finanzas.cerrar_mes')

  const shared = {
    companyId,
    year,
    month,
    monthStr,
    finMonth,
    invoices,
    distributions,
    clients,
    lines,
    loading,
    refetch: fetchPeriod,
    userProfile,
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
              onClick={() => navigate(tab.path)}
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
          <DashboardView {...shared} canCerrarMes={canCerrarMes} />
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
            />
          ))}

        {activeKey === 'porcobrar' && can('finanzas.porcobrar') && (
          <PorCobrarView companyId={companyId} canManageCobros={canManageCobros} />
        )}
      </div>
    </main>
  )
}
