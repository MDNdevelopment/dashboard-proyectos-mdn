// `dot` es la clase Tailwind literal usada por <StatusPill> (src/components/common/StatusPill.jsx)
// para el punto de color del badge/menú — mismo patrón que ya usaba PRIORITY.
export const STATUS = {
  'Pendiente':  { label: 'Pendiente',  bg: 'bg-[#e3f2fd]', text: 'text-[#1565c0]', dot: 'bg-[#1565c0]' },
  'En Curso':   { label: 'En Curso',   bg: 'bg-[#fff8e1]', text: 'text-[#f57f17]', dot: 'bg-[#f57f17]' },
  'Revisión':   { label: 'Revisión',   bg: 'bg-[#f3e5f5]', text: 'text-[#7b1fa2]', dot: 'bg-[#7b1fa2]' },
  'Aprobado':   { label: 'Aprobado',   bg: 'bg-[#e8f5e9]', text: 'text-[#2e7d32]', dot: 'bg-[#2e7d32]' },
  'Finalizado': { label: 'Finalizado', bg: 'bg-[#f5f3eb]', text: 'text-[#555]',    dot: 'bg-[#555]'    },
  'Cancelado':  { label: 'Cancelado',  bg: 'bg-[#fce4ec]', text: 'text-[#c62828]', dot: 'bg-[#c62828]' },
}

export const PRIORITY = {
  'Alta':  { label: 'Alta',  dot: 'bg-[#ef4444]', text: 'text-[#b91c1c]' },
  'Media': { label: 'Media', dot: 'bg-[#f59e0b]', text: 'text-[#92400e]' },
  'Baja':  { label: 'Baja',  dot: 'bg-[#9ca3af]', text: 'text-[#555]'    },
}

export const STATUSES   = ['Pendiente', 'En Curso', 'Revisión', 'Aprobado', 'Finalizado', 'Cancelado']
export const PRIORITIES = ['Alta', 'Media', 'Baja']

export const OBJECTIVES = ['Tráfico al perfil', 'Mensajes / Interacción', 'Clientes potenciales']
