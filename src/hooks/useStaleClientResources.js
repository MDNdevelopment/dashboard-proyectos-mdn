import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  loadClients,
  loadCompanyEmployees,
  loadLines,
  updateClient,
} from '../components/metricas/metricsApi'
import { staleResourceClients } from '../utils/staleClientResources'

/**
 * Orquesta el aviso bloqueante de "recursos que ya no están en la empresa"
 * (ver utils/staleClientResources.js y components/StaleClientResourcesModal.jsx).
 *
 * - Carga primero SOLO las líneas: si el usuario no es jefa de ninguna, corta ahí
 *   y no hace las otras dos queries. Solo 4 de ~40 empleados son jefas, así que
 *   el home del resto paga una única query.
 * - El descarte vive en memoria (useState), NO en localStorage: es justamente lo
 *   que hace que el aviso reaparezca en cada entrada a la herramienta mientras
 *   queden asignaciones sin reasignar.
 * - `reassign()` escribe en metric_clients y actualiza el estado local, así que la
 *   fila arreglada desaparece y el modal se cierra solo al resolver la última.
 */
export function useStaleClientResources(companyId, userId) {
  const [clients, setClients] = useState([])
  const [employees, setEmployees] = useState([])
  const [lines, setLines] = useState([])
  const [dismissed, setDismissed] = useState(false)
  const [savingKey, setSavingKey] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!companyId || !userId) return
    let cancelled = false

    ;(async () => {
      const { data: linesData } = await loadLines(companyId)
      if (cancelled) return

      const leads = (linesData ?? []).filter((l) => l.lead_user_id === userId)
      if (leads.length === 0) {
        // No es jefa de línea: nada que avisar, y nos ahorramos las dos queries.
        setLines([])
        return
      }
      setLines(linesData ?? [])

      const [{ data: clientsData }, { data: employeesData }] = await Promise.all([
        loadClients(companyId),
        loadCompanyEmployees(companyId),
      ])
      if (cancelled) return
      setClients(clientsData ?? [])
      setEmployees(employeesData ?? [])
    })()

    return () => {
      cancelled = true
    }
  }, [companyId, userId])

  const items = useMemo(
    () => staleResourceClients(clients, employees, lines, userId),
    [clients, employees, lines, userId],
  )

  /**
   * Reasigna un recurso de una cuenta. `value` ya viene resuelto por el modal
   * con resolvedValue() (id o null para los simples, array para los múltiples).
   */
  const reassign = useCallback(async (clientId, field, value) => {
    const key = `${clientId}:${field}`
    setSavingKey(key)
    setError(null)
    const { error: err } = await updateClient(clientId, { [field]: value })
    setSavingKey(null)
    if (err) {
      setError(err.message ?? 'No se pudo guardar el cambio.')
      return
    }
    setClients((prev) => prev.map((c) => (c.id === clientId ? { ...c, [field]: value } : c)))
  }, [])

  const dismiss = useCallback(() => setDismissed(true), [])

  return {
    show: items.length > 0 && !dismissed,
    items,
    employees,
    lines,
    savingKey,
    error,
    reassign,
    dismiss,
  }
}
