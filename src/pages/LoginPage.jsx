import { useState } from 'react'
import { Navigate, Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import MDNLogo from '../components/MDNLogo'

export default function LoginPage() {
  const { session, signIn, sessionExpired, accountDisabled } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  if (session) return <Navigate to="/" replace />

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    const { error } = await signIn(email, password)
    if (error) {
      // Empleado archivado (baneado en auth.users): Supabase rechaza el login
      // con este código antes de que lleguemos a fetchUserProfile.
      setError(
        error.code === 'user_banned'
          ? 'Tu cuenta ha sido deshabilitada. Contacta a un administrador.'
          : 'Correo o contraseña incorrectos'
      )
    }
    setLoading(false)
  }

  return (
    <div className="main-bg min-h-screen flex items-center justify-center px-4">
      <div className="bg-white rounded-2xl border border-[#e0ddd4] p-8 w-full max-w-[360px]">
        <div className="flex flex-col items-center mb-7">
          <MDNLogo size={48} />
          <p className="text-[15px] font-medium text-[#888] mt-3">MDN Publicidad</p>
        </div>

        {sessionExpired && (
          <div className="mb-5 bg-amber-50 border border-amber-300 rounded-xl px-4 py-3 text-[14px] text-amber-800 font-medium">
            Tu sesión expiró. Vuelve a iniciar sesión para continuar.
          </div>
        )}

        {accountDisabled && (
          <div className="mb-5 bg-red-50 border border-red-300 rounded-xl px-4 py-3 text-[14px] text-red-700 font-medium">
            Tu cuenta ha sido deshabilitada. Contacta a un administrador.
          </div>
        )}

        <h1 className="text-[20px] font-bold text-[#111] mb-1">Iniciar sesión</h1>
        <p className="text-[15px] text-[#888] mb-6">Ingresa tus credenciales para continuar</p>

        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            className="input-base"
            type="email"
            placeholder="Correo electrónico"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
            autoComplete="email"
          />
          <input
            className="input-base"
            type="password"
            placeholder="Contraseña"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
            autoComplete="current-password"
          />

          {error && (
            <p className="text-[14px] text-red-500 font-medium">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-[#FFB800] text-[#111] text-[15px] font-bold py-2.5 rounded-xl hover:bg-[#e6a600] transition-colors disabled:opacity-60 mt-1"
          >
            {loading ? 'Ingresando...' : 'Ingresar'}
          </button>
        </form>

        <div className="mt-5 text-center">
          <Link
            to="/forgot-password"
            className="text-[14px] text-[#888] hover:text-[#111] transition-colors"
          >
            ¿Olvidaste tu contraseña?
          </Link>
        </div>
      </div>
    </div>
  )
}
