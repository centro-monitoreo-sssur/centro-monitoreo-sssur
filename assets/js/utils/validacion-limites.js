// Validación de límites municipales
// Utilidad para verificar si una coordenada está dentro de la jurisdicción municipal
// DEMO: Funcionalidad simulada sin Turf.js - reemplazar con Turf.js para validación precisa

// Bounding box del municipio San Salvador Sur (del schema SQL)
const BBOX_MUNICIPIO = {
  latMin: 13.60,
  latMax: 13.80,
  lngMin: -89.30,
  lngMax: -89.10
};

// Función simple para verificar si un punto está dentro del bounding box
function estaDentroDelBoundingBox(lat, lng, bbox = BBOX_MUNICIPIO) {
  return lat >= bbox.latMin && lat <= bbox.latMax && 
         lng >= bbox.lngMin && lng <= bbox.lngMax;
}

// Función para verificar si un punto está dentro de un polígono usando Turf.js
function estaDentroDelPoligono(lat, lng, feature) {
  if (typeof turf === 'undefined') {
    console.warn('Turf.js no está disponible. Usando validación por bounding box.');
    return estaDentroDelBoundingBox(lat, lng);
  }
  
  const punto = turf.point([lng, lat]);
  return turf.booleanPointInPolygon(punto, feature);
}

// Función para verificar si un punto está cerca de un límite (buffer de tolerancia)
function estaCercaDelLimite(lat, lng, lineas, toleranciaMetros = 100) {
  if (typeof turf === 'undefined') {
    // Fallback simple: verificar si está cerca de los bordes del bounding box
    const bbox = BBOX_MUNICIPIO;
    const margen = 0.01; // ~1km de margen
    return (lat < bbox.latMin + margen || lat > bbox.latMax - margen ||
            lng < bbox.lngMin + margen || lng > bbox.lngMax - margen);
  }
  
  const punto = turf.point([lng, lat]);
  
  for (const linea of lineas) {
    if (linea.geometry.type === 'LineString') {
      const lineaTurf = turf.lineString(linea.geometry.coordinates);
      const buffer = turf.buffer(lineaTurf, toleranciaMetros / 1000, { units: 'kilometers' });
      
      if (turf.booleanPointInPolygon(punto, buffer)) {
        return true;
      }
    } else if (linea.geometry.type === 'MultiLineString') {
      for (const coords of linea.geometry.coordinates) {
        const lineaTurf = turf.lineString(coords);
        const buffer = turf.buffer(lineaTurf, toleranciaMetros / 1000, { units: 'kilometers' });
        
        if (turf.booleanPointInPolygon(punto, buffer)) {
          return true;
        }
      }
    }
  }
  
  return false;
}

// Función principal para validar si una denuncia está dentro de la jurisdicción
// modo: 'estricto' (límite duro) | 'suave' (advertencia pero permite)
function validarJurisdiccion(lat, lng, limitesMunicipio, limitesPoligonos, modo = 'estricto') {
  // Validación básica por bounding box (siempre disponible)
  const dentroBBox = estaDentroDelBoundingBox(lat, lng);
  
  if (!dentroBBox) {
    return { 
      dentro: false, 
      modo: 'fuera',
      mensaje: 'Ubicación fuera de la jurisdicción municipal. La municipalidad no puede atender denuncias fuera de su territorio.' 
    };
  }
  
  // Si Turf.js está disponible, usar validación precisa por polígonos
  if (typeof turf !== 'undefined') {
    // Primero verificar si está dentro de los polígonos de los distritos
    if (limitesPoligonos && limitesPoligonos.features) {
      for (const feature of limitesPoligonos.features) {
        if (feature.geometry && (feature.geometry.type === 'Polygon' || feature.geometry.type === 'MultiPolygon')) {
          if (estaDentroDelPoligono(lat, lng, feature)) {
            return { 
              dentro: true, 
              modo: 'dentro',
              mensaje: 'Ubicación dentro de la jurisdicción municipal' 
            };
          }
        }
      }
    }
    
    // Si no está dentro de los distritos, verificar si está dentro del polígono del municipio general
    if (limitesMunicipio && limitesMunicipio.features) {
      for (const feature of limitesMunicipio.features) {
        if (feature.geometry && (feature.geometry.type === 'Polygon' || feature.geometry.type === 'MultiPolygon')) {
          if (estaDentroDelPoligono(lat, lng, feature)) {
            return { 
              dentro: true, 
              modo: 'dentro',
              mensaje: 'Ubicación dentro de la jurisdicción municipal' 
            };
          }
        }
      }

      // Verificar si está cerca del límite (modo suave)
      if (modo === 'suave') {
        const lineas = [];
        for (const feature of limitesMunicipio.features) {
          if (feature.geometry && (feature.geometry.type === 'LineString' || feature.geometry.type === 'MultiLineString')) {
            lineas.push(feature);
          }
        }
        
        if (lineas.length > 0) {
          const cerca = estaCercaDelLimite(lat, lng, lineas, 100); // 100 metros de tolerancia
          
          if (cerca) {
            return { 
              dentro: true, 
              modo: 'advertencia',
              mensaje: 'Ubicación cerca del límite de la jurisdicción municipal. Verifique que la ubicación sea correcta.' 
            };
          }
        }
      }
    }
    
    // Si no está dentro ni cerca, está fuera
    return { 
      dentro: false, 
      modo: 'fuera',
      mensaje: 'Ubicación fuera de la jurisdicción municipal. La municipalidad no puede atender denuncias fuera de su territorio.' 
    };
  }
  
  // Sin Turf.js, usar validación por bounding box
  return { 
    dentro: true, 
    modo: 'dentro',
    mensaje: 'Ubicación dentro de la jurisdicción municipal (validación por bounding box)' 
  };
}

// Exportar funciones (CommonJS para compatibilidad con carga global)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { 
    validarJurisdiccion, 
    estaDentroDelPoligono, 
    estaCercaDelLimite,
    estaDentroDelBoundingBox,
    BBOX_MUNICIPIO
  };
}

// Exponer al window para uso global (carga como script en index.html)
if (typeof window !== 'undefined') {
  window.validarJurisdiccion = validarJurisdiccion;
  window.estaDentroDelPoligono = estaDentroDelPoligono;
  window.estaCercaDelLimite = estaCercaDelLimite;
  window.estaDentroDelBoundingBox = estaDentroDelBoundingBox;
  window.BBOX_MUNICIPIO = BBOX_MUNICIPIO;
}
