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
