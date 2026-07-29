// DEMO: Noticias/Avisos Municipales — reemplazar con API real
// Fuente: Alcaldía de San Salvador Sur

export const noticiasDemo = [
  {
    id: 1,
    titulo: 'Cierre de calle — Fiestas Patronales de San Marcos',
    categoria: 'Eventos',
    categoriaColor: 'blue',
    categoriaIcono: 'fa-star',
    descripcion: 'Durante las fiestas patronales de San Marcos del 25 al 27 de julio, se cerrará la Calle Principal desde la 1ª Avenida Norte hasta el Parque Central para el paso de procesiones y actividades culturales. Se habilitarán rutas alternas por la Calle 3 Poniente.',
    fecha: '2026-07-23T08:00:00',
    imagen: null,
    distritos: ['San Marcos'],
    trazado: [
      [13.636590, -89.236944],
      [13.637500, -89.232000],
      [13.638500, -89.226000],
      [13.639539, -89.209972],
      [13.640300, -89.207500]
    ],
    coordenadas: { lat: 13.6385, lng: -89.2225 },
    autor: 'Alcaldía de San Salvador Sur',
    autorIcono: 'fa-building-columns',
    autorColor: 'blue',
    respuestas: [
      {
        autor: 'Alcaldía SSSur',
        texto: 'Este aviso fue publicado oficialmente por la Gerencia de Comunicaciones. Para más información llama al 2550-0001.',
        fecha: '2026-07-23T08:05:00',
        oficial: true
      }
    ],
    leida: false
  },
  {
    id: 2,
    titulo: 'Corte de Agua Programado — Panchimalco',
    categoria: 'Servicios',
    categoriaColor: 'cyan',
    categoriaIcono: 'fa-droplet',
    descripcion: 'ANDA informa que el miércoles 24 de julio se realizará mantenimiento a la red de distribución en la colonia El Progreso, Panchimalco. El corte será de 8:00 AM a 4:00 PM. Se recomienda almacenar agua con anticipación.',
    fecha: '2026-07-22T15:00:00',
    imagen: null,
    distritos: ['Panchimalco'],
    trazado: null,
    coordenadas: { lat: 13.6100, lng: -89.1750 },
    autor: 'ANDA / Alcaldía SSSur',
    autorIcono: 'fa-building-columns',
    autorColor: 'blue',
    respuestas: [
      {
        autor: 'Alcaldía SSSur',
        texto: 'Agradecemos tu comprensión. Los trabajos son necesarios para mejorar el servicio en la zona.',
        fecha: '2026-07-22T15:10:00',
        oficial: true
      }
    ],
    leida: false
  },
  {
    id: 3,
    titulo: 'Reparación de bache — Rosario de Mora',
    categoria: 'Vialidad',
    categoriaColor: 'orange',
    categoriaIcono: 'fa-road',
    descripcion: 'La Gerencia de Obras Municipales realizará reparación de baches en la Av. Principal de Rosario de Mora el jueves 25 de julio. El tráfico será desviado por la calle paralela. Se estima una duración de 6 horas.',
    fecha: '2026-07-21T10:30:00',
    imagen: null,
    distritos: ['Rosario de Mora'],
    trazado: [
      [13.5700, -89.2200],
      [13.5720, -89.2220],
      [13.5745, -89.2245],
      [13.5760, -89.2260]
    ],
    coordenadas: { lat: 13.5740, lng: -89.2230 },
    autor: 'Gerencia de Obras Municipales',
    autorIcono: 'fa-hard-hat',
    autorColor: 'orange',
    respuestas: [],
    leida: true
  },
  {
    id: 4,
    titulo: 'Alerta Meteorológica — Lluvias intensas',
    categoria: 'Emergencias',
    categoriaColor: 'red',
    categoriaIcono: 'fa-cloud-bolt',
    descripcion: 'El MARN emite alerta amarilla por lluvias intensas para todo el municipio durante las próximas 48 horas. Se recomienda evitar zonas bajas y quebradas. La Protección Civil Municipal está en estado de alerta preventiva.',
    fecha: '2026-07-20T06:00:00',
    imagen: null,
    distritos: ['Panchimalco', 'Rosario de Mora', 'San Marcos', 'Santiago Texacuangos', 'Santo Tomás'],
    trazado: null,
    coordenadas: null,
    autor: 'Protección Civil Municipal',
    autorIcono: 'fa-shield-halved',
    autorColor: 'red',
    respuestas: [
      {
        autor: 'Alcaldía SSSur',
        texto: 'Equipos de Protección Civil están desplegados en zonas de riesgo. Ante cualquier emergencia llama al 123.',
        fecha: '2026-07-20T07:00:00',
        oficial: true
      }
    ],
    leida: true
  },
  {
    id: 5,
    titulo: 'Festival Cultural de Santo Tomás 2026',
    categoria: 'Eventos',
    categoriaColor: 'purple',
    categoriaIcono: 'fa-masks-theater',
    descripcion: 'La Alcaldía invita a toda la comunidad al Festival Cultural de Santo Tomás. Este sábado 26 de julio desde las 3:00 PM en la plaza central. Habrá música en vivo, gastronomía típica, artesanías locales y actividades para niños. Entrada libre.',
    fecha: '2026-07-19T14:00:00',
    imagen: null,
    distritos: ['Santo Tomás'],
    trazado: null,
    coordenadas: { lat: 13.6600, lng: -89.1300 },
    autor: 'Gerencia de Comunicaciones',
    autorIcono: 'fa-building-columns',
    autorColor: 'purple',
    respuestas: [],
    leida: true
  },
  {
    id: 6,
    titulo: 'Jornada de limpieza — Santiago Texacuangos',
    categoria: 'Municipalidad',
    categoriaColor: 'green',
    categoriaIcono: 'fa-recycle',
    descripcion: 'Este fin de semana realizaremos una gran jornada de limpieza en el centro de Santiago Texacuangos. Los puntos de recolección estarán en el parque central y la entrada al mercado municipal.',
    fecha: '2026-07-18T09:00:00',
    imagen: null,
    distritos: ['Santiago Texacuangos'],
    trazado: null,
    coordenadas: { lat: 13.6700, lng: -89.1050 },
    autor: 'Unidad de Medio Ambiente',
    autorIcono: 'fa-leaf',
    autorColor: 'green',
    respuestas: [
      {
        autor: 'Alcaldía SSSur',
        texto: 'Gracias a todos los vecinos que participaron. Juntos hacemos un municipio más limpio.',
        fecha: '2026-07-18T17:00:00',
        oficial: true
      }
    ],
    leida: true
  },
  {
    id: 7,
    titulo: 'Cierre vehicular — Desfile de Independencia',
    categoria: 'Vialidad',
    categoriaColor: 'orange',
    categoriaIcono: 'fa-flag',
    descripcion: 'Por el desfile del 15 de septiembre, se cerrará al tráfico vehicular la Calle Principal de San Marcos desde las 7:00 AM hasta las 12:00 PM. Las rutas alternas serán señalizadas por agentes del CAM.',
    fecha: '2026-07-16T08:00:00',
    imagen: null,
    distritos: ['San Marcos'],
    trazado: [
      [13.636590, -89.236944],
      [13.637800, -89.229000],
      [13.638500, -89.221000],
      [13.639200, -89.215000]
    ],
    coordenadas: { lat: 13.638000, lng: -89.226000 },
    autor: 'Cuerpo de Agentes Municipales (CAM)',
    autorIcono: 'fa-shield-halved',
    autorColor: 'orange',
    respuestas: [],
    leida: true
  },
  {
    id: 8,
    titulo: 'Nuevas rutas de recolección de basura',
    categoria: 'Servicios',
    categoriaColor: 'green',
    categoriaIcono: 'fa-truck',
    descripcion: 'A partir del 1 de agosto, la Unidad de Recolección implementará nuevas rutas optimizadas. Consulta los días de recolección de tu colonia en la app o llama al 2550-0003.',
    fecha: '2026-07-17T10:00:00',
    imagen: null,
    distritos: ['Panchimalco', 'Rosario de Mora', 'San Marcos', 'Santiago Texacuangos', 'Santo Tomás'],
    trazado: null,
    coordenadas: null,
    autor: 'Alcaldía de San Salvador Sur',
    autorIcono: 'fa-building-columns',
    autorColor: 'green',
    respuestas: [],
    leida: true
  }
];

