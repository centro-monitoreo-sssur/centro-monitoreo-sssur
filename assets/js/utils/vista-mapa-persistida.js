// ============================================================
// Recuerda dónde dejó cada usuario cada mapa (centro, zoom y capa base).
//
// Antes, cada entrada a un mapa arrancaba en el centro del municipio. Una
// cuadrilla que trabaja toda la mañana en Panchimalco tenía que reencuadrar
// después de cada consulta: entrar al detalle de un caso y volver al mapa
// costaba tres gestos que no aportan nada.
//
// Se guarda por clave de vista, no una sola para todas: el Mapa en Vivo del
// Centro de Monitoreo y el mapa de campo se usan a escalas distintas, y heredar
// el zoom de uno en el otro desorienta más de lo que ayuda.
//
// Es preferencia de interfaz, así que va a `localStorage` y no a la base — es
// exactamente el criterio que ya sigue `stores/configuracion.js`.
// ============================================================

const PREFIJO = 'mapa_vista_';
// Una posición de hace una semana ya no es "donde estaba trabajando": es ruido.
// Pasado ese plazo se ignora y el mapa arranca en su encuadre por defecto.
const VIGENCIA_MS = 7 * 24 * 60 * 60 * 1000;

/** Guarda centro, zoom y capa base de un mapa Leaflet. */
export function guardarVistaMapa(clave, mapa, estiloTile) {
  if (!mapa) return;
  try {
    const c = mapa.getCenter();
    localStorage.setItem(PREFIJO + clave, JSON.stringify({
      lat: c.lat, lng: c.lng, zoom: mapa.getZoom(),
      estilo: estiloTile || null,
      ts: Date.now(),
    }));
  } catch (e) {
    // Modo privado o cuota llena. Recordar el encuadre es una comodidad, no
    // una función crítica: si falla, el mapa simplemente arranca por defecto.
  }
}

/** Devuelve `{lat, lng, zoom, estilo}` o null si no hay nada vigente. */
export function leerVistaMapa(clave) {
  try {
    const crudo = localStorage.getItem(PREFIJO + clave);
    if (!crudo) return null;
    const v = JSON.parse(crudo);
    if (!v || typeof v.lat !== 'number' || typeof v.lng !== 'number') return null;
    if (!v.ts || Date.now() - v.ts > VIGENCIA_MS) return null;
    return v;
  } catch (e) {
    return null;
  }
}

/**
 * Aplica la vista recordada a un mapa recién creado.
 * @returns {boolean} true si se restauró algo (para no encuadrar por defecto).
 */
export function restaurarVistaMapa(clave, mapa) {
  const v = leerVistaMapa(clave);
  if (!v || !mapa) return false;
  mapa.setView([v.lat, v.lng], v.zoom, { animate: false });
  return true;
}

/**
 * Engancha el guardado a los eventos del mapa. Devuelve la función para
 * desengancharlo, que la vista debe llamar en `onUnmounted`: si no, el listener
 * sobrevive al componente y sigue escribiendo sobre un mapa ya destruido.
 *
 * `moveend` y `zoomend` se disparan mucho al arrastrar, así que se agrupa con
 * un temporizador: interesa dónde se quedó el usuario, no cada fotograma.
 */
export function vigilarVistaMapa(clave, mapa, obtenerEstilo) {
  if (!mapa) return () => {};
  let temporizador = null;

  const alMover = () => {
    clearTimeout(temporizador);
    temporizador = setTimeout(() => {
      guardarVistaMapa(clave, mapa, obtenerEstilo ? obtenerEstilo() : null);
    }, 600);
  };

  mapa.on('moveend', alMover);
  mapa.on('zoomend', alMover);

  return () => {
    clearTimeout(temporizador);
    mapa.off('moveend', alMover);
    mapa.off('zoomend', alMover);
  };
}
