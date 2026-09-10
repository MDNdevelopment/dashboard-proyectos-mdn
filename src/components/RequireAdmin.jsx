import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

/**
 * Guard de ruta solo-admin. A diferencia de RequireModule, no pasa por MODULES/
 * module_permissions: el default de ese sistema es "acceso libre sin reglas", lo que
 * dejaría el buzón anónimo abierto a toda la empresa hasta configurarlo a mano. Aquí el
 * acceso es explícito (userProfile.admin === true) y la RLS de anonymous_feedback lo
 * respalda del lado del servidor.
 */
export default function RequireAdmin({ children }) {
  const { loading, userProfile } = useAuth()

  if (loading) {
    return (
      <div className="main-bg min-h-screen flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-[#FFB800] border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!userProfile?.admin) {
    return <Navigate to="/" replace />
  }

  return children
}
