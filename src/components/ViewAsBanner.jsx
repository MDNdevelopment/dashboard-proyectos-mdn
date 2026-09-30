import { useAuth } from '../context/AuthContext'

/**
 * Barra fija que avisa de que la plataforma se está viendo con el perfil de otra
 * persona (modo "Ver como", solo dev — ver src/lib/viewAs.js).
 *
 * Usa un morado y no el amarillo de marca (#FFB800) a propósito: ese amarillo está
 * en toda la UI y la barra tiene que leerse como "esto no es la app normal".
 */
export default function ViewAsBanner() {
  const { isViewingAs, userProfile, realUserProfile, stopViewAs } = useAuth()

  if (!isViewingAs) return null

  const name = `${userProfile?.first_name ?? ''} ${userProfile?.last_name ?? ''}`.trim()
  const cargo = userProfile?.position?.position_name
  const nivel = userProfile?.admin ? 'admin' : `nivel ${userProfile?.access_level ?? 1}`

  return (
    <div className="sticky top-0 z-50 bg-[#5b2d8e] text-white px-4 py-2 flex items-center gap-3 flex-wrap">
      <span className="text-[11px] font-mono font-bold tracking-[0.1em] uppercase bg-white/20 rounded px-2 py-0.5">
        Ver como
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[14px] font-medium leading-snug truncate">
          {name || 'Usuario'}
          <span className="text-white/70"> · {[cargo, nivel].filter(Boolean).join(' · ')}</span>
        </p>
        <p className="text-[12px] text-white/70 leading-snug">
          Solo lectura. Los datos que la base filtra por usuario (notificaciones, algunas tareas)
          siguen siendo los de {realUserProfile?.first_name ?? 'tu cuenta'}.
        </p>
      </div>
      <button
        type="button"
        onClick={() => stopViewAs?.()}
        className="flex-shrink-0 text-[14px] font-medium bg-white text-[#5b2d8e] rounded-lg px-3 py-1.5 hover:bg-white/90 transition-colors"
      >
        Salir
      </button>
    </div>
  )
}
