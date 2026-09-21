/**
 * Constantes del módulo Finanzas. Los porcentajes de reparto viven por mes en
 * `fin_months.pct_gastos/pct_socios/pct_ganancia` (ver src/utils/finanzas.js →
 * pctsDelMes), no aquí: así un mes cerrado sigue siendo auditable contra el
 * porcentaje vigente cuando se cerró, aunque la política cambie después.
 * PARTIDAS_PCT_DEFAULT es solo el valor con el que se abre un mes nuevo.
 */

export const PARTIDAS = {
  gastos: {
    key: 'gastos',
    name: 'Gastos operativos',
    dot: 'bg-[#F97316]',
    text: 'text-[#c2410c]',
  },
  socios: { key: 'socios', name: 'Socios', dot: 'bg-[#34343A]', text: 'text-[#333]' },
  ganancia: {
    key: 'ganancia',
    name: 'Ganancia',
    dot: 'bg-[#10B981]',
    text: 'text-[#047857]',
  },
}

export const PARTIDAS_PCT_DEFAULT = { gastos: 0.72, socios: 0.18, ganancia: 0.1 }

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
