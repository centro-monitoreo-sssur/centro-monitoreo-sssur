// ============================================================
// VISTA: Mapa en vivo (consola de monitoreo municipal).
// Vista única para visualizar todo lo que recibe el sistema. Hereda la
// identidad visual institucional (ver .kilocode/rules/04-sistema-diseno):
// paneles tipo tarjeta blanca, badges con badgeEstado(), tiles CartoDB
// light_all. Toda la data fluye desde los stores: denuncias, catálogos e
// intervenciones (tramos y puntos), sin datos de demostración.
// ============================================================
import { ref, reactive, computed, onMounted, onUnmounted, watch, nextTick } from '../../core/vue.js';
import { L } from '../../core/libs.js';
import { useDenuncias } from '../../stores/denuncias.js';
import { useCatalogos } from '../../stores/catalogos.js';
import { useIntervenciones } from '../../stores/intervenciones.js';
import { useNavegacion } from '../../stores/navegacion.js';
import { usePermisos } from '../../stores/permisos.js';
import { useTerritorio } from '../../stores/territorio.js';
import { formatoFecha } from '../../utils/formato.js';
import { badgeEstado, etiquetaEstado } from '../../utils/badge.js';
import { marcadorDenuncia, marcadorIntervencion } from '../../services/marcadores.js';
import { popupDenuncia, popupIntervencion } from '../../services/mapa-monitoreo.js';
import { cargarLimitesSSSur } from '../../services/geo-json/cargador.js';
import { leerVistaMapa, restaurarVistaMapa, vigilarVistaMapa } from '../../utils/vista-mapa-persistida.js';
import { useConfiguracion } from '../../stores/configuracion.js';
// Estructura de la consola, extraída a tres módulos declarativos. La vista
// ejecuta los efectos; el catálogo de paneles, herramientas y filtros vive
// fuera para poder cambiarlo sin bucear en este archivo.
import { PANELES, SECCIONES_CAPAS, SECCIONES_MENU_CAPAS, TABS_MOVIL, estadoInicialPaneles }
  from '../../config/mapa/paneles-mapa.js';
import {
  TILES, TILE_POR_DEFECTO, HERRAMIENTAS, GRUPOS_HERRAMIENTAS, BOTONES_FLOTANTES,
  CONTROLES_NAVEGACION, MODOS_MEDICION, estadoInicialHerramientas, exclusionesDe,
} from '../../config/mapa/herramientas-mapa.js';
import {
  ESTADOS_FILTRO, VENTANAS_TIEMPO, COLUMNAS_COMPARATIVO,
  filtrosIniciales, politicaComparativo,
} from '../../config/mapa/filtros-territoriales.js';

