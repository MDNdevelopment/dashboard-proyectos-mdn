export default function MDNLogo({ size = 36 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="36" height="36" rx="9" fill="#FFB800"/>
      {/* M */}
      <path d="M5.5 25.5V11l5 7 5-7v14.5" stroke="#111" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
      {/* D */}
      <path d="M18.5 11v14.5" stroke="#111" strokeWidth="2.2" strokeLinecap="round"/>
      <path d="M18.5 11h2.5c3.3 0 5.5 2.5 5.5 7.25S24.3 25.5 21 25.5h-2.5" stroke="#111" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
      {/* N dot */}
      <circle cx="30.5" cy="24.5" r="1.5" fill="#111"/>
    </svg>
  )
}
