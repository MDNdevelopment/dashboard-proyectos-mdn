/**
 * Ícono de red social (badge circular con el glifo de la marca), usado por Chequeo
 * (ChequeoGrid.jsx) para identificar cada fila de red por marca en vez de texto plano.
 */
const NETWORK_META = {
  Instagram: {
    bg: 'linear-gradient(45deg, #f9ce34, #ee2a7b 45%, #6228d7)',
    icon: (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="white"
        strokeWidth="2"
        width="100%"
        height="100%"
      >
        <rect x="3" y="3" width="18" height="18" rx="5" />
        <circle cx="12" cy="12" r="4.2" />
        <circle cx="17.3" cy="6.7" r="1.1" fill="white" stroke="none" />
      </svg>
    ),
  },
  Facebook: {
    bg: '#1877F2',
    icon: (
      <svg viewBox="0 0 24 24" fill="white" width="100%" height="100%">
        <path d="M15.5 8.5h-2c-.4 0-.8.3-.8.8v2.2h2.7l-.4 2.8h-2.3V21h-2.9v-6.7H8v-2.8h1.8V9.3c0-2.1 1.4-3.8 3.7-3.8h2v3z" />
      </svg>
    ),
  },
  TikTok: {
    bg: '#010101',
    icon: (
      <svg viewBox="0 0 24 24" fill="white" width="100%" height="100%">
        <path d="M15.5 3c.4 2.4 1.9 3.9 4.4 4.1v2.9c-1.5 0-2.9-.5-4.1-1.3v6.2a5.6 5.6 0 1 1-4.8-5.5v2.9a2.7 2.7 0 1 0 1.9 2.6V3h2.6z" />
      </svg>
    ),
  },
  X: {
    bg: '#000000',
    icon: (
      <svg
        viewBox="0 0 24 24"
        stroke="white"
        strokeWidth="2.1"
        strokeLinecap="round"
        width="100%"
        height="100%"
      >
        <path d="M6 6l12 12M18 6L6 18" />
      </svg>
    ),
  },
  YouTube: {
    bg: '#FF0000',
    icon: (
      <svg viewBox="0 0 24 24" fill="white" width="100%" height="100%">
        <path d="M10 8.2v7.6l6.5-3.8z" />
      </svg>
    ),
  },
  'YouTube Shorts': {
    bg: '#FF0000',
    icon: (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="white"
        strokeWidth="1.8"
        width="100%"
        height="100%"
      >
        <rect x="7" y="2.5" width="10" height="19" rx="2.5" />
        <path d="M10.5 9.3v5.4l4.3-2.7z" fill="white" stroke="none" />
      </svg>
    ),
  },
  LinkedIn: {
    bg: '#0A66C2',
    icon: (
      <svg viewBox="0 0 24 24" fill="white" width="100%" height="100%">
        <circle cx="7" cy="7" r="1.7" />
        <rect x="5.5" y="10" width="3" height="9" />
        <path d="M11.5 10h3v1.3c.6-.9 1.6-1.5 2.9-1.5 2.4 0 3.6 1.6 3.6 4.4V19h-3v-4.3c0-1.1-.4-1.9-1.5-1.9s-1.7.7-1.7 1.9V19h-3v-9z" />
      </svg>
    ),
  },
  Mailchimp: {
    bg: '#FFE01B',
    icon: (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="#241c15"
        strokeWidth="1.8"
        width="100%"
        height="100%"
      >
        <rect x="3" y="5.5" width="18" height="13" rx="2" />
        <path d="M3.5 6.5l8.5 7 8.5-7" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
}

const DEFAULT_META = {
  bg: '#9a9488',
  icon: (
    <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" width="100%" height="100%">
      <circle cx="12" cy="12" r="8" />
      <path d="M4 12h16M12 4c2.5 2.5 2.5 13.5 0 16M12 4c-2.5 2.5-2.5 13.5 0 16" />
    </svg>
  ),
}

export default function NetworkIcon({ network, size = 20, className = '' }) {
  const meta = NETWORK_META[network] ?? DEFAULT_META
  const glyphSize = Math.round(size * 0.62)
  return (
    <span
      title={network}
      className={`inline-flex items-center justify-center rounded-full flex-shrink-0 ${className}`}
      style={{ width: size, height: size, background: meta.bg }}
    >
      <span style={{ width: glyphSize, height: glyphSize }}>{meta.icon}</span>
    </span>
  )
}
