// ============================================================
// CATÁLOGO ÚNICO DE CAPAS BASE DEL MAPA
//
// Había SIETE implementaciones distintas de `L.tileLayer` repartidas por las
// vistas —dos en admin, tres en empleados, dos en población— cada una con su
// propia lista de opciones y sus propios identificadores. Consecuencias:
//
//   · La misma opción se llamaba distinto según la pantalla, así que no se
//     podía guardar «cómo quiero ver el mapa» de forma coherente.
//   · Añadir una capa nueva obligaba a tocar siete sitios, y quien tocara seis
//     dejaba una pantalla distinta a las demás sin que nada lo avisara.
//   · «Satélite sin etiquetas» no existía en ninguna, aunque es la vista más
//     útil para reconocer un terreno en campo.
//
// Aquí está el catálogo entero. Las vistas piden una capa por su id.
// ============================================================
import { L } from '../../core/libs.js';

/**
 * Capas base disponibles.
 *
 * `esOscura` lo consumen los estilos de los polígonos: sobre imagen de satélite
 * o sobre mapa oscuro, un trazo oscuro desaparece. Ver `capas-territoriales.js`.
 */
export const TESELAS = Object.freeze({
  claro: {
    id: 'claro',
    nombre: 'Claro',
    descripcion: 'Mapa sobrio, máximo contraste con los polígonos',
    icono: 'fa-sun',
    esOscura: false,
    esSatelite: false,
    crear: () => L.tileLayer(
      'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
      { maxZoom: 20, subdomains: 'abcd', attribution: '© OpenStreetMap · © CARTO' }
    ),
  },

  oscuro: {
    id: 'oscuro',
    nombre: 'Oscuro',
    descripcion: 'Menos brillo. Cómodo de noche o en turnos nocturnos',
    icono: 'fa-moon',
    esOscura: true,
    esSatelite: false,
    crear: () => L.tileLayer(
      'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
      { maxZoom: 20, subdomains: 'abcd', attribution: '© OpenStreetMap · © CARTO' }
    ),
  },

  calles: {
    id: 'calles',
    nombre: 'Calles',
    descripcion: 'Nombres de calle y numeración. El de siempre',
    icono: 'fa-road',
    esOscura: false,
    esSatelite: false,
    crear: () => L.tileLayer(
      'https://mt{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}',
      { maxZoom: 20, subdomains: '0123', attribution: '© Google' }
    ),
  },

  satelite: {
    id: 'satelite',
    nombre: 'Satélite limpio',
    descripcion: 'Imagen aérea sin rótulos. Para reconocer el terreno',
    icono: 'fa-image',
    esOscura: true,
    esSatelite: true,
    crear: () => L.tileLayer(
      'https://mt{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}',
      { maxZoom: 20, subdomains: '0123', attribution: '© Google' }
    ),
  },

  satelite_etiquetas: {
    id: 'satelite_etiquetas',
    nombre: 'Satélite con nombres',
    descripcion: 'Imagen aérea con calles y rótulos encima',
    icono: 'fa-map-location-dot',
    esOscura: true,
    esSatelite: true,
    crear: () => L.tileLayer(
      'https://mt{s}.google.com/vt/lyrs=y&x={x}&y={y}&z={z}',
      { maxZoom: 20, subdomains: '0123', attribution: '© Google' }
    ),
  },

  osm: {
    id: 'osm',
    nombre: 'OpenStreetMap',
    descripcion: 'Cartografía libre. Respaldo si otro proveedor falla',
    icono: 'fa-globe',
    esOscura: false,
    esSatelite: false,
    crear: () => L.tileLayer(
      'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
      { maxZoom: 19, attribution: '© OpenStreetMap' }
    ),
  },
});

/** Orden en que se ofrecen al usuario, de más a menos habitual en campo. */
export const ORDEN_TESELAS = ['calles', 'satelite_etiquetas', 'satelite', 'claro', 'oscuro', 'osm'];

export const TESELA_POR_DEFECTO = 'calles';

/**
 * Equivalencias con los identificadores antiguos.
 *
 * Cada vista tenía los suyos —`google`, `googlemaps`, `cartomap`, `darkmap`,
 * `satellite`…— y hay preferencias ya guardadas en el almacén de los teléfonos
 * con esos valores. Sin esta traducción, el primer arranque tras el cambio
 * ignoraría la preferencia del empleado y volvería al mapa por defecto.
 */
const EQUIVALENCIAS = Object.freeze({
  google: 'calles', googlemaps: 'calles', maps: 'calles', streets: 'calles',
  cartomap: 'claro', light: 'claro', positron: 'claro',
  darkmap: 'oscuro', dark: 'oscuro',
  satellite: 'satelite', satelite: 'satelite',
  hybrid: 'satelite_etiquetas', hibrido: 'satelite_etiquetas',
  openstreetmap: 'osm',
});

/** Normaliza cualquier identificador —nuevo o heredado— a uno del catálogo. */
export function normalizarTesela(id) {
  if (!id) return TESELA_POR_DEFECTO;
  if (TESELAS[id]) return id;
  return EQUIVALENCIAS[String(id).toLowerCase()] || TESELA_POR_DEFECTO;
}

/** Crea la capa de Leaflet correspondiente. Nunca devuelve null. */
export function crearTesela(id) {
  return TESELAS[normalizarTesela(id)].crear();
}

/** Metadatos de una capa, para que la interfaz la describa. */
export function infoTesela(id) {
  return TESELAS[normalizarTesela(id)];
}

/** `true` si sobre esa capa conviene usar trazos claros. */
export function esTeselaOscura(id) {
  return infoTesela(id).esOscura === true;
}

/** Catálogo en el orden de presentación, listo para un `v-for`. */
export const CATALOGO_TESELAS = ORDEN_TESELAS.map((id) => TESELAS[id]);
