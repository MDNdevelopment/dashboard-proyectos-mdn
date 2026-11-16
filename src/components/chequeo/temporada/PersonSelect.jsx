import UserPickerSingle, { Avatar } from '../../tareas/UserPickerSingle'
import { ASSIGNMENT_LABELS, USE_MAPPI } from '../../../utils/temporada'

/**
 * Casilla de personal de la temporada: foto + nombre de la persona. Sin permiso de gestión
 * es solo lectura; con permiso abre el selector de personas (con buscador). Cuando la
 * persona se cambió a mano aparece un ↺ para volver a la original (la de MAPPI), y la
 * casilla se resalta para distinguirla.
 */
export default function PersonSelect({
  role,
  client,
  resolved,
  users,
  usersById,
  canManage,
  onChange,
}) {
  const label = `${ASSIGNMENT_LABELS[role]} de ${client.name}`

  if (!canManage) {
    const current = usersById.get(resolved.userId)
    if (!current) return <span className="text-[13px] text-[#ccc]">—</span>
    return (
      <span className="flex items-center gap-1.5 text-[13.5px] text-[#333]">
        <Avatar user={current} size={22} />
        {current.first_name}
      </span>
    )
  }

  return (
    <div role="group" aria-label={label} className="flex items-center gap-1 min-w-[190px]">
      <div
        className={`flex-1 min-w-0 rounded-lg ${resolved.overridden ? 'ring-1 ring-[#FFB800]' : ''}`}
      >
        <UserPickerSingle
          users={users}
          selectedId={resolved.userId}
          onChange={(id) => onChange(id ?? '')}
          placeholder="Sin asignar"
        />
      </div>
      {resolved.overridden && (
        <button
          type="button"
          onClick={() => onChange(USE_MAPPI)}
          aria-label={`Restablecer ${label}`}
          title="Volver a la persona original"
          className="flex-shrink-0 text-[16px] leading-none text-[#999] hover:text-[#111]"
        >
          ↺
        </button>
      )}
    </div>
  )
}
