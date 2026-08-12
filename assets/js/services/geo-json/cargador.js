// ============================================================
// CARGADOR DE CARTOGRAFÍA OFICIAL
//
// Fuente única para los límites del municipio. Sustituye a los globales
// `getMunicipalityGeoJSON()` / `getDistritosGeoJSON()` de limites-municipio.js
// y limites-poligonos.js, que traían el trazado antiguo.
//
// ── Por qué `fetch` y no un <script> más en index.html ──────────────────────
// Los dos archivos suman ~1.1 MB. Los globales actuales ya cargan 290 KB de
// forma bloqueante en CADA arranque, también en la PWA de campo con datos
// móviles, y solo hacen falta cuando se abre un mapa. Aquí se piden bajo
// demanda y se memoriza la promesa: la segunda vista que los pida reutiliza la
// misma descarga en vez de disparar otra.
//
// ── Normalización ───────────────────────────────────────────────────────────
// El archivo viene de una exportación de ArcGIS/KML: el nombre del distrito
// está en `Municipio` y en mayúsculas sin acentos ("SANTO TOMAS"), mientras que
// el cartograma y el mapa admin buscan `properties.nombre` con la grafía
// oficial ("Santo Tomás"). Se traduce aquí, en un solo sitio, en lugar de
// obligar a cada vista a conocer el formato del proveedor.
// ============================================================

// Rutas ABSOLUTAS: las tres aplicaciones cuelgan de rutas distintas
// —/panel/, /campo/, /ciudadano/— reescritas al mismo index.html. Una ruta
// relativa se resolvería contra el documento y desde /campo/ pediría
// `/campo/assets/...`, dejando los mapas de la PWA sin límites ni colonias.
const RUTA_LIMITES  = '/assets/js/services/geo-json/limites-sssur.geojson';
const RUTA_COLONIAS = '/assets/js/services/geo-json/colonias-san-marcos.geojson';

// Mayúsculas sin acento → grafía oficial. No se resuelve con un "title case"
// automático: no restituiría la tilde de "Tomás" ni dejaría "de" en minúscula.
const NOMBRE_OFICIAL = {
  'PANCHIMALCO':          'Panchimalco',
  'ROSARIO DE MORA':      'Rosario de Mora',
  'SAN MARCOS':           'San Marcos',
  'SANTIAGO TEXACUANGOS': 'Santiago Texacuangos',
  'SANTO TOMAS':          'Santo Tomás',
  'SANTO TOMÁS':          'Santo Tomás',
};

const canonico = (bruto) => {
  const clave = String(bruto || '').trim().toUpperCase();
  return NOMBRE_OFICIAL[clave] || String(bruto || '').trim();
};

// Memoria de promesas, no de resultados: si dos vistas se montan a la vez,
// ambas esperan la MISMA petición en lugar de lanzar dos descargas.
const cache = new Map();

async function pedirGeoJson(ruta, normalizar) {
  if (cache.has(ruta)) return cache.get(ruta);

  const promesa = fetch(ruta)
    .then((r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status} al pedir ${ruta}`);
      return r.json();
    })
    .then((geo) => {
      if (!geo || !Array.isArray(geo.features)) {
        throw new Error(`${ruta} no es un FeatureCollection válido`);
      }
      return normalizar ? normalizar(geo) : geo;
    })
    .catch((e) => {
      // Se descarta la promesa fallida para que un fallo de red puntual no
      // deje el mapa sin límites durante el resto de la sesión.
      cache.delete(ruta);
      console.error('[cartografia] ' + e.message);
      return null;
    });

  cache.set(ruta, promesa);
  return promesa;
}

/**
 * Límites oficiales de San Salvador Sur: un MultiPolygon por distrito.
 * Cada feature queda con `properties.nombre` en grafía oficial, además de las
 * propiedades originales del proveedor.
 */
export function cargarLimitesSSSur() {
  return pedirGeoJson(RUTA_LIMITES, (geo) => ({
    ...geo,
    features: geo.features.map((f) => ({
      ...f,
      properties: {
        ...f.properties,
        nombre: canonico(f.properties?.Municipio),
        // OJO: `PobTotal` / `Total` del proveedor NO son la población del
        // distrito (traen 983, 215, 1098, 977, 729 — son conteos de la capa de
        // origen, no habitantes). La población oficial está en `DATOS_DISTRITO`
        // de admin/vista-cartograma.js: 44 404 Panchimalco, 57 094 San Marcos…
        // Se deja fuera del objeto normalizado a propósito, para que ninguna
        // vista la pinte por error creyendo que es un dato de habitantes.
      },
    })),
  }));
}

/**
 * Colonias del distrito de San Marcos (153 polígonos).
 * El nombre viene en `text_1`; `name` está vacío en todos los registros.
 */
export function cargarColoniasSanMarcos() {
  return pedirGeoJson(RUTA_COLONIAS, (geo) => ({
    ...geo,
    features: geo.features.map((f) => ({
      ...f,
      properties: {
        ...f.properties,
        nombre: String(f.properties?.text_1 || '').trim() || 'Sin nombre',
        zona: f.properties?.zona ?? null,
        viviendas: Number(f.properties?.viviendas) || null,
      },
    })),
  }));
}

/** Nombres de distrito, en el orden del archivo. Útil para selectores. */
export async function nombresDeDistrito() {
  const geo = await cargarLimitesSSSur();
  return geo ? geo.features.map((f) => f.properties.nombre) : [];
}
