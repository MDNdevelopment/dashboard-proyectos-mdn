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

/**
 * Partida técnica del "resultado por cambio" (spec MAPPI-Finanzas-Divisas §5.2/D1).
 * Vive FUERA de `PARTIDAS` a propósito: no tiene meta, ni %, ni saldo pagable —
 * `PARTIDA_KEYS` es el iterador de todo lo presupuestario (metas, %, selector de
 * pago, traspasos) y meterla ahí la haría aparecer como una cuarta partida real
 * en esos 9 sitios. Se genera sola vía trigger (`fin_fx_sync`), nunca a mano.
 */
export const PARTIDA_CAMBIO = 'cambio'

export const PARTIDA_CAMBIO_META = {
  key: PARTIDA_CAMBIO,
  name: 'Resultado por cambio',
  dot: 'bg-[#7C6FF0]',
  text: 'text-[#4c3fd0]',
  hex: '#7C6FF0',
}

/** Las 3 partidas reales + 'cambio', solo para sitios que deben MOSTRAR las 4 (ej. Movimientos). */
export const PARTIDA_KEYS_LEDGER = [...PARTIDA_KEYS, PARTIDA_CAMBIO]

/** Resuelve la meta (nombre/color) de cualquiera de las 4 partidas, o `null` si no existe. */
export function partidaMeta(key) {
  return PARTIDAS[key] ?? (key === PARTIDA_CAMBIO ? PARTIDA_CAMBIO_META : null)
}

/**
 * Rubros de gasto operativo: el "¿En qué?" de un pago de la partida Gastos
 * (`PagoPartidaModal.jsx`). Es una lista CERRADA a propósito — antes era texto
 * libre, y el mismo gasto entraba escrito de cinco formas distintas ("nomina",
 * "Nómina sept", "pago quincena"), lo que hacía imposible agrupar por rubro.
 *
 * El `label` es lo que se guarda en `fin_distributions.concept`, no la key: esa
 * columna se muestra tal cual en Distribución, Partida y Movimientos, así que
 * guardar el nombre legible mantiene esas 3 vistas sin cambios y deja los pagos
 * históricos (texto libre) perfectamente legibles al lado de los nuevos.
 *
 * 'Sin clasificar' es la vía de escape cuando nada encaja; si empieza a crecer, a
 * esta lista le falta un rubro.
 */
export const CATEGORIAS_GASTO = [
  {
    key: 'nomina',
    label: 'Nómina y personal',
    description:
      'Sueldos, quincenas, bonos, utilidades, liquidaciones, horas extra, freelancers y colaboradores externos.',
  },
  {
    key: 'beneficios',
    label: 'Beneficios y bienestar',
    description:
      'Comida y refrigerios, transporte de personal, cobertura médica, actividades internas, cumpleaños, celebraciones.',
  },
  {
    key: 'sede',
    label: 'Sede y servicios',
    description:
      'Alquiler, condominio, electricidad, agua, aseo, vigilancia, mantenimiento del local, limpieza.',
  },
  {
    key: 'conectividad',
    label: 'Conectividad y software',
    description:
      'Internet y respaldo, telefonía, Adobe, Canva, Make, Higgsfield, Claude, hosting, dominios, licencias y suscripciones.',
  },
  {
    key: 'equipos',
    label: 'Equipos y producción',
    description:
      'Cámaras, lentes, luces, micrófonos, computadoras, teléfonos, discos, reparaciones, utilería y ambientación.',
  },
  {
    key: 'movilidad',
    label: 'Movilidad y pautas',
    description:
      'Combustible, mantenimiento de vehículos, traslados para grabaciones, viáticos, peajes, estacionamiento.',
  },
  {
    key: 'impuestos',
    label: 'Impuestos y legales',
    description:
      'ISLR, IVA por enterar, impuestos municipales, IVSS y parafiscales, contador, abogado, permisos, trámites.',
  },
  {
    key: 'financieros',
    label: 'Financieros',
    description:
      'Comisiones bancarias y de plataformas de pago, transferencias, costos de mover dinero (sin confundir con resultado por cambio, que tiene partida propia).',
  },
  {
    key: 'marca',
    label: 'Marca propia y comercial',
    description:
      'Pauta propia, material POP, regalos a clientes, eventos, ferias, gastos de representación.',
  },
  {
    key: 'sin_clasificar',
    label: 'Sin clasificar',
    description: 'El cubo por defecto; si crece mucho, a la lista le falta un rubro.',
  },
]

