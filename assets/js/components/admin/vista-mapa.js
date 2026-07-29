// ============================================================
// VISTA: Mapa en vivo (consola de monitoreo municipal).
// Vista única para visualizar todo lo que recibe el sistema. Hereda la
// identidad visual institucional (ver .kilocode/rules/04-sistema-diseno):
// paneles tipo tarjeta blanca, badges con badgeEstado(), tiles CartoDB
// light_all. Toda la data fluye desde los stores (denuncias/catálogos);
// rutas e intervenciones son datos demo de la capa de monitoreo.
// ============================================================
import { ref, reactive, computed, onMounted, onUnmounted, watch, nextTick } from '../../core/vue.js';
import { L } from '../../core/libs.js';
import { useDenuncias } from '../../stores/denuncias.js';
import { useCatalogos } from '../../stores/catalogos.js';
import { useNavegacion } from '../../stores/navegacion.js';
import { formatoFecha } from '../../utils/formato.js';
import { badgeEstado, etiquetaEstado } from '../../utils/badge.js';
import { marcadorDenuncia, marcadorIntervencion } from '../../services/marcadores.js';
import { popupDenuncia, popupIntervencion } from '../../services/mapa-monitoreo.js';

export default {
  setup() {
    const { denuncias, nombreDeTipo } = useDenuncias();
    const { tiposDenuncia, buscarDepartamento } = useCatalogos();
    const { mapaFullscreen, toggleMapaFullscreen, isDarkMode, sidebarColapsado } = useNavegacion();

    /* ─── Estado de UI (efímero, vive en ref) ─── */
    const kpisOpen = ref(false); // Solo para móviles
    const mobileTab = ref('feed'); // 'feed' | 'capas' — pestaña activa en Bottom Sheet móvil
    const isLgUp = ref(window.innerWidth >= 1024); // breakpoint Tailwind lg
    const _kpiResizeHandler = () => { isLgUp.value = window.innerWidth >= 1024; };
    const clock = ref('');
    const dateStr = ref('');
    const coords = reactive({ lat: 13.61229, lng: -89.17036 });
    const zoomLvl = ref(13);
    const altitudStr = computed(() => {
      // Aproximación de altitud visual en metros basada en el nivel de zoom de Leaflet
      const altMeters = Math.round(30000000 / Math.pow(2, zoomLvl.value));
      if (altMeters >= 1000) return (altMeters / 1000).toFixed(1) + ' km';
      return altMeters + ' m';
    });
    const estiloTile = ref('google'); // 'google' | 'osm' | 'satellite' | 'cartomap'
    const ubicacionActiva = ref(false);
    const ubicacionCargando = ref(false);
    const marcadorUbicacion = ref(null);
    const feedOpen = ref(true);
    const rpanelOpen = ref(true);
    const selectedCat = ref(null);
    const hasNewFeed = ref(false);
    const pillFlash = ref(false);
    const toasts = ref([]);
    const feedItems = ref([]);
    const categories = ref([]);
    const visibilidad = reactive({});

    // ── Estado de filtros del mapa ──────────────────────────────────────────────
    const mostrarPanelFiltros = ref(false);
    const filtros = reactive({
      distrito: '',   // nombre del distrito o '' para todos
      centroPoblacional: '',   // nombre del centro o '' para todos
      tipoIncidencia: '',   // tipo_id o '' para todos
      estadoIncidencia: '',   // 'pendiente' | 'en_revision' | 'en_obra' | 'resuelta' | ''
      historicoActivo: false,
      fechaInicio: '',
      fechaFin: '',
    });

    // Lista fija de distritos (mismos que GeoJSON)
    const DISTRITOS = [
      'San Marcos', 'Santo Tomás', 'Santiago Texacuangos', 'Panchimalco', 'Rosario de Mora'
    ];

    // Nuevas variables para el Menú de Capas
    const mostrarMenuCapas = ref(false);
    const herramientasActivas = reactive({
      clustering: true,
      heatmap: false,
      medicion: false,
      poligonos: false,
      distritos: true
    });
    const medicionModo = ref('linea'); // 'linea' | 'ruta'
    const medicionTerminada = ref(false); // true cuando ya se calculó resultado
    const medicionPuntosCount = ref(0);  // num de puntos trazados (0 ó 1)

    // Estado de polígonos
    const poligonosGuardados = ref([]);
    const mostrarModalPoligono = ref(false);

    // Modal de detalle de incidente/intervención/tramo/polígono (reemplaza
    // los popups rústicos de Leaflet por una vista coherente con el design system).
    // null = cerrado. De lo contrario: { tipo, datos }.
    const modalDetalle = ref(null);
    function abrirDetalle(payload) { modalDetalle.value = payload; }
    function cerrarDetalle() { modalDetalle.value = null; }
    const formPoligono = reactive({ nombre: '', descripcion: '', color: '#3b82f6', tipo: 'area_verde' });
    let _poligonoCoordsTemporal = [];

    const _timers = new Set(); // Para controlar los setTimeout/setInterval y limpiarlos en onUnmounted

    /* ─── Datos demo de la capa de monitoreo (bbox SSSur) ─── */
    const routes = reactive([
      {
        id: 'r1', name: 'Reparación de carpeta — Calle El Progreso', type: 'Obras Municipales', color: '#b06a20',
        coords: [[13.6435, -89.1355], [13.6442, -89.1348], [13.6448, -89.1342], [13.6455, -89.1338], [13.6462, -89.1335]]
      },
      {
        id: 'r2', name: 'Mantenimiento alumbrado — Av. J.M. Delgado', type: 'Alumbrado Público', color: '#2098b8',
        coords: [[13.6105, -89.1810], [13.6112, -89.1807], [13.6120, -89.1805], [13.6128, -89.1802], [13.6145, -89.1796], [13.6155, -89.1793]]
      },
      {
        id: 'r3', name: 'Limpieza de escombros — Calle Santa Lucía', type: 'Recolección de Residuos', color: '#8b6fc4',
        coords: [[13.5715, -89.2078], [13.5720, -89.2080], [13.5728, -89.2082], [13.5735, -89.2085], [13.5745, -89.2088]]
      },
    ]);
    const interventions = reactive([
      { id: 'i1', lat: 13.6440, lng: -89.1370, name: 'Reparación de bache en boulevard', area: 'Obras Municipales', status: 'En progreso', color: '#c8a200' },
      { id: 'i2', lat: 13.6165, lng: -89.1795, name: 'Retiro de árbol caído', area: 'Protección Civil', status: 'En progreso', color: '#27a86e' },
      { id: 'i3', lat: 13.5720, lng: -89.2105, name: 'Operativo de ordenamiento vial', area: 'CAM', status: 'Desplegado', color: '#e07b3a' },
    ]);

    /* ─── Leaflet (instancia local a la vista) ─── */
    let lmap = null;
    let layerGroups = {};
    let heatmapLayer = null;
    let measureControl = null;
    let distritosLayer = null;
    let routesLayer = null;
    let intervLayer = null;
    let clockInt = null;
    let initTimeoutId = null;
    let capaBase = null;
    let idsPrev = new Set();
    let inicializado = false;
    const nuevosIds = new Set();
    let toastSeq = 0;

    /* ─── Notificación sonora (Web Audio API — sin archivos externos) ─── */
    let _audioCtx = null;
    function reproducirSonidoAlerta() {
      try {
        if (!_audioCtx) _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const ctx = _audioCtx;
        // Chime ascendente de 3 tonos: Do5 → Mi5 → Sol5 (acorde mayor)
        const notas = [
          { freq: 523.25, t: 0.00 },  // C5
          { freq: 659.25, t: 0.13 },  // E5
          { freq: 783.99, t: 0.26 },  // G5
        ];
        notas.forEach(({ freq, t }) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(freq, ctx.currentTime + t);
          // Ataque rápido → decay suave → silencio
          gain.gain.setValueAtTime(0, ctx.currentTime + t);
          gain.gain.linearRampToValueAtTime(0.35, ctx.currentTime + t + 0.02);
          gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + t + 0.45);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start(ctx.currentTime + t);
          osc.stop(ctx.currentTime + t + 0.5);
        });
      } catch (e) {
        // Silencioso si el navegador bloquea el audio sin interacción previa
        console.warn('[Audio] Alerta sonora no disponible:', e.message);
      }
    }

    /* ─── Conteos (computed, derivados del store) ─── */
    const total = computed(() => categories.value.reduce((s, c) => s + c.points.length, 0));
    const pendientes = computed(() => categories.value.reduce((s, c) => s + c.points.filter((p) => p.estado === 'pendiente').length, 0));
    const enCurso = computed(() => categories.value.reduce((s, c) => s + c.points.filter((p) => p.estado === 'en_revision' || p.estado === 'en_obra').length, 0) + interventions.length);
    const resueltas = computed(() => categories.value.reduce((s, c) => s + c.points.filter((p) => p.estado === 'resuelta').length, 0));

    // Propiedades computadas para el modal de detalle
    const modalTitulo = computed(() => {
      const m = modalDetalle.value; if (!m) return '';
      if (m.tipo === 'denuncia') return m.pt.title || 'Denuncia sin título';
      if (m.tipo === 'intervencion') return m.iv.name || 'Intervención sin nombre';
      if (m.tipo === 'tramo') return m.r.name || 'Tramo sin nombre';
      if (m.tipo === 'poligono') return m.p.nombre || 'Polígono sin nombre';
      return '';
    });
    const modalSubtitulo = computed(() => {
      const m = modalDetalle.value; if (!m) return '';
      if (m.tipo === 'denuncia') return m.cat.shortName || '';
      if (m.tipo === 'intervencion') return 'Intervención activa';
      if (m.tipo === 'tramo') return 'Tramo en intervención';
      if (m.tipo === 'poligono') return 'Zona dibujada';
      return '';
    });
    const modalLatitud = computed(() => {
      const m = modalDetalle.value; if (!m) return '';
      if (m.tipo === 'denuncia') return m.pt.lat?.toFixed(5) || '';
      if (m.tipo === 'intervencion') return m.iv.lat?.toFixed(5) || '';
      if (m.tipo === 'tramo') return m.r.coords[0][0]?.toFixed(5) || '';
      if (m.tipo === 'poligono') return m.p.coordenadas[0][0]?.toFixed(5) || '';
      return '';
    });
    const modalLongitud = computed(() => {
      const m = modalDetalle.value; if (!m) return '';
      if (m.tipo === 'denuncia') return m.pt.lng?.toFixed(5) || '';
      if (m.tipo === 'intervencion') return m.iv.lng?.toFixed(5) || '';
      if (m.tipo === 'tramo') return m.r.coords[0][1]?.toFixed(5) || '';
      if (m.tipo === 'poligono') return m.p.coordenadas[0][1]?.toFixed(5) || '';
      return '';
    });

    /* ─── Construcción de categorías desde el store (con filtros aplicados) ─── */
    function construirCategorias() {
      return (tiposDenuncia.value || []).map((t) => {
        let puntos = (denuncias.value || [])
          .filter((d) => d.tipo_id === t.id)
          .map((d) => ({
            id: d.id, lat: d.lat, lng: d.lng,
            title: d.descripcion || nombreDeTipo(d.tipo_id),
            address: d.direccion, time: formatoFecha(d.created_at),
            estado: d.estado, isNew: nuevosIds.has(d.id),
            distrito: d.distrito || '', centroPoblacional: d.centro_poblacional || '',
            createdAt: d.created_at,
          }));

        // Aplicar filtros activos
        if (filtros.tipoIncidencia && filtros.tipoIncidencia !== t.id) {
          puntos = []; // Este tipo de incidencia está excluido
        }
        if (filtros.distrito) {
          puntos = puntos.filter(p => p.distrito === filtros.distrito);
        }
        if (filtros.centroPoblacional) {
          puntos = puntos.filter(p => p.centroPoblacional === filtros.centroPoblacional);
        }
        if (filtros.estadoIncidencia) {
          puntos = puntos.filter(p => p.estado === filtros.estadoIncidencia);
        }
        if (filtros.historicoActivo) {
          if (filtros.fechaInicio) {
            const desde = new Date(filtros.fechaInicio + 'T00:00:00');
            puntos = puntos.filter(p => p.createdAt && new Date(p.createdAt) >= desde);
          }
          if (filtros.fechaFin) {
            const hasta = new Date(filtros.fechaFin + 'T23:59:59');
            puntos = puntos.filter(p => p.createdAt && new Date(p.createdAt) <= hasta);
          }
        }

        if (visibilidad[t.id] === undefined) visibilidad[t.id] = true;
        
        const dpto = buscarDepartamento(t.departamento_responsable_id);
        const areaName = dpto ? dpto.nombre : 'General';

        return {
          id: t.id, name: t.nombre, shortName: areaName,
          area: areaName, icon: t.icono, color: t.color_hex,
          visible: visibilidad[t.id], points: puntos,
        };
      });
    }

    // Desde el modal de detalle, abre Google Maps en una nueva pestaña con la ubicación.
    function verDetalleEnMapa() {
      const m = modalDetalle.value;
      if (!m) return;
      let query = '';
      if (m.tipo === 'denuncia') query = `${m.pt.lat},${m.pt.lng}`;
      else if (m.tipo === 'intervencion') query = `${m.iv.lat},${m.iv.lng}`;
      else if (m.tipo === 'tramo') {
        const mid = m.r.coords[Math.floor(m.r.coords.length / 2)];
        query = `${mid[0]},${mid[1]}`;
      } else if (m.tipo === 'poligono' && m.p.coordenadas?.length) {
        const mid = m.p.coordenadas[Math.floor(m.p.coordenadas.length / 2)];
        query = `${mid[0]},${mid[1]}`;
      }
      if (query) window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`, '_blank');
      cerrarDetalle();
    }

    // Clases Tailwind del badge de estado para el modal de detalle (5 estados fijos).
    function estadoClase(estado) {
      switch (estado) {
        case 'pendiente':   return 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-800';
        case 'en_revision': return 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 border border-blue-200 dark:border-blue-800';
        case 'en_obra':     return 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800';
        case 'resuelta':    return 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800';
        case 'rechazada':   return 'bg-gray-100 dark:bg-gray-700/40 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-600';
        default:            return 'bg-gray-100 dark:bg-gray-700/40 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-600';
      }
    }

    function reconstruirFeed() {
      const todos = [];
      categories.value.forEach((cat) => {
        cat.points.forEach((p) => {
          todos.push({
            id: p.id, lat: p.lat, lng: p.lng, catShort: cat.shortName, color: cat.color,
            title: p.title, address: p.address, time: p.time, estado: p.estado, isNew: p.isNew,
          });
        });
      });
      feedItems.value = todos.sort(() => Math.random() - 0.5);
    }
    /* ─── Filtros: computed y helpers ─────────────────────────────────────────── */
    const filtrosActivos = computed(() => {
      return filtros.distrito || filtros.centroPoblacional || filtros.tipoIncidencia
        || filtros.estadoIncidencia || filtros.historicoActivo;
    });

    function aplicarFiltros() {
      categories.value = construirCategorias();
      reconstruirFeed();
      pintarCapas();
    }

    function limpiarFiltros() {
      filtros.distrito = '';
      filtros.centroPoblacional = '';
      filtros.tipoIncidencia = '';
      filtros.estadoIncidencia = '';
      filtros.historicoActivo = false;
      filtros.fechaInicio = '';
      filtros.fechaFin = '';
      aplicarFiltros();
    }

    // Fecha máxima = hoy
    const hoy = new Date().toISOString().split('T')[0];

    /* ─── Capas en el mapa ─── */
    function pintarCapas() {
      if (!lmap) return;
      Object.values(layerGroups).forEach((lg) => lmap.removeLayer(lg));
      layerGroups = {};
      categories.value.forEach((cat) => {
        // Usa MarkerCluster si la herramienta está activa, sino un LayerGroup estándar
        const lg = herramientasActivas.clustering
          ? L.markerClusterGroup({ maxClusterRadius: 40 })
          : L.layerGroup();

        cat.points.forEach((pt) => {
          const mk = L.marker([pt.lat, pt.lng], { icon: marcadorDenuncia(cat.color, pt.isNew) });
          mk.on('click', () => abrirDetalle({ tipo: 'denuncia', pt, cat }));
          lg.addLayer(mk);
        });
        if (cat.visible && !herramientasActivas.heatmap) lg.addTo(lmap);
        layerGroups[cat.id] = lg;
      });
      actualizarHeatmap();
    }

    function actualizarHeatmap() {
      if (!lmap) return;
      if (heatmapLayer) {
        lmap.removeLayer(heatmapLayer);
        heatmapLayer = null;
      }
      if (herramientasActivas.heatmap) {
        const pts = [];
        categories.value.forEach((cat) => {
          if (cat.visible) {
            cat.points.forEach(p => pts.push([p.lat, p.lng, 1])); // [lat, lng, intensity]
          }
        });
        heatmapLayer = L.heatLayer(pts, { radius: 25, blur: 15, maxZoom: 17 }).addTo(lmap);
      }
    }



    /* ─── Límites del Municipio (GeoJSON) ─── */
    function toggleCapaDistrítos(activa) {
      if (activa) {
        // Intentar usar la función global del archivo limites-municipio.js
        let geoData = null;
        if (typeof window.getMunicipalityGeoJSON === 'function') {
          geoData = window.getMunicipalityGeoJSON();
        }
        if (!geoData) {
          console.warn('[Distritos] getMunicipalityGeoJSON() no está disponible.');
          return;
        }

        // Procesar el GeoJSON que puede tener FeatureCollections anidadas
        // El archivo tiene LineStrings → dibujamos como polilíneas institucionales
        const colorLimites = estiloTile.value === 'satellite' ? '#ffffff' : '#1d4ed8';
        const style = {
          color: colorLimites,
          weight: 2.5,
          opacity: 0.9,
          dashArray: null,
          fillOpacity: 0,
        };

        distritosLayer = L.geoJSON(geoData, {
          style,
          // Para cada feature añadimos un tooltip con el nombre si existe
          onEachFeature(feature, layer) {
            const nombre = feature.properties?.name || feature.properties?.NOMBRE || feature.properties?.nombre;
            if (nombre) {
              layer.bindTooltip(`<div style="font-family:'Inter',sans-serif;font-size:12px;font-weight:600;">${nombre}</div>`, {
                sticky: true, className: 'dp',
              });
            }
          },
        }).addTo(lmap);

        // Hacer zoom para mostrar el polígono completo
        try {
          const bounds = distritosLayer.getBounds();
          if (bounds.isValid()) lmap.fitBounds(bounds, { padding: [40, 40] });
        } catch (e) { /* getBounds puede fallar si la capa es vacía */ }

      } else {
        if (distritosLayer) {
          lmap.removeLayer(distritosLayer);
          distritosLayer = null;
        }
      }
    }

    function toggleHerramienta(herramienta) {
      herramientasActivas[herramienta] = !herramientasActivas[herramienta];

      if (herramienta === 'clustering' || herramienta === 'heatmap') {
        // Al encender heatmap, apagamos los marcadores regulares/clusters
        if (herramienta === 'heatmap' && herramientasActivas.heatmap) {
          Object.values(layerGroups).forEach((lg) => lmap.removeLayer(lg));
        } else if (herramienta === 'heatmap' && !herramientasActivas.heatmap) {
          Object.entries(layerGroups).forEach(([id, lg]) => {
            if (visibilidad[id]) lg.addTo(lmap);
          });
        } else {
          // Si cambian los clusters, hay que recrear las capas
          pintarCapas();
        }
        actualizarHeatmap();
      }

      if (herramienta === 'medicion') {
        if (herramientasActivas.poligonos) toggleHerramienta('poligonos'); // mutual exclusive
        if (herramientasActivas.medicion) {
          iniciarMedicion();
        } else {
          detenerMedicion();
        }
      }

      if (herramienta === 'poligonos') {
        if (herramientasActivas.medicion) toggleHerramienta('medicion'); // mutual exclusive
        if (herramientasActivas.poligonos) {
          iniciarPoligono();
        } else {
          detenerPoligono();
        }
      }

      if (herramienta === 'distritos') {
        toggleCapaDistrítos(herramientasActivas.distritos);
      }
    }

    /* ─── Medición de distancias (implementación propia sin plugins) ─── */
    let _medicionLayer = null;
    let _medicionPuntos = [];
    let _medicionLinea = null;
    let _medicionLineaTemp = null;
    let _medicionTooltip = null;

    function _distanciaM(a, b) {
      return lmap.distance(a, b);
    }

    function _distanciaTotal(puntos) {
      let total = 0;
      for (let i = 1; i < puntos.length; i++) total += _distanciaM(puntos[i - 1], puntos[i]);
      return total;
    }

    function _formatDistancia(m) {
      return m >= 1000 ? (m / 1000).toFixed(2) + ' km' : Math.round(m) + ' m';
    }

    function _onMedicionClick(e) {
      if (!herramientasActivas.medicion) return;
      _medicionPuntos.push(e.latlng);
      medicionPuntosCount.value = _medicionPuntos.length;

      // Marcador de punto
      const mk = L.circleMarker(e.latlng, {
        radius: 5, color: '#001ba0', weight: 2,
        fillColor: '#fff', fillOpacity: 1
      });

      if (_medicionPuntos.length === 2) {
        if (medicionModo.value === 'linea') {
          const dist = _distanciaTotal(_medicionPuntos);
          mk.bindTooltip(_formatDistancia(dist), {
            permanent: true, direction: 'top', offset: [0, -8],
            className: 'mv-medicion-tt'
          }).openTooltip();
          mk.addTo(_medicionLayer);
          if (_medicionLinea) _medicionLayer.removeLayer(_medicionLinea);
          _medicionLinea = L.polyline(_medicionPuntos, {
            color: '#001ba0', weight: 2.5, dashArray: '6,4', opacity: 0.9
          }).addTo(_medicionLayer);

          addToast(`📏 Distancia en línea recta: ${_formatDistancia(dist)}`, '#001ba0', 'MEDICIÓN COMPLETADA');
          _terminarCapturaPuntos();
        } else {
          // Modo ruta: calculamos ruta OSRM
          mk.bindTooltip('Calculando ruta...', {
            permanent: true, direction: 'top', offset: [0, -8],
            className: 'mv-medicion-tt'
          }).openTooltip();
          mk.addTo(_medicionLayer);
          const origen = _medicionPuntos[0];
          const destino = e.latlng;
          _calcularRutaOSRM(origen, destino, mk);
        }
      } else {
        mk.bindTooltip('Inicio', {
          permanent: true, direction: 'top', offset: [0, -8],
          className: 'mv-medicion-tt'
        }).openTooltip();
        mk.addTo(_medicionLayer);
      }
    }

    function _terminarCapturaPuntos() {
      if (_medicionLineaTemp) {
        _medicionLayer.removeLayer(_medicionLineaTemp);
        _medicionLineaTemp = null;
      }
      _medicionPuntos = []; // Resetea para permitir un nuevo click de inicio
      medicionPuntosCount.value = 0;
      medicionTerminada.value = true; // <-- activa el flotante de herramientas
    }

    function _onMedicionMove(e) {
      if (!herramientasActivas.medicion || _medicionPuntos.length !== 1) return;
      if (_medicionLineaTemp) _medicionLayer.removeLayer(_medicionLineaTemp);
      _medicionLineaTemp = L.polyline([_medicionPuntos[0], e.latlng], {
        color: '#001ba0', weight: 2, dashArray: '4,4', opacity: 0.55
      }).addTo(_medicionLayer);
    }

    function deshacerPuntoMedicion() {
      if (_medicionPuntos.length === 0) return;
      _medicionPuntos.pop();
      medicionPuntosCount.value = _medicionPuntos.length;
      // Limpiar y redibujar
      if (_medicionLayer) _medicionLayer.clearLayers();
      _medicionLinea = null;
      _medicionLineaTemp = null;
      // Si quedaron puntos, redibujar el marcador de inicio
      if (_medicionPuntos.length > 0) {
        L.circleMarker(_medicionPuntos[0], {
          radius: 6, color: '#001ba0', weight: 2, fillColor: '#fff', fillOpacity: 1
        }).bindTooltip('Inicio', {
          permanent: true, direction: 'top', offset: [0, -8], className: 'mv-medicion-tt'
        }).openTooltip().addTo(_medicionLayer);
      }
      // Asegurarse de estar escuchando de nuevo
      lmap.on('click', _onMedicionClick);
      lmap.on('mousemove', _onMedicionMove);
    }

    function limpiarMedicion() {
      if (_medicionLayer) _medicionLayer.clearLayers();
      _medicionPuntos = [];
      _medicionLinea = null;
      _medicionLineaTemp = null;
      medicionPuntosCount.value = 0;
      medicionTerminada.value = false;
      // Reactivar captura si la herramienta sigue activa
      if (herramientasActivas.medicion) {
        lmap.on('click', _onMedicionClick);
        lmap.on('mousemove', _onMedicionMove);
        lmap.getContainer().style.cursor = 'crosshair';
      }
    }

    async function _calcularRutaOSRM(origen, destino, markerDestino) {
      try {
        const url = `https://router.project-osrm.org/route/v1/driving/${origen.lng},${origen.lat};${destino.lng},${destino.lat}?overview=full&geometries=geojson`;
        const resp = await fetch(url);
        const data = await resp.json();
        if (data.code !== 'Ok' || !data.routes.length) {
          markerDestino.setTooltipContent('Sin ruta disponible');
          return;
        }
        const route = data.routes[0];
        const distM = route.distance; // metros
        const durMin = Math.round(route.duration / 60);
        const label = `${_formatDistancia(distM)} · ~${durMin} min`;
        markerDestino.setTooltipContent(label);
        // Dibujar la ruta en el mapa
        if (_medicionLinea) _medicionLayer.removeLayer(_medicionLinea);
        _medicionLinea = L.geoJSON(route.geometry, {
          style: { color: '#001ba0', weight: 4, opacity: 0.85 }
        }).addTo(_medicionLayer);
        addToast(`🗺️ Ruta calculada: ${label}`, '#001ba0', 'RUTA DE MAPA');
        _terminarCapturaPuntos();
      } catch (err) {
        markerDestino.setTooltipContent('Error calculando ruta');
        addToast('No se pudo calcular la ruta. Verifica tu conexión.', '#dc2626', 'ERROR DE RUTA');
        _terminarCapturaPuntos();
      }
    }

    function iniciarMedicion() {
      if (!lmap) return;
      if (!_medicionLayer) _medicionLayer = L.layerGroup().addTo(lmap);
      else _medicionLayer.clearLayers();
      _medicionPuntos = [];
      medicionPuntosCount.value = 0;
      medicionTerminada.value = false;
      lmap.getContainer().style.cursor = 'crosshair';
      lmap.on('click', _onMedicionClick);
      lmap.on('mousemove', _onMedicionMove);
      if (medicionModo.value === 'linea') {
        addToast('📏 Modo línea recta activo. Haz click en el punto A y luego en el B.', '#001ba0', 'MEDICIÓN ACTIVA');
      } else {
        addToast('🗺️ Modo ruta activo. Haz click en el punto A y luego en el B.', '#001ba0', 'MEDICIÓN ACTIVA');
      }
    }

    function detenerMedicion() {
      if (!lmap) return;
      lmap.off('click', _onMedicionClick);
      lmap.off('mousemove', _onMedicionMove);
      lmap.getContainer().style.cursor = '';
      if (_medicionLayer) { lmap.removeLayer(_medicionLayer); _medicionLayer = null; }
      _medicionPuntos = [];
      _medicionLinea = null;
      _medicionLineaTemp = null;
      medicionPuntosCount.value = 0;
      medicionTerminada.value = false;
    }

    /* ─── Herramienta de Polígonos ─── */
    let _poligonosLayer = null;
    let _poligonoDrawnLayer = null; // Capa de los poligonos ya guardados
    let _poligonoDibujandoLinea = null;
    let _poligonoDibujandoTemp = null;

    function iniciarPoligono() {
      if (!lmap) return;
      if (!_poligonosLayer) _poligonosLayer = L.layerGroup().addTo(lmap);
      if (!_poligonoDrawnLayer) _poligonoDrawnLayer = L.layerGroup().addTo(lmap);
      _poligonoCoordsTemporal = [];
      lmap.getContainer().style.cursor = 'crosshair';
      lmap.on('click', _onPoligonoClick);
      lmap.on('mousemove', _onPoligonoMove);
      addToast('Dibujo de polígono activo. Haz clicks para trazar vértices. Click en el primer punto para cerrar.', '#3b82f6', 'POLÍGONOS');
    }

    function detenerPoligono() {
      if (!lmap) return;
      lmap.off('click', _onPoligonoClick);
      lmap.off('mousemove', _onPoligonoMove);
      lmap.getContainer().style.cursor = '';
      if (_poligonosLayer) { lmap.removeLayer(_poligonosLayer); _poligonosLayer = null; }
      _poligonoCoordsTemporal = [];
      _poligonoDibujandoLinea = null;
      _poligonoDibujandoTemp = null;
      // No borramos _poligonoDrawnLayer para que los polígonos sigan viéndose
    }

    function _onPoligonoClick(e) {
      if (!herramientasActivas.poligonos) return;

      // Si hace click cerca del primer punto (y hay más de 2), cerrar polígono
      if (_poligonoCoordsTemporal.length > 2) {
        const firstPt = _poligonoCoordsTemporal[0];
        const distToFirst = lmap.distance(firstPt, e.latlng);
        if (distToFirst < 50) { // si clickea a menos de 50 metros del inicio
          _cerrarPoligonoTemporal();
          return;
        }
      }

      _poligonoCoordsTemporal.push(e.latlng);
      L.circleMarker(e.latlng, { radius: 4, color: '#3b82f6', fillColor: '#fff', fillOpacity: 1 }).addTo(_poligonosLayer);

      if (_poligonoDibujandoLinea) _poligonosLayer.removeLayer(_poligonoDibujandoLinea);
      if (_poligonoCoordsTemporal.length > 1) {
        _poligonoDibujandoLinea = L.polyline(_poligonoCoordsTemporal, { color: '#3b82f6', weight: 2, dashArray: '5,5' }).addTo(_poligonosLayer);
      }
    }

    function _onPoligonoMove(e) {
      if (!herramientasActivas.poligonos || _poligonoCoordsTemporal.length === 0) return;
      if (_poligonoDibujandoTemp) _poligonosLayer.removeLayer(_poligonoDibujandoTemp);

      const lastPt = _poligonoCoordsTemporal[_poligonoCoordsTemporal.length - 1];
      const pts = [lastPt, e.latlng];

      // Si hay más de 2 puntos, dibujar línea temporal de cierre al inicio también
      if (_poligonoCoordsTemporal.length > 1) {
        pts.push(_poligonoCoordsTemporal[0]);
      }

      _poligonoDibujandoTemp = L.polyline(pts, { color: '#3b82f6', weight: 1.5, opacity: 0.5, dashArray: '3,3' }).addTo(_poligonosLayer);
    }

    function _cerrarPoligonoTemporal() {
      if (_poligonoCoordsTemporal.length < 3) return;
      // Parar de escuchar clicks temporalmente
      lmap.off('click', _onPoligonoClick);
      lmap.off('mousemove', _onPoligonoMove);
      lmap.getContainer().style.cursor = '';

      // Dibujar preview del polígono cerrado
      if (_poligonoDibujandoTemp) _poligonosLayer.removeLayer(_poligonoDibujandoTemp);
      L.polygon(_poligonoCoordsTemporal, { color: '#3b82f6', weight: 2, fillColor: '#3b82f6', fillOpacity: 0.2 }).addTo(_poligonosLayer);

      // Abrir modal de captura
      formPoligono.nombre = ''; formPoligono.descripcion = ''; formPoligono.color = '#3b82f6';
      mostrarModalPoligono.value = true;
    }

    function guardarPoligono() {
      // Simular guardado en BD
      const nuevoPoligono = {
        id: Date.now(),
        ...formPoligono,
        coordenadas: [..._poligonoCoordsTemporal] // clonar
      };
      poligonosGuardados.value.push(nuevoPoligono);

      // Dibujar en la capa definitiva
      const poly = L.polygon(nuevoPoligono.coordenadas, {
        color: nuevoPoligono.color, weight: 2, fillColor: nuevoPoligono.color, fillOpacity: 0.4
      });
      poly.on('click', () => abrirDetalle({ tipo: 'poligono', p: nuevoPoligono }));
      poly.addTo(_poligonoDrawnLayer);

      addToast(`Polígono "${nuevoPoligono.nombre}" guardado con éxito.`, nuevoPoligono.color, 'POLÍGONO REGISTRADO');
      cerrarModalPoligono();
    }

    function cerrarModalPoligono() {
      mostrarModalPoligono.value = false;
      // Limpiar dibujo temporal
      if (_poligonosLayer) _poligonosLayer.clearLayers();
      _poligonoCoordsTemporal = [];
      _poligonoDibujandoLinea = null;

      // Reactivar escucha si la herramienta sigue activa
      if (herramientasActivas.poligonos) {
        lmap.on('click', _onPoligonoClick);
        lmap.on('mousemove', _onPoligonoMove);
        lmap.getContainer().style.cursor = 'crosshair';
      }
    }

    function sincronizar() {
      categories.value = construirCategorias();
      pintarCapas();
      reconstruirFeed();
    }

    /* ─── Estilos de mapa base (Google Maps / OpenStreetMap / Google Satélite) ─── */
    function construirTile(estilo) {
      if (estilo === 'cartomap') {
        return L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
          subdomains: 'abcd', maxZoom: 20, attribution: '&copy; CARTO'
        });
      }
      if (estilo === 'darkmap') {
        return L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
          subdomains: 'abcd', maxZoom: 20, attribution: '&copy; CARTO'
        });
      }
      if (estilo === 'osm') {
        return L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          subdomains: 'abc', maxZoom: 19, attribution: '&copy; OpenStreetMap',
        });
      }
      if (estilo === 'satellite') {
        return L.tileLayer('https://mt{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}', {
          subdomains: '0123', maxZoom: 20, attribution: '&copy; Google',
        });
      }
      // 'google' = Google Maps (roadmap)
      return L.tileLayer('https://mt{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}', {
        subdomains: '0123', maxZoom: 20, attribution: '&copy; Google',
      });
    }

    function cambiarTile(estilo) {
      if (!lmap || estiloTile.value === estilo) return;
      estiloTile.value = estilo;
      if (capaBase) lmap.removeLayer(capaBase);
      capaBase = construirTile(estilo).addTo(lmap);
      
      // Si la capa de distritos (límites) está activa, forzar re-dibujado para aplicar color dinámico
      if (herramientasActivas.distritos) {
        toggleCapaDistrítos(false);
        toggleCapaDistrítos(true);
      }
    }

    function obtenerUbicacion() {
      if (!navigator.geolocation) {
        alert('Tu navegador no soporta geolocalización');
        return;
      }

      if (ubicacionActiva.value) {
        // Desactivar ubicación
        if (marcadorUbicacion.value) {
          lmap.removeLayer(marcadorUbicacion.value);
          marcadorUbicacion.value = null;
        }
        ubicacionActiva.value = false;
        return;
      }

      ubicacionCargando.value = true;

      navigator.geolocation.getCurrentPosition(
        (position) => {
          ubicacionCargando.value = false;
          const { latitude, longitude } = position.coords;
          
          // Remover marcador anterior si existe
          if (marcadorUbicacion.value) {
            lmap.removeLayer(marcadorUbicacion.value);
          }
          
          // Crear marcador de ubicación
          const iconoUbicacion = L.divIcon({
            className: 'ubicacion-icon',
            html: '<div style="background: #3b82f6; width: 20px; height: 20px; border-radius: 50%; border: 3px solid white; box-shadow: 0 2px 5px rgba(0,0,0,0.3);"></div>',
            iconSize: [20, 20],
            iconAnchor: [10, 10]
          });
          
          marcadorUbicacion.value = L.marker([latitude, longitude], { icon: iconoUbicacion })
            .addTo(lmap)
            .bindPopup('Tu ubicación actual');
          
          // Centrar mapa en ubicación
          lmap.setView([latitude, longitude], 16);
          ubicacionActiva.value = true;
        },
        (error) => {
          ubicacionCargando.value = false;
          alert('Error al obtener ubicación: ' + error.message);
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
      );
    }

    /* ─── Inicialización del mapa ─── */
    function initMap() {
      lmap = L.map('map-mapa', {
        center: [13.61229, -89.17036], zoom: 13, zoomControl: false,
        attributionControl: true, minZoom: 11, maxZoom: 20,
      });
      capaBase = construirTile(estiloTile.value).addTo(lmap);

      // Rastrear el centro del mapa en lugar del cursor
      lmap.on('move', () => {
        const center = lmap.getCenter();
        coords.lat = center.lat;
        coords.lng = center.lng;
      });
      lmap.on('zoomend', () => { zoomLvl.value = lmap.getZoom(); });
      lmap.on('click', () => {
        mostrarMenuCapas.value = false;
        mostrarPanelFiltros.value = false;
      });

      sincronizar();
      pintarRutas();
      pintarIntervenciones();

      if (herramientasActivas.distritos) {
        toggleCapaDistrítos(true);
      }
    }

    function pintarRutas() {
      routesLayer = L.layerGroup();
      routes.forEach((r) => {
        L.polyline(r.coords, { color: r.color, weight: 9, opacity: 0.12, lineCap: 'round', lineJoin: 'round' }).addTo(routesLayer);
        const polyline = L.polyline(r.coords, { color: r.color, weight: 3, opacity: 0.85, dashArray: '8,6', lineCap: 'round', lineJoin: 'round' }).addTo(routesLayer);
        polyline.on('click', () => abrirDetalle({ tipo: 'tramo', r }));
        const mid = r.coords[Math.floor(r.coords.length / 2)];
        const midMk = L.marker(mid, {
          icon: L.divIcon({ className: '', html: `<div style="width:6px;height:6px;background:${r.color};border-radius:50%;border:1.5px solid #fff;"></div>`, iconSize: [6, 6], iconAnchor: [3, 3] }),
        });
        midMk.on('click', () => abrirDetalle({ tipo: 'tramo', r }));
        midMk.addTo(routesLayer);
      });
      routesLayer.addTo(lmap);
    }

    function pintarIntervenciones() {
      intervLayer = L.layerGroup();
      interventions.forEach((iv) => {
        const mk = L.marker([iv.lat, iv.lng], { icon: marcadorIntervencion() });
        mk.on('click', () => abrirDetalle({ tipo: 'intervencion', iv }));
        intervLayer.addLayer(mk);
      });
      intervLayer.addTo(lmap);
    }

    /* ─── Toasts ─── */
    function addToast(text, color, label) {
      const id = ++toastSeq;
      toasts.value.push({ id, text, color, label: label || 'NUEVA DENUNCIA', exiting: false });
      pillFlash.value = true; setTimeout(() => { pillFlash.value = false; }, 800);
      setTimeout(() => dismissToast(id), 6500);
    }
    function dismissToast(id) {
      const t = toasts.value.find((x) => x.id === id); if (!t) return;
      t.exiting = true;
      setTimeout(() => { toasts.value = toasts.value.filter((x) => x.id !== id); }, 350);
    }

    /* ─── Ripple para nuevas denuncias ─── */
    function spawnRipple(lat, lng, color) {
      [0, 350].forEach((delay) => {
        setTimeout(() => {
          if (!lmap) return;
          const el = document.createElement('div');
          el.className = 'mv-ripple'; el.style.borderColor = color;
          const mk = L.marker([lat, lng], {
            icon: L.divIcon({ className: '', html: el, iconSize: [36, 36], iconAnchor: [18, 18] }),
            interactive: false, zIndexOffset: 1000,
          }).addTo(lmap);
          setTimeout(() => {
            if (lmap && mk) lmap.removeLayer(mk);
          }, 1800);
        }, delay);
      });
    }

    /* ─── Detección de nuevas denuncias (realtime / simulación) ─── */
    function manejarNueva(id) {
      const d = (denuncias.value || []).find((x) => x.id === id);
      if (!d) return;
      const cat = (tiposDenuncia.value || []).find((t) => t.id === d.tipo_id);
      const color = cat ? cat.color_hex : '#ffcc00';
      const short = cat ? (cat.area || cat.nombre) : 'Denuncia';
      nuevosIds.add(id);
      setTimeout(() => nuevosIds.delete(id), 2200);
      reproducirSonidoAlerta(); // ▶ chime de notificación
      if (lmap && d.lat && d.lng) {
        lmap.flyTo([d.lat, d.lng], 16, { duration: 0.8 });
        spawnRipple(d.lat, d.lng, color);
      }
      const fi = feedItems.value.find((f) => f.id === id);
      if (fi) fi.isNew = true;
      hasNewFeed.value = true;
      setTimeout(() => { hasNewFeed.value = false; if (fi) fi.isNew = false; }, 3500);
      addToast(`${d.descripcion || nombreDeTipo(d.tipo_id)} — ${d.direccion}`, color, `${short.toUpperCase()} · NUEVA DENUNCIA`);
    }

    const firma = computed(() => (denuncias.value || []).map((d) => d.id).join('|'));
    watch(firma, () => {
      if (!inicializado) {
        if ((denuncias.value || []).length) {
          (denuncias.value || []).forEach((d) => idsPrev.add(d.id));
          inicializado = true;
        }
        sincronizar();
        return;
      }
      const actuales = (denuncias.value || []).map((d) => d.id);
      actuales.filter((id) => !idsPrev.has(id)).forEach((id) => { idsPrev.add(id); manejarNueva(id); });
      sincronizar();
    }, { immediate: true });

    /* ─── Toggles de capas ─── */
    function toggleCat(id) {
      visibilidad[id] = !visibilidad[id];
      if (!lmap) return;
      if (visibilidad[id]) lmap.addLayer(layerGroups[id]);
      else lmap.removeLayer(layerGroups[id]);
    }
    const routesVis = ref(true);
    function toggleRoutes() {
      if (!lmap || !routesLayer) return;
      if (routesVis.value) lmap.removeLayer(routesLayer); else lmap.addLayer(routesLayer);
      routesVis.value = !routesVis.value;
    }
    const intervVis = ref(true);
    function toggleInterv() {
      if (!lmap || !intervLayer) return;
      if (intervVis.value) lmap.removeLayer(intervLayer); else lmap.addLayer(intervLayer);
      intervVis.value = !intervVis.value;
    }

    /* ─── Navegación en el mapa ─── */
    function selectAndZoom(id) {
      if (selectedCat.value === id) { selectedCat.value = null; return; }
      selectedCat.value = id;
      const c = categories.value.find((x) => x.id === id);
      if (!c || !c.points.length) return;
      lmap.fitBounds(L.latLngBounds(c.points.map((p) => [p.lat, p.lng])), { padding: [60, 320], maxZoom: 17 });
    }
    function zoomRoute(r) { lmap.fitBounds(L.latLngBounds(r.coords), { padding: [60, 320], maxZoom: 17 }); }
    function zoomInterv(iv) { lmap.flyTo([iv.lat, iv.lng], 17, { duration: 0.7 }); }
    function flyToFeed(item) { lmap.flyTo([item.lat, item.lng], 17, { duration: 0.7 }); }
    function doZoomIn() { lmap.zoomIn(); }
    function doZoomOut() { lmap.zoomOut(); }
    function resetView() { lmap.flyTo([13.58059, -89.1423], 12, { duration: 0.7 }); }
    function fitAll() {
      const pts = [];
      categories.value.forEach((c) => c.points.forEach((p) => pts.push([p.lat, p.lng])));
      interventions.forEach((i) => pts.push([i.lat, i.lng]));
      routes.forEach((r) => r.coords.forEach((c) => pts.push(c)));
      if (pts.length) lmap.fitBounds(L.latLngBounds(pts), { padding: [60, 320] });
    }

    /* ─── Reloj ─── */
    function tick() {
      const n = new Date();
      clock.value = n.toLocaleTimeString('es-SV', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
      dateStr.value = n.toLocaleDateString('es-SV', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' }).toUpperCase();
    }

    /* ─── Pantalla completa: al entrar el mapa ocupa todo el viewport ─── */
    watch(mapaFullscreen, () => nextTick(() => lmap && lmap.invalidateSize()));

    /* ─── Toggle conjunto de barras laterales (Feed + Capas) ─── */
    // true = ambas visibles; false = ambas ocultas. Refleja el estado para el ícono.
    const sidebarsOpen = computed(() => feedOpen.value && rpanelOpen.value);
    const toggleSidebars = () => {
      const nuevo = !sidebarsOpen.value;
      feedOpen.value = nuevo;
      rpanelOpen.value = nuevo;
      // Cerrar herramientas flotantes para no solapar
      mostrarMenuCapas.value = false;
      mostrarPanelFiltros.value = false;
    };

    /* ─── Auto-cierre de paneles al iniciar (2s) ─── */
    let _panelTimeout = null;
    const triggerAutoClose = () => {
      _panelTimeout = setTimeout(() => {
        feedOpen.value = false;
        rpanelOpen.value = false;
      }, 2000);
    };

    /* ─── Sincronizar estilo de mapa con Dark Mode ─── */
    watch(isDarkMode, (isDark) => {
      if (isDark && estiloTile.value !== 'satellite') cambiarTile('darkmap');
      else if (!isDark && estiloTile.value === 'darkmap') cambiarTile('google');
    }, { immediate: true });

    /* ─── Ciclo de vida ─── */
    onMounted(() => {
      mapaFullscreen.value = false; // el mapa arranca normal (con sidebar)
      triggerAutoClose(); // Iniciar cuenta regresiva al montar
      tick();
      clockInt = setInterval(tick, 1000);
      nextTick(() => { initMap(); if (lmap) lmap.invalidateSize(); });
      window.addEventListener('resize', _kpiResizeHandler, { passive: true });
    });

    onUnmounted(() => {
      clearInterval(clockInt);
      if (initTimeoutId) clearTimeout(initTimeoutId);
      mapaFullscreen.value = false;
      if (lmap) { lmap.remove(); lmap = null; }
      window.removeEventListener('resize', _kpiResizeHandler);
    });

    return {
      clock, dateStr, coords, zoomLvl, altitudStr, estiloTile,
      feedOpen, rpanelOpen, sidebarsOpen, toggleSidebars, selectedCat, kpisOpen, isLgUp, mobileTab,
      modalDetalle, abrirDetalle, cerrarDetalle, estadoClase, verDetalleEnMapa,
      modalTitulo, modalSubtitulo, modalLatitud, modalLongitud,
      mapaFullscreen, toggleMapaFullscreen,
      mostrarMenuCapas, herramientasActivas, toggleHerramienta, medicionModo,
      medicionTerminada, medicionPuntosCount, deshacerPuntoMedicion, limpiarMedicion,
      mostrarModalPoligono, formPoligono, guardarPoligono, cerrarModalPoligono,
      hasNewFeed, pillFlash, toasts, feedItems, categories, visibilidad,
      routes, interventions, routesVis, intervVis,
      total, pendientes, enCurso, resueltas,
      badgeEstado, etiquetaEstado,
      cambiarTile, obtenerUbicacion, ubicacionActiva, ubicacionCargando, toggleCat, selectAndZoom, toggleRoutes, toggleInterv,
      zoomRoute, zoomInterv, flyToFeed,
      doZoomIn, doZoomOut, resetView, fitAll,
      dismissToast,
      // Filtros
      mostrarPanelFiltros, filtros, filtrosActivos, DISTRITOS, hoy,
      aplicarFiltros, limpiarFiltros, tiposDenuncia,
      sidebarColapsado,
    };
  },
};
