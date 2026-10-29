import { useState, useEffect } from 'react'
import { fetchEquipmentForUser } from '../../lib/equipment'

/**
 * Bloque "Equipos a su cargo" para la ficha de un empleado: los iPhones que tiene como
 * responsable (Empresa → Equipos). Se monta desde EmployeeFichaContent.jsx, compartido por
 * EmployeeInfoModal y LineFichaModal. No renderiza nada mientras carga ni si no tiene equipos.
 */
export default function EmployeeEquipmentBlock({ userId }) {
  const [items, setItems] = useState([])

  useEffect(() => {
    let cancelled = false
    fetchEquipmentForUser(userId)
      .then((rows) => {
        if (!cancelled) setItems(rows)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [userId])

  if (items.length === 0) return null

  return (
    <div className="p-3 rounded-xl bg-[#faf9f5] border border-[#ece9df]">
      <p className="text-[11.5px] font-mono font-bold uppercase tracking-[0.12em] text-[#aaa] mb-2">
        Equipos a su cargo
      </p>
      <ul className="space-y-1">
        {items.map((eq) => (
          <li key={eq.id} className="text-[14px] text-[#444]">
            <span className="font-semibold">{eq.model}</span>
            {eq.serial && (
              <span className="font-mono text-[12.5px] text-[#999]"> · {eq.serial}</span>
            )}
            {eq.icloud_email && (
              <span className="block font-mono text-[12.5px] text-[#999]">{eq.icloud_email}</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