// Categorías disponibles para chips de filtro
export const categoriasNoticias = [
  { id: 'todos', label: 'Todos', icono: 'fa-border-all' },
  { id: 'mi-zona', label: 'Mi zona', icono: 'fa-location-dot' },
  { id: 'Vialidad', label: 'Vialidad', icono: 'fa-road' },
  { id: 'Eventos', label: 'Eventos', icono: 'fa-star' },
  { id: 'Servicios', label: 'Servicios', icono: 'fa-wrench' },
  { id: 'Emergencias', label: 'Emergencias', icono: 'fa-triangle-exclamation' },
  { id: 'Municipalidad', label: 'Municipal', icono: 'fa-building-columns' }
];

// Helper para formatear fecha relativa
export const formatearFechaRelativa = (fechaISO) => {
  const ahora = new Date();
  const fecha = new Date(fechaISO);
  const diffMs = ahora - fecha;
  const diffMin = Math.floor(diffMs / 60000);
  const diffHrs = Math.floor(diffMs / 3600000);
  const diffDias = Math.floor(diffMs / 86400000);

  if (diffMin < 1) return 'Hace un momento';
  if (diffMin < 60) return `Hace ${diffMin} min`;
  if (diffHrs < 24) return `Hace ${diffHrs} h`;
  if (diffDias === 1) return 'Ayer';
  if (diffDias < 7) return `Hace ${diffDias} días`;

  return fecha.toLocaleDateString('es-SV', { day: 'numeric', month: 'short' });
};
