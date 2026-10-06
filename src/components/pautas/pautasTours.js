// Recorridos guiados de Pautas (motor: components/common/onboarding). Cada paso señala el
// elemento con `data-tour="<target>"`; `view` / `semanaModo` le dicen a la pantalla dónde
// ponerse antes de mostrarlo. Los pasos solo explican, nunca ejecutan acciones.
//
// ctx = { coordina, manage, canViewAll, esRecurso, tieneTrabajo }

export const PAUTAS_TOURS = [
  {
    id: 'basico',
    titulo: 'Lo básico',
    descripcion: 'Cómo moverte por Pautas: semana, mes, alertas y resumen.',
    when: () => true,
    steps: [
      {
        titulo: 'Pautas, de un vistazo',
        texto:
          'Aquí se agendan las pautas audiovisuales (sesiones y grabaciones) de cada cliente. La agenda de la semana siguiente se arma el jueves, máximo el viernes a las 5:00 pm.',
        view: 'semana',
        semanaModo: 'semana',
      },
      {
        target: 'tabs',
        titulo: 'Las pestañas',
        texto:
          'Semana es el inicio. Datos resume cómo va el mes y Todas es la lista completa con filtros. Los números rojos o amarillos avisan cuánto hay por atender.',
        view: 'semana',
      },
      {
        target: 'scope',
        titulo: 'Filtra por línea',
        texto:
          'Elige "Todos" o una línea para ver solo sus pautas. Todo lo demás (semana, mes, alertas, datos) se ajusta a lo que elijas.',
        when: (ctx) => ctx.canViewAll,
      },
      {
        target: 'semana-grid',
        titulo: 'Tu semana, de lunes a sábado',
        texto:
          'Cada tarjeta es una pauta, con su hora, lugar, quién va y cómo va la edición. Haz clic en una para ver todo su detalle. Con las flechas de arriba cambias de semana.',
        view: 'semana',
        semanaModo: 'semana',
        side: 'top',
      },
      {
        target: 'semana-toggle',
        titulo: 'Semana o Mes',
        texto:
          'Con este botón cambias entre la vista de la semana y el calendario del mes completo. Al pasar a Mes se abre en el mes de la semana que estabas viendo.',
        view: 'semana',
        semanaModo: 'semana',
      },
      {
        target: 'alertas',
        titulo: 'Lo que necesita atención',
        texto:
          'Estas etiquetas se calculan solas: solicitudes por aprobar, pautas pasadas sin captura, grillas vencidas y piezas atrasadas. Cada una abre su lista en un panel lateral.',
        view: 'semana',
      },
      {
        target: 'semana-kpi',
        titulo: 'Cómo va el mes',
        texto:
          'El porcentaje editado, las pautas realizadas y las solicitudes por aprobar. Si haces clic aquí vas directo a la pestaña Datos.',
        view: 'semana',
      },
      {
        target: 'whatsapp',
        titulo: 'Agenda para WhatsApp',
        texto: 'Genera el texto de la agenda de la semana, listo para copiar y mandar al grupo.',
        view: 'semana',
      },
    ],
  },
  {
    id: 'pedir',
    titulo: 'Pedir una pauta',
    descripcion: 'Cómo solicitar una pauta y seguirla hasta que se agenda.',
    when: (ctx) => ctx.manage && !ctx.coordina,
    steps: [
      {
        target: 'crear',
        titulo: 'Solicitar una pauta',
        texto:
          'Abre un asistente de 3 pasos: (1) para qué cliente y qué se captura (Foto, Video 4K o Reel); (2) cuándo y dónde, en el Estudio MDN o en locación, con huecos libres sugeridos; (3) los detalles de la pauta.',
        view: 'semana',
        semanaModo: 'semana',
      },
      {
        titulo: 'El camino de tu solicitud',
        texto:
          'Toda solicitud empieza como "Solicitada". Coordinación la revisa y la agenda con fecha, lugar y recursos, o la declina con un motivo. Cuando se hace queda "Realizada".',
        view: 'semana',
      },
      {
        target: 'mis-solicitudes',
        titulo: 'Mis solicitudes',
        texto:
          'Aquí ves cada solicitud tuya con su línea de tiempo y la fecha de cada paso, para saber en qué va sin tener que preguntar.',
        view: 'semana',
      },
      {
        titulo: 'Editar o borrar',
        texto:
          'Mientras una solicitud siga en "Solicitada" puedes abrirla (clic sobre ella) para editarla o borrarla. Una vez agendada, los cambios los hace coordinación.',
      },
    ],
  },
  {
    id: 'coordinar',
    titulo: 'Coordinar la agenda',
    descripcion: 'Aprobar solicitudes, cuidar el estudio y cerrar pautas.',
    when: (ctx) => ctx.coordina,
    steps: [
      {
        target: 'alertas',
        titulo: 'Solicitudes por aprobar',
        texto:
          'La etiqueta "por aprobar" abre la cola: desde ahí agendas cada solicitud con fecha, lugar y recursos, o la declinas, sin salir de la pantalla.',
        view: 'semana',
        semanaModo: 'semana',
      },
      {
        target: 'ocupacion',
        titulo: 'Ocupación del estudio',
        texto:
          'El Estudio MDN se reserva en ventanas de 2 horas. Aquí ves los bloques ocupados de cada día y cuántas pautas tiene cada recurso. Dos pautas del mismo cliente sí pueden compartir el estudio.',
        view: 'semana',
        semanaModo: 'semana',
        side: 'top',
      },
      {
        target: 'semana-grid',
        titulo: 'Detalle de una pauta',
        texto:
          'Al abrir una pauta puedes marcarla como realizada, reagendarla (queda un historial del cambio) o reabrir una declinada.',
        view: 'semana',
        semanaModo: 'semana',
        side: 'top',
      },
      {
        target: 'crear',
        titulo: 'Agregar una pauta directa',
        texto: 'Si la pauta no viene de una solicitud, créala aquí y queda agendada de una vez.',
        view: 'semana',
      },
      {
        target: 'lista-filtros',
        titulo: 'La lista completa',
        texto:
          'En Todas filtras por estado (solicitadas, agendadas, realizadas, declinadas o papelera), por recurso o buscando por cliente. Lo borrado va a la papelera y desde ahí se puede restaurar.',
        view: 'todas',
      },
    ],
  },
  {
    id: 'captura',
    titulo: 'Registrar captura y edición',
    descripcion: 'Qué se capturó, qué falta por editar y cómo marcarlo de un toque.',
    when: (ctx) => ctx.esRecurso || ctx.tieneTrabajo,
    steps: [
      {
        target: 'mt-resumen',
        titulo: 'Mi trabajo',
        texto:
          'Tu pantalla personal: las pautas que te tocan y las piezas que tienes por editar. Está pensada para usarse desde el celular.',
        view: 'mitrabajo',
      },
      {
        target: 'mt-hoy',
        titulo: 'Hoy y por registrar',
        texto:
          'Para cada pauta suma con + y − cuántas piezas capturaste por formato. Lo que registres aquí alimenta los datos del mes.',
        view: 'mitrabajo',
      },
      {
        target: 'mt-editar',
        titulo: 'Por editar',
        texto:
          'Sube las piezas que ya están listas con + y −, o usa "todo listo" cuando termines el lote completo.',
        view: 'mitrabajo',
      },
      {
        target: 'mt-disponible',
        titulo: 'Disponible para tomar',
        texto:
          'Lotes de piezas que todavía nadie está editando. Tómalos para que queden a tu nombre.',
        view: 'mitrabajo',
      },
    ],
  },
  {
    id: 'datos',
    titulo: 'Leer los datos',
    descripcion: 'Qué dicen los números del mes y cómo llegar al detalle.',
    when: () => true,
    steps: [
      {
        target: 'datos-kpi',
        titulo: 'Conclusiones del mes',
        texto:
          'Porcentaje editado, piezas capturadas y editadas, pautas realizadas. Cada número muestra cómo cambió frente al mes anterior; con el selector cambias de mes.',
        view: 'datos',
      },
      {
        target: 'datos-pendientes',
        titulo: 'Pendiente por editar',
        texto:
          'Las piezas capturadas que aún no están listas, por línea y formato. Haz clic en un número para ir a la lista de pautas que lo componen.',
        view: 'datos',
      },
      {
        target: 'datos-ranking',
        titulo: 'Rankings',
        texto:
          'Videos (4K y Reels) y Fotos por separado: quién capturó y quién editó más en el mes.',
        view: 'datos',
      },
    ],
  },
]

/** Recorridos (y pasos) que aplican a quien mira, según sus permisos. */
export function toursFor(ctx) {
  return PAUTAS_TOURS.filter((tour) => tour.when(ctx)).map((tour) => ({
    ...tour,
    steps: tour.steps.filter((step) => !step.when || step.when(ctx)),
  }))
}
