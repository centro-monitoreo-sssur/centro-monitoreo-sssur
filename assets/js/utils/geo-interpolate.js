// ============================================================
// UTILIDAD: Interpolación GeoJSON
// Realiza una interpolación lineal entre dos geometrías (origen y destino)
// para lograr una transición fluida en Leaflet sin depender de librerías D3.
// ============================================================

/**
 * Anima una capa de Leaflet desde una forma actual hacia una nueva forma.
 * @param {L.Layer} layer - La capa de polígono de Leaflet.
 * @param {Array} coordsOrigen - Array de coordenadas [[[lng, lat], ...]] original.
 * @param {Array} coordsDestino - Array de coordenadas [[[lng, lat], ...]] destino.
 * @param {number} duracion - Duración en milisegundos.
 */
export function animarTransicionGeoJSON(layer, coordsOrigen, coordsDestino, duracion = 800) {
  return new Promise((resolve) => {
    // Si no tienen la misma topología básica, reemplazamos sin animar para evitar errores
    if (coordsOrigen.length === 0 || coordsDestino.length === 0 || 
        coordsOrigen[0].length !== coordsDestino[0].length) {
      // Invertir coordenadas porque Leaflet usa [lat, lng]
      const latlngs = coordsDestino[0].map(c => [c[1], c[0]]);
      layer.setLatLngs(latlngs);
      return resolve();
    }

    const startTime = performance.now();
    const ringOrigen = coordsOrigen[0];
    const ringDestino = coordsDestino[0];
    const numPuntos = ringOrigen.length;

    function pasoAnimacion(currentTime) {
      const elapsed = currentTime - startTime;
      let progreso = elapsed / duracion;

      if (progreso > 1) progreso = 1;

      // Función de easing easeInOutQuad
      const ease = progreso < 0.5 
        ? 2 * progreso * progreso 
        : 1 - Math.pow(-2 * progreso + 2, 2) / 2;

      const interpoladas = [];
      for (let i = 0; i < numPuntos; i++) {
        const oLng = ringOrigen[i][0];
        const oLat = ringOrigen[i][1];
        const dLng = ringDestino[i][0];
        const dLat = ringDestino[i][1];

        const cLng = oLng + (dLng - oLng) * ease;
        const cLat = oLat + (dLat - oLat) * ease;

        interpoladas.push([cLat, cLng]); // Leaflet espera [Lat, Lng]
      }

      layer.setLatLngs(interpoladas);

      if (progreso < 1) {
        requestAnimationFrame(pasoAnimacion);
      } else {
        resolve();
      }
    }

    requestAnimationFrame(pasoAnimacion);
  });
}
