// Vista: Mapa en Vivo (Mobile PWA - Empleados)
import { ref, onMounted, onUnmounted, nextTick } from '../../core/vue.js';
import { useNavegacion } from '../../stores/navegacion.js';
import { L } from '../../core/libs.js';
import { useDenuncias } from '../../stores/denuncias.js';
import { marcadorDenuncia } from '../../services/marcadores.js';
import { useCatalogos } from '../../stores/catalogos.js';

export default {
  setup() {
    const { irA } = useNavegacion();
    const { denuncias } = useDenuncias();
    
    const mapa = ref(null);
    const mostrarMenuCapas = ref(false);
    const estiloTile = ref('google');
    const capaBase = ref(null);
    let marcadorGPS = null;
    let radioGPS = null;
    let marcadoresLayer = null;
    let capaLimitesRef = null;
    let capaDistritosRef = null;

    const { tiposDenuncia } = useCatalogos();

    // Mapa plano de id -> color_hex
    const colorMap = {};
    (tiposDenuncia.value || []).forEach(c => {
      colorMap[c.id] = c.color_hex;
    });

    function initMap() {
      if (mapa.value) return;
      
      const mapEl = document.getElementById('map-vivo-mobile');
      if (!mapEl) return;
      
      mapa.value = L.map(mapEl, {
        zoomControl: true,
        zoomAnimation: false,
        markerZoomAnimation: false
      }).setView([13.61229, -89.17036], 13);
      
      // Tile base (Google Maps)
      capaBase.value = construirTile(estiloTile.value).addTo(mapa.value);
      
      // Dibujar distritos/limites
      dibujarLimites();
      
      // Pintar incidentes
      pintarIncidentes();
      
      // Forzar re-cálculo del tamaño para el padding del tab bar
      setTimeout(() => mapa.value && mapa.value.invalidateSize(), 150);

      // Intentar obtener ubicación GPS real
      obtenerUbicacion();
    }
    
    const obtenerColorLimites = () => estiloTile.value === 'satellite' ? '#ffffff' : '#1d4ed8';

    function dibujarLimites() {
      cargarLimitesMunicipio();
    }

    function cargarLimitesMunicipio() {
      if (!mapa.value) return;

      const color = obtenerColorLimites();

      try {
        const limites = getMunicipalityGeoJSON();
        if (limites && limites.features) {
          if (capaLimitesRef) mapa.value.removeLayer(capaLimitesRef);
          capaLimitesRef = L.geoJSON(limites, {
            style: {
              color,
              weight: 2.5,
              opacity: 0.9,
              fillOpacity: 0
            }
          }).addTo(mapa.value);
        }

        const distritos = getDistritosGeoJSON();
        if (distritos && distritos.features) {
          if (capaDistritosRef) mapa.value.removeLayer(capaDistritosRef);
          capaDistritosRef = L.geoJSON(distritos, {
            style: {
              color,
              weight: 2.5,
              opacity: 0.9,
              fillOpacity: 0
            },
            onEachFeature: (feature, layer) => {
              const nombre = feature.properties?.name || feature.properties?.NOMBRE || feature.properties?.nombre;
              if (nombre) layer.bindPopup(`<b style="font-family:'Inter',sans-serif;font-size:12px;">${nombre}</b>`);
            }
          }).addTo(mapa.value);
        }
      } catch (error) {
        console.error('Error al cargar límites:', error);
      }
    }
    
    function pintarIncidentes() {
      if (!mapa.value) return;
      if (marcadoresLayer) {
        mapa.value.removeLayer(marcadoresLayer);
      }
      
      marcadoresLayer = L.layerGroup().addTo(mapa.value);
      
      (denuncias.value || []).forEach(d => {
        if (d.lat && d.lng && d.estado !== 'resuelto') {
          const color = colorMap[d.tipo_id] || '#ffcc00';
          const mk = L.marker([d.lat, d.lng], {
            icon: marcadorDenuncia(color, false)
          });
          mk.bindPopup(`<b>${d.descripcion || 'Incidente'}</b><br>${d.direccion}`);
          marcadoresLayer.addLayer(mk);
        }
      });
    }

    function obtenerUbicacion() {
      if (!navigator.geolocation || !mapa.value) return;
      
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const lat = pos.coords.latitude;
          const lng = pos.coords.longitude;
          const accuracy = pos.coords.accuracy;
          
          if (marcadorGPS) mapa.value.removeLayer(marcadorGPS);
          if (radioGPS) mapa.value.removeLayer(radioGPS);
          
          radioGPS = L.circle([lat, lng], {
            radius: accuracy,
            color: '#10b981',
            fillColor: '#10b981',
            fillOpacity: 0.15,
            weight: 1
          }).addTo(mapa.value);
          
          marcadorGPS = L.circleMarker([lat, lng], {
            radius: 8,
            color: '#fff',
            weight: 2,
            fillColor: '#10b981',
            fillOpacity: 1
          }).addTo(mapa.value);
          
          mapa.value.setView([lat, lng], 16);
        },
        (err) => {
          console.warn('GPS Error:', err);
          // Fallback a coordenadas por defecto
          mapa.value.setView([13.61229, -89.17036], 13);
        },
        { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
      );
    }

    const construirTile = (estilo) => {
      if (estilo === 'cartomap') {
        return L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
          subdomains: 'abcd', maxZoom: 21, attribution: '&copy; CARTO'
        });
      }
      if (estilo === 'google') {
        return L.tileLayer('https://mt{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}', {
          subdomains: '0123', maxZoom: 20, attribution: '&copy; Google'
        });
      }
      if (estilo === 'satellite') {
        return L.tileLayer('https://mt{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}', {
          subdomains: '0123', maxZoom: 20, attribution: '&copy; Google'
        });
      }
      return L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors'
      });
    };

    const cambiarTile = (estilo) => {
      if (!mapa.value || estiloTile.value === estilo) return;
      estiloTile.value = estilo;
      if (capaBase.value) mapa.value.removeLayer(capaBase.value);
      capaBase.value = construirTile(estilo).addTo(mapa.value);
      cargarLimitesMunicipio();
    };

    onMounted(() => {
      nextTick(() => {
        initMap();
        setTimeout(() => {
          if (mapa.value) mapa.value.invalidateSize();
        }, 200);
      });
    });

    onUnmounted(() => {
      if (mapa.value) {
        if (capaLimitesRef) { mapa.value.removeLayer(capaLimitesRef); capaLimitesRef = null; }
        if (capaDistritosRef) { mapa.value.removeLayer(capaDistritosRef); capaDistritosRef = null; }
        if (marcadorGPS) { mapa.value.removeLayer(marcadorGPS); marcadorGPS = null; }
        if (radioGPS) { mapa.value.removeLayer(radioGPS); radioGPS = null; }
        if (marcadoresLayer) { mapa.value.removeLayer(marcadoresLayer); marcadoresLayer = null; }
        mapa.value.remove();
        mapa.value = null;
      }
    });

    return {
      irA,
      obtenerUbicacion,
      mostrarMenuCapas,
      estiloTile,
      cambiarTile
    };
  }
};
