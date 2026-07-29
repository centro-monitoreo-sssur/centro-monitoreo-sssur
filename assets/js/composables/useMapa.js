// ============================================================
// COMPOSABLE: mapa Leaflet desacoplado.
// La instancia vive fuera del scope reactivo de Vue. La librería nunca lee
// el estado directamente: la función puente `pintarMarcadores` recibe la
// lista ya derivada (denunciasFiltradas). Se destruye al desmontar la vista.
// ============================================================
import { watch, nextTick, onUnmounted } from '../core/vue.js';
import { L } from '../core/libs.js';
import { useDenuncias } from '../stores/denuncias.js';
import { useNavegacion } from '../stores/navegacion.js';
import { formatoFecha } from '../utils/formato.js';
import { marcadorDenuncia } from '../services/marcadores.js';

let mapa = null;
let capaMarcadores = null;
let capaLimites = null;
let capaDistritos = null;

function pintarMarcadores(lista) {
  if (!mapa) return;
  capaMarcadores.clearLayers();
  lista.forEach((d) => {
    const { nombreDeTipo, colorDeTipo } = useDenuncias();
    const m = L.marker([d.lat, d.lng], { icon: marcadorDenuncia(colorDeTipo(d.tipo_id)) }).addTo(capaMarcadores);
    m.bindPopup(`
      <b>${nombreDeTipo(d.tipo_id)}</b><br>
      <span class="text-xs">${d.direccion}</span><br>
      ${d.descripcion || ''}<br>
      <span style="font-size:11px;color:#888">${formatoFecha(d.created_at)}</span>
    `);
  });
}

function cargarLimitesMunicipales() {
  if (!mapa) return;
  
  try {
    if (typeof getMunicipalityGeoJSON === 'function') {
      const limites = getMunicipalityGeoJSON();
      if (limites && limites.features) {
        capaLimites = L.geoJSON(limites, {
          style: {
            color: '#ef4444',
            weight: 2,
            opacity: 0.7,
            dashArray: '5, 10'
          }
        }).addTo(mapa);
      }
    }
    
    if (typeof getDistritosGeoJSON === 'function') {
      const distritos = getDistritosGeoJSON();
      if (distritos && distritos.features) {
        capaDistritos = L.geoJSON(distritos, {
          style: {
            color: '#3b82f6',
            weight: 2,
            opacity: 0.5,
            fillOpacity: 0.1
          },
          onEachFeature: (feature, layer) => {
            if (feature.properties && feature.properties.nombre) {
              layer.bindPopup(feature.properties.nombre);
            }
          }
        }).addTo(mapa);
      }
    }
  } catch (error) {
    console.error('Error al cargar límites:', error);
  }
}

function iniciarMapa() {
  if (mapa) return;
  mapa = L.map('mapa-vivo').setView([13.7035, -89.2], 13);
  L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; OpenStreetMap & CartoDB', subdomains: 'abcd', maxZoom: 19,
  }).addTo(mapa);
  capaMarcadores = L.layerGroup().addTo(mapa);
  cargarLimitesMunicipales();
  pintarMarcadores(useDenuncias().denunciasFiltradas.value);
}

function centrarEnMapa(d) {
  if (mapa) mapa.setView([d.lat, d.lng], 16);
}

export function useMapa() {
  const { denunciasFiltradas } = useDenuncias();
  const { vistaActual } = useNavegacion();

  // Redibujar marcadores cuando cambia el filtro/lista.
  watch(denunciasFiltradas, (lista) => pintarMarcadores(lista));

  // Ajustar tamaño si la vista vuelve a mostrarse.
  watch(vistaActual, (v) => {
    if (v === 'dashboard') nextTick(() => { if (mapa) mapa.invalidateSize(); });
  });

  // Limpieza al desmontar la vista (evita fugas de la instancia Leaflet).
  onUnmounted(() => {
    if (mapa) { 
      if (capaLimites) mapa.removeLayer(capaLimites);
      if (capaDistritos) mapa.removeLayer(capaDistritos);
      mapa.remove(); 
      mapa = null; 
      capaMarcadores = null;
      capaLimites = null;
      capaDistritos = null;
    }
  });

  return { iniciarMapa, centrarEnMapa, cargarLimitesMunicipales };
}
