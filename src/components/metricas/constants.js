export const SOCIAL_NETWORKS = [
  'Instagram', 'Facebook', 'TikTok', 'X', 'YouTube', 'LinkedIn', 'Otro',
]

export const MONTHS = [
  "Enero","Febrero","Marzo","Abril","Mayo","Junio",
  "Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"
];

export const INDICATORS = [
  { key: "reuniones",    nombre: "Reuniones realizadas",          peso: 20, short: "Reuniones"    },
  { key: "productividad",nombre: "Productividad – Tareas Fijas",  peso: 20, short: "Productividad" },
  { key: "crecimiento",  nombre: "Crecimiento de seguidores",     peso: 20, short: "Crecimiento"  },
  { key: "solicitudes",  nombre: "Solicitudes vs Entregados",     peso: 10, short: "Solicitudes"  },
  { key: "pautas",       nombre: "Nº Pautas",                     peso: 20, short: "Pautas"       },
  { key: "piezas",       nombre: "Nº Piezas vs Piezas editadas",  peso: 10, short: "Piezas"       },
];

export const DEFAULT_SUBTAREAS = [
  { nombre: "Métricas",                   meta: 15 },
  { nombre: "Grillas Redes → Diseño",     meta: 41 },
  { nombre: "Grillas Diseño → Redes",     meta: 41 },
  { nombre: "Actualización de Plataformas", meta: 50 },
  { nombre: "Calendario",                 meta: 15 },
];

// Líneas/jefas y sus colores de marca (tomados de las variables CSS del HTML original)
export const SEED_LINES = [
  { name: "Georgina",  color: "#FAB51A", sort_order: 0 },
  { name: "Daniellys", color: "#3B82F6", sort_order: 1 },
  { name: "Sabrina",   color: "#10B981", sort_order: 2 },
  { name: "Bianca",    color: "#EC4899", sort_order: 3 },
];

export const LINE_COLORS = {
  Georgina:  "#FAB51A",
  Daniellys: "#3B82F6",
  Sabrina:   "#10B981",
  Bianca:    "#EC4899",
};

// Cartera inicial de clientes por línea (tomada del HTML original)
export const SEED_CLIENTES = {
  Georgina: [
    "Da Vinci","ALSA","Maxxis","Energon","Smashack","DomiSalud","ComSalud",
    "Udimed","Cow Rodizio","Opticolor (tiktok)","Andiamo","Lego","PLI",
    "Cow Carnicería","Clínica San Lucas","Da Vinci Cafe",
  ],
  Daniellys: [
    "Flexmed","ENCCO","SuperFina","Drink Cola","Vettal","LiderWest",
    "Flamingo","Blu","Zurca","Innocens","Lavoflux","Push","AutoTeke",
  ],
  Sabrina: [
    "Fernando Balza","Inspira","Fórmula Sae","TurboPre","Nuvitt","Punto Fit",
    "Regalado","BeStronger Ve","Protein Center","Capitas Vzla","ADS","RE/MAX",
    "Be Stronger Usa","Reparveca","Montana","Padel Club","One Pizza","Ritmi","LCDLI",
  ],
  Bianca: [
    "Gelarttesano","Fein Kaffee","Agrolago","Alpitech","El Complejo / Academia",
    "La Tienda del Pintor","Taller Elite","Digicell","Vin Store",
  ],
};

// Colores para los 6 indicadores (coinciden con --ind-1..6 del HTML)
export const INDICATOR_COLORS = [
  "#FAB51A","#3B82F6","#10B981","#F97316","#8B5CF6","#06B6D4",
];
