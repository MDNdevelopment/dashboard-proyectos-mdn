import { Avatar } from '../../tareas/UserPickerSingle'
import { ASSIGNMENT_LABELS, USE_MAPPI } from '../../../utils/temporada'

const fullName = (u) => [u?.first_name, u?.last_name].filter(Boolean).join(' ')

/**
 * Casilla de personal de la temporada. Sin permiso de gestión es solo lectura; con permiso es
 * un selector con tres tipos de opción: «De MAPPI» (quita la asignación manual), «Sin
 * asignar» y cada empleado. Una asignación manual se resalta para distinguirla de la de MAPPI.
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
  const current = usersById.get(resolved.userId)
  const mappiUser = usersById.get(resolved.mappiUserId)

  if (!canManage) {
    if (!current) return <span className="text-[13px] text-[#ccc]">—</span>
    return (
      <span className="flex items-center gap-1.5 text-[13.5px] text-[#333]">
        <Avatar user={current} size={20} />
        {current.first_name}
      </span>
    )
  }

  // Empleados activos; si la persona asignada está archivada se conserva para no perderla.
  const options = users.filter((u) => !u.deleted_at || u.user_id === resolved.userId)
  const value = resolved.overridden ? (resolved.userId ?? '') : USE_MAPPI

  return (
    <select
      aria-label={`${ASSIGNMENT_LABELS[role]} de ${client.name}`}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={`input-base w-full min-w-[150px] py-1 text-[13px] ${
        resolved.overridden ? 'border-[#FFB800] bg-[#fffaf0]' : ''
      }`}
    >
      <option value={USE_MAPPI}>
        {mappiUser ? `De MAPPI: ${fullName(mappiUser)}` : 'De MAPPI: sin asignar'}
      </option>
      <option value="">Sin asignar</option>
      {options.map((u) => (
        <option key={u.user_id} value={u.user_id}>
          {fullName(u)}
        </option>
      ))}
    </select>
  )
}
