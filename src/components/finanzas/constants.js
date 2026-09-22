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
    hex: '#F97316',
  },
  socios: {
    key: 'socios',
    name: 'Socios',
    dot: 'bg-[#34343A]',
    text: 'text-[#333]',
    hex: '#34343A',
  },
  ganancia: {
    key: 'ganancia',
    name: 'Ganancia',
    dot: 'bg-[#10B981]',
    text: 'text-[#047857]',
    hex: '#10B981',
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

/**
 * `note` con la que PagoPartidaModal marca los 2 movimientos de traspaso entre
 * partidas (salida de la origen + entrada a la que paga) cuando un pago excede
 * el disponible de su partida. Sirve para poder excluirlos donde haga falta:
 * el traspaso mueve plata ya cobrada de una partida a otra, no es dinero nuevo
 * — contarlo como "asignado" en ambas partidas infla el total por encima del
 * 100% del cobrado (ver pctsEnterosPorPartida() en utils/finanzas.js).
 */
export const NOTA_TRASPASO_PARTIDA = 'traspaso_entre_partidas'
