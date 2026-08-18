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
      'Al eliminar un cliente ahora eliges si sigue contando en el reporte del mes en curso (facturó/trabajó parte del mes) o si se retira de inmediato también de ese mes.',
      'Nueva opción "Mover de línea" para las marcas: al cambiar una cuenta de equipo, los reportes de meses anteriores conservan el nombre y el logo de la marca (ya no aparece como "cliente eliminado"). Al mover eliges si este mes ya cuenta para el equipo nuevo (el ingreso del mes se reparte entre ambos según los días y las métricas pasan al nuevo) o si este mes se queda completo con el equipo actual y el cambio se aplica solo el 1° del próximo mes. Además, las tareas abiertas de la marca pasan al equipo nuevo y quedan a cargo del jefe de ese equipo. También puedes mover una marca a "Independientes"; como no tiene jefe, ahí eliges tú a quién quedan asignadas las tareas.',
      'Ahora las marcas tienen "Fin de contrato" en su ficha: indicas hasta qué fecha trabajó la cuenta y, desde el mes siguiente, deja de aparecer en los reportes. Los reportes ya guardados de meses posteriores se limpian solos (los meses cerrados no se modifican).',
      'Corregido: los ads y campañas no se estaban finalizando solos al llegar a su fecha de cierre desde el 7 de agosto. Ya se pusieron al día los que quedaron pendientes.',
      'Corregido: en la sección Reuniones de un reporte de mes pasado, una marca movida a otra línea después de ese mes podía seguir apareciendo (en la meta y en el listado de marcas), aunque ya no figurara en el resto de las métricas de ese mes.',
      'Corregido: las tareas pendientes y en proceso de Energon y Maxxis se habían quedado en el equipo anterior al mover esas marcas a Team Sabrina. Ya se movieron al equipo nuevo y quedaron a cargo de la jefa de línea.',
      'Nuevo: se puede conectar Claude (computadora o iPhone) a la base de datos del dashboard para hacer preguntas y análisis en el chat, en modo solo lectura. Se conecta agregando un enlace en Settings → Connectors de Claude e iniciando sesión con una contraseña, sin instalar nada.',
      'Corregido: ahora se puede eliminar un empleado (u otro elemento) aunque su nombre tenga espacios de más al escribirlo para confirmar.',
      'En Empresa → Empleados, los usuarios de nivel 1 y 2 ya no ven el nivel de cada empleado ni la vista por columnas que lo dejaba entrever.',
      'Corregido: al crear un empleado con un correo que ya existe aparecía un mensaje de error técnico. Ahora avisa claramente si el correo ya pertenece a un empleado activo, o si pertenece a uno archivado (indicando que debe restaurarse desde "Ver eliminados").',
      'Corregido: en el Perfil del empleado (Evaluaciones), el conteo de "Tareas asignadas" no contaba las tareas con varios responsables; ahora sí las incluye.',
      'En el Perfil del empleado (Evaluaciones) ahora se abre mostrando el mes actual (con botón para ver el histórico completo). El recuadro de estado operativo suma un contador de tareas Pendientes y ahora refleja el mes elegido, y cada proyecto muestra su fecha de inicio y se filtra según el mes seleccionado.',
      'Corregido: en el Perfil del empleado (Evaluaciones), al hacer click en un proyecto asignado a veces se salía a la pantalla de Inicio en vez de abrir el proyecto. Ahora abre el detalle del proyecto directamente, sin cambiar de pantalla.',
      'Nuevo: en Inicio, un recuadro de "Análisis IA" resume en segundos cómo va la empresa, qué se puede mejorar y qué áreas necesitan acción, generado automáticamente y actualizable con un botón. Solo lo ve la dirección.',
      'Nuevo: "Tareas Fijas" dentro de Gestión de Tareas (por ahora para las líneas de Redes/Diseño). Una grilla semanal para tildar el cumplimiento de las 5 tareas recurrentes de cada cuenta (Métricas, Grillas, Plataformas, Calendario). Lo que se tilda ahí llena solo la sección "Productividad" del reporte mensual de la línea, y también se ve reflejado en el perfil de cada empleado (sección "Tareas fijas").',
      'En Tareas Fijas, la columna "Actualización de Plataformas" ahora muestra un botón por cada red social de la cuenta (Instagram, Facebook, TikTok, etc.), en vez de un solo botón general. Así la meta de ese renglón en el reporte se calcula automáticamente según el total de redes sociales de la línea, multiplicado por 4 semanas fijas al mes.',
      'Mejorado el diseño móvil de Tareas Fijas: la columna de la cuenta ocupa menos espacio, dejando más pantalla disponible para las tareas y reduciendo cuánto hay que deslizar la tabla hacia los lados.',
      'En Tareas Fijas (vista "Todas"), se quitó el renglón que repetía el nombre de la línea entre grupos de cuentas.',
      'El apartado "2. Productividad – Tareas Fijas" del reporte operativo empieza a llenarse solo desde el reporte de septiembre; los reportes de agosto hacia atrás se pueden seguir editando a mano como antes.',
      'El recuadro de "Análisis IA" en Inicio se ocultó temporalmente hasta nuevo aviso.',
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
