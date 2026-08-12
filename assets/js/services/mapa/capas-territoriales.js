// ============================================================================
// CAPAS TERRITORIALES DEL MAPA
//
// Dibuja y retira los límites sobre cualquier mapa de Leaflet: municipio,
// distritos y colonias. Lo usan el Mapa en Vivo y el Cartograma, que son las
// dos vistas con mapa del Centro de Monitoreo.
//
// Existe porque el mismo `L.geoJSON(...)` con su estilo, su tooltip y su
// limpieza estaba copiado en SEIS archivos —las dos vistas admin, las dos de la
// PWA de campo y las dos del portal ciudadano— y las copias ya habían
// divergido en grosor, color y en si el polígono llevaba relleno. Un cambio de
// criterio obligaba a encontrar los seis.
//
// Patrón: cada capa es una entrada de catálogo con su propio cargador y su
// propio estilo (`CAPAS`), y el motor de pintado es genérico. Añadir "límites
// de cantón" cuando Catastro los entregue es añadir una entrada, no tocar el
// motor.
// ============================================================================
import { L } from '../../core/libs.js';
import { cargarLimitesSSSur, cargarColoniasSanMarcos } from '../geo-json/cargador.js';
import { esTeselaOscura } from './teselas.js';

// ── Contorno del municipio ──────────────────────────────────────────────────
//
// No hay archivo con el límite exterior: hay que fusionar los cinco distritos.
// Se hace UNA vez y se memoriza, porque son ~11 500 vértices y la fusión no es
// gratis. Turf ya viene cargado por index.html.
let promesaMunicipio = null;

function cargarLimiteMunicipal() {
  if (promesaMunicipio) return promesaMunicipio;

  promesaMunicipio = cargarLimitesSSSur().then((geo) => {
    if (!geo?.features?.length) return null;

    // Sin Turf no se puede fusionar. Se devuelven los cinco polígonos: el
    // usuario ve el contorno correcto, solo que con las divisiones internas
    // dibujadas. Degradar así es preferible a no pintar nada.
    if (typeof window.turf?.union !== 'function') {
      console.warn('[capas] Turf no está disponible: el límite municipal se dibuja por distritos.');
      return geo;
    }

    try {
      const fusionado = geo.features.reduce((acc, f) => (acc ? window.turf.union(acc, f) : f));
      return { type: 'FeatureCollection', features: [fusionado] };
    } catch (e) {
      // Una geometría con auto-intersecciones hace fallar la unión. No es
      // motivo para dejar el mapa sin límites.
      console.warn('[capas] No se pudo fusionar el municipio, se usan los distritos:', e.message);
      return geo;
    }
  });

  return promesaMunicipio;
}

// ── Catálogo de capas ───────────────────────────────────────────────────────
//
// `estilo` recibe el modo de tesela para decidir el color: sobre la imagen
// satélite un azul oscuro es invisible, y sobre el callejero un blanco lo es
// igualmente.
// Antes comparaba contra dos identificadores escritos a mano —'satellite' y
// 'darkmap'— que solo existían en la consola administrativa. La PWA de campo
// usaba otros nombres, así que aquí nunca daba verdadero y sus polígonos se
// pintaban con colores de fondo claro sobre imagen de satélite: invisibles.
//
// Ahora lo decide el catálogo único (`services/mapa/teselas.js`), que además
// traduce los identificadores heredados. Añadir una capa base nueva ya no
// obliga a acordarse de tocar esta línea.
const sobreSatelite = (tile) => esTeselaOscura(tile);

export const CAPAS = {
  municipio: {
    id: 'municipio',
    nombre: 'Límite municipal',
    icono: 'fa-location-dot',
    claveConfig: 'mostrarMunicipio',
    ayuda: 'Contorno exterior de San Salvador Sur, sin divisiones internas.',
    cargar: cargarLimiteMunicipal,
    estilo: (tile) => ({
      color: sobreSatelite(tile) ? '#ffffff' : '#0f172a',
      weight: 3.5, opacity: 0.95, fill: false, fillOpacity: 0,
    }),
    etiqueta: () => 'San Salvador Sur',
  },

  distritos: {
    id: 'distritos',
    nombre: 'Límites distritales',
    icono: 'fa-draw-polygon',
    claveConfig: 'mostrarDistritos',
    ayuda: 'Contorno de los cinco distritos del municipio.',
    cargar: cargarLimitesSSSur,
    estilo: (tile) => ({
      color: sobreSatelite(tile) ? '#ffffff' : '#1d4ed8',
      weight: 2.5, opacity: 0.9, fill: false, fillOpacity: 0,
    }),
    // Sin relleno a propósito: teñir la superficie apaga las teselas, resta
    // contraste a los pines y en los solapes el tono se duplica. En una consola
    // de monitoreo importa dónde está cada incidencia, no el área del distrito.
    etiqueta: (p) => p.nombre || p.Municipio || '',
  },

  colonias: {
    id: 'colonias',
    nombre: 'Colonias',
    icono: 'fa-city',
    claveConfig: 'mostrarColonias',
    ayuda: 'Colonias, barrios y lotificaciones. Por ahora solo San Marcos.',
    cargar: cargarColoniasSanMarcos,
    // Trazo fino y sí con relleno muy tenue: son 153 polígonos pequeños y sin
    // una superficie mínima no se distingue dónde acaba uno y empieza el otro.
    // El ámbar sobre satélite y el ocre sobre mapa claro son los dos tonos que
    // sobreviven a un fondo de vegetación y tejado. El violeta que usaba la PWA
    // se confundía con la sombra de los árboles en la imagen aérea.
    //
    // Sobre fondo oscuro el trazo va algo más grueso y el relleno algo más
    // presente: una línea de 1 px sobre imagen de satélite se pierde entre el
    // ruido de la propia fotografía, cosa que no pasa sobre un mapa plano.
    estilo: (tile) => (sobreSatelite(tile)
      ? { color: '#fbbf24', weight: 1.6, opacity: 0.95, fill: true, fillOpacity: 0.12 }
      : { color: '#b45309', weight: 1.0, opacity: 0.75, fill: true, fillOpacity: 0.06 }),
    etiqueta: (p) => p.nombre || '',
    // Solo tiene sentido de cerca. Con el municipio entero en pantalla, 153
    // polígonos son una mancha ilegible que además cuesta dibujar.
    zoomMinimo: 13,
  },
};

