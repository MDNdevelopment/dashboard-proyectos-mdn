import { useState, useEffect } from 'react'
import { useAuth } from '../../context/AuthContext'
import { fetchEquipmentForUser } from '../../lib/equipment'

/**
 * Aviso dentro del diálogo de baja de un empleado: lista los iPhones que todavía tiene a su
 * cargo para que se reasignen. No bloquea la baja. Solo consulta si el usuario puede ver
 * Equipos; sin equipos (o sin permiso) no renderiza nada.
 */
export default function EquipmentArchiveWarning({ userId }) {
  const { can = () => true } = useAuth()
  const allowed = can('empresa.equipos')
  const [items, setItems] = useState([])

  useEffect(() => {
    if (!allowed) return
    let cancelled = false
    fetchEquipmentForUser(userId)
      .then((rows) => {
        if (!cancelled) setItems(rows)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [allowed, userId])

  if (!allowed || items.length === 0) return null

  return (
    <div className="rounded-xl border border-[#f0dfae] bg-[#fff8e6] p-3 text-[13.5px] text-[#8a6600]">
      <p className="font-semibold">
        Tiene {items.length} iPhone{items.length === 1 ? '' : 's'} a su cargo
      </p>
      <p className="mt-0.5">
        {items.map((i) => i.model).join(', ')}. Reasígnalos en Empresa → Equipos; la baja no los
        libera sola.
      </p>
    </div>
  )
}
