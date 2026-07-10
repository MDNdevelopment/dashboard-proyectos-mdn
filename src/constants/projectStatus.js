// Mapas de color/etiqueta compartidos entre ProjectCard y ProjectDetailModal.

export const STATUS = {
  'Pendiente':  { text: '#92400e', bg: '#fef9ee', border: '#fde68a', line: '#f59e0b', label: 'Pendiente'  },
  'En proceso': { text: '#1e40af', bg: '#eff6ff', border: '#bfdbfe', line: '#3b82f6', label: 'En proceso' },
  'Paralizado': { text: '#991b1b', bg: '#fff1f1', border: '#fecaca', line: '#ef4444', label: 'Paralizado' },
  'Completado': { text: '#14532d', bg: '#f0fdf4', border: '#bbf7d0', line: '#22c55e', label: 'Completado' },
}

export const STATUS_LIST = ['Pendiente', 'En proceso', 'Completado']

export const TASK_S = {
  pendiente:  { label: 'Pendiente',  text: '#777',    bg: '#f5f3eb', border: '#e8e5db' },
  en_proceso: { label: 'En proceso', text: '#1d4ed8', bg: '#eff6ff', border: '#bfdbfe' },
  pausada:    { label: 'Pausada',    text: '#b45309', bg: '#fffbeb', border: '#fde68a' },
  completada: { label: 'Completada', text: '#15803d', bg: '#f0fdf4', border: '#bbf7d0' },
}

export const TASK_ORDER = ['pendiente', 'en_proceso', 'pausada', 'completada']