/** Capas en el orden en que deben ofrecerse y dibujarse (de fondo a frente). */
export const ORDEN_CAPAS = ['colonias', 'distritos', 'municipio'];

/**
 * Gestor de capas territoriales de UN mapa.
 *
 * Se crea uno por vista. Guarda las capas de Leaflet en un `Map` normal —nunca
 * en un `ref` ni en un `reactive`: envolver un objeto de Leaflet en un proxy de
 * Vue es lo que produjo el `TypeError: ... '_latLngToNewLayerPoint'` que ya
 * apareció en esta consola.
 */
export function crearGestorDeCapas(mapa, opciones = {}) {
  const dibujadas = new Map();          // id → L.GeoJSON
  let tileActual = opciones.tile || 'google';

  /** ¿Sigue el gestor apuntando a un mapa vivo? */
  const vivo = () => Boolean(mapa && mapa.getContainer && mapa.getContainer());

  async function mostrar(id) {
    const capa = CAPAS[id];
    if (!capa || !vivo() || dibujadas.has(id)) return;

    // Se reserva el hueco ANTES del await. Sin esto, dos llamadas seguidas
    // —un doble clic en el conmutador— dispararían dos descargas y pintarían
    // la capa dos veces, y la segunda quedaría huérfana al apagarla.
    dibujadas.set(id, null);

    const geo = await capa.cargar();

    // Entre la petición y la respuesta el usuario pudo apagar la capa o salir
    // de la vista. Sin esta guarda, la capa aparecería sola después.
    if (!geo || !vivo() || dibujadas.get(id) !== null) {
      if (dibujadas.get(id) === null) dibujadas.delete(id);
      return;
    }

    const capaLeaflet = L.geoJSON(geo, {
      style: capa.estilo(tileActual),
      // `L.canvas()` en vez de SVG: con 153 polígonos de colonias, un nodo del
      // DOM por polígono hace que el desplazamiento del mapa vaya a tirones.
      renderer: L.canvas(),
      onEachFeature(feature, layer) {
        const texto = capa.etiqueta(feature.properties || {});
        if (!texto) return;
        layer.bindTooltip(
          `<div style="font-family:'Inter',sans-serif;font-size:12px;font-weight:600;">${texto}</div>`,
          { sticky: true, className: 'dp' }
        );
      },
    });

    capaLeaflet.addTo(mapa);
    dibujadas.set(id, capaLeaflet);
  }

  function ocultar(id) {
    const capaLeaflet = dibujadas.get(id);
    if (capaLeaflet && vivo()) mapa.removeLayer(capaLeaflet);
    dibujadas.delete(id);   // también borra el hueco reservado si seguía en vuelo
  }

  const alternar = (id, activa) => (activa ? mostrar(id) : ocultar(id));

  /**
   * Reaplica los colores tras cambiar de tesela. Solo el estilo: volver a
   * crear las capas obligaría a repetir la fusión del municipio y a redibujar
   * 153 polígonos por un simple cambio de fondo.
   */
  function actualizarTile(tile) {
    tileActual = tile;
    for (const [id, capaLeaflet] of dibujadas) {
      if (capaLeaflet) capaLeaflet.setStyle(CAPAS[id].estilo(tile));
    }
  }

  /** ¿Está el mapa lo bastante cerca para que la capa aporte algo? */
  const tieneSentidoAlZoom = (id) => {
    const minimo = CAPAS[id]?.zoomMinimo;
    return !minimo || !vivo() || mapa.getZoom() >= minimo;
  };

  function destruir() {
    for (const capaLeaflet of dibujadas.values()) {
      if (capaLeaflet && vivo()) mapa.removeLayer(capaLeaflet);
    }
    dibujadas.clear();
    mapa = null;   // corta la referencia: el mapa lo destruye quien lo creó
  }

  return { mostrar, ocultar, alternar, actualizarTile, tieneSentidoAlZoom, destruir };
}
