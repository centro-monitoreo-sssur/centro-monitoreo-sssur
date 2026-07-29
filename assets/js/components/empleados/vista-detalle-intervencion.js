// Vista: Detalle de Intervención (Empleado)
import { ref, onMounted, nextTick } from '../../core/vue.js';
import { useNavegacion } from '../../stores/navegacion.js';
import { L } from '../../core/libs.js';

export default {
  setup() {
    const { irA } = useNavegacion();
    
    const intervencion = ref(null);
    const cargando = ref(true);
    let mapa = null;
    
    // Helpers para UI
    const getPrioridadColor = (prioridad) => {
      const colores = {
        alta: 'bg-red-500',
        media: 'bg-yellow-500',
        baja: 'bg-green-500'
      };
      return colores[prioridad] || 'bg-gray-500';
    };
    
    const getEstadoColor = (estado) => {
      const colores = {
        pendiente: 'bg-red-100 text-red-800',
        en_proceso: 'bg-blue-100 text-blue-800',
        completada: 'bg-green-100 text-green-800'
      };
      return colores[estado] || 'bg-gray-100 text-gray-800';
    };
    
    const getEstadoLabel = (estado) => {
      const labels = {
        pendiente: 'Pendiente',
        en_proceso: 'En Proceso',
        completada: 'Completada'
      };
      return labels[estado] || 'Desconocido';
    };
    
    const formatDate = (fecha) => {
      const date = new Date(fecha);
      return date.toLocaleDateString('es-ES', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    };

    const initMap = (coords) => {
      if (mapa) {
        mapa.remove();
      }
      const mapEl = document.getElementById('map-detalle-intervencion');
      if (!mapEl) return;

      mapa = L.map(mapEl, {
        zoomControl: false,
        dragging: false,
        touchZoom: false,
        scrollWheelZoom: false,
        doubleClickZoom: false,
        boxZoom: false
      }).setView(coords, 16);

      L.tileLayer('https://{s}.google.com/vt/lyrs=s,h&x={x}&y={y}&z={z}', {
        maxZoom: 20,
        subdomains: ['mt0', 'mt1', 'mt2', 'mt3']
      }).addTo(mapa);

      const markerHtml = `
        <div style="background-color: #ef4444; width: 40px; height: 40px; border-radius: 50%; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 12px rgba(239, 68, 68, 0.4); border: 3px solid white;">
          <i class="fa-solid fa-map-pin" style="color: white; font-size: 16px;"></i>
        </div>
      `;
      const customIcon = L.divIcon({
        html: markerHtml,
        className: 'custom-marker',
        iconSize: [40, 40],
        iconAnchor: [20, 40]
      });

      L.marker(coords, { icon: customIcon }).addTo(mapa);
    };

    onMounted(() => {
      // Simular carga
      setTimeout(() => {
        const intervencionStr = localStorage.getItem('intervencion_activa');
        if (intervencionStr) {
          intervencion.value = JSON.parse(intervencionStr);
          cargando.value = false;
          
          nextTick(() => {
            // Simulamos que todas las incidencias están por San Salvador Sur
            initMap([13.61229, -89.17036]); 
          });
        } else {
          irA('mis-intervenciones');
        }
      }, 400);
    });

    const volver = () => {
      irA('mis-intervenciones');
    };

    const irACierre = () => {
      irA('cierre-incidente');
    };

    return {
      intervencion,
      cargando,
      getPrioridadColor,
      getEstadoColor,
      getEstadoLabel,
      formatDate,
      volver,
      irACierre
    };
  }
};
