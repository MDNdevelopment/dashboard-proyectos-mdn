import { Avatar } from "../tareas/UserPickerSingle";

/**
 * Chip de solo lectura que muestra el avatar + nombre de un empleado.
 * Reutilizado en ClientModal (Empresa) y ClientFichaContent (Reportes).
 */
export function EmployeeChip({ user }) {
  if (!user) return <span className="text-[13.5px] text-[#bbb]">—</span>;
  return (
    <div className="flex items-center gap-1.5 bg-[#f5f3eb] rounded-lg px-2 py-1 w-fit">
      <Avatar user={user} size={20} />
      <span className="text-[13px] text-[#333]">{user.first_name} {user.last_name}</span>
    </div>
  );
}

/**
 * Lista de chips de empleados a partir de un array de user_ids.
 * Resuelve cada id contra el array `employees` y descarta los no encontrados.
 */
export function EmployeeChipList({ userIds = [], employees = [] }) {
  const users = userIds.map(id => employees.find(u => u.user_id === id)).filter(Boolean);
  if (!users.length) return <span className="text-[13.5px] text-[#bbb]">—</span>;
  return (
    <div className="flex flex-wrap gap-2">
      {users.map(u => <EmployeeChip key={u.user_id} user={u} />)}
    </div>
  );
}
