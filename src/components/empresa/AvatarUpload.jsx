import { useState, useRef, useEffect, useCallback } from 'react'
import ReactCrop from 'react-image-crop'
import 'react-image-crop/dist/ReactCrop.css'
import { Avatar } from '../tareas/UserPickerSingle'
import { cropToBlob, uploadToCloudinary } from '../../utils/uploadToCloudinary'

/**
 * Componente reutilizable de subida y recorte de avatar.
 *
 * Props:
 *   user        — objeto con { first_name, last_name, avatar_url, user_id }; se usa para el preview.
 *   onUploaded  — callback(secureUrl: string) llamado con la URL de Cloudinary.
 *                 El padre es responsable de persistir en DB.
 *   size        — tamaño del preview circular en px (default: 72). Si es 0, oculta el trigger visual.
 *   label       — texto opcional debajo del avatar (default: 'Cambiar foto'). Si es '', oculta el label.
 *   triggerRef  — opcional. Si se provee, el padre recibe una referencia al <input type="file"> y puede
 *                 abrirlo programáticamente con triggerRef.current.click() desde una acción de usuario.
 *                 Útil cuando el trigger visual no es el avatar sino un botón externo (ej. Sidebar).
 */
export default function AvatarUpload({ user, onUploaded, size = 72, label = 'Cambiar foto', triggerRef }) {
  const inputRef = useRef(null)
  const imgRef = useRef(null)

  // Forwardear el input ref al padre si lo solicitó
  useEffect(() => {
    if (triggerRef) triggerRef.current = inputRef.current
  })

  const [imgSrc, setImgSrc] = useState(null)      // dataURL de la imagen seleccionada
  const [crop, setCrop] = useState({ unit: '%', width: 80, aspect: 1 })
  const [completedCrop, setCompletedCrop] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState(null)

  function handleFileChange(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setError(null)
    const reader = new FileReader()
    reader.onload = ev => {
      setImgSrc(ev.target.result)
      setCrop({ unit: '%', width: 80, aspect: 1 })
      setCompletedCrop(null)
    }
    reader.readAsDataURL(file)
    // Limpiar el input para poder seleccionar el mismo archivo otra vez
    e.target.value = ''
  }

  const onImageLoad = useCallback(e => {
    imgRef.current = e.currentTarget
  }, [])

  async function handleUpload() {
    if (!completedCrop || !imgRef.current) return
    setUploading(true)
    setError(null)
    try {
      const blob = await cropToBlob(imgRef.current, completedCrop)
      const url = await uploadToCloudinary(blob)
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
          <Avatar user={user} size={size} />
          {/* Overlay al hover */}
          <span className="absolute inset-0 rounded-full bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
            <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="white" strokeWidth="1.8">
              <path d="M3 17h14M10 3l3 3-7 7H3v-3l7-7z" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </span>
        </button>
        {label && (
          <span className="text-[11px] font-mono text-[#999] cursor-pointer hover:text-[#555] transition-colors"
            onClick={() => inputRef.current?.click()}>
            {label}
          </span>
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

      {/* Modal de recorte */}
      {imgSrc && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-[3px]"
          onClick={e => { if (e.target === e.currentTarget) handleCancel() }}
        >
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-[#ece9df]">
              <h3 className="text-[15px] font-bold text-[#111]">Recortar foto</h3>
              <button
                type="button"
                onClick={handleCancel}
                className="w-7 h-7 flex items-center justify-center rounded-lg text-[#999] hover:text-[#111] hover:bg-[#f0ede3] transition-colors"
                aria-label="Cancelar"
              >
                <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M2 2l10 10M12 2L2 12" />
                </svg>
              </button>
            </div>

            {/* Crop area */}
            <div className="p-5 flex flex-col items-center gap-4">
              <ReactCrop
                crop={crop}
                onChange={c => setCrop(c)}
                onComplete={c => setCompletedCrop(c)}
                aspect={1}
                circularCrop
                minWidth={40}
                minHeight={40}
              >
                {/* eslint-disable-next-line jsx-a11y/img-redundant-alt */}
                <img
                  src={imgSrc}
                  onLoad={onImageLoad}
                  alt="Preview para recortar"
                  className="max-h-64 w-auto object-contain"
                />
              </ReactCrop>

              <p className="text-[11px] font-mono text-[#888] text-center">
                La imagen se recortará a un círculo (máx. 512×512 px, ~WebP 85%).
              </p>

              {error && (
                <div className="w-full bg-red-50 border border-red-200 text-red-700 text-[12px] rounded-lg px-3 py-2 text-center">
                  {error}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-2 px-5 pb-5">
              <button
                type="button"
                onClick={handleCancel}
                className="px-4 py-2 rounded-xl text-[13px] font-semibold text-[#555] border border-[#e0ddd4] hover:bg-[#f5f3eb] transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleUpload}
                disabled={!completedCrop?.width || uploading}
                className="px-4 py-2 rounded-xl text-[13px] font-bold bg-[#FFB800] text-[#111] hover:bg-[#f0ad00] transition-colors disabled:opacity-50"
              >
                {uploading ? 'Subiendo…' : 'Subir foto'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
