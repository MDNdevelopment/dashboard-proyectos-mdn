import { useState } from 'react'

const DEFAULT_AVATAR_URL =
  'https://res.cloudinary.com/mdnclientes/image/upload/v1787599847/evaluacion/MAPPI_avatar_lbnekj.webp'

// Avatar de MAPPI. Si la imagen falla en cargar, cae al glifo por defecto en vez de
// dejar un hueco roto.
export default function AiAvatar({ src = DEFAULT_AVATAR_URL, size = 32, bordered = false }) {
  const [errored, setErrored] = useState(false)
  const style = { width: size, height: size }
  const borderClass = bordered ? 'border border-[#e0ddd4]' : ''

  if (src && !errored) {
    return (
      <img
        src={src}
        alt="MAPPI"
        style={style}
        onError={() => setErrored(true)}
        className={`rounded-full object-cover flex-shrink-0 ${borderClass}`}
      />
    )
  }
  return (
    <div
      style={style}
      className={`rounded-full bg-[#FFB800] flex items-center justify-center flex-shrink-0 ${borderClass}`}
      aria-label="MAPPI"
    >
      <svg
        viewBox="0 0 24 24"
        width={size * 0.55}
        height={size * 0.55}
        fill="none"
        stroke="#111"
        strokeWidth="2"
      >
        <path
          d="M12 2a4 4 0 0 1 4 4v1a4 4 0 0 1-8 0V6a4 4 0 0 1 4-4Z"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path d="M6 20c0-3.3 2.7-6 6-6s6 2.7 6 6" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="9" cy="6.5" r="0.6" fill="#111" stroke="none" />
        <circle cx="15" cy="6.5" r="0.6" fill="#111" stroke="none" />
      </svg>
    </div>
  )
}
