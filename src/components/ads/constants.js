// `dot` es la clase Tailwind literal usada por <StatusPill> (src/components/common/StatusPill.jsx)
// para el punto de color del badge/menú — mismo patrón que ya usaba PRIORITY.
// NOTA: 'Descartado' se mantiene en STATUS (meta) pero NO en STATUSES (seleccionables): ya no se
// puede elegir al crear/editar/filtrar, pero las filas históricas en 'Descartado' se siguen
// renderizando con su color (StatusPill lee el color desde STATUS[value]).
export const STATUS = {
  Pendiente: {
    label: 'Pendiente',
    bg: 'bg-[#e3f2fd]',
    text: 'text-[#1565c0]',
    dot: 'bg-[#1565c0]',
  },
  'En Curso': {
    label: 'En Curso',
    bg: 'bg-[#fff8e1]',
    text: 'text-[#f57f17]',
    dot: 'bg-[#f57f17]',
  },
  Finalizado: { label: 'Finalizado', bg: 'bg-[#f5f3eb]', text: 'text-[#555]', dot: 'bg-[#555]' },
  Descartado: {
    label: 'Descartado',
    bg: 'bg-[#fce4ec]',
    text: 'text-[#c62828]',
    dot: 'bg-[#c62828]',
  },
}

export const PRIORITY = {
  Alta: { label: 'Alta', dot: 'bg-[#ef4444]', text: 'text-[#b91c1c]' },
  Media: { label: 'Media', dot: 'bg-[#f59e0b]', text: 'text-[#92400e]' },
  Baja: { label: 'Baja', dot: 'bg-[#9ca3af]', text: 'text-[#555]' },
}

// Estados seleccionables (crear/editar/filtrar). 'Descartado' quedó como legacy: sigue en STATUS
// (para renderizar filas viejas) pero fuera de esta lista, así que ya no se puede elegir.
export const STATUSES = ['Pendiente', 'En Curso', 'Finalizado']
export const PRIORITIES = ['Alta', 'Media', 'Baja']

export const OBJECTIVES = [
  'Tráfico al perfil',
  'Mensajes / Interacción',
  'Clientes potenciales',
  'Una combinación de ambas',
]

// Resultados de un Ad (pauta pagada), capturados al marcarlo como Finalizado.
// Fuente única usada por AdsResultsModal, AdsSpendDetail y AdsSpendForm.
export const RESULT_FIELDS = [
  { key: 'reach', label: 'Alcance' },
  { key: 'interactions', label: 'Interacciones' },
  { key: 'followers', label: 'Seguidores' },
  { key: 'impressions', label: 'Impresiones' },
  { key: 'views', label: 'Visualizaciones' },
  { key: 'profile_visits', label: 'Visitas al perfil' },
]
