// `dot` es la clase Tailwind literal usada por <StatusPill> (src/components/common/StatusPill.jsx)
// para el punto de color del badge/menú — mismo patrón que ya usaba PRIORITY.
export const STATUS = {
  'Pendiente':  { label: 'Pendiente',  bg: 'bg-[#e3f2fd]', text: 'text-[#1565c0]', dot: 'bg-[#1565c0]' },
  'En Curso':   { label: 'En Curso',   bg: 'bg-[#fff8e1]', text: 'text-[#f57f17]', dot: 'bg-[#f57f17]' },
  'Finalizado': { label: 'Finalizado', bg: 'bg-[#f5f3eb]', text: 'text-[#555]',    dot: 'bg-[#555]'    },
  'Descartado': { label: 'Descartado', bg: 'bg-[#fce4ec]', text: 'text-[#c62828]', dot: 'bg-[#c62828]' },
}

export const PRIORITY = {
  'Alta':  { label: 'Alta',  dot: 'bg-[#ef4444]', text: 'text-[#b91c1c]' },
  'Media': { label: 'Media', dot: 'bg-[#f59e0b]', text: 'text-[#92400e]' },
  'Baja':  { label: 'Baja',  dot: 'bg-[#9ca3af]', text: 'text-[#555]'    },
}

export const STATUSES   = ['Pendiente', 'En Curso', 'Finalizado', 'Descartado']
export const PRIORITIES = ['Alta', 'Media', 'Baja']

export const OBJECTIVES = ['Tráfico al perfil', 'Mensajes / Interacción', 'Clientes potenciales']

// Resultados de un Ad (pauta pagada), capturados al marcarlo como Finalizado.
// Fuente única usada por AdsResultsModal, AdsSpendDetail y AdsSpendForm.
export const RESULT_FIELDS = [
  { key: 'reach',          label: 'Alcance' },
  { key: 'interactions',   label: 'Interacciones' },
  { key: 'followers',      label: 'Seguidores' },
  { key: 'impressions',    label: 'Impresiones' },
  { key: 'views',          label: 'Visualizaciones' },
  { key: 'profile_visits', label: 'Visitas al perfil' },
]
