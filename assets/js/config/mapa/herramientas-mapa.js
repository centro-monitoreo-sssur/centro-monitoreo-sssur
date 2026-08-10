// ============================================================
// CONFIGURACIÓN: herramientas flotantes y capas base del Mapa en Vivo
//
// Declara qué herramientas existen, cómo se agrupan, cuáles se excluyen entre
// sí y con qué estado arrancan. La vista solo ejecuta el efecto de cada una;
// aquí vive el catálogo.
//
// La exclusión mutua estaba escrita como `if` encadenados dentro de
// `toggleHerramienta()`: añadir una tercera herramienta de dibujo obligaba a
// tocar esa cadena y era fácil olvidarse de un caso. Ahora es un dato.
// ============================================================

/** Capas base disponibles. `id` es lo que guarda `config.mapa.estilo`. */
export const TILES = [
  { id: 'google',    nombre: 'Google Maps',  icono: 'fa-map-location-dot', descripcion: 'Callejero, el predeterminado' },
  { id: 'satellite', nombre: 'Satélite',     icono: 'fa-earth-americas',   descripcion: 'Imagen aérea' },
  { id: 'cartomap',  nombre: 'CartoDB Claro', icono: 'fa-sun',             descripcion: 'Alto contraste, sobrio' },
  { id: 'darkmap',   nombre: 'CartoDB Oscuro', icono: 'fa-moon',           descripcion: 'Para salas con poca luz' },
  { id: 'osm',       nombre: 'OpenStreetMap', icono: 'fa-map',             descripcion: 'Cartografía comunitaria' },
];

// Satélite de arranque: sobre la foto aérea se distinguen caminos y
// construcciones que el callejero no tiene, y es la referencia que pide el
// personal de campo. Configuración → Mapa puede sobrescribirlo por
// instalación (`cfgMapa.estilo`).
export const TILE_POR_DEFECTO = 'satellite';

/**
 * Herramientas conmutables del panel de capas.
 *
 *   id           clave dentro de `herramientasActivas`
 *   claveConfig  clave de `config.mapa` que fija su estado inicial
 *   excluyeA     ids que se apagan al encender esta (dibujo sobre el lienzo)
 *   requiereDato false si funciona sin incidencias cargadas
 */
export const HERRAMIENTAS = [
  {
    id: 'clustering', nombre: 'Agrupar marcadores', icono: 'fa-object-group',
    grupo: 'visualizacion', claveConfig: 'clustering', excluyeA: [],
    ayuda: 'Reúne los marcadores cercanos en un solo círculo con su conteo.',
  },
  {
    id: 'heatmap', nombre: 'Mapa de calor', icono: 'fa-fire',
    grupo: 'visualizacion', claveConfig: 'heatmap', excluyeA: [],
    ayuda: 'Sustituye los marcadores por densidad. Útil por encima de ~2000 puntos.',
  },
  // ── Capas territoriales ───────────────────────────────────────────────
  // Antes había un único conmutador llamado `distritos` cuya etiqueta en la
  // plantilla decía "Límites Municipio": dos cosas distintas bajo un mismo
  // interruptor, así que no se podía ver el contorno del municipio sin las
  // divisiones internas, ni al revés.
  //
  // El dibujo lo hace `services/mapa/capas-territoriales.js`; aquí solo se
  // declara qué se ofrece. `grupo: 'territorio'` las separa de las de datos.
  {
    id: 'municipio', nombre: 'Límite municipal', icono: 'fa-location-dot',
    grupo: 'territorio', claveConfig: 'mostrarMunicipio', excluyeA: [],
    ayuda: 'Contorno exterior de San Salvador Sur, sin divisiones internas.',
  },
  {
    id: 'distritos', nombre: 'Límites distritales', icono: 'fa-draw-polygon',
    grupo: 'territorio', claveConfig: 'mostrarDistritos', excluyeA: [],
    ayuda: 'Contorno de los cinco distritos del municipio.',
  },
  {
    id: 'colonias', nombre: 'Colonias', icono: 'fa-city',
    grupo: 'territorio', claveConfig: 'mostrarColonias', excluyeA: [],
    ayuda: 'Colonias, barrios y lotificaciones. Por ahora solo San Marcos.',
  },
  {
    id: 'medicion', nombre: 'Medir distancia', icono: 'fa-ruler-combined',
    grupo: 'dibujo', claveConfig: null, excluyeA: ['poligonos'],
    ayuda: 'Traza una línea o una ruta y calcula su longitud.',
  },
  {
    id: 'poligonos', nombre: 'Dibujar polígono', icono: 'fa-vector-square',
    grupo: 'dibujo', claveConfig: null, excluyeA: ['medicion'],
    ayuda: 'Delimita un área para guardarla como zona de interés.',
  },
];

