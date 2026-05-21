export const PRIORITY = {
  baja:    { label: 'Baja',    color: 'bg-[#e8f5e9] text-[#2e7d32]' },
  media:   { label: 'Media',   color: 'bg-[#fff8e1] text-[#f57f17]' },
  alta:    { label: 'Alta',    color: 'bg-[#fff3e0] text-[#e65100]' },
  urgente: { label: 'Urgente', color: 'bg-[#fce4ec] text-[#c62828]' },
}

export const CATEGORY = {
  hardware: { label: 'Hardware' },
  software: { label: 'Software' },
  red:      { label: 'Red'      },
  accesos:  { label: 'Accesos'  },
  otro:     { label: 'Otro'     },
}

export const STATUS = {
  abierto:     { label: 'Abierto',      color: 'bg-[#e3f2fd] text-[#1565c0]' },
  en_progreso: { label: 'En progreso',  color: 'bg-[#fff8e1] text-[#f57f17]' },
  resuelto:    { label: 'Resuelto',     color: 'bg-[#e8f5e9] text-[#2e7d32]' },
}

export const PRIORITIES = ['baja', 'media', 'alta', 'urgente']
export const CATEGORIES = ['hardware', 'software', 'red', 'accesos', 'otro']
export const STATUSES   = ['abierto', 'en_progreso', 'resuelto']
