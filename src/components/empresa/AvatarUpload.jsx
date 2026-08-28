import { useState, useRef, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import ReactCrop from 'react-image-crop'
import 'react-image-crop/dist/ReactCrop.css'
import { Avatar } from '../tareas/UserPickerSingle'
import {
  cropToBlob,
  uploadToCloudinary,
  deleteFromCloudinary,
} from '../../utils/uploadToCloudinary'

/**
 * Componente reutilizable de subida y recorte de avatar.
 *
 * Props:
 *   user        — objeto con { first_name, last_name, avatar_url, user_id }; se usa para el preview.
 *   onUploaded  — callback(secureUrl: string | null) llamado con la URL de Cloudinary tras
 *                 subir, o con `null` tras quitar la foto (botón "Quitar foto", visible solo
 *                 si `user.avatar_url` existe: borra el asset de Cloudinary y limpia el campo).
 *                 El padre es responsable de persistir en DB.
 *   size        — tamaño del preview circular en px (default: 72). Si es 0, oculta el trigger visual.
 *   label       — texto opcional debajo del avatar (default: 'Cambiar foto'). Si es '', oculta el label.
 *   triggerRef  — opcional. Si se provee, el padre recibe una referencia al <input type="file"> y puede
 *                 abrirlo programáticamente con triggerRef.current.click() desde una acción de usuario.
 *                 Útil cuando el trigger visual no es el avatar sino un botón externo (ej. Sidebar).
 */
export default function AvatarUpload({
  user,
  onUploaded,
  size = 72,
  label = 'Cambiar foto',
  triggerRef,
  publicId,
  circular = true,
  uploadPreset,
}) {
  const inputRef = useRef(null)
  const imgRef = useRef(null)

  // Forwardear el input ref al padre si lo solicitó
  useEffect(() => {
    if (triggerRef) triggerRef.current = inputRef.current
  })

  const [imgSrc, setImgSrc] = useState(null) // dataURL de la imagen seleccionada
  const [crop, setCrop] = useState(
    circular ? { unit: '%', width: 80, aspect: 1 } : { unit: '%', width: 80 },
  )
  const [completedCrop, setCompletedCrop] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [removing, setRemoving] = useState(false)
  const [error, setError] = useState(null)

  function handleFileChange(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setError(null)
    const reader = new FileReader()
    reader.onload = (ev) => {
      const dataUrl = ev.target.result
      if (!circular) {
        setImgSrc(dataUrl)
        setCrop({ unit: '%', width: 90 })
        setCompletedCrop(null)
        return
      }
      // Para recorte circular: primero centrar la imagen en un canvas cuadrado con fondo blanco
      // para que logos/fotos rectangulares quepan bien dentro del círculo
      const img = new Image()
      img.onload = () => {
        const side = Math.max(img.naturalWidth, img.naturalHeight)
        const canvas = document.createElement('canvas')
        canvas.width = side
        canvas.height = side
        const ctx = canvas.getContext('2d')
        ctx.fillStyle = '#ffffff'
        ctx.fillRect(0, 0, side, side)
        ctx.drawImage(
          img,
          Math.round((side - img.naturalWidth) / 2),
          Math.round((side - img.naturalHeight) / 2),
        )
        setImgSrc(canvas.toDataURL('image/png'))
        setCrop({ unit: '%', width: 80, aspect: 1 })
        setCompletedCrop(null)
      }
      img.src = dataUrl
    }
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  const onImageLoad = useCallback(
    (e) => {
      const { width: w, height: h } = e.currentTarget
      imgRef.current = e.currentTarget

      // Pre-seleccionar un recorte inicial centrado para que el botón esté habilitado desde el inicio
      let initial
      if (circular) {
        const side = Math.round(Math.min(w, h) * 0.8)
        initial = {
          unit: 'px',
          width: side,
          height: side,
          x: Math.round((w - side) / 2),
          y: Math.round((h - side) / 2),
        }
      } else {
        const iw = Math.round(w * 0.9)
        const ih = Math.round(h * 0.9)
        initial = {
          unit: 'px',
          width: iw,
          height: ih,
          x: Math.round((w - iw) / 2),
          y: Math.round((h - ih) / 2),
        }
      }
      setCrop(initial)
      setCompletedCrop(initial)
    },
    [circular],
  )

  async function handleUpload() {
    if (!completedCrop || !imgRef.current) return
    setUploading(true)
    setError(null)
    try {
      const blob = await cropToBlob(imgRef.current, completedCrop)
      const url = await uploadToCloudinary(blob, publicId ?? user?.user_id, uploadPreset)
      setImgSrc(null)
      onUploaded(url)
    } catch (err) {
      setError(err.message)
    } finally {
      setUploading(false)
    }
  }

  function handleCancel() {
    setImgSrc(null)
    setError(null)
    setCompletedCrop(null)
  }

  async function handleRemove() {
    if (!user?.avatar_url) return
    if (!window.confirm('¿Quitar la foto actual? No se puede deshacer.')) return
    setRemoving(true)
    setError(null)
    try {
      await deleteFromCloudinary(publicId ?? user?.user_id)
      onUploaded(null)
    } catch (err) {
      setError(err.message)
    } finally {
      setRemoving(false)
    }
  }

  return (
    <>
      {/* Trigger: clic en el avatar abre el file picker. Se oculta cuando size=0 (trigger externo). */}
      <div className={`flex flex-col items-center gap-1.5 ${size === 0 ? 'hidden' : ''}`}>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="relative group focus:outline-none"
          aria-label={label || 'Cambiar foto'}
        >
          {circular ? (
            <Avatar user={user} size={size} />
          ) : (
            <div
              className="flex items-center justify-center rounded-xl border border-[#e0ddd4] bg-[#f8f7f2] overflow-hidden"
              style={{ width: size * 2.2, height: size }}
            >
              {user?.avatar_url ? (
                <img
                  src={user.avatar_url}
                  alt="logo"
                  style={{
                    maxWidth: '100%',
                    maxHeight: '100%',
                    objectFit: 'contain',
                    padding: '6px',
                  }}
                />
              ) : (
                <span className="text-[13px] font-mono text-[#aaa]">Logo</span>
              )}
            </div>
          )}
          {/* Overlay al hover */}
          <span
            className={`absolute inset-0 ${circular ? 'rounded-full' : 'rounded-xl'} bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center`}
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 20 20"
              fill="none"
              stroke="white"
              strokeWidth="1.8"
            >
              <path
                d="M3 17h14M10 3l3 3-7 7H3v-3l7-7z"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
        </button>
        {label && (
          <span
            className="text-[13px] font-mono text-[#999] cursor-pointer hover:text-[#555] transition-colors"
            onClick={() => inputRef.current?.click()}
          >
            {label}
          </span>
        )}
        {user?.avatar_url && (
          <button
            type="button"
            onClick={handleRemove}
            disabled={removing}
            className="text-[13px] font-mono text-red-500 hover:text-red-700 transition-colors disabled:opacity-50"
          >
            {removing ? 'Quitando…' : 'Quitar foto'}
          </button>
        )}
        {error && !imgSrc && (
          <p className="text-[12px] font-mono text-red-600 text-center max-w-[160px]">{error}</p>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileChange}
        data-testid="avatar-file-input"
      />

      {/* Modal de recorte — portal para evitar que el overflow del sidebar lo recorte */}
      {imgSrc &&
        createPortal(
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-[3px]">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
              {/* Header */}
              <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-[#ece9df]">
                <h3 className="text-[17px] font-bold text-[#111]">Recortar foto</h3>
                <button
                  type="button"
                  onClick={handleCancel}
                  className="w-7 h-7 flex items-center justify-center rounded-lg text-[#999] hover:text-[#111] hover:bg-[#f0ede3] transition-colors"
                  aria-label="Cancelar"
                >
                  <svg
                    width="13"
                    height="13"
                    viewBox="0 0 14 14"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                  >
                    <path d="M2 2l10 10M12 2L2 12" />
                  </svg>
                </button>
              </div>

              {/* Crop area */}
              <div className="p-5 flex flex-col items-center gap-4">
                <ReactCrop
                  crop={crop}
                  onChange={(c) => setCrop(c)}
                  onComplete={(c) => setCompletedCrop(c)}
                  aspect={circular ? 1 : undefined}
                  circularCrop={circular}
                  minWidth={40}
                  minHeight={40}
                >
                  {}
                  <img
                    src={imgSrc}
                    onLoad={onImageLoad}
                    alt="Preview para recortar"
                    className="max-h-64 max-w-full"
                  />
                </ReactCrop>

                <p className="text-[13px] font-mono text-[#888] text-center">
                  {circular
                    ? 'La imagen se recortará a un círculo (máx. 512×512 px, ~WebP 85%).'
                    : 'Selecciona el área a recortar (máx. 512 px, ~WebP 85%).'}
                </p>

                {error && (
                  <div className="w-full bg-red-50 border border-red-200 text-red-700 text-[14px] rounded-lg px-3 py-2 text-center">
                    {error}
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="flex items-center justify-end gap-2 px-5 pb-5">
                <button
                  type="button"
                  onClick={handleCancel}
                  className="px-4 py-2 rounded-xl text-[15px] font-semibold text-[#555] border border-[#e0ddd4] hover:bg-[#f5f3eb] transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleUpload}
                  disabled={!completedCrop?.width || uploading}
                  className="px-4 py-2 rounded-xl text-[15px] font-bold bg-[#FFB800] text-[#111] hover:bg-[#f0ad00] transition-colors disabled:opacity-50"
                >
                  {uploading ? 'Subiendo…' : 'Subir foto'}
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  )
}
