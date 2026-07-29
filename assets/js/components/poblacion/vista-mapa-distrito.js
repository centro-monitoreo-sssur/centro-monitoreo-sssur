// Vista: Mapa del Distrito (Población) - Simplificado igual que empleados
import { ref, onMounted, onUnmounted, nextTick } from '../../core/vue.js';
import { useNavegacion } from '../../stores/navegacion.js';
import { L } from '../../core/libs.js';
import { useDenuncias } from '../../stores/denuncias.js';
import { marcadorDenuncia } from '../../services/marcadores.js';
import { getCategoriasPorDepartamento } from '../../utils/categorias-denuncias.js';
import { calcularDistancia, estaDentroDeRadio } from '../../utils/geofencing.js';

export default {
  setup() {
    const { irA } = useNavegacion();
    const { denuncias } = useDenuncias();
    
    const mapa = ref(null);
    const mostrarMenuCapas = ref(false);
    const capaBase = ref(null);
    let marcadorGPS = null;
    let radioGPS = null;
    let marcadoresLayer = null;
    let capaLimitesRef = null;
    let capaDistritosRef = null;
    let circuloRadioFiltro = null;
    const estiloTile = ref('google');
    
    // Estado del filtro de radio
    const radioSeleccionado = ref(parseFloat(localStorage.getItem('radio_filtro_mapa') || '2'));
    const incidentesEnRadio = ref(null);
    let debounceTimer = null;
    let ubicacionUsuario = null; // Para calcular radio desde ubicación del usuario
    const mostrarPanelRadio = ref(false); // Control de visibilidad del panel

    const categoriasPorDepartamento = getCategoriasPorDepartamento();
    const colorMap = {};
    Object.values(categoriasPorDepartamento).forEach(cats => {
      cats.forEach(c => colorMap[c.id] = c.color_hex);
    });

    function initMap() {
      if (mapa.value) return;
      
      const mapEl = document.getElementById('mapa-vivo');
      if (!mapEl) return;
      
      mapa.value = L.map(mapEl, {
        zoomControl: true,
        zoomAnimation: false,
        markerZoomAnimation: false
      }).setView([13.61229, -89.17036], 13);
      
      // Tile base (Google Maps por defecto)
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
      
      // Filtrar incidentes por radio si hay ubicación del usuario
      let denunciasFiltradas = denuncias.value || [];
      if (ubicacionUsuario) {
        const radioMetros = radioSeleccionado.value * 1000;
        denunciasFiltradas = denunciasFiltradas.filter(d => {
          if (!d.lat || !d.lng) return false;
          return estaDentroDeRadio(ubicacionUsuario.lat, ubicacionUsuario.lng, d.lat, d.lng, radioMetros);
        });
        
        // Actualizar contador
        incidentesEnRadio.value = denunciasFiltradas.length;
      } else {
        incidentesEnRadio.value = null;
      }
      
      denunciasFiltradas.forEach(d => {
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

    // Actualizar radio con debounce
    const actualizarRadio = () => {
      // Limpiar timer anterior
      if (debounceTimer) {
        clearTimeout(debounceTimer);
      }
      
      // Guardar preferencia
      localStorage.setItem('radio_filtro_mapa', radioSeleccionado.value);
      
      // Debounce de 300ms
      debounceTimer = setTimeout(() => {
        actualizarCirculoRadio();
        pintarIncidentes();
      }, 300);
    };

    // Actualizar círculo visual del radio
    const actualizarCirculoRadio = () => {
      if (!mapa.value || !ubicacionUsuario) return;
      
      // Remover círculo anterior
      if (circuloRadioFiltro) {
        mapa.value.removeLayer(circuloRadioFiltro);
      }
      
      // Crear nuevo círculo
      const radioMetros = radioSeleccionado.value * 1000;
      circuloRadioFiltro = L.circle([ubicacionUsuario.lat, ubicacionUsuario.lng], {
        radius: radioMetros,
        color: '#3b82f6',
        fillColor: '#3b82f6',
        fillOpacity: 0.1,
        weight: 2,
        dashArray: '10, 10'
      }).addTo(mapa.value);
    };

    function obtenerUbicacion() {
      if (!navigator.geolocation || !mapa.value) return;
      
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const lat = pos.coords.latitude;
          const lng = pos.coords.longitude;
          const accuracy = pos.coords.accuracy;
          
          // Guardar ubicación del usuario para el filtro de radio
          ubicacionUsuario = { lat, lng };
          
          if (marcadorGPS) mapa.value.removeLayer(marcadorGPS);
          if (radioGPS) mapa.value.removeLayer(radioGPS);
          
          radioGPS = L.circle([lat, lng], {
            radius: accuracy,
            color: '#3b82f6',
            fillColor: '#3b82f6',
            fillOpacity: 0.15,
            weight: 1
          }).addTo(mapa.value);
          
          marcadorGPS = L.circleMarker([lat, lng], {
            radius: 8,
            color: '#fff',
            weight: 2,
            fillColor: '#3b82f6',
            fillOpacity: 1
          }).addTo(mapa.value);
          
          mapa.value.setView([lat, lng], 16);
          
          // Dibujar círculo del filtro de radio
          actualizarCirculoRadio();
          
          // Filtrar y pintar incidentes
          pintarIncidentes();
        },
        (err) => {
          console.warn('GPS Error:', err);
          // Fallback a coordenadas por defecto
          mapa.value.setView([13.61229, -89.17036], 13);
          // Sin ubicación, mostrar todos los incidentes
          pintarIncidentes();
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
        if (circuloRadioFiltro) { mapa.value.removeLayer(circuloRadioFiltro); circuloRadioFiltro = null; }
        mapa.value.remove();
        mapa.value = null;
      }
      // Limpiar debounce timer
      if (debounceTimer) {
        clearTimeout(debounceTimer);
      }
    });

    return {
      irA,
      obtenerUbicacion,
      mostrarMenuCapas,
      estiloTile,
      cambiarTile,
      radioSeleccionado,
      actualizarRadio,
      incidentesEnRadio,
      mostrarPanelRadio
    };
  }
};
