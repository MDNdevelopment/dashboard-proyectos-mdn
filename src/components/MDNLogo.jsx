const LOGO_URL = 'https://res.cloudinary.com/mdnclientes/image/upload/v1779727686/MDN-LOGO-PNG-2_1_f8o5gk.webp'

export default function MDNLogo({ size = 36 }) {
  return (
    <img
      src={LOGO_URL}
      alt="MDN Publicidad"
      width={size}
      height={size}
      loading="eager"
      className="object-contain"
    />
  )
}
