// Vista: Noticias Municipales (Ciudadanos)
// DEMO: Datos simulados — reemplazar con API real
import { ref, computed, onMounted, onUnmounted } from '../../core/vue.js';
import { useNavegacion } from '../../stores/navegacion.js';
import { L } from '../../core/libs.js';
import { noticiasDemo, categoriasNoticias, formatearFechaRelativa } from '../../utils/noticias-demo.js';

export default {
  setup() {
    const { irA } = useNavegacion();

    // Obtener distrito del usuario registrado
    const distritoUsuario = computed(() => {
      const datos = localStorage.getItem('ciudadano_datos');
      return datos ? (JSON.parse(datos).distrito || '') : '';
    });

    // Estado reactivo
    const filtroActivo = ref('todos');
    const noticiaSeleccionada = ref(null);
    const mostrandoMapa = ref(false);
    const mapaDetalle = ref(null);

    // DEMO: noticias como ref para poder marcarlas como leídas
    const noticias = ref(noticiasDemo.map(n => ({ ...n })));

    // Noticias filtradas por categoría y distrito (Senior: prioridad a la zona)
    const noticiasFiltradas = computed(() => {
      let lista = noticias.value;
      const filtro = filtroActivo.value;

      if (filtro === 'mi-zona') {
        const distrito = distritoUsuario.value;
        lista = lista.filter(n =>
          !distrito || n.distritos.includes(distrito) || n.distritos.length === 5
        );
      } else if (filtro !== 'todos') {
        lista = lista.filter(n => n.categoria === filtro);
      }

      // Ordenar: primero las de "mi zona", luego el resto, siempre las más recientes primero
      const distrito = distritoUsuario.value;
      return [...lista].sort((a, b) => {
        const aEnZona = distrito && a.distritos.includes(distrito);
        const bEnZona = distrito && b.distritos.includes(distrito);
        if (aEnZona && !bEnZona) return -1;
        if (!aEnZona && bEnZona) return 1;
        return new Date(b.fecha) - new Date(a.fecha);
      });
    });

    // Cantidad de no leídas (para badge en tab)
    const noLeidasCount = computed(() =>
      noticias.value.filter(n => !n.leida).length
    );

    // Abrir detalle de noticia
    const abrirDetalle = (noticia) => {
      // Marcar como leída
      const idx = noticias.value.findIndex(n => n.id === noticia.id);
      if (idx !== -1) noticias.value[idx].leida = true;
      noticiaSeleccionada.value = noticias.value[idx];
      mostrandoMapa.value = false;
    };

    // Volver al feed
    const volverAlFeed = () => {
      noticiaSeleccionada.value = null;
      if (mapaDetalle.value) {
        mapaDetalle.value.remove();
        mapaDetalle.value = null;
      }
    };

    // Mostrar mapa de la noticia
    const verEnMapa = () => {
      mostrandoMapa.value = true;
      // Inicializar mapa en el siguiente tick
      setTimeout(() => initMapaDetalle(), 150);
    };

    // Inicializar mapa de detalle
    const initMapaDetalle = () => {
      if (mapaDetalle.value) return;
      const noticia = noticiaSeleccionada.value;
      if (!noticia) return;

      const mapEl = document.getElementById('mapa-noticia-detalle');
      if (!mapEl) return;

      // Centro del mapa: coordenadas de la noticia o centro del municipio
      const centro = noticia.coordenadas
        ? [noticia.coordenadas.lat, noticia.coordenadas.lng]
        : [13.61229, -89.17036];

      mapaDetalle.value = L.map(mapEl, {
        zoomControl: true,
        attributionControl: false,
        scrollWheelZoom: true
      }).setView(centro, 15);

      // Tile base Google Maps
      L.tileLayer('https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}', {
        maxZoom: 20
      }).addTo(mapaDetalle.value);

      // Si hay trazado de cierre de calle: dibujar polyline
      if (noticia.trazado && noticia.trazado.length > 0) {
        const polyline = L.polyline(noticia.trazado, {
          color: '#ef4444',
          weight: 6,
          opacity: 0.85,
          dashArray: '10, 8',
          lineCap: 'round',
          lineJoin: 'round'
        }).addTo(mapaDetalle.value);

        // Marcadores de inicio/fin del cierre
        const iconoCierre = L.divIcon({
          className: '',
          html: `<div style="
            background: #ef4444;
            color: white;
            border: 2px solid white;
            border-radius: 50%;
            width: 28px;
            height: 28px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 12px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.3);
          "><i class="fa-solid fa-road-barrier"></i></div>`,
          iconSize: [28, 28],
          iconAnchor: [14, 14]
        });

        L.marker(noticia.trazado[0], { icon: iconoCierre })
          .addTo(mapaDetalle.value)
          .bindPopup('Inicio del cierre');
        L.marker(noticia.trazado[noticia.trazado.length - 1], { icon: iconoCierre })
          .addTo(mapaDetalle.value)
          .bindPopup('Fin del cierre');

        // Ajustar zoom para que se vea todo el trazo
        mapaDetalle.value.fitBounds(polyline.getBounds(), { padding: [30, 30] });

      } else if (noticia.coordenadas) {
        // Solo un punto de ubicación
        const iconoNoticia = L.divIcon({
          className: '',
          html: `<div style="
            background: #2563eb;
            color: white;
            border: 3px solid white;
            border-radius: 50%;
            width: 36px;
            height: 36px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 16px;
            box-shadow: 0 3px 12px rgba(0,0,0,0.4);
          "><i class="fa-solid fa-circle-info"></i></div>`,
          iconSize: [36, 36],
          iconAnchor: [18, 18]
        });

        L.marker([noticia.coordenadas.lat, noticia.coordenadas.lng], { icon: iconoNoticia })
          .addTo(mapaDetalle.value)
          .bindPopup(noticia.titulo)
          .openPopup();
      }

      setTimeout(() => mapaDetalle.value && mapaDetalle.value.invalidateSize(), 100);
    };

    // Helpers
    const esMiZona = (noticia) => {
      const distrito = distritoUsuario.value;
      return distrito && noticia.distritos.includes(distrito);
    };

    const getBadgeClasses = (color) => {
      const map = {
        blue: 'bg-blue-100 text-blue-700',
        cyan: 'bg-cyan-100 text-cyan-700',
        orange: 'bg-orange-100 text-orange-700',
        red: 'bg-red-100 text-red-700',
        green: 'bg-emerald-100 text-emerald-700',
        purple: 'bg-purple-100 text-purple-700',
        gray: 'bg-gray-100 text-gray-600',
      };
      return map[color] || map.gray;
    };

    const getIconBgClasses = (color) => {
      const map = {
        blue: 'bg-blue-500',
        cyan: 'bg-cyan-500',
        orange: 'bg-orange-500',
        red: 'bg-red-500',
        green: 'bg-emerald-500',
        purple: 'bg-purple-500',
        gray: 'bg-gray-400',
      };
      return map[color] || map.gray;
    };

    // Cleanup al desmontar
    onUnmounted(() => {
      if (mapaDetalle.value) {
        mapaDetalle.value.remove();
        mapaDetalle.value = null;
      }
    });

    return {
      categoriasNoticias,
      filtroActivo,
      noticiasFiltradas,
      noticiaSeleccionada,
      mostrandoMapa,
      noLeidasCount,
      distritoUsuario,
      abrirDetalle,
      volverAlFeed,
      verEnMapa,
      esMiZona,
      getBadgeClasses,
      getIconBgClasses,
      formatearFechaRelativa,
      irA
    };
  }
};
