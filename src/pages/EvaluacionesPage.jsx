import { useEffect } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import EmployeeEvalList from '../components/evaluaciones/EmployeeEvalList'
import EmployeeProfileView from '../components/evaluaciones/EmployeeProfileView'
import SummaryView from '../components/evaluaciones/SummaryView'

const ALL_TABS = [
  { key: 'empleados', label: 'Empleados', path: '/evaluaciones' },
  { key: 'resumen',   label: 'Resumen',   path: '/evaluaciones/resumen' },
]

function pathToKey(pathname) {
  if (pathname.startsWith('/evaluaciones/resumen'))  return 'resumen'
  return 'empleados'
}

export default function EvaluacionesPage() {
  const { userProfile } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const { id: employeeId } = useParams()

  const canEval = userProfile?.access_level >= 2 || userProfile?.admin === true
  const activeKey = pathToKey(location.pathname)
  const isProfileView = location.pathname.startsWith('/evaluaciones/empleado/')

  // Redirigir si no tiene acceso
  useEffect(() => {
    if (!canEval && userProfile != null) {
      navigate('/', { replace: true })
    }
  }, [canEval, navigate, userProfile])

  if (!userProfile) {
    return (
      <main className="flex-1 overflow-y-auto main-bg h-screen">
        <div className="flex items-center justify-center py-20">
          <div className="w-6 h-6 border-2 border-[#FFB800] border-t-transparent rounded-full animate-spin" />
        </div>
      </main>
    )
  }

  if (!canEval) return null

  return (
    <main className="flex-1 overflow-y-auto main-bg h-screen">
      <div className="max-w-7xl mx-auto px-6 py-8">

        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-[26px] font-bold text-[#111] leading-tight">Evaluaciones</h1>
            <p className="text-[15px] text-[#888] mt-0.5">Desempeño · Historial · Resumen</p>
          </div>
        </div>

        {/* Tab switcher — oculto en la vista de perfil */}
        {!isProfileView && (
          <div className="flex bg-white border border-[#e0ddd4] rounded-xl p-1 w-fit mb-6">
            {ALL_TABS.map(tab => (
              <button
                key={tab.key}
                onClick={() => navigate(tab.path)}
                className={`px-4 py-1.5 rounded-lg text-[14.5px] font-semibold transition-all ${
                  activeKey === tab.key
                    ? 'bg-[#111] text-white'
                    : 'text-[#666] hover:text-[#111] hover:bg-[#f5f3eb]'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        )}

        {/* Contenido */}
        {isProfileView ? (
          <EmployeeProfileView employeeId={employeeId} />
        ) : activeKey === 'empleados' ? (
          <EmployeeEvalList
            companyId={userProfile.company_id}
            currentUserId={userProfile.user_id}
          />
        ) : (
          <SummaryView companyId={userProfile.company_id} />
        )}

      </div>
    </main>
  )
}
