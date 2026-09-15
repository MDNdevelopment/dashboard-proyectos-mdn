/**
 * Constantes del módulo Finanzas. Los porcentajes de PARTIDAS son una decisión de
 * dirección que se revisa a lo sumo una vez al año — se dejan como constante y no
 * como tabla administrable para que los meses ya cerrados sigan siendo auditables
 * contra el porcentaje vigente cuando se cerraron.
 */

export const PARTIDAS = {
  gastos: {
    key: 'gastos',
    name: 'Gastos operativos',
    pct: 0.66,
    dot: 'bg-[#F97316]',
    text: 'text-[#c2410c]',
  },
  socios: { key: 'socios', name: 'Socios', pct: 0.2, dot: 'bg-[#34343A]', text: 'text-[#333]' },
  ganancia: {
    key: 'ganancia',
    name: 'Ganancia',
    pct: 0.14,
    dot: 'bg-[#10B981]',
    text: 'text-[#047857]',
  },
}

export const PARTIDA_KEYS = Object.keys(PARTIDAS)

export const METODOS_PAGO = ['Zelle', 'Efectivo $', 'Transferencia Bs', 'Otro']

export const CONCEPTOS_SUGERIDOS = [
  'Gestión de redes',
  'Página web',
  'Branding',
  'Campaña publicitaria',
  'Sesión de fotos/video',
]

export const CONCEPTO_RECURRENTE = 'Gestión de redes'
