// Utilidad de Geofencing para cálculo de distancias geográficas
// DEMO: Funcionalidad simulada - reemplazar con API real cuando se conecte backend

/**
 * Calcula la distancia entre dos coordenadas geográficas usando la fórmula Haversine
 * @param {number} lat1 - Latitud del punto 1 en grados decimales
 * @param {number} lng1 - Longitud del punto 1 en grados decimales
 * @param {number} lat2 - Latitud del punto 2 en grados decimales
 * @param {number} lng2 - Longitud del punto 2 en grados decimales
 * @returns {number} Distancia en metros
 */
export function calcularDistancia(lat1, lng1, lat2, lng2) {
  const R = 6371000; // Radio de la Tierra en metros
  const φ1 = lat1 * Math.PI / 180;
  const φ2 = lat2 * Math.PI / 180;
  const Δφ = (lat2 - lat1) * Math.PI / 180;
  const Δλ = (lng2 - lng1) * Math.PI / 180;

  const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

/**
 * Verifica si un punto está dentro de un radio específico de otro punto
 * @param {number} lat1 - Latitud del punto 1
 * @param {number} lng1 - Longitud del punto 1
 * @param {number} lat2 - Latitud del punto 2
 * @param {number} lng2 - Longitud del punto 2
 * @param {number} radioMetros - Radio en metros
 * @returns {boolean} True si el punto 2 está dentro del radio del punto 1
 */
export function estaDentroDeRadio(lat1, lng1, lat2, lng2, radioMetros) {
  const distancia = calcularDistancia(lat1, lng1, lat2, lng2);
  return distancia <= radioMetros;
}

/**
 * Convierte distancia de metros a kilómetros
 * @param {number} metros - Distancia en metros
 * @returns {number} Distancia en kilómetros
 */
export function metrosAKilometros(metros) {
  return metros / 1000;
}

/**
 * Convierte distancia de kilómetros a metros
 * @param {number} kilometros - Distancia en kilómetros
 * @returns {number} Distancia en metros
 */
export function kilometrosAMetros(kilometros) {
  return kilometros * 1000;
}

/**
 * Formatea distancia para display en UI
 * @param {number} metros - Distancia en metros
 * @returns {string} Distancia formateada (ej. "150 m" o "2.5 km")
 */
export function formatearDistancia(metros) {
  if (metros < 1000) {
    return `${Math.round(metros)} m`;
  }
  return `${metrosAKilometros(metros).toFixed(1)} km`;
}