/** Métodos disponibles cuando el cobro se registra en USD (ver CobroModal.jsx). */
export const METODOS_PAGO_USD = ['Zelle', 'Efectivo $', 'Otro']

/**
 * Métodos disponibles cuando el cobro se registra en Bs (ver CobroModal.jsx).
 * La moneda ya no se infiere del método elegido (eso lo decide el toggle
 * USD/Bs, igual que en InvoiceModal.jsx) — esta lista solo puebla el
 * desplegable cuando la moneda activa es Bs.
 */
export const METODOS_PAGO_BS = ['Transferencia Bs', 'Efectivo Bs', 'Otro']

/** Unión de ambas, para listados/filtros que necesiten conocer todos los métodos. */
export const METODOS_PAGO = [...new Set([...METODOS_PAGO_USD, ...METODOS_PAGO_BS])]

export const FX_OP_TYPES = {
  compra: { key: 'compra', label: 'Compra de dólares' },
  venta: { key: 'venta', label: 'Venta de dólares' },
}

/**
 * Tipos de fila de la tab Movimientos (el diario consolidado del módulo). `orden`
 * es el orden de exhibición cuando se ordena por tipo — de flujo del dinero, no
 * alfabético (mismo criterio que ordenar estados de tarea por su secuencia).
 *
 * `naturaleza` dice QUÉ PUEDE SUMARSE y es la clave de que los totales no mientan:
 *   - `ingreso` / `egreso`: dinero que entra o sale de la empresa.
 *   - `conversion`: compra/venta de divisas. No suma ni resta patrimonio, cambia
 *     de bolsillo (Bs ↔ divisa).
 *   - `interno`: asignación a partida y traspaso entre partidas. El dólar ya entró
 *     en su cobro; contarlo otra vez al etiquetarlo infla el mes ~1.72×.
 *   - `ajuste`: conciliación de la Caja Bs contra el banco.
 */
export const MOVIMIENTO_TIPOS = {
  cobro: { key: 'cobro', label: 'Cobro', naturaleza: 'ingreso', orden: 0 },
  asignacion: { key: 'asignacion', label: 'Asignación a partida', naturaleza: 'interno', orden: 1 },
  pago: { key: 'pago', label: 'Pago', naturaleza: 'egreso', orden: 2 },
  traspaso: {
    key: 'traspaso',
    label: 'Traspaso entre partidas',
    naturaleza: 'interno',
    orden: 3,
  },
  compra_divisa: {
    key: 'compra_divisa',
    label: 'Compra de divisas',
    naturaleza: 'conversion',
    orden: 4,
  },
  venta_divisa: {
    key: 'venta_divisa',
    label: 'Venta de divisas',
    naturaleza: 'conversion',
    orden: 5,
  },
  cambio: { key: 'cambio', label: 'Resultado por cambio', naturaleza: 'interno', orden: 6 },
  ajuste_bs: { key: 'ajuste_bs', label: 'Ajuste de Caja Bs', naturaleza: 'ajuste', orden: 7 },
}

export const MOVIMIENTO_TIPO_KEYS = Object.keys(MOVIMIENTO_TIPOS)

/** Qué caja toca un movimiento, para la columna "Caja" de Movimientos. */
export const CAJA_LABELS = {
  divisa: 'Divisa',
  bs: 'Caja Bs',
  ambas: 'Divisa + Caja Bs',
  ninguna: '—',
}

/** Etiquetas en español para la columna "origen" del libro de Caja Bs. */
export const BS_LEDGER_SOURCES = {
  cobro: 'Cobro en Bs',
  venta_divisa: 'Venta de divisas',
  compra_divisa: 'Compra de divisas',
  pago_directo: 'Pago directo en Bs',
  ajuste: 'Ajuste de cuadre',
}

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
