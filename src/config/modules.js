/**
 * Registro central de módulos del sistema.
 * Fuente de verdad compartida por PermisosView, RequireModule y Sidebar.
 *
 * module_key debe coincidir con el moduleKey usado en:
 *   - module_permissions.module_key (BD)
 *   - can(moduleKey) en AuthContext
 *   - RequireModule moduleKey prop
 *   - Sidebar can() calls
 */
export const MODULES = [
  {
    key: 'proyectos',
    label: 'Proyectos',
    routePrefix: '/',
    description: 'Gestión de proyectos y fases',
  },
  {
    key: 'tickets',
    label: 'Soporte Técnico',
    routePrefix: '/tickets',
    description: 'Sistema de tickets de soporte',
  },
  {
    key: 'ads',
    label: 'Campañas',
    routePrefix: '/ads',
    description: 'Campañas publicitarias y tácticas',
  },
  {
    key: 'tareas',
    label: 'Tareas QC / Cierre',
    routePrefix: '/tareas',
    description: 'Gestión de tareas de control de calidad',
  },
  {
    key: 'empresa',
    label: 'Empresa',
    routePrefix: '/empresa',
    description: 'Organización, empleados, clientes y líneas',
  },
  {
    key: 'evaluaciones',
    label: 'Evaluaciones',
    routePrefix: '/evaluaciones',
    description: 'Evaluaciones de desempeño del equipo',
  },
  {
    key: 'reportes',
    label: 'Reportes',
    routePrefix: '/reportes',
    description: 'Métricas y reportes por línea',
  },
]

/** Mapa rápido key → módulo */
export const MODULE_MAP = Object.fromEntries(MODULES.map(m => [m.key, m]))
