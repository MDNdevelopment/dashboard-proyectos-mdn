import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

/**
 * Guard de ruta por módulo.
 * Usa can(moduleKey) del AuthContext (config-driven + admin-override).
 * Si el usuario no tiene acceso es redirigido a '/' (proyectos).
 *
 * Uso en main.jsx:
 *   <RequireModule moduleKey="ads">
 *     <AdsPage />
 *   </RequireModule>
 */
export default function RequireModule({ moduleKey, children }) {
  const { loading, can = () => true } = useAuth()

  if (loading) {
    return (
      <div className="main-bg min-h-screen flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-[#FFB800] border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!can(moduleKey)) {
    return <Navigate to="/" replace />
  }

  return children
}
