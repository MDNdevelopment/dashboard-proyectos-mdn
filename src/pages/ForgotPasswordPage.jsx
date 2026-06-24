import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import MDNLogo from '../components/MDNLogo'

export default function ForgotPasswordPage() {
  const { resetPassword } = useAuth()
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [loading, setLoading] = useState(false)
  const [countdown, setCountdown] = useState(0)
  const [submitCount, setSubmitCount] = useState(0)

  useEffect(() => {
    if (submitCount === 0) return
    setCountdown(180)
    const interval = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) { clearInterval(interval); return 0 }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(interval)
  }, [submitCount])

  async function handleSubmit(e) {
    e.preventDefault()
    setLoading(true)
    await resetPassword(email)
    setSent(true)
    setSubmitCount(c => c + 1)
    setLoading(false)
  }

  async function handleResend() {
    setLoading(true)
    await resetPassword(email)
    setSubmitCount(c => c + 1)
    setLoading(false)
  }

  const mm = String(Math.floor(countdown / 60)).padStart(2, '0')
  const ss = String(countdown % 60).padStart(2, '0')

  return (
    <div className="main-bg min-h-screen flex items-center justify-center px-4">
      <div className="bg-white rounded-2xl border border-[#e0ddd4] p-8 w-full max-w-[360px]">
        <div className="flex flex-col items-center mb-7">
          <MDNLogo size={48} />
          <p className="text-[15px] font-medium text-[#888] mt-3">MDN Publicidad</p>
        </div>

        <h1 className="text-[20px] font-bold text-[#111] mb-1">Restablecer contraseña</h1>
        <p className="text-[15px] text-[#888] mb-6">Te enviaremos un enlace a tu correo</p>

        {sent ? (
          <div className="mb-5 space-y-3">
            <div className="bg-[#f0fdf4] border border-[#bbf7d0] rounded-xl p-4">
              <p className="text-[15px] text-[#166534] font-medium">
                Revisa tu correo para restablecer tu contraseña
              </p>
            </div>
            <button
              onClick={handleResend}
              disabled={countdown > 0 || loading}
              className="w-full bg-[#FFB800] text-[#111] text-[15px] font-bold py-2.5 rounded-xl hover:bg-[#e6a600] transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {loading ? 'Enviando...' : countdown > 0 ? `Reenviar enlace (${mm}:${ss})` : 'Reenviar enlace'}
            </button>
          </div>
        ) : (
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
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-[#FFB800] text-[#111] text-[15px] font-bold py-2.5 rounded-xl hover:bg-[#e6a600] transition-colors disabled:opacity-60"
            >
              {loading ? 'Enviando...' : 'Enviar enlace'}
            </button>
          </form>
        )}

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
