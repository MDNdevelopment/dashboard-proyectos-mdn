import { useState, useEffect, useRef } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { supabase } from '../supabase'
import MDNLogo from '../components/MDNLogo'
import { parseRecoveryParams } from '../utils/parseRecoveryParams'
import { needsPasswordSetup } from '../utils/needsPasswordSetup'

const MIN_PASSWORD_LENGTH = 8

export default function ResetPasswordPage() {
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [ready, setReady] = useState(false)
  const [success, setSuccess] = useState(false)
  const [linkError, setLinkError] = useState(null) // 'expired' | 'invalid'
  const [session, setSessionState] = useState(null)
  // Espejo síncrono de `ready`, legible dentro del callback async de getSession()
  // (el closure del effect ve el `ready` de cuando se creó, no el valor actual).
  const readyRef = useRef(false)

  // true si es una invitación (empleado nuevo, sin contraseña) y no una recuperación normal.
  const isInvite = needsPasswordSetup(session)

  useEffect(() => {
    // 1. Check immediately if the URL contains an error (e.g. expired link).
    //    Supabase sends ?error=access_denied&error_code=otp_expired for expired tokens.
    const { error: urlError, errorCode, hasAccessToken } = parseRecoveryParams(window.location.href)
    if (urlError || errorCode) {
      setLinkError(errorCode === 'otp_expired' ? 'expired' : 'invalid')
      return
    }

    // 2. The Supabase client processes the #access_token hash synchronously during
    //    initialization (before React mounts). Check if the session is already set
    //    to avoid getting stuck waiting for PASSWORD_RECOVERY event.
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        setSessionState(session)
        readyRef.current = true
        setReady(true)
      } else if (!hasAccessToken && !readyRef.current) {
        // Sin sesión, sin token en la URL y el evento de recuperación nunca llegó:
        // enlace muerto (marcador viejo, ya usado). Sin esto se queda para siempre
        // en "Verificando enlace...".
        setLinkError('invalid')
      }
    })

    // 3. Also listen for the event in case the client fires it after mount.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY' || event === 'SIGNED_IN') {
        if (session) setSessionState(session)
        readyRef.current = true
        setReady(true)
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  async function handleSubmit(e) {
    e.preventDefault()

    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres`)
      return
    }
    if (password !== confirm) {
      setError('Las contraseñas no coinciden')
      return
    }

    setError('')
    setLoading(true)
    // must_set_password: false siempre, también en recuperación normal — cubre al
    // invitado que perdió la sesión y terminó llegando por "Olvidé mi contraseña".
    const { error: updateError } = await supabase.auth.updateUser({
      password,
      data: { must_set_password: false },
    })
    if (updateError) {
      setError('No se pudo actualizar la contraseña. Intenta de nuevo.')
    } else if (isInvite) {
      // El invitado ya tiene sesión válida: entra directo, sin pasar por login de nuevo.
      setSuccess(true)
      navigate('/', { replace: true })
    } else {
      await supabase.auth.signOut()
      setSuccess(true)
      setTimeout(() => navigate('/login'), 3000)
    }
    setLoading(false)
  }

  async function handleSignOut() {
    await supabase.auth.signOut()
    navigate('/login')
  }

  // ── Enlace expirado o inválido ───────────────────────────────────────────
  if (linkError) {
    return (
      <div className="main-bg min-h-screen flex items-center justify-center px-4">
        <div className="bg-white rounded-2xl border border-[#e0ddd4] p-8 w-full max-w-[360px]">
          <div className="flex flex-col items-center mb-7">
            <MDNLogo size={48} />
            <p className="text-[15px] font-medium text-[#888] mt-3">MDN Publicidad</p>
          </div>

          <h1 className="text-[20px] font-bold text-[#111] mb-1">
            {linkError === 'expired' ? 'Enlace expirado' : 'Enlace inválido'}
          </h1>
          <p className="text-[15px] text-[#888] mb-6">
            {linkError === 'expired'
              ? 'Este enlace de recuperación ya expiró. Los enlaces son válidos por 1 hora.'
              : 'Este enlace no es válido o ya fue utilizado.'}
          </p>

          <Link
            to="/forgot-password"
            className="block w-full bg-[#FFB800] text-[#111] text-[15px] font-bold py-2.5 rounded-xl hover:bg-[#e6a600] transition-colors text-center"
          >
            Solicitar nuevo enlace
          </Link>

          <div className="mt-5 text-center">
            <Link
              to="/login"
              className="text-[14px] text-[#888] hover:text-[#111] transition-colors"
            >
              Volver al inicio de sesión
            </Link>
          </div>
        </div>
      </div>
    )
  }

  // ── Flujo normal ─────────────────────────────────────────────────────────
  return (
    <div className="main-bg min-h-screen flex items-center justify-center px-4">
      <div className="bg-white rounded-2xl border border-[#e0ddd4] p-8 w-full max-w-[360px]">
        <div className="flex flex-col items-center mb-7">
          <MDNLogo size={48} />
          <p className="text-[15px] font-medium text-[#888] mt-3">MDN Publicidad</p>
        </div>

        <h1 className="text-[20px] font-bold text-[#111] mb-1">
          {isInvite ? 'Te damos la bienvenida' : 'Nueva contraseña'}
        </h1>
        <p className="text-[15px] text-[#888] mb-6">
          {isInvite
            ? 'Crea tu contraseña para entrar a MDN Gestión'
            : 'Elige una contraseña segura para tu cuenta'}
        </p>

        {success ? (
          <div className="bg-[#f0fdf4] border border-[#bbf7d0] rounded-xl p-4">
            <p className="text-[15px] text-[#166534] font-medium">
              {isInvite
                ? '¡Contraseña creada! Entrando...'
                : '¡Contraseña actualizada! Redirigiendo al inicio de sesión...'}
            </p>
          </div>
        ) : !ready ? (
          <div className="flex flex-col items-center gap-3 py-4">
            <div className="w-6 h-6 border-2 border-[#FFB800] border-t-transparent rounded-full animate-spin" />
            <p className="text-[15px] text-[#888] text-center">Verificando enlace...</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <input
                className="input-base"
                type="password"
                placeholder="Nueva contraseña"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="new-password"
              />
              <p className="text-[12px] text-[#aaa] mt-1 ml-1">
                Mínimo {MIN_PASSWORD_LENGTH} caracteres
              </p>
            </div>
            <input
              className="input-base"
              type="password"
              placeholder="Confirmar contraseña"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
              autoComplete="new-password"
            />

            {error && <p className="text-[14px] text-red-500 font-medium">{error}</p>}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-[#FFB800] text-[#111] text-[15px] font-bold py-2.5 rounded-xl hover:bg-[#e6a600] transition-colors disabled:opacity-60 mt-1"
            >
              {loading
                ? isInvite
                  ? 'Creando...'
                  : 'Guardando...'
                : isInvite
                  ? 'Crear contraseña'
                  : 'Guardar contraseña'}
            </button>

            {isInvite && (
              <button
                type="button"
                onClick={handleSignOut}
                className="w-full text-[13px] text-[#aaa] hover:text-[#888] transition-colors text-center pt-1"
              >
                Cerrar sesión
              </button>
            )}
          </form>
        )}
      </div>
    </div>
  )
}