export const GRUPOS_HERRAMIENTAS = [
  { id: 'visualizacion', titulo: 'Visualización',      icono: 'fa-eye' },
  { id: 'territorio',    titulo: 'Límites y territorio', icono: 'fa-map-location-dot' },
  { id: 'dibujo',        titulo: 'Dibujo y medición',  icono: 'fa-pen-ruler' },
];

/** Herramientas de un grupo, en el orden declarado. */
export const herramientasDelGrupo = (grupo) => HERRAMIENTAS.filter((h) => h.grupo === grupo);

/**
 * Ids de las capas territoriales. Es lo que el Cartograma necesita ofrecer:
 * allí no hay agrupación de pines ni mapa de calor, solo límites.
 */
export const CAPAS_TERRITORIALES = HERRAMIENTAS
  .filter((h) => h.grupo === 'territorio')
  .map((h) => h.id);

/** Botones flotantes sobre el lienzo (columna derecha del mapa). */
export const BOTONES_FLOTANTES = [
  { id: 'paneles',    icono: 'fa-table-columns',   titulo: 'Mostrar/ocultar paneles', accion: 'toggleSidebars' },
  { id: 'filtros',    icono: 'fa-filter',          titulo: 'Filtros',                 accion: 'panelFiltros' },
  { id: 'capas',      icono: 'fa-layer-group',     titulo: 'Capas del mapa',          accion: 'menuCapas' },
  { id: 'ubicacion',  icono: 'fa-location-crosshairs', titulo: 'Mi ubicación',        accion: 'ubicacion' },
  { id: 'fullscreen', icono: 'fa-expand',          titulo: 'Pantalla completa',       accion: 'fullscreen' },
];

/** Controles de navegación del pie del mapa. */
export const CONTROLES_NAVEGACION = [
  { id: 'zoomOut', icono: 'fa-minus',           titulo: 'Alejar',              accion: 'doZoomOut' },
  { id: 'zoomIn',  icono: 'fa-plus',            titulo: 'Acercar',             accion: 'doZoomIn' },
  { id: 'reset',   icono: 'fa-house',           titulo: 'Vista inicial',       accion: 'resetView' },
  { id: 'fitAll',  icono: 'fa-arrows-to-circle', titulo: 'Ajustar a los datos', accion: 'fitAll' },
];

/** Modos de la herramienta de medición. */
export const MODOS_MEDICION = [
  { id: 'linea', nombre: 'Línea recta', icono: 'fa-slash',  ayuda: 'Distancia en línea recta entre dos puntos.' },
  { id: 'ruta',  nombre: 'Por calles',  icono: 'fa-route',  ayuda: 'Distancia siguiendo la red vial (OSRM).' },
];

/**
 * Estado inicial de las herramientas, resuelto contra la configuración.
 * Las de dibujo (`claveConfig: null`) arrancan siempre apagadas: dejar el
 * lienzo en modo dibujo al abrir la consola haría que el primer clic sobre el
 * mapa creara un punto de medición en lugar de seleccionar una incidencia.
 */
export function estadoInicialHerramientas(configMapa = {}) {
  const estado = {};
  for (const h of HERRAMIENTAS) {
    estado[h.id] = h.claveConfig ? (configMapa[h.claveConfig] ?? false) : false;
  }
  return estado;
}

/** Ids que deben apagarse al encender `id`. Sustituye a los `if` encadenados. */
export function exclusionesDe(id) {
  return HERRAMIENTAS.find((h) => h.id === id)?.excluyeA || [];
}

export function buscarHerramienta(id) {
  return HERRAMIENTAS.find((h) => h.id === id) || null;
}