export default {
  setup() {
    const { config } = useConfiguracion();
    // Instantánea al montar: si se leyera de forma reactiva, cambiar un ajuste
    // en Configuración reabriría paneles y reiniciaría filtros mientras alguien
    // está trabajando sobre el mapa. Es el estado INICIAL, no un enlace vivo.
    const cfgMapa = { ...(config.value.mapa || {}) };
    const inicialPaneles = estadoInicialPaneles(cfgMapa);
    const comparativo = politicaComparativo(cfgMapa);

    const { denuncias, nombreDeTipo } = useDenuncias();
    const { tiposDenuncia, buscarDepartamento, distritos } = useCatalogos();
    const { distritoPorDefecto, puedeCompararDistritos, alcanceResuelto } = usePermisos();
    const { cargarKpisDistrito } = useTerritorio();

    // Tablero comparativo. Se abre solo si hay más de un distrito que comparar:
    // a una jefatura distrital no se le ofrece comparar consigo misma.
    const tableroAbierto = ref(false);
    const { mapaFullscreen, toggleMapaFullscreen, isDarkMode, sidebarColapsado } = useNavegacion();

    /* ─── Estado de UI (efímero, vive en ref) ─── */
    const kpisOpen = ref(inicialPaneles.kpisOpen); // Solo para móviles
    const mobileTab = ref(inicialPaneles.mobileTab); // 'feed' | 'capas' — pestaña activa en Bottom Sheet móvil
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
    // Capa base inicial. El catálogo de tiles vive en config/mapa/herramientas-mapa.js
    const CLAVE_VISTA_MAPA = 'admin-mapa';
    let _dejarDeVigilarVista = null;
    // La capa base recordada gana a la de configuración: si el operador eligió
    // satélite para revisar una zona rural, volver al callejero en cada entrada
    // le obliga a repetir el gesto.
    const estiloTile = ref(leerVistaMapa(CLAVE_VISTA_MAPA)?.estilo || cfgMapa.estilo || TILE_POR_DEFECTO);
    const ubicacionActiva = ref(false);
    const ubicacionCargando = ref(false);
    // ⚠ Los objetos de Leaflet NUNCA deben vivir dentro de un ref/reactive.
    // Vue 3 los envuelve en un Proxy, y Leaflet des-registra sus listeners
    // comparando identidad de contexto: `map.off(tipo, fn, context)`. Si el
    // marcador se añade crudo (`L.marker(...).addTo(map)`) y luego se remueve
    // a través del Proxy, el `off` no encuentra el listener y el handler
    // 'zoomanim' queda huérfano mientras `_map` ya vale null → al siguiente
    // zoom animado revienta con
    // "Cannot read properties of null (reading '_latLngToNewLayerPoint')".
    // Nada del template lee este marcador, así que va en una variable simple.
    let marcadorUbicacion = null;
    const feedOpen = ref(inicialPaneles.feedOpen);
    const rpanelOpen = ref(inicialPaneles.rpanelOpen);
    const selectedCat = ref(null);
    const hasNewFeed = ref(false);
    const pillFlash = ref(false);
    const toasts = ref([]);
    const feedItems = ref([]);
    const categories = ref([]);
    const visibilidad = reactive({});

    // ── Estado de filtros del mapa ──────────────────────────────────────────────
    const mostrarPanelFiltros = ref(false);
    // Valores iniciales y vocabulario de estados: config/mapa/filtros-territoriales.js.
    // `distrito` lo fija después el store de permisos, que sabe cuáles ve el usuario.
    const filtros = reactive(filtrosIniciales(cfgMapa));

    const acordeonTipos = ref(inicialPaneles.acordeonTipos);
    const acordeonTramos = ref(inicialPaneles.acordeonTramos);
    const acordeonIntervenciones = ref(inicialPaneles.acordeonIntervenciones);

    // Los distritos salen de `public.distritos` vía el store de catálogos.
    // Estaban hardcodeados como una lista de nombres, lo que además de
    // contradecir la regla de "todas las vistas conectadas a BD" hacía que el
    // filtro comparase un nombre contra el id que traía cada caso.

    // Nuevas variables para el Menú de Capas
    const mostrarMenuCapas = ref(false);
    const seccionesCapas = reactive(inicialPaneles.seccionesCapas);

    // Catálogo y estado inicial: config/mapa/herramientas-mapa.js
    const herramientasActivas = reactive(estadoInicialHerramientas(cfgMapa));
    const medicionModo = ref('linea'); // 'linea' | 'ruta' | 'manual'
    const medicionTerminada = ref(false); // true cuando ya se calculó resultado
    const medicionPuntosCount = ref(0);  // vértices marcados en la medición viva
    const medicionResultado = ref('');   // etiqueta del resultado (distancia, o distancia · tiempo)
    const medicionCalculando = ref(false);

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

    /* ─── Capas de monitoreo (datos reales desde el store) ───────────────
       `routes` son los tramos: casos cuya geometría es una línea.
       `interventions` son las intervenciones puntuales con responsable
       asignado. La separación es geométrica, no de catálogo. */
    const { tramos, intervencionesMapa, cargarCapasMapa } = useIntervenciones();
    const routes = tramos;
    const interventions = intervencionesMapa;

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

    /* ─── Predicados de filtrado ──────────────────────────────────────────
       `pasaFiltrosBase` cubre todo EXCEPTO el estado; `pasaFiltroEstado` solo
       el estado. La separación permite que la franja de KPIs siga siendo un
       resumen estable del ámbito consultado (distrito/tipo/período) mientras
       el segmento de estado actúa como drill-down: si los conteos se
       calcularan sobre el resultado ya filtrado, al pulsar "Pendientes" los
       demás segmentos caerían a 0 y la franja perdería sentido.
       ─────────────────────────────────────────────────────────────────── */
    function pasaFiltrosBase(d) {
      if (filtros.tipoIncidencia && d.tipo_id !== filtros.tipoIncidencia) return false;
      // El filtro guarda el id del distrito, no su nombre. Antes comparaba el
      // nombre de la lista hardcodeada contra `d.distrito`, que traía el
      // smallint de `casos.distrito_id`: la comparación nunca casaba y el
      // filtro territorial no recortaba nada.
      if (filtros.distrito && String(d.distrito_id ?? '') !== String(filtros.distrito)) return false;
      if (filtros.historicoActivo) {
        if (filtros.fechaInicio) {
          const desde = new Date(filtros.fechaInicio + 'T00:00:00');
          if (!d.created_at || new Date(d.created_at) < desde) return false;
        }
        if (filtros.fechaFin) {
          const hasta = new Date(filtros.fechaFin + 'T23:59:59');
          if (!d.created_at || new Date(d.created_at) > hasta) return false;
        }
      }
      return true;
    }

    function pasaFiltroEstado(d) {
      if (!filtros.estadoIncidencia) return true;
      if (filtros.estadoIncidencia === 'en_curso') {
        // Estado agregado: agrupa lo que el tablero muestra como "En curso".
        return d.estado === 'en_revision' || d.estado === 'en_obra';
      }
      return d.estado === filtros.estadoIncidencia;
    }

    /* ─── Conteos para la franja de KPIs (ámbito sin filtro de estado) ─── */
    const denunciasEnAmbito = computed(() => (denuncias.value || []).filter(pasaFiltrosBase));
    const total = computed(() => denunciasEnAmbito.value.length);
    const pendientes = computed(() => denunciasEnAmbito.value.filter((d) => d.estado === 'pendiente').length);
    const enCurso = computed(() => denunciasEnAmbito.value.filter((d) => d.estado === 'en_revision' || d.estado === 'en_obra').length + interventions.value.length);
    const resueltas = computed(() => denunciasEnAmbito.value.filter((d) => d.estado === 'resuelta').length);

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
        const puntos = (denuncias.value || [])
          .filter((d) => d.tipo_id === t.id && pasaFiltrosBase(d) && pasaFiltroEstado(d))
          .map((d) => ({
            id: d.id, lat: d.lat, lng: d.lng,
            title: d.descripcion || nombreDeTipo(d.tipo_id),
            address: d.direccion, time: formatoFecha(d.created_at),
            estado: d.estado, isNew: nuevosIds.has(d.id),
            distrito: d.distrito || '', distritoId: d.distrito_id ?? null,
            prioridad: d.prioridad_id ?? null,
            createdAt: d.created_at,
          }));

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

    // Orden operativo del feed. En un centro de monitoreo el orden ES la
    // priorización: lo de arriba es lo que hay que atender primero.
    //   1. Prioridad — `prioridades.nivel` va de 1 (Crítica) a 5 (Informativa),
    //      así que ascendente pone lo urgente arriba.
    //   2. Estado — lo no atendido antes que lo que ya está en curso o cerrado.
    //   3. Antigüedad — dentro del mismo cajón, primero lo que lleva más tiempo
    //      sin resolverse. Un caso crítico de hace tres días pesa más que uno
    //      de hace diez minutos.
    // Antes esto era `sort(() => Math.random() - 0.5)`: además de barajar el
    // feed, un comparador que devuelve valores aleatorios no es una relación de
    // orden válida y el resultado dependía del algoritmo del motor.
    const RANGO_ESTADO = { pendiente: 0, en_revision: 1, en_obra: 2, resuelta: 3, rechazada: 4 };

    function compararPrioridadOperativa(a, b) {
      const pa = a.prioridad ?? 99;
      const pb = b.prioridad ?? 99;
      if (pa !== pb) return pa - pb;

      const ea = RANGO_ESTADO[a.estado] ?? 98;
      const eb = RANGO_ESTADO[b.estado] ?? 98;
      if (ea !== eb) return ea - eb;

      const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      if (ta !== tb) return ta - tb;            // más antiguo primero

      return String(a.id).localeCompare(String(b.id));  // desempate estable
    }

    function reconstruirFeed() {
      const todos = [];
      categories.value.forEach((cat) => {
        cat.points.forEach((p) => {
          todos.push({
            id: p.id, lat: p.lat, lng: p.lng, catShort: cat.shortName, color: cat.color,
            title: p.title, address: p.address, time: p.time, estado: p.estado, isNew: p.isNew,
            prioridad: p.prioridad, createdAt: p.createdAt, distrito: p.distrito,
          });
        });
      });
      feedItems.value = todos.sort(compararPrioridadOperativa);
    }
    /* ─── Filtros: computed y helpers ─────────────────────────────────────────── */
    const conteoFiltros = computed(() => [
      filtros.distrito, filtros.tipoIncidencia,
      filtros.estadoIncidencia, filtros.historicoActivo,
    ].filter(Boolean).length);

    const filtrosActivos = computed(() => conteoFiltros.value > 0);

    // Leyenda: solo describe lo que está pintado AHORA mismo. Antes listaba las
    // 19 categorías del catálogo tuvieran o no incidencias; como `shortName` es
    // el nombre completo del departamento responsable ("Unidad Operativa De
    // Obras Municipales"), el bloque crecía hasta cubrir el centro del mapa.
    // Una leyenda que explica símbolos que no están en pantalla no es leyenda.
    const leyendaCategorias = computed(() =>
      (categories.value || []).filter((c) => c.visible && c.points.length)
    );
    const hayCapasEspeciales = computed(
      () => (routesVis.value && routes.value.length) || (intervVis.value && interventions.value.length)
    );
    const mostrarLeyenda = computed(
      () => leyendaCategorias.value.length > 0 || hayCapasEspeciales.value
    );

    // Atajo desde la franja de KPIs: pulsar un segmento filtra el mapa por ese
    // estado; pulsarlo de nuevo (o pulsar "Denuncias") vuelve al total.
    function filtrarPorEstado(estado) {
      filtros.estadoIncidencia = filtros.estadoIncidencia === estado ? '' : estado;
      aplicarFiltros();
    }

    function aplicarFiltros() {
      categories.value = construirCategorias();
      reconstruirFeed();
      pintarCapas();
    }

    // Extrae el bounding box del polígono de un distrito desde el GeoJSON
    // municipal. El GeoJSON identifica los distritos por NOMBRE
    // (`properties.nombre`), así que hay que traducir el id del catálogo.
    // Usa la cartografía oficial ya descargada (`cartografiaCache`), la misma
    // que dibuja la capa de distritos. Con el global antiguo, encuadrar un
    // distrito llevaba el mapa a una frontera distinta de la que se veía
    // pintada encima.
    function limitesDeDistrito(idDistrito) {
      const dist = (distritos.value || []).find((d) => String(d.id) === String(idDistrito));
      if (!dist) return null;

      const geojson = cartografiaCache
        || (typeof window.getDistritosGeoJSON === 'function' ? window.getDistritosGeoJSON() : null);
      const feat = (geojson?.features || []).find((f) => {
        const p = f.properties || {};
        const nombre = p.nombre || p.NOMBRE || p.name || '';
        // Comparación laxa: el GeoJSON viene de una fuente externa y no
        // garantiza la misma acentuación ni capitalización que el catálogo.
        return nombre.localeCompare(dist.nombre, 'es', { sensitivity: 'base' }) === 0;
      });
      if (!feat) return null;

      const puntos = [];
      const recoger = (coords) => {
        if (typeof coords[0] === 'number') { puntos.push([coords[1], coords[0]]); return; }
        coords.forEach(recoger);
      };
      recoger(feat.geometry.coordinates);
      return puntos.length ? L.latLngBounds(puntos) : null;
    }

    // Cambio de distrito desde la barra o desde el tablero comparativo.
    // Filtra los datos y además encuadra el mapa: sin el encuadre el usuario
    // ve menos pines pero sigue mirando el municipio entero, y no percibe que
    // el contexto cambió.
    function cambiarDistrito(id) {
      filtros.distrito = id ? String(id) : '';
      aplicarFiltros();
      if (!lmap) return;
      const limites = id ? limitesDeDistrito(id) : null;
      if (limites) {
        lmap.flyToBounds(limites, { padding: [40, 40], duration: 0.7 });
      } else if (!id) {
        fitAll();
      }
    }

    function limpiarFiltros() {
      filtros.distrito = '';
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



    // Cartografía oficial ya resuelta. `limitesDeDistrito()` la necesita de
    // forma síncrona para encuadrar el mapa al cambiar de distrito.
    let cartografiaCache = null;

    /* ─── Límites del Municipio (GeoJSON) ─── */
    // Cartografía oficial actualizada (`limites-sssur.geojson`, 5 distritos en
    // MultiPolygon). Antes se leía el global `getMunicipalityGeoJSON()` de
    // limites-municipio.js, que traía el trazado anterior en LineStrings: el
    // Mapa en Vivo y las PWA de campo dibujaban fronteras distintas del mismo
    // municipio. El cargador es asíncrono y memoriza la descarga.
    async function toggleCapaDistrítos(activa) {
      if (activa) {
        const geoData = await cargarLimitesSSSur();
        cartografiaCache = geoData;

        // Entre el clic y la respuesta el usuario pudo apagar la capa o salir
        // de la vista. Sin esta guarda, la capa aparecería sola después.
        if (!geoData || !lmap || !herramientasActivas.distritos) {
          if (!geoData) console.warn('[Distritos] No se pudo cargar limites-sssur.geojson.');
          return;
        }
        if (distritosLayer) return;   // otra llamada ya la pintó

        const colorLimites = estiloTile.value === 'satellite' ? '#ffffff' : '#1d4ed8';
        // Solo el contorno. La geometría es de polígonos, pero rellenarlos
        // —aunque sea al 5%— apaga las teselas, resta contraste a los pines y
        // en las zonas donde dos distritos se solapan el tono se duplica. En una
        // consola de monitoreo lo que importa es dónde está cada incidencia,
        // no la superficie del distrito.
        const style = {
          color: colorLimites,
          weight: 2.5,
          opacity: 0.9,
          dashArray: null,
          fill: false,
          fillOpacity: 0,
        };

        distritosLayer = L.geoJSON(geoData, {
          style,
          onEachFeature(feature, layer) {
            const p = feature.properties || {};
            const nombre = p.nombre || p.name || p.NOMBRE;
            if (!nombre) return;
            // Solo el nombre del distrito. El GeoJSON trae un `PobTotal` que no
            // es población de habitantes, y mostrarlo aquí contradecía las
            // cifras del Cartograma, que sí son las oficiales.
            layer.bindTooltip(
              `<div style="font-family:'Inter',sans-serif;font-size:12px;font-weight:600;">${nombre}</div>`,
              { sticky: true, className: 'dp' }
            );
            // Resaltado al pasar por encima: solo engrosando el trazo, ya que
            // sin relleno no hay superficie que teñir.
            //
            // `mouseout` restaura grosor y opacidad, pero NO el color: si lo
            // restaurara desde `style`, que quedó capturado en el closure al
            // crear la capa, tras cambiar a satélite el primer hover devolvería
            // el azul del callejero sobre la foto aérea.
            layer.on('mouseover', () => layer.setStyle({ weight: 4, opacity: 1 }));
            layer.on('mouseout',  () => layer.setStyle({ weight: style.weight, opacity: style.opacity }));
          },
        }).addTo(lmap);

        // Deliberadamente NO se hace `fitBounds` aquí. Encender una capa de
        // referencia no debe mover el mapa: quien está mirando un caso concreto
        // lo perdía de vista al activar los límites. Para encuadrar están los
        // botones "Ver todo" y "Vista inicial", que son acciones explícitas.

      } else {
        if (distritosLayer) {
          lmap.removeLayer(distritosLayer);
          distritosLayer = null;
        }
      }
    }

    function toggleHerramienta(herramienta) {
      herramientasActivas[herramienta] = !herramientasActivas[herramienta];

      // Exclusión mutua declarada en el catálogo (`excluyeA`), no en una cadena
      // de `if`. Al encender una herramienta de dibujo se apagan las demás
      // ANTES de aplicar su efecto, para que no queden dos capturando clics
      // sobre el mismo lienzo.
      if (herramientasActivas[herramienta]) {
        for (const otra of exclusionesDe(herramienta)) {
          if (herramientasActivas[otra]) {
            herramientasActivas[otra] = false;
            if (otra === 'medicion') detenerMedicion();
            if (otra === 'poligonos') detenerPoligono();
          }
        }
      }

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

    /* ─── Medición de distancias (implementación propia sin plugins) ───
     *
     * Tres modos, para que cualquier persona del equipo pueda medir sobre el
     * mapa sin escribir nada en el sistema:
     *
     *   · linea  → distancia en línea recta entre dos puntos. Exactamente dos:
     *              el tercer clic descarta la medición anterior y empieza otra.
     *   · ruta   → distancia por calle. Admite waypoints: A→B→C…, y OSRM
     *              encadena el recorrido completo.
     *   · manual → polilínea trazada a mano, vértice a vértice. Necesaria en
     *              zona rural, donde hay caminos visibles en la vista satélite
     *              que no existen en la base de OpenStreetMap y que por tanto
     *              el ruteo automático no puede seguir.
     *
     * Regla común: UNA medición viva a la vez. Antes, `_terminarCapturaPuntos()`
     * vaciaba el array de puntos pero NO la capa, así que la medición anterior
     * seguía dibujada y el siguiente clic iniciaba una segunda encima. Todo el
     * dibujo pasa ahora por `_redibujarMedicion()`, que parte siempre de la capa
     * limpia: con una sola función de pintado, el estado no puede
     * desincronizarse de lo que se ve.
     *
     * Nada de esto persiste: no toca `casos`, ni `recorrido`, ni la cola
     * offline. Es una herramienta de consulta.
     */
    let _medicionLayer = null;
    let _medicionPuntos = [];          // vértices confirmados por el usuario
    let _medicionLineaTemp = null;     // segmento elástico hasta el cursor
    let _medicionGeometriaRuta = null; // geometría devuelta por OSRM

    // Tope de waypoints. El servidor público de OSRM degrada y acaba rechazando
    // peticiones con muchas coordenadas; y un trayecto de 25 tramos ya no es una
    // medición, es una ruta operativa.
    const MAX_WAYPOINTS = 25;

    const MODOS_MULTIPUNTO = ['ruta', 'manual'];
    const esMultipunto = () => MODOS_MULTIPUNTO.includes(medicionModo.value);

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

    const _opcionesTooltip = {
      permanent: true, direction: 'top', offset: [0, -8], className: 'mv-medicion-tt',
    };

    /**
     * Única función que dibuja. Limpia la capa y repinta desde el estado, de
     * modo que deshacer, reiniciar y finalizar comparten un solo camino.
     */
    function _redibujarMedicion() {
      if (!_medicionLayer) return;
      _medicionLayer.clearLayers();
      _medicionLineaTemp = null;

      const puntos = _medicionPuntos;
      if (!puntos.length) return;

      // Traza: la geometría de OSRM si la hay; si no, los vértices rectos.
      if (medicionModo.value === 'ruta' && _medicionGeometriaRuta) {
        L.geoJSON(_medicionGeometriaRuta, {
          style: { color: '#001ba0', weight: 4, opacity: 0.85 },
        }).addTo(_medicionLayer);
      } else if (puntos.length > 1) {
        L.polyline(puntos, {
          color: '#001ba0', weight: 2.5,
          // Punteado fino en el trazado manual: recuerda que ese camino lo
          // dibujó una persona y no sale de la cartografía base.
          dashArray: medicionModo.value === 'manual' ? '2,6' : '6,4',
          opacity: 0.9,
        }).addTo(_medicionLayer);
      }

      // Vértices. El último lleva la etiqueta con el acumulado.
      puntos.forEach((pt, i) => {
        const esUltimo = i === puntos.length - 1;
        const mk = L.circleMarker(pt, {
          radius: esUltimo ? 6 : 4,
          color: '#001ba0', weight: 2, fillColor: '#fff', fillOpacity: 1,
        });
        let etiqueta = '';
        if (i === 0 && puntos.length === 1) etiqueta = 'Inicio';
        else if (esUltimo) etiqueta = medicionResultado.value || _formatDistancia(_distanciaTotal(puntos));
        if (etiqueta) mk.bindTooltip(etiqueta, _opcionesTooltip).openTooltip();
        mk.addTo(_medicionLayer);
      });
    }

    function _reiniciarMedicion(primerPunto) {
      _medicionPuntos = primerPunto ? [primerPunto] : [];
      _medicionGeometriaRuta = null;
      medicionResultado.value = '';
      medicionTerminada.value = false;
      medicionPuntosCount.value = _medicionPuntos.length;
      _redibujarMedicion();
    }

    function _onMedicionClick(e) {
      if (!herramientasActivas.medicion) return;

      // Una medición terminada no se acumula con la siguiente: el clic que
      // sigue a un resultado descarta el trazo anterior y empieza de cero.
      if (medicionTerminada.value) {
        _reiniciarMedicion(e.latlng);
        return;
      }

      if (_medicionPuntos.length >= MAX_WAYPOINTS) {
        addToast('Máximo ' + MAX_WAYPOINTS + ' puntos por medición. Finaliza o elimina el trazo.',
                 '#f59e0b', 'LÍMITE DE PUNTOS');
        return;
      }

      _medicionPuntos.push(e.latlng);
      medicionPuntosCount.value = _medicionPuntos.length;

      // Línea recta: exactamente dos puntos, y se cierra sola.
      if (medicionModo.value === 'linea') {
        if (_medicionPuntos.length === 2) {
          medicionResultado.value = _formatDistancia(_distanciaTotal(_medicionPuntos));
          medicionTerminada.value = true;
          _redibujarMedicion();
          addToast('📏 Distancia en línea recta: ' + medicionResultado.value,
                   '#001ba0', 'MEDICIÓN COMPLETADA');
          return;
        }
        _redibujarMedicion();
        return;
      }

      // Manual: acumula y va mostrando el total sobre la marcha.
      if (medicionModo.value === 'manual') {
        if (_medicionPuntos.length > 1) {
          medicionResultado.value = _formatDistancia(_distanciaTotal(_medicionPuntos));
        }
        _redibujarMedicion();
        return;
      }

      // Ruta: cada punto nuevo recalcula el recorrido completo por calle.
      _redibujarMedicion();
      if (_medicionPuntos.length > 1) _calcularRutaOSRM();
    }

    function _onMedicionMove(e) {
      if (!herramientasActivas.medicion) return;
      if (medicionTerminada.value || !_medicionPuntos.length) return;
      // En modo ruta el elástico recto engañaría: la distancia real la marca la
      // calle, no la línea entre el último vértice y el cursor.
      if (medicionModo.value === 'ruta') return;

      if (_medicionLineaTemp) _medicionLayer.removeLayer(_medicionLineaTemp);
      const ultimo = _medicionPuntos[_medicionPuntos.length - 1];
      _medicionLineaTemp = L.polyline([ultimo, e.latlng], {
        color: '#001ba0', weight: 2, dashArray: '4,4', opacity: 0.55,
      }).addTo(_medicionLayer);
    }

    // Doble clic cierra el trazo en los modos de varios puntos: es el gesto que
    // espera cualquiera que haya dibujado en un SIG.
    function _onMedicionDblClick(e) {
      if (!herramientasActivas.medicion || !esMultipunto()) return;
      if (L.DomEvent && e.originalEvent) L.DomEvent.stop(e.originalEvent);
      finalizarMedicion();
    }

    function _onMedicionTecla(evento) {
      if (!herramientasActivas.medicion) return;
      if (evento.key === 'Enter') { evento.preventDefault(); finalizarMedicion(); }
      else if (evento.key === 'Escape') { evento.preventDefault(); limpiarMedicion(); }
    }

    /** Cierra la medición en curso. El trazo se queda visible. */
    function finalizarMedicion() {
      if (medicionTerminada.value) return;
      if (_medicionPuntos.length < 2) {
        addToast('Marca al menos dos puntos antes de finalizar.', '#f59e0b', 'MEDICIÓN INCOMPLETA');
        return;
      }
      medicionTerminada.value = true;
      if (_medicionLineaTemp) { _medicionLayer.removeLayer(_medicionLineaTemp); _medicionLineaTemp = null; }

      if (medicionModo.value === 'manual') {
        medicionResultado.value = _formatDistancia(_distanciaTotal(_medicionPuntos));
        addToast('✏️ Trayecto manual: ' + medicionResultado.value + ' · ' + _medicionPuntos.length + ' puntos',
                 '#001ba0', 'TRAYECTO COMPLETADO');
      } else if (medicionModo.value === 'ruta' && medicionResultado.value) {
        addToast('🗺️ Ruta: ' + medicionResultado.value, '#001ba0', 'RUTA COMPLETADA');
      }
      _redibujarMedicion();
    }

    function deshacerPuntoMedicion() {
      if (!_medicionPuntos.length) return;
      _medicionPuntos.pop();
      medicionPuntosCount.value = _medicionPuntos.length;
      medicionTerminada.value = false;
      _medicionGeometriaRuta = null;
      medicionResultado.value = _medicionPuntos.length > 1
        ? _formatDistancia(_distanciaTotal(_medicionPuntos))
        : '';
      _redibujarMedicion();
      if (medicionModo.value === 'ruta' && _medicionPuntos.length > 1) _calcularRutaOSRM();
    }

    function limpiarMedicion() {
      _reiniciarMedicion(null);
      if (herramientasActivas.medicion && lmap) {
        lmap.getContainer().style.cursor = 'crosshair';
      }
    }

    /**
     * Ruta por calle a través de TODOS los vértices marcados. OSRM acepta las
     * coordenadas separadas por `;`, así que un solo viaje resuelve el trayecto
     * completo en lugar de encadenar tramos A→B sueltos.
     */
    async function _calcularRutaOSRM() {
      const puntos = _medicionPuntos.slice();
      if (puntos.length < 2) return;

      medicionCalculando.value = true;
      medicionResultado.value = 'Calculando ruta…';
      _redibujarMedicion();

      try {
        const coords = puntos.map((p) => p.lng + ',' + p.lat).join(';');
        const url = 'https://router.project-osrm.org/route/v1/driving/' + coords +
                    '?overview=full&geometries=geojson';
        const resp = await fetch(url);
        const data = await resp.json();

        // Mientras respondía, el usuario pudo deshacer o reiniciar: si los
        // puntos ya no son los mismos, este resultado es de otra medición.
        if (puntos.length !== _medicionPuntos.length) return;

        if (data.code !== 'Ok' || !data.routes || !data.routes.length) {
          medicionResultado.value = 'Sin ruta por calle';
          _medicionGeometriaRuta = null;
          addToast('OSRM no encontró calle entre esos puntos. En zona rural usa el trazado manual.',
                   '#f59e0b', 'SIN RUTA');
          _redibujarMedicion();
          return;
        }

        const route = data.routes[0];
        const durMin = Math.round(route.duration / 60);
        medicionResultado.value = _formatDistancia(route.distance) + ' · ~' + durMin + ' min';
        _medicionGeometriaRuta = route.geometry;
        _redibujarMedicion();
      } catch (err) {
        medicionResultado.value = 'Error de conexión';
        _medicionGeometriaRuta = null;
        addToast('No se pudo calcular la ruta. Verifica tu conexión.', '#dc2626', 'ERROR DE RUTA');
        _redibujarMedicion();
      } finally {
        medicionCalculando.value = false;
      }
    }

    const MENSAJE_MODO = {
      linea:  '📏 Línea recta: marca el punto A y el punto B. Un tercer clic empieza una medición nueva.',
      ruta:   '🗺️ Ruta vial: marca los puntos del recorrido. Doble clic o «Finalizar» para cerrarlo.',
      manual: '✏️ Trazado manual: marca cada vértice del camino. Doble clic o «Finalizar» para cerrarlo.',
    };

    function iniciarMedicion() {
      if (!lmap) return;
      if (!_medicionLayer) _medicionLayer = L.layerGroup().addTo(lmap);
      _reiniciarMedicion(null);

      lmap.getContainer().style.cursor = 'crosshair';
      lmap.on('click', _onMedicionClick);
      lmap.on('mousemove', _onMedicionMove);
      lmap.on('dblclick', _onMedicionDblClick);
      document.addEventListener('keydown', _onMedicionTecla);
      // Sin esto, el doble clic con el que se cierra un trazo también hace zoom.
      if (lmap.doubleClickZoom) lmap.doubleClickZoom.disable();

      addToast(MENSAJE_MODO[medicionModo.value], '#001ba0', 'MEDICIÓN ACTIVA');
    }

    function detenerMedicion() {
      if (!lmap) return;
      lmap.off('click', _onMedicionClick);
      lmap.off('mousemove', _onMedicionMove);
      lmap.off('dblclick', _onMedicionDblClick);
      document.removeEventListener('keydown', _onMedicionTecla);
      if (lmap.doubleClickZoom) lmap.doubleClickZoom.enable();
      lmap.getContainer().style.cursor = '';
      if (_medicionLayer) { lmap.removeLayer(_medicionLayer); _medicionLayer = null; }
      _medicionPuntos = [];
      _medicionLineaTemp = null;
      _medicionGeometriaRuta = null;
      medicionPuntosCount.value = 0;
      medicionTerminada.value = false;
      medicionResultado.value = '';
      medicionCalculando.value = false;
    }

    // Cambiar de modo descarta la medición en curso: mezclar una recta con un
    // trayecto por calle daría un total que no significa nada.
    function cambiarModoMedicion(modo) {
      if (medicionModo.value === modo) return;
      medicionModo.value = modo;
      if (herramientasActivas.medicion) {
        detenerMedicion();
        herramientasActivas.medicion = true;
        iniciarMedicion();
      }
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

      // El color de los límites depende de la capa base (blanco sobre satélite,
      // azul sobre callejero), así que hay que refrescarlo.
      //
      // Se hace con `setStyle` y NO apagando y volviendo a encender la capa,
      // que era lo que había: `toggleCapaDistrítos(true)` reencuadraba el mapa
      // al municipio entero, así que cambiar de tipo de mapa devolvía al
      // usuario a la vista inicial y perdía la zona que estaba mirando.
      // Además, reencender la capa relanzaba la descarga del GeoJSON.
      if (distritosLayer) {
        distritosLayer.setStyle({
          color: estilo === 'satellite' ? '#ffffff' : '#1d4ed8',
        });
      }
    }

    // Retira el marcador de ubicación siempre por la misma referencia cruda con
    // la que se añadió, para que Leaflet pueda des-registrar sus listeners.
    function quitarMarcadorUbicacion() {
      if (!marcadorUbicacion) return;
      if (lmap) lmap.removeLayer(marcadorUbicacion);
      marcadorUbicacion = null;
    }

    function obtenerUbicacion() {
      if (!navigator.geolocation) {
        alert('Tu navegador no soporta geolocalización');
        return;
      }

      if (ubicacionActiva.value) {
        // Desactivar ubicación
        quitarMarcadorUbicacion();
        ubicacionActiva.value = false;
        return;
      }

      ubicacionCargando.value = true;

      navigator.geolocation.getCurrentPosition(
        (position) => {
          ubicacionCargando.value = false;
          // La geolocalización es asíncrona: la vista pudo desmontarse mientras
          // el usuario aceptaba el permiso del navegador.
          if (!lmap) return;
          const { latitude, longitude } = position.coords;

          quitarMarcadorUbicacion();

          // Crear marcador de ubicación
          const iconoUbicacion = L.divIcon({
            className: 'ubicacion-icon',
            html: '<div style="background: #3b82f6; width: 20px; height: 20px; border-radius: 50%; border: 3px solid white; box-shadow: 0 2px 5px rgba(0,0,0,0.3);"></div>',
            iconSize: [20, 20],
            iconAnchor: [10, 10]
          });
          
          marcadorUbicacion = L.marker([latitude, longitude], { icon: iconoUbicacion })
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
      // Devuelve al operador donde lo dejó. Entrar al detalle de un caso y
      // volver al mapa reencuadraba el municipio entero cada vez.
      restaurarVistaMapa(CLAVE_VISTA_MAPA, lmap);
      capaBase = construirTile(estiloTile.value).addTo(lmap);
      _dejarDeVigilarVista = vigilarVistaMapa(CLAVE_VISTA_MAPA, lmap, () => estiloTile.value);

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
      // Los tramos llegan de forma asíncrona: hay que poder repintar la capa.
      if (routesLayer && lmap) lmap.removeLayer(routesLayer);
      routesLayer = L.layerGroup();
      routes.value.forEach((r) => {
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
      if (intervLayer && lmap) lmap.removeLayer(intervLayer);
      intervLayer = L.layerGroup();
      interventions.value.forEach((iv) => {
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
    //
    // Una denuncia que entra y NO pasa los filtros activos no puede
    // desaparecer en silencio. Con el filtro de estado en "En curso" —que es
    // configurable y mucha gente deja puesto— un caso nuevo nace en
    // `pendiente`, queda fuera del filtro y el mapa no muestra absolutamente
    // nada: ni pin, ni feed, ni aviso. En una consola de monitoreo eso es el
    // peor fallo posible, porque el operador concluye que no ha entrado nada.
    //
    // Se avisa aparte y se ofrece quitar el filtro de un clic.
    const nuevasFueraDeFiltro = ref(0);

    function limpiarFiltroEstado() {
      filtros.estadoIncidencia = '';
      nuevasFueraDeFiltro.value = 0;
      aplicarFiltros();
    }

    function manejarNueva(id) {
      const d = (denuncias.value || []).find((x) => x.id === id);
      if (!d) return;

      // ¿La vería el operador con los filtros que tiene puestos?
      const visible = pasaFiltrosBase(d) && pasaFiltroEstado(d);
      if (!visible) {
        nuevasFueraDeFiltro.value++;
        reproducirSonidoAlerta();
        addToast(
          `Entró una denuncia que tus filtros ocultan (${etiquetaEstado(d.estado)}). Pulsa "Ver todas" para mostrarla.`,
          '#f59e0b', 'DENUNCIA FUERA DE FILTRO'
        );
        return;
      }

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
      lmap.fitBounds(L.latLngBounds(c.points.map((p) => [p.lat, p.lng])), { padding: [48, 48], maxZoom: 17 });
    }
    function zoomRoute(r) { lmap.fitBounds(L.latLngBounds(r.coords), { padding: [48, 48], maxZoom: 17 }); }
    function zoomInterv(iv) { lmap.flyTo([iv.lat, iv.lng], 17, { duration: 0.7 }); }
    function flyToFeed(item) { lmap.flyTo([item.lat, item.lng], 17, { duration: 0.7 }); }
    function doZoomIn() { lmap.zoomIn(); }
    function doZoomOut() { lmap.zoomOut(); }
    function resetView() { lmap.flyTo([13.58059, -89.1423], 12, { duration: 0.7 }); }
    function fitAll() {
      const pts = [];
      categories.value.forEach((c) => c.points.forEach((p) => pts.push([p.lat, p.lng])));
      interventions.value.forEach((i) => pts.push([i.lat, i.lng]));
      routes.value.forEach((r) => r.coords.forEach((c) => pts.push(c)));
      if (pts.length) lmap.fitBounds(L.latLngBounds(pts), { padding: [48, 48] });
    }

    /* ─── Reloj ─── */
    function tick() {
      const n = new Date();
      clock.value = n.toLocaleTimeString('es-SV', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
      dateStr.value = n.toLocaleDateString('es-SV', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' }).toUpperCase();
    }

    /* ─── Pantalla completa: al entrar el mapa ocupa todo el viewport ─── */
    // `pan: false` por el mismo motivo que en el reflow de paneles: entrar o
    // salir de pantalla completa no debe recolocar el mapa.
    watch(mapaFullscreen, () => nextTick(() => lmap && lmap.invalidateSize({ pan: false })));

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

    /* ─── Reflow de Leaflet al plegar/desplegar paneles ───────────────────
       Con el layout en grid los paneles son columnas reales: al abrirlos o
       cerrarlos cambia el ancho del escenario y Leaflet debe recalcular su
       viewport, o el mapa queda con tiles en gris. La transición de ancho
       dura 300ms (ver .mv-panel en mapa.css), así que revalidamos al final. */
    let _reflowTimeout = null;
    watch([feedOpen, rpanelOpen], () => {
      clearTimeout(_reflowTimeout);
      _reflowTimeout = setTimeout(() => {
        // `pan: false` es lo que evita que el mapa se desplace solo.
        //
        // Por defecto `invalidateSize()` conserva el CENTRO del contenedor: al
        // ensancharse el escenario, Leaflet hace un `panBy` de la mitad del
        // ancho ganado para que el centro siga siendo el centro. El efecto para
        // quien mira es que el mapa "se va" justo cuando los paneles se
        // repliegan solos al entrar en la vista — se estaba mirando una zona y
        // acaba en otra sin haber tocado nada.
        //
        // Con `pan: false` el contenido queda anclado y el ancho ganado
        // simplemente descubre más territorio, que es lo que se espera al
        // cerrar un panel lateral.
        if (lmap) lmap.invalidateSize({ animate: false, pan: false });
      }, 320);
    });

    /* ─── Sincronizar estilo de mapa con Dark Mode ─── */
    watch(isDarkMode, (isDark) => {
      if (isDark && estiloTile.value !== 'satellite') cambiarTile('darkmap');
      else if (!isDark && estiloTile.value === 'darkmap') cambiarTile('google');
    }, { immediate: true });

    /* ─── Ciclo de vida ─── */
    /* ─── Repintar las capas cuando llegan del backend ───────────────────
       cargarCapasMapa() es asíncrona y el mapa puede montarse antes. */
    watch(routes, () => { if (lmap) pintarRutas(); });
    watch(interventions, () => { if (lmap) pintarIntervenciones(); });

    // Arranque territorial. El alcance puede resolverse después del montaje
    // (el RPC `mi_alcance()` es asíncrono), así que en lugar de leerlo una vez
    // en onMounted se observa hasta que llega.
    //
    // Una jefatura distrital entra directamente encuadrada en su distrito, sin
    // tener que seleccionarlo: es el único que puede ver, y obligarle a
    // elegirlo cada vez sería trabajo sin información.
    // Se controla con una bandera y NO llamando al `stop` que devuelve watch():
    // con `immediate: true` el callback corre de forma síncrona DENTRO de la
    // llamada a watch(), antes de que la constante quede asignada, así que
    // referenciarla ahí lanza `ReferenceError: Cannot access 'X' before
    // initialization` (zona muerta temporal de const/let).
    let arranqueTerritorialHecho = false;

    watch(alcanceResuelto, (listo) => {
      if (!listo || arranqueTerritorialHecho) return;
      arranqueTerritorialHecho = true;
      if (distritoPorDefecto.value && !filtros.distrito) {
        cambiarDistrito(distritoPorDefecto.value);
      }
      // El comparativo solo se ofrece —y solo se abre— si hay algo que comparar.
      // `autoAbrir` sale de Configuración → Mapa, pero nunca puede forzarlo a
      // una jefatura distrital: no tiene con qué compararse.
      tableroAbierto.value = puedeCompararDistritos.value && comparativo.autoAbrir;
    }, { immediate: true });

    /* ─── Auto-repliegue de los paneles laterales ───────────────────────────
       Los paneles arrancan abiertos y se cierran solos a los pocos segundos:
       así el operador ve que existen y dónde están, y después el mapa recupera
       todo el ancho. Arrancar cerrados sería más simple, pero quien entra por
       primera vez no descubriría el feed.

       Reglas:
       · Se dispara UNA sola vez. Que los paneles se cerraran cada vez que el
         ratón sale de ellos sería insufrible en una jornada completa.
       · Pasar el ratón por encima pausa la cuenta: si alguien está leyendo el
         feed, no se le puede cerrar en la cara.
       · Cualquier cierre o apertura manual antes de que salte lo cancela: el
         usuario ya expresó su preferencia. */
    let temporizadorAutoOcultar = null;
    let autoOcultarConsumido = false;

    function programarAutoOcultar() {
      if (!inicialPaneles.autoOcultar || autoOcultarConsumido) return;
      clearTimeout(temporizadorAutoOcultar);
      temporizadorAutoOcultar = setTimeout(() => {
        autoOcultarConsumido = true;
        temporizadorAutoOcultar = null;
        feedOpen.value = false;
        rpanelOpen.value = false;
      }, inicialPaneles.msAutoOcultar);
    }

    /** `definitivo` = el usuario tomó el control; no se vuelve a programar. */
    function cancelarAutoOcultar(definitivo = false) {
      clearTimeout(temporizadorAutoOcultar);
      temporizadorAutoOcultar = null;
      if (definitivo) autoOcultarConsumido = true;
    }

    // Alterna un panel y desactiva el auto-repliegue: si el operador ya está
    // decidiendo qué ver, el temporizador no debe contradecirle.
    function alternarPanel(cual) {
      cancelarAutoOcultar(true);
      if (cual === 'feed') feedOpen.value = !feedOpen.value;
      else rpanelOpen.value = !rpanelOpen.value;
    }

    onMounted(() => {
      cargarCapasMapa();
      // KPIs agregados en la base de datos, no calculados sobre las filas ya
      // cargadas: los de la franja se computaban sobre un tope de 200 casos.
      cargarKpisDistrito();
      mapaFullscreen.value = false; // el mapa arranca normal (con sidebar)
      programarAutoOcultar();
      tick();
      clockInt = setInterval(tick, 1000);
      nextTick(() => { initMap(); if (lmap) lmap.invalidateSize({ pan: false }); });
      window.addEventListener('resize', _kpiResizeHandler, { passive: true });
    });

    onUnmounted(() => {
      // Sin esto, el vigilante sigue escuchando `moveend` sobre un mapa ya
      // destruido y escribiendo en localStorage desde una vista que no existe.
      if (_dejarDeVigilarVista) { _dejarDeVigilarVista(); _dejarDeVigilarVista = null; }
      clearInterval(clockInt);
      if (initTimeoutId) clearTimeout(initTimeoutId);
      clearTimeout(_reflowTimeout);
      // Sin esto, salir de la vista antes de que salte dejaría el temporizador
      // vivo escribiendo sobre refs de un componente ya desmontado.
      cancelarAutoOcultar(true);
      mapaFullscreen.value = false;
      marcadorUbicacion = null;
      if (lmap) { lmap.remove(); lmap = null; }
      window.removeEventListener('resize', _kpiResizeHandler);
    });

    return {
      clock, dateStr, coords, zoomLvl, altitudStr, estiloTile,
      feedOpen, rpanelOpen, sidebarsOpen, toggleSidebars, selectedCat, kpisOpen, isLgUp, mobileTab,
      alternarPanel, programarAutoOcultar, cancelarAutoOcultar,
      modalDetalle, abrirDetalle, cerrarDetalle, estadoClase, verDetalleEnMapa,
      modalTitulo, modalSubtitulo, modalLatitud, modalLongitud,
      mapaFullscreen, toggleMapaFullscreen,
      mostrarMenuCapas, seccionesCapas, herramientasActivas, toggleHerramienta, medicionModo,
      medicionTerminada, medicionPuntosCount, deshacerPuntoMedicion, limpiarMedicion, cambiarModoMedicion,
      medicionResultado, medicionCalculando, finalizarMedicion, esMultipunto,
      nuevasFueraDeFiltro, limpiarFiltroEstado,
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
      mostrarPanelFiltros, filtros, filtrosActivos, conteoFiltros, filtrarPorEstado,
      ESTADOS_FILTRO, distritos, hoy,
      // Catálogos declarativos (assets/js/config/mapa/). Se exponen para que la
      // plantilla pueda recorrerlos en lugar de repetir el marcado por cada
      // tile, herramienta o botón: añadir uno nuevo pasa a ser una línea de
      // datos y no un bloque de HTML copiado.
      PANELES, SECCIONES_CAPAS, SECCIONES_MENU_CAPAS, TABS_MOVIL,
      TILES, HERRAMIENTAS, GRUPOS_HERRAMIENTAS, BOTONES_FLOTANTES,
      CONTROLES_NAVEGACION, MODOS_MEDICION,
      VENTANAS_TIEMPO, COLUMNAS_COMPARATIVO,
      // Consola territorial
      tableroAbierto, cambiarDistrito,
      leyendaCategorias, hayCapasEspeciales, mostrarLeyenda,
      aplicarFiltros, limpiarFiltros, tiposDenuncia,
      sidebarColapsado,
      acordeonTipos, acordeonTramos, acordeonIntervenciones
    };
  },
};
