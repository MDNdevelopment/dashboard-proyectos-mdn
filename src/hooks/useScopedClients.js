import { useEffect, useState } from 'react'
import { loadClients, loadLines } from '../components/metricas/metricsApi'
import { clientsForUser } from '../utils/lineMembers'

/**
 * Clientes de la empresa acotados a la línea del usuario, para selectores de creación
 * (Ads → Nueva campaña/Ad). Carga clientes y líneas en paralelo y aplica clientsForUser().
 * Ver clientsForUser() en utils/lineMembers.js para las reglas de alcance.
 *
 * @param {string|null|undefined} companyId
 * @param {object|null} userProfile - Perfil del usuario (de useAuth)
 * @param {string|null} [currentClientId] - cliente ya seleccionado (edición), siempre visible
 * @returns {{ clients: Array, loading: boolean }}
 */
export function useScopedClients(companyId, userProfile, currentClientId = null) {
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
        setClients(clientsForUser(clientsData ?? [], linesData ?? [], userProfile, currentClientId))
        setLoading(false)
      },
    )
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId, userProfile?.user_id, currentClientId])

  return { clients, loading }
}
