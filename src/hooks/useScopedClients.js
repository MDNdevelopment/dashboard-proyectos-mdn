import { useEffect, useState } from 'react'
import { loadClients, loadLines } from '../components/metricas/metricsApi'
import { useAuth } from '../context/AuthContext'

/**
 * Clientes de la empresa acotados a la línea del usuario, para selectores de creación
 * (Ads → Nueva campaña/Ad). Carga clientes y líneas en paralelo. Con `ads.ver_todo`: todos los clientes.
 * Sin ella: clientes de las líneas del usuario + los sin línea (transversales) + `currentClientId`.
 *
 * @param {string|null|undefined} companyId
 * @param {object|null} userProfile - Perfil del usuario (de useAuth)
 * @param {string|null} [currentClientId] - cliente ya seleccionado (edición), siempre visible
 * @returns {{ clients: Array, loading: boolean }}
 */
export function useScopedClients(companyId, userProfile, currentClientId = null) {
  const { can = () => true } = useAuth()
  const canViewAll = can('ads.ver_todo')
  const [clients, setClients] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!companyId) {
      setLoading(false)
      return
    }
    let cancelled = false
    setLoading(true)
    Promise.all([loadClients(companyId), loadLines(companyId)]).then(
      ([{ data: clientsData }, { data: linesData }]) => {
        if (cancelled) return
        const all = clientsData ?? []
        if (canViewAll) {
          setClients(all)
        } else {
          const myLineIds = new Set(
            (linesData ?? [])
              .filter((l) => l.member_user_ids?.includes(userProfile?.user_id))
              .map((l) => l.id),
          )
          setClients(
            all.filter((c) => !c.line_id || myLineIds.has(c.line_id) || c.id === currentClientId),
          )
        }
        setLoading(false)
      },
    )
    return () => {
      cancelled = true
    }
  }, [companyId, userProfile?.user_id, currentClientId, canViewAll])

  return { clients, loading }
}
