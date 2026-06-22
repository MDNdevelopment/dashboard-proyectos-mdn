import { useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import DepartmentsView from '../components/empresa/DepartmentsView'
import EmployeesView from '../components/empresa/EmployeesView'
import QuestionsView from '../components/empresa/QuestionsView'

const ALL_TABS = [
  { key: 'general',       label: 'Inicio',         path: '/empresa',               adminOnly: false },
  { key: 'departamentos', label: 'Departamentos',   path: '/empresa/departamentos', adminOnly: true },
  { key: 'empleados',     label: 'Empleados',       path: '/empresa/empleados',     adminOnly: true },
  { key: 'preguntas',     label: 'Preguntas',       path: '/empresa/preguntas',     adminOnly: true },
]

function pathToKey(pathname) {
  if (pathname.startsWith('/empresa/departamentos')) return 'departamentos'
  if (pathname.startsWith('/empresa/empleados'))     return 'empleados'
  if (pathname.startsWith('/empresa/preguntas'))     return 'preguntas'
  return 'general'
}

export default function EmpresaPage() {
  const { userProfile } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()

  const isAdmin = userProfile?.admin === true
  const tabs = ALL_TABS.filter(t => !t.adminOnly || isAdmin)
  const activeKey = pathToKey(location.pathname)

  // Si un no-admin llega a una ruta de gestión, redirigir a /empresa
  useEffect(() => {
    const tab = ALL_TABS.find(t => t.key === activeKey)
    if (tab?.adminOnly && !isAdmin && userProfile != null) {
      navigate('/empresa', { replace: true })
    }
  }, [activeKey, isAdmin, navigate, userProfile])

  return (
    <main className="flex-1 overflow-y-auto main-bg h-screen">
      <div className="max-w-7xl mx-auto px-6 py-8">

        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-[24px] font-bold text-[#111] leading-tight">Empresa</h1>
            <p className="text-[13px] text-[#888] mt-0.5">Organización · Equipos · Documentos</p>
          </div>
        </div>

        {/* Tab switcher */}
        <div className="flex bg-white border border-[#e0ddd4] rounded-xl p-1 w-fit mb-6">
          {tabs.map(tab => (
            <button
              key={tab.key}
              onClick={() => navigate(tab.path)}
              className={`px-4 py-1.5 rounded-lg text-[12.5px] font-semibold transition-all ${
                activeKey === tab.key
                  ? 'bg-[#111] text-white'
                  : 'text-[#666] hover:text-[#111] hover:bg-[#f5f3eb]'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Contenido por tab */}
        {activeKey === 'general' && (
          <div className="bg-white rounded-xl border border-[#e0ddd4] p-10 text-center">
            <p className="text-[15px] font-semibold text-[#888] mb-1">Próximamente</p>
            <p className="text-[13px] text-[#bbb]">
              Documentos, onboarding y recursos de la empresa.
            </p>
          </div>
        )}

        {activeKey === 'departamentos' && isAdmin && (
          <DepartmentsView companyId={userProfile.company_id} />
        )}

        {activeKey === 'empleados' && isAdmin && (
          <EmployeesView companyId={userProfile.company_id} />
        )}

        {activeKey === 'preguntas' && isAdmin && (
          <QuestionsView companyId={userProfile.company_id} />
        )}

      </div>
    </main>
  )
}
