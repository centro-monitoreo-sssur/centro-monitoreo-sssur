// Vista: Comunicados de la municipalidad (portal ciudadano)
//
// Mostraba cuatro avisos escritos a mano en `utils/noticias-demo.js`, con
// fechas de julio. Ahora sale de la tabla `noticias`, y lo que cada quien ve lo
// decide la RLS por el arreglo `audiencias` de la v36: al vecino solo le llegan
// los marcados como `publico`.
//
// El catálogo de categorías y el formateador de fechas se siguen importando de
// `noticias-demo.js` porque no son datos de demostración: son presentación, y
// no tienen dónde vivir mejor por ahora.
import { ref, computed, onMounted, onUnmounted } from '../../core/vue.js';
import { useNavegacion } from '../../stores/navegacion.js';
import { L } from '../../core/libs.js';
import { categoriasNoticias, formatearFechaRelativa } from '../../utils/noticias-demo.js';
import { useComunicados } from '../../stores/comunicados.js';
import { useCiudadano } from '../../stores/ciudadano.js';

export default {
  setup() {
    const { irA } = useNavegacion();
    const {
      comunicados, cargando, errorComunicados,
      estaLeido, sinLeer, cargarComunicados, marcarLeido,
    } = useComunicados();
    const { perfil, cargarPerfil } = useCiudadano();

    // El distrito sale de la ficha del ciudadano. Antes se leía de
    // `localStorage.ciudadano_datos`, la clave del registro simulado que desde
    // el bloque 2 no escribe nadie, así que el filtro «Mi zona» no funcionaba.
    // Es un ID, no un nombre: `noticias_distritos` guarda claves foráneas.
    const distritoUsuario = computed(() => perfil.value?.distrito_id ?? null);

    // Estado reactivo
    const filtroActivo = ref('todos');
    const noticiaSeleccionada = ref(null);
    const mostrandoMapa = ref(false);
    const mapaDetalle = ref(null);

    /* Se traduce la fila de la base a la forma que ya esperaba la plantilla
       —camelCase, `trazado`, `leida`— en vez de tocar el marcado. Es una capa
       fina y deja el cambio acotado a este archivo.

       `respuestas` NO se traduce: eran respuestas oficiales del demo y la
       tabla no tiene dónde guardarlas. Se retira de la plantilla en vez de
       fingir que existen. */
    const noticias = computed(() => comunicados.value.map((c) => ({
      id: c.id,
      titulo: c.titulo,
      descripcion: c.descripcion,
      categoria: c.categoria,
      categoriaColor: c.categoria_color || 'gray',
      categoriaIcono: c.categoria_icono || 'fa-bullhorn',
      autor: c.autor || 'Alcaldía de San Salvador Sur',
      autorIcono: c.autor_icono || 'fa-building-columns',
      autorColor: 'blue',
      fecha: c.fecha,
      imagen: c.imagen_url || null,
      distritos: c.distritos,
      // La columna guarda un arreglo de pares [lat, lng], que es justo lo que
      // consume `L.polyline`.
      trazado: Array.isArray(c.trazado_geojson) ? c.trazado_geojson : null,
      leida: estaLeido(c.id),
    })));

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
    // El contador sale del store: la marca de leído vive en la base y es de la
    // persona, no de esta pantalla. Antes se contaba sobre el arreglo de
    // demostración y volvía a su valor inicial en cada recarga.
    const noLeidasCount = sinLeer;

    const abrirDetalle = (noticia) => {
      noticiaSeleccionada.value = noticia;
      mostrandoMapa.value = false;
      // Sin `await`: la marca se refleja al instante en la interfaz y el store
      // deshace el cambio si la escritura falla. Hacer esperar a alguien para
      // abrir algo que ya tiene delante no aporta nada.
      marcarLeido(noticia.id);
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

    onMounted(async () => {
      // La ficha primero: de ella sale el distrito con el que se ordena y se
      // filtra «Mi zona». Sin ella el feed sigue funcionando, solo pierde la
      // prioridad territorial.
      if (!perfil.value) await cargarPerfil();
      await cargarComunicados();
    });

    return {
      categoriasNoticias,
      filtroActivo,
      noticiasFiltradas,
      noticiaSeleccionada,
      mostrandoMapa,
      noLeidasCount,
      distritoUsuario,
      // Estado de la carga: sin esto, «no hay comunicados» y «todavía estoy
      // pidiéndolos» se veían igual —una lista vacía— y ninguno se explicaba.
      cargando,
      errorComunicados,
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
