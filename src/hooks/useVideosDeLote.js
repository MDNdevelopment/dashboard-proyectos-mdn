import { useCallback, useEffect, useId, useState } from 'react'
import { supabase } from '../supabase'
import { loadVideosDeLote, updateVideo } from '../components/pautas/avPautasApi'
import { pautaErrorMessage } from '../utils/audiovisual'

/**
 * Videos (estado por unidad) de UN lote de edición, con realtime. Se carga al montar el
 * componente que lo usa (la fila del lote o el detalle abierto) en vez de cargar todos los
 * videos de la empresa junto con las pautas.
 *
 * `cantidad` se pasa como llave de recarga: al subir o bajar las asignadas el trigger
 * `av_pauta_piezas_sync_videos` crea o borra videos y la lista debe reflejarlo.
 */
export default function useVideosDeLote(piezaId, cantidad) {
  const [videos, setVideos] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  // La misma pieza puede estar montada dos veces (Mi trabajo + detalle abierto): un topic fijo
  // haría que una instancia pise o cierre el canal de la otra.
  const instancia = useId()

  useEffect(() => {
    if (!piezaId) return undefined
    let cancelled = false
    loadVideosDeLote(piezaId).then(({ data, error: err }) => {
      if (cancelled) return
      if (err) setError(pautaErrorMessage(err))
      else setVideos(data ?? [])
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [piezaId, cantidad])

  useEffect(() => {
    if (!piezaId) return undefined
    const channel = supabase
      .channel(`av-videos-${piezaId}-${instancia}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'av_pauta_videos',
          filter: `pieza_id=eq.${piezaId}`,
        },
        (payload) => {
          setVideos((prev) => {
            if (payload.eventType === 'DELETE') return prev.filter((v) => v.id !== payload.old.id)
            const next = payload.new
            const exists = prev.some((v) => v.id === next.id)
            const merged = exists ? prev.map((v) => (v.id === next.id ? next : v)) : [...prev, next]
            return merged.sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
          })
        },
      )
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [piezaId, instancia])

  const actualizar = useCallback(async (videoId, fields) => {
    setError(null)
    const { data, error: err } = await updateVideo(videoId, fields)
    if (err) {
      setError(pautaErrorMessage(err))
      return false
    }
    if (data) setVideos((prev) => prev.map((v) => (v.id === data.id ? data : v)))
    return true
  }, [])

  return { videos, loading, error, actualizar }
}
