/**
 * Helpers para subida de imágenes a Cloudinary vía upload firmado (signed).
 *
 * El flujo pide al Edge Function "express" (Supabase) que genere signature + timestamp
 * con el API secret guardado solo en el servidor. El cliente nunca toca el secret.
 * Variables requeridas: VITE_CLOUDINARY_CLOUD_NAME, VITE_CLOUDINARY_UPLOAD_PRESET,
 * VITE_CLOUDINARY_API_KEY.
 */
import { supabase } from '../supabase'

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

  // Escalar manteniendo la proporción real del recorte (no fuerza cuadrado)
  const scale = Math.min(1, MAX_SIZE / Math.max(cropW, cropH))
  const outW = Math.round(cropW * scale)
  const outH = Math.round(cropH * scale)
  canvas.width = outW
  canvas.height = outH

  const ctx = canvas.getContext('2d')
  ctx.drawImage(
    image,
    completedCrop.x * scaleX,
    completedCrop.y * scaleY,
    cropW,
    cropH,
    0,
    0,
    outW,
    outH,
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
 * Sube un Blob a Cloudinary mediante upload firmado.
 * Obtiene signature + timestamp del Edge Function "express" (el secret nunca sale del servidor).
 * @param {Blob} blob
 * @param {string} [publicId] — ID público en Cloudinary (ej. user_id del usuario).
 *   Si se omite se genera uno único para el asset.
 * @param {string} [uploadPreset] — Override del preset. Por defecto usa VITE_CLOUDINARY_UPLOAD_PRESET.
 * @returns {Promise<string>} secure_url del archivo subido
 */
export async function uploadToCloudinary(blob, publicId, uploadPreset) {
  const cloud = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME
  const preset = uploadPreset || import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET
  const apiKey = import.meta.env.VITE_CLOUDINARY_API_KEY
  const pid = publicId || `mdn_${crypto.randomUUID()}`

  // Pedir firma al servidor (el API secret vive solo en el Edge Function)
  const { data, error } = await supabase.functions.invoke('express', {
    body: { publicId: pid, uploadPreset: preset },
  })
  if (error || !data) throw new Error('Error al obtener la firma de Cloudinary')

  const fd = new FormData()
  fd.append('file', blob)
  fd.append('upload_preset', preset)
  fd.append('signature', data.signature)
  fd.append('timestamp', data.timestamp)
  fd.append('public_id', pid)
  fd.append('api_key', apiKey)

  const res = await fetch(
    `https://api.cloudinary.com/v1_1/${cloud}/image/upload`,
    { method: 'POST', body: fd },
  )
  if (!res.ok) throw new Error('Error al subir la imagen a Cloudinary')
  const { secure_url } = await res.json()
  return secure_url
}
