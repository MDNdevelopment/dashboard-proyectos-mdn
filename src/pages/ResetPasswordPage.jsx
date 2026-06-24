import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabase'
import MDNLogo from '../components/MDNLogo'

export default function ResetPasswordPage() {
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [ready, setReady] = useState(false)
  const [success, setSuccess] = useState(false)

  useEffect(() => {
    // Supabase sends the recovery token as a URL fragment.
    // onAuthStateChange fires with event PASSWORD_RECOVERY once the session is set.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') setReady(true)
    })
    return () => subscription.unsubscribe()
  }, [])

  async function handleSubmit(e) {
    e.preventDefault()
    if (password !== confirm) {
      setError('Las contraseñas no coinciden')
      return
    }
    setError('')
    setLoading(true)
    const { error } = await supabase.auth.updateUser({ password })
    if (error) {
      setError('No se pudo actualizar la contraseña. Intenta de nuevo.')
    } else {
      await supabase.auth.signOut()
      setSuccess(true)
      setTimeout(() => navigate('/login'), 3000)
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

        <h1 className="text-[20px] font-bold text-[#111] mb-1">Nueva contraseña</h1>
        <p className="text-[15px] text-[#888] mb-6">Elige una contraseña segura para tu cuenta</p>

        {success ? (
          <div className="bg-[#f0fdf4] border border-[#bbf7d0] rounded-xl p-4">
            <p className="text-[15px] text-[#166534] font-medium">
              ¡Contraseña actualizada! Redirigiendo al inicio de sesión...
            </p>
          </div>
        ) : !ready ? (
          <p className="text-[15px] text-[#888] text-center">Verificando enlace...</p>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-3">
            <input
              className="input-base"
              type="password"
              placeholder="Nueva contraseña"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              autoComplete="new-password"
            />
            <input
              className="input-base"
              type="password"
              placeholder="Confirmar contraseña"
              value={confirm}
              onChange={e => setConfirm(e.target.value)}
              required
              autoComplete="new-password"
            />

            {error && (
              <p className="text-[14px] text-red-500 font-medium">{error}</p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-[#FFB800] text-[#111] text-[15px] font-bold py-2.5 rounded-xl hover:bg-[#e6a600] transition-colors disabled:opacity-60 mt-1"
            >
              {loading ? 'Guardando...' : 'Guardar contraseña'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
