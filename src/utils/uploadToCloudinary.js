/**
 * Helpers para subida de imágenes a Cloudinary vía unsigned preset.
 *
 * IMPORTANTE: Solo usar VITE_CLOUDINARY_CLOUD_NAME y VITE_CLOUDINARY_UPLOAD_PRESET.
 * Nunca incluir el API secret en variables VITE_ (se filtra al bundle del cliente).
 */

/**
 * Recorta el área seleccionada de una imagen y devuelve un Blob WebP ≤512×512.
 * @param {HTMLImageElement} image
 * @param {{ x: number, y: number, width: number, height: number, unit: string }} completedCrop
 * @returns {Promise<Blob>}
 */
export function cropToBlob(image, completedCrop) {
  const MAX_SIZE = 512
  const canvas = document.createElement('canvas')
  const scaleX = image.naturalWidth / image.width
  const scaleY = image.naturalHeight / image.height

  const cropW = completedCrop.width * scaleX
  const cropH = completedCrop.height * scaleY

  // Redimensionar al máximo manteniendo aspecto 1:1 (siempre cuadrado tras recorte)
  const outSize = Math.min(MAX_SIZE, cropW)
  canvas.width = outSize
  canvas.height = outSize

  const ctx = canvas.getContext('2d')
  ctx.drawImage(
    image,
    completedCrop.x * scaleX,
    completedCrop.y * scaleY,
    cropW,
    cropH,
    0,
    0,
    outSize,
    outSize,
  )

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      blob => {
        if (blob) resolve(blob)
        else reject(new Error('No se pudo generar el blob de la imagen'))
      },
      'image/webp',
      0.85,
    )
  })
}

/**
 * Sube un Blob a Cloudinary via unsigned upload preset.
 * @param {Blob} blob
 * @returns {Promise<string>} secure_url del archivo subido
 */
export async function uploadToCloudinary(blob) {
  const cloud = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME
  const preset = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET
  const fd = new FormData()
  fd.append('file', blob)
  fd.append('upload_preset', preset)
  const res = await fetch(
    `https://api.cloudinary.com/v1_1/${cloud}/image/upload`,
    { method: 'POST', body: fd },
  )
  if (!res.ok) throw new Error('Error al subir la imagen a Cloudinary')
  const { secure_url } = await res.json()
  return secure_url
}
