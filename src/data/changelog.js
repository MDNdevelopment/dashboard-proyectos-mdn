// Novedades mostradas en el modal "Novedades" (una vez por versión, vía localStorage).
//
// CONVENCIÓN (ver CLAUDE.md → "Changelog de novedades"):
// - CHANGELOG[0] es SIEMPRE la versión actual en desarrollo: cada fix/feature agrega
//   un ítem a su array `changes`. NO crear una entrada nueva por cambio.
// - Entrada SIN `date` = en desarrollo. Al publicar una versión: asignar `date` a la
//   actual, crear una entrada nueva arriba con el siguiente semver (sin `date`) y subir
//   de versión (fixes → patch, features → minor).
// - `version` debe ser semver comparable. `date` es informativo (string libre, opcional).
export const CHANGELOG = [
  {
    version: '1.2.0',
    title: 'Mejoras en Campañas y Empresa',
    changes: [
      'Campañas y Ads ahora se ven por línea de negocio: elige una línea arriba o "Todos". Las jefas de línea ven su línea por defecto.',
      'En Campañas simplificamos los estados a Pendiente, En Curso y Finalizado.',
      'Cada Táctica puede tener un checklist de acciones; al ir tildándolas avanza su % de cumplimiento.',
      'Al crear un Ad ahora puedes elegir el objetivo "Una combinación de ambas".',
      'Las campañas y los ads pasan solos a "Finalizado" cuando termina su fecha de cierre. Se avisa al responsable y a los Marketing Managers, y en los ads queda un aviso para cargar los resultados.',
      'La campanita de notificaciones ahora tiene un botón "Cargar más" para ver el historial completo, no solo las más recientes.',
      'En Empresa → Empleados puedes marcar a alguien "En período de prueba", ver cuántos hay y filtrarlos; al pasar a fijo lo desmarcas.',
    ],
  },
  {
    version: '1.1.0',
    date: '2026-08-05',
    title: 'Reportes por línea',
    changes: [
      'Nuevo desglose de métricas por línea de negocio.',
      'Se unificó el mes de referencia en el dashboard.',
    ],
  },
  {
    version: '1.0.0',
    date: '2026-07-01',
    title: 'Lanzamiento',
    changes: ['Primera versión del sistema.'],
  },
]

export const LATEST_VERSION = CHANGELOG[0]?.version ?? '0.0.0'
