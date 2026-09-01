export const SOCIAL_NETWORKS = [
  'Instagram',
  'Facebook',
  'TikTok',
  'X',
  'YouTube',
  'YouTube Shorts',
  'LinkedIn',
  'Mailchimp',
  'Otro',
]

export const MONTHS = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
]

// Mes en que arrancó el módulo Reuniones (migración 20260717000000_create_meetings.sql).
// Antes de este mes no existen filas en `meetings`, así que el conteo automático de
// reuniones.realizadas siempre daría 0 — los reportes de meses anteriores conservan el
// valor que ya tenían guardado en metric_reports.data en vez de que se les pise con 0.
export const REUNIONES_MODULE_START = { year: 2026, month: 7 }

// Mes en que arrancó el auto-llenado de «2. Productividad – Tareas Fijas» desde la
// grilla de Tareas Fijas (migración 20260818000000_create_fixed_task_marks.sql).
// Antes de este mes no existen filas en `fixed_task_marks`, así que el conteo
// automático siempre daría 0/0 — los reportes de meses anteriores conservan las
// filas que ya tenían guardadas (capturadas a mano) en vez de que se les pise.
export const TAREAS_FIJAS_MODULE_START = { year: 2026, month: 9 }

// Mes en que arranca el auto-llenado de «6. Nº Piezas vs Piezas editadas» desde las
// pautas realizadas de Tareas Fijas → Audiovisual (tabla `av_pautas`). Antes de este mes
// no hay pautas que derivar, así que esos reportes conservan el valor capturado a mano.
export const AUDIOVISUAL_MODULE_START = { year: 2026, month: 9 }

// Mes en que arranca el auto-llenado de la fila «Actualización de Plataformas» (dentro
// de Productividad) desde la grilla semanal del módulo Chequeo (tabla
// `publication_checks`, periodizada por mes/semana desde
// 20260831000000_publication_checks_weekly_periods.sql — `publication_check_events` quedó
// en desuso). Antes de este mes no hay celdas que derivar — esa fila se omite en vez de
// mostrar meta>0/real=0 falso. Reemplaza a la columna "Actualización de Plataformas" que
// antes vivía en Tareas Fijas.
export const CHEQUEO_PRODUCTIVIDAD_START = { year: 2026, month: 9 }

// Mes en que arranca el auto-llenado de «4. Solicitudes vs Entregados» a partir de los
// módulos CNP (tabla `cnp_requests`) y Gestión de Tareas (tabla `tasks`). El indicador se
// reparte 5 pts CNP + 5 pts Gestión de Tareas (ver calcSolicitudes en metricsScore.js).
// Antes de este mes ambas fuentes tienen pocos o ningún dato limpio (los CNP recién se
// separan de `tasks`), así que esos reportes conservan la captura manual.
export const SOLICITUDES_MODULE_START = { year: 2026, month: 9 }

export const INDICATORS = [
  { key: 'reuniones', nombre: 'Reuniones realizadas', peso: 20, short: 'Reuniones' },
  {
    key: 'productividad',
    nombre: 'Productividad – Tareas Fijas',
    peso: 20,
    short: 'Productividad',
  },
  { key: 'crecimiento', nombre: 'Crecimiento de seguidores', peso: 20, short: 'Crecimiento' },
  {
    key: 'solicitudes',
    nombre: 'Solicitudes vs Entregados (CNP y gestión de tareas)',
    peso: 10,
    short: 'Solicitudes',
  },
  { key: 'pautas', nombre: 'Nº Pautas', peso: 20, short: 'Pautas' },
  { key: 'piezas', nombre: 'Nº Piezas vs Piezas editadas', peso: 10, short: 'Piezas' },
]

// Justificativo de marcas sin reunión realizada en el período (Reportes → Operaciones,
// modal de cobertura de reuniones). No afecta el score — es puramente informativo.
export const JUSTIFICATIVOS_REUNION = [
  { value: 'no_aplica', label: 'No aplica' },
  { value: 'reprogramado_cliente', label: 'Reprogramado por el cliente' },
  { value: 'no_cumplio', label: 'No cumplió' },
]

export const DEFAULT_SUBTAREAS = [
  { nombre: 'Métricas', meta: 15 },
  { nombre: 'Grillas Redes → Diseño', meta: 41 },
  { nombre: 'Grillas Diseño → Redes', meta: 41 },
  { nombre: 'Actualización de Plataformas', meta: 50 },
  { nombre: 'Calendario', meta: 15 },
]

// Líneas/jefas y sus colores de marca (tomados de las variables CSS del HTML original)
export const SEED_LINES = [
  { name: 'Georgina', color: '#FAB51A', sort_order: 0 },
  { name: 'Daniellys', color: '#3B82F6', sort_order: 1 },
  { name: 'Sabrina', color: '#10B981', sort_order: 2 },
  { name: 'Bianca', color: '#EC4899', sort_order: 3 },
]

export const LINE_COLORS = {
  Georgina: '#FAB51A',
  Daniellys: '#3B82F6',
  Sabrina: '#10B981',
  Bianca: '#EC4899',
}

// Cartera inicial de clientes por línea (tomada del HTML original)
export const SEED_CLIENTES = {
  Georgina: [
    'Da Vinci',
    'ALSA',
    'Maxxis',
    'Energon',
    'Smashack',
    'DomiSalud',
    'ComSalud',
    'Udimed',
    'Cow Rodizio',
    'Opticolor (tiktok)',
    'Andiamo',
    'Lego',
    'PLI',
    'Cow Carnicería',
    'Clínica San Lucas',
    'Da Vinci Cafe',
  ],
  Daniellys: [
    'Flexmed',
    'ENCCO',
    'SuperFina',
    'Drink Cola',
    'Vettal',
    'LiderWest',
    'Flamingo',
    'Blu',
    'Zurca',
    'Innocens',
    'Lavoflux',
    'Push',
    'AutoTeke',
  ],
  Sabrina: [
    'Fernando Balza',
    'Inspira',
    'Fórmula Sae',
    'TurboPre',
    'Nuvitt',
    'Punto Fit',
    'Regalado',
    'BeStronger Ve',
    'Protein Center',
    'Capitas Vzla',
    'ADS',
    'RE/MAX',
    'Be Stronger Usa',
    'Reparveca',
    'Montana',
    'Padel Club',
    'One Pizza',
    'Ritmi',
    'LCDLI',
  ],
  Bianca: [
    'Gelarttesano',
    'Fein Kaffee',
    'Agrolago',
    'Alpitech',
    'El Complejo / Academia',
    'La Tienda del Pintor',
    'Taller Elite',
    'Digicell',
    'Vin Store',
  ],
}

// Colores para los 6 indicadores (coinciden con --ind-1..6 del HTML)
export const INDICATOR_COLORS = ['#FAB51A', '#3B82F6', '#10B981', '#F97316', '#8B5CF6', '#06B6D4']
