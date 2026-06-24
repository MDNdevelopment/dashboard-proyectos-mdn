import { useState, useEffect } from 'react'

const STORAGE_KEY = 'mdn_install_dismissed'

function isIOS() {
  return /iPhone|iPad|iPod/.test(navigator.userAgent) && !window.MSStream
}

function isInStandaloneMode() {
  return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true
}

export default function InstallBanner() {
  const [deferredPrompt, setDeferredPrompt] = useState(null)
  const [show, setShow] = useState(false)
  const [platform, setPlatform] = useState(null) // 'ios' | 'android'

  useEffect(() => {
    if (isInStandaloneMode()) return
    if (sessionStorage.getItem(STORAGE_KEY)) return

    const ios = isIOS()

    if (ios) {
      setPlatform('ios')
      setShow(true)
      return
    }

    const handler = (e) => {
      e.preventDefault()
      setDeferredPrompt(e)
      setPlatform('android')
      setShow(true)
    }

    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  const dismiss = () => {
    sessionStorage.setItem(STORAGE_KEY, '1')
    setShow(false)
  }

  const install = async () => {
    if (!deferredPrompt) return
    deferredPrompt.prompt()
    const { outcome } = await deferredPrompt.userChoice
    if (outcome === 'accepted') setShow(false)
    setDeferredPrompt(null)
  }

  if (!show) return null

  return (
    <div className="fixed bottom-4 left-3 right-3 z-50 lg:hidden">
      <div className="bg-[#0d0d0d] text-white rounded-2xl px-4 py-3 flex items-center gap-3 shadow-xl">
        <div className="w-9 h-9 bg-[#FFB800] rounded-xl flex items-center justify-center shrink-0">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#0d0d0d" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="5" y="2" width="14" height="20" rx="2"/>
            <line x1="12" y1="18" x2="12" y2="18" strokeWidth="3"/>
          </svg>
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-[15px] font-semibold leading-tight">Agrega MDN a tu pantalla</p>
          {platform === 'ios' ? (
            <p className="text-[13px] text-white/60 mt-0.5 leading-tight">
              Toca{' '}
              <svg className="inline w-3 h-3 mb-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/>
                <polyline points="16 6 12 2 8 6"/>
                <line x1="12" y1="2" x2="12" y2="15"/>
              </svg>
              {' '}y luego "Añadir a inicio"
            </p>
          ) : (
            <p className="text-[13px] text-white/60 mt-0.5 leading-tight">Instálala como una app</p>
          )}
        </div>

        {platform === 'android' && (
          <button
            onClick={install}
            className="bg-[#FFB800] text-[#0d0d0d] text-[14px] font-bold px-3 py-1.5 rounded-xl shrink-0"
          >
            Instalar
          </button>
        )}

        <button onClick={dismiss} className="text-white/40 hover:text-white/70 transition-colors shrink-0 ml-1">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
            <line x1="18" y1="6" x2="6" y2="18"/>
            <line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>
    </div>
  )
}
