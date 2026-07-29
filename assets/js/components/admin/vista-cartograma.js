// ============================================================
// VISTA: Cartograma Analítico — Panel Ejecutivo Territorial
// Herramienta de análisis comparativo entre los 5 distritos
// de San Salvador Sur para apoyo en toma de decisiones.
// ============================================================
import { ref, computed, onMounted, onUnmounted, nextTick } from '../../core/vue.js';
import { useNavegacion } from '../../stores/navegacion.js';
import { useDenuncias } from '../../stores/denuncias.js';
import { useIntervenciones } from '../../stores/intervenciones.js';
import { useCatalogos } from '../../stores/catalogos.js';

export default {
  setup() {
    const { irA } = useNavegacion();
    const { denuncias, cargarDenuncias } = useDenuncias();
    const { intervenciones, cargarIntervenciones } = useIntervenciones();
    const { distritos, cargarDistritos: cargarCatalogos } = useCatalogos();

    const cargando = ref(true);
    const cargandoAnimacion = ref(false);
    const modoActivo = ref('geo');          // 'geo' | 'densidad' | 'denuncias' | 'inversion'
    const zonas = ref([]);
    const distritoSeleccionado = ref(null); // objeto zona completo
    const panelAbierto = ref(false);

    // ── Filtro de fechas (DEMO: escala proporcional los datos mock) ────────────
    const hoy = new Date().toISOString().split('T')[0];
    const filtroFecha = ref({ desde: '', hasta: '' });
    const filtroActivo = computed(() => !!(filtroFecha.value.desde || filtroFecha.value.hasta));

    // Calcula un factor [0..1] basado en el rango de fechas sobre un año base.
    // DEMO: simula que el total acumulado equivale a 365 días de actividad.
    const factorFecha = computed(() => {
      const { desde, hasta } = filtroFecha.value;
      if (!desde && !hasta) return 1;
      const d1 = desde ? new Date(desde + 'T00:00:00') : new Date(new Date().getFullYear(), 0, 1);
      const d2 = hasta ? new Date(hasta + 'T23:59:59') : new Date();
      if (d2 < d1) return 0;
      const diasRango = Math.max(1, (d2 - d1) / (1000 * 60 * 60 * 24));
      return Math.min(1, diasRango / 365);
    });

    function limpiarFiltroFecha() {
      filtroFecha.value = { desde: '', hasta: '' };
    }

    // Mapa y capas no reactivos (evita proxies en Leaflet)
    let mapa = null;
    let capas = new Map();

    // ── Configuración de modos ─────────────────────────────────────────────────
    const MODOS = [
      { id: 'geo', label: 'Geográfico', icono: 'fa-earth-americas', color: '#3b82f6', desc: 'Vista real del territorio' },
      { id: 'densidad', label: 'Densidad Pobl.', icono: 'fa-users', color: '#8b5cf6', desc: 'Hab. por km²' },
      { id: 'denuncias', label: 'Carga de Denuncias', icono: 'fa-clipboard-list', color: '#fb923c', desc: 'Denuncias activas por distrito' },
      { id: 'eficiencia', label: 'Eficiencia (%)', icono: 'fa-bolt', color: '#10b981', desc: 'Porcentaje de denuncias resueltas' },
    ];

    // ── Datos oficiales por distrito ───────────────────────────────────────────
    const DATOS_DISTRITO = {
      'Panchimalco': {
        poblacion: 44404, extensionKm2: 89.97, altitud: '570 m.s.n.m.',
        icono: '🏛️', color: '#e91e63',
        economia: 'Artesanía, turismo cultural, agricultura.',
        descripcion: 'Conocida como la "Ciudad de los Arcos". Corazón cultural e indígena Náhuat-Pipil del municipio.',
        destacados: ['Iglesia La Asunción (s. XVII)', 'Festival de Las Palmas', 'Arte indígena Náhuat'],
        // Datos simulados (demo) — reemplazar con API real
        denunciasActivas: 12, denunciasResueltas: 47, intervencionesActivas: 3,
        presupuestoEjecutado: 850000, telefono: '2299-8300',
        lat: 13.611602, lng: -89.179556,
      },
      'Rosario de Mora': {
        poblacion: 12993, extensionKm2: 39.2, altitud: '520 m.s.n.m.',
        icono: '🌿', color: '#ff9800',
        economia: 'Agricultura, ganadería, artesanías.',
        descripcion: 'Vocación rural con naturaleza exuberante y vistas al volcán de San Salvador.',
        destacados: ['Miradores naturales', 'Senderos de montaña', 'Ecoturismo rural'],
        denunciasActivas: 5, denunciasResueltas: 18, intervencionesActivas: 1,
        presupuestoEjecutado: 480000, telefono: '2399-0600',
        lat: 13.575556, lng: -89.206032,
      },
      'San Marcos': {
        poblacion: 57094, extensionKm2: 14.7, altitud: '760 m.s.n.m.',
        icono: '🏢', color: '#2196f3',
        economia: 'Comercio, industria manufacturera, educación.',
        descripcion: 'El distrito más urbanizado. Centro administrativo con alta actividad comercial e industrial.',
        destacados: ['Centro histórico', 'Mercado Central', 'Arte urbano mural'],
        denunciasActivas: 28, denunciasResueltas: 134, intervencionesActivas: 7,
        presupuestoEjecutado: 2100000, telefono: '2510-4400',
        lat: 13.657028, lng: -89.181884,
      },
      'Santiago Texacuangos': {
        poblacion: 20081, extensionKm2: 30.5, altitud: '820 m.s.n.m.',
        icono: '🌸', color: '#673ab7',
        economia: 'Floricultura, viveros, horticultura, comercio.',
        descripcion: 'Famoso por sus flores ornamentales que abastecen los mercados del AMSS.',
        destacados: ['Festival de Las Flores', 'Viveros de orquídeas', 'Fiestas patronales'],
        denunciasActivas: 8, denunciasResueltas: 31, intervencionesActivas: 2,
        presupuestoEjecutado: 620000, telefono: '2510-4400',
        lat: 13.642479, lng: -89.117980,
      },
      'Santo Tomás': {
        poblacion: 32099, extensionKm2: 24.30, altitud: '700 m.s.n.m.',
        icono: '⛰️', color: '#4caf50',
        economia: 'Residencial, comercio local, servicios, pequeña industria.',
        descripcion: 'Combina vocación urbano-residencial con reservas naturales. Pulmón verde del AMSS.',
        destacados: ['Cerro El Chulo', 'Mirador Lago de Ilopango', 'Gestión ambiental'],
        denunciasActivas: 11, denunciasResueltas: 52, intervencionesActivas: 4,
        presupuestoEjecutado: 950000, telefono: '2213-3100',
        lat: 13.642923, lng: -89.133104,
      },
    };

    // Función para obtener KPIs reales dinámicos para un distrito
    const getKPIDistrito = (nombreDistrito) => {
      const dId = distritos.value.find(d => d.nombre === nombreDistrito)?.id;
      
      let dActivas = DATOS_DISTRITO[nombreDistrito].denunciasActivas;
      let dResueltas = DATOS_DISTRITO[nombreDistrito].denunciasResueltas;
      let iActivas = DATOS_DISTRITO[nombreDistrito].intervencionesActivas;

      if (dId) {
        // Conteo real de denuncias
        const d_distrito = denuncias.value.filter(d => d.distrito_id === dId || d.distrito === dId);
        dActivas = d_distrito.filter(d => ['pendiente', 'en_revision'].includes(d.estado)).length;
        dResueltas = d_distrito.filter(d => d.estado === 'resuelta').length;
        
        // Conteo real de intervenciones
        const i_distrito = intervenciones.value.filter(i => i.distrito_id === dId);
        iActivas = i_distrito.filter(i => ['pendiente', 'en_progreso'].includes(i.estado)).length;
      }
      
      return { denunciasActivas: dActivas, denunciasResueltas: dResueltas, intervencionesActivas: iActivas };
    };

    // ── KPIs globales del municipio ────────────────────────────────────────────
    // DEMO: los contadores se escalan por factorFecha cuando hay un filtro activo.
    const kpisGlobales = computed(() => {
      const total = Object.values(DATOS_DISTRITO);
      const f = factorFecha.value;
      return {
        poblacion: total.reduce((s, d) => s + d.poblacion, 0),
        denunciasActivas: Math.round(Object.keys(DATOS_DISTRITO).reduce((s, name) => s + getKPIDistrito(name).denunciasActivas, 0) * f),
        resueltas: Math.round(Object.keys(DATOS_DISTRITO).reduce((s, name) => s + getKPIDistrito(name).denunciasResueltas, 0) * f),
        intervenciones: Math.round(Object.keys(DATOS_DISTRITO).reduce((s, name) => s + getKPIDistrito(name).intervencionesActivas, 0) * f),
      };
    });

    // Versión del detalle de distrito también ajustada por factor fecha (DEMO)
    const distritoConFiltro = computed(() => {
      if (!distritoSeleccionado.value) return null;
      const f = factorFecha.value;
      const dName = distritoSeleccionado.value.nombre;
      const kpis = getKPIDistrito(dName);
      
      return {
        ...distritoSeleccionado.value,
        denunciasActivas: Math.round(kpis.denunciasActivas * f),
        denunciasResueltas: Math.round(kpis.denunciasResueltas * f),
        intervencionesActivas: Math.round(kpis.intervencionesActivas * f),
      };
    });

    // ── Ranking según modo activo ──────────────────────────────────────────────
    const rankingZonas = computed(() => {
      if (!zonas.value.length) return [];
      return [...zonas.value].sort((a, b) => {
        const va = getMetricaValor(a, modoActivo.value);
        const vb = getMetricaValor(b, modoActivo.value);
        return vb - va;
      });
    });

    function getMetricaValor(zona, modo) {
      const d = DATOS_DISTRITO[zona.nombre] || {};
      const kpis = getKPIDistrito(zona.nombre);
      switch (modo) {
        case 'densidad': return d.poblacion / (d.extensionKm2 || 1);
        case 'denuncias': return kpis.denunciasActivas || 0;
        case 'eficiencia': return (kpis.denunciasResueltas / ((kpis.denunciasActivas || 0) + (kpis.denunciasResueltas || 1))) * 100;
        default: return d.poblacion || 0;
      }
    }

    function getMetricaLabel(zona, modo) {
      const d = DATOS_DISTRITO[zona.nombre] || {};
      switch (modo) {
        case 'densidad': return Math.round(d.poblacion / (d.extensionKm2 || 1)).toLocaleString() + ' hab/km²';
        case 'denuncias': return (d.denunciasActivas || 0) + ' activas';
        case 'inversion': return '$' + Math.round((d.presupuestoEjecutado || 0) / (d.poblacion || 1)).toLocaleString() + '/hab';
        default: return (d.poblacion || 0).toLocaleString() + ' hab.';
      }
    }

    // ── Factores de escala por modo ────────────────────────────────────────────
    function calcularFactores(modo) {
      // Calcular valor bruto de cada zona
      const valores = zonas.value.map(z => getMetricaValor(z, modo));
      const max = Math.max(...valores);
      const min = Math.min(...valores);
      const rango = max - min || 1;
      // Normalizar entre 0.65 y 1.40
      return valores.map(v => 0.65 + ((v - min) / rango) * 0.75);
    }

    // ── Escalar coordenadas relativo a su centroide ────────────────────────────
    function escalarCoordenadas(coords, centroid, scale, geomType) {
      const [cLat, cLng] = centroid;
      if (geomType === 'Polygon') {
        return coords.map(pt => [cLat + (pt[0] - cLat) * scale, cLng + (pt[1] - cLng) * scale]);
      } else if (geomType === 'MultiPolygon') {
        return coords.map(poly => poly.map(pt => [cLat + (pt[0] - cLat) * scale, cLng + (pt[1] - cLng) * scale]));
      }
      return coords;
    }

    // ── Animación de cambio de modo ────────────────────────────────────────────
    function animarHaciaModo(modo) {
      if (cargandoAnimacion.value || !mapa) return;
      cargandoAnimacion.value = true;
      modoActivo.value = modo;

      const esGeo = modo === 'geo';
      const factoresDestino = esGeo ? zonas.value.map(() => 1.0) : calcularFactores(modo);
      const factoresOrigen = capas.has('_lastFactors')
        ? capas.get('_lastFactors')
        : zonas.value.map(() => 1.0);

      capas.set('_lastFactors', factoresDestino);

      const duracion = 900;
      const inicio = performance.now();

      // Actualizar colores según modo
      const modoConf = MODOS.find(m => m.id === modo);
      zonas.value.forEach(zona => {
        const poly = capas.get(zona.id);
        if (!poly) return;
        const fillColor = esGeo ? zona.colorOriginal : modoConf.color;
        poly.setStyle({ fillColor, color: fillColor });
      });

      function frame(ahora) {
        const t = Math.min((ahora - inicio) / duracion, 1);
        const ease = 1 - Math.pow(1 - t, 3);

        zonas.value.forEach((zona, idx) => {
          const poly = capas.get(zona.id);
          if (!poly) return;
          const scale = factoresOrigen[idx] + (factoresDestino[idx] - factoresOrigen[idx]) * ease;
          poly.setLatLngs(escalarCoordenadas(zona.coordsReal, zona.centroid, scale, zona.geomType));
        });

        if (t < 1) requestAnimationFrame(frame);
        else cargandoAnimacion.value = false;
      }

      requestAnimationFrame(frame);
    }

    // ── Click en distrito → abre panel de detalle ──────────────────────────────
    function seleccionarDistrito(zona) {
      const datos = DATOS_DISTRITO[zona.nombre] || {};
      distritoSeleccionado.value = { ...zona, ...datos };
      panelAbierto.value = true;
      // Volar al distrito
      if (mapa) mapa.flyTo(zona.centroid, 13, { animate: true, duration: 0.8 });
    }

    function cerrarPanel() {
      panelAbierto.value = false;
      distritoSeleccionado.value = null;
      // Volver a vista completa
      if (mapa && zonas.value.length) {
        const todos = [];
        zonas.value.forEach(z => {
          if (z.geomType === 'Polygon') todos.push(...z.coordsReal);
          else z.coordsReal.forEach(p => todos.push(...p));
        });
        mapa.fitBounds(L.latLngBounds(todos), { padding: [60, 60], animate: true, duration: 0.6 });
      }
    }

    function irAMapaDistrito() {
      if (!distritoSeleccionado.value) return;
      irA('mapa');
    }

    // ── Cargar GeoJSON ─────────────────────────────────────────────────────────
    function cargarDistritos() {
      if (typeof window.getDistritosGeoJSON !== 'function') return [];
      const geojson = window.getDistritosGeoJSON();
      return geojson.features.map((feat, idx) => {
        const name = feat.properties.nombre;
        const geom = feat.geometry;
        let coordsReal = [], sumLat = 0, sumLng = 0, totalPoints = 0;
        if (geom.type === 'Polygon') {
          coordsReal = geom.coordinates[0].map(pt => { sumLng += pt[0]; sumLat += pt[1]; totalPoints++; return [pt[1], pt[0]]; });
        } else if (geom.type === 'MultiPolygon') {
          coordsReal = geom.coordinates.map(poly => poly[0].map(pt => { sumLng += pt[0]; sumLat += pt[1]; totalPoints++; return [pt[1], pt[0]]; }));
        }
        const colorOriginal = (DATOS_DISTRITO[name] || {}).color || '#6b7280';
        return {
          id: 'z' + (idx + 1), nombre: name,
          colorOriginal,
          color: colorOriginal,
          coordsReal,
          centroid: totalPoints > 0 ? [sumLat / totalPoints, sumLng / totalPoints] : [0, 0],
          geomType: geom.type,
        };
      });
    }

    // ── Ciclo de vida ──────────────────────────────────────────────────────────
    onMounted(() => {
      // Cargar datos reales en paralelo
      if (typeof cargarDenuncias === 'function') cargarDenuncias();
      if (typeof cargarIntervenciones === 'function') cargarIntervenciones();

      nextTick(() => {
        try {
          mapa = L.map('carto-map', {
            center: [13.58059, -89.14238],
            zoom: 12,
            zoomControl: false,
            attributionControl: false,
          });

          // Capa base minimalista
          L.tileLayer('https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png', { maxZoom: 19 }).addTo(mapa);
          // Labels encima (para que queden sobre los polígonos)
          L.tileLayer('https://{s}.basemaps.cartocdn.com/light_only_labels/{z}/{x}/{y}{r}.png', { maxZoom: 19, pane: 'shadowPane' }).addTo(mapa);

          // Control de zoom personalizado
          L.control.zoom({ position: 'bottomright' }).addTo(mapa);

          zonas.value = cargarDistritos();

          zonas.value.forEach(zona => {
            const poly = L.polygon(zona.coordsReal, {
              color: zona.colorOriginal,
              weight: 2.5,
              fillColor: zona.colorOriginal,
              fillOpacity: 0.50,
              className: 'carto-poly',
            }).addTo(mapa);

            poly.on('click', () => seleccionarDistrito(zona));
            poly.on('mouseover', function () {
              this.setStyle({ fillOpacity: 0.70, weight: 3 });
            });
            poly.on('mouseout', function () {
              this.setStyle({ fillOpacity: 0.50, weight: 2.5 });
            });

            capas.set(zona.id, poly);
          });

          // Ajuste inicial
          const todos = [];
          zonas.value.forEach(z => {
            if (z.geomType === 'Polygon') todos.push(...z.coordsReal);
            else z.coordsReal.forEach(p => todos.push(...p));
          });
          if (todos.length) mapa.fitBounds(L.latLngBounds(todos), { padding: [60, 60] });

        } catch (e) {
          console.error('[Cartograma]', e);
        } finally {
          cargando.value = false;
        }
      });
    });

    onUnmounted(() => { if (mapa) { mapa.remove(); mapa = null; } capas.clear(); });

    return {
      cargando, cargandoAnimacion, modoActivo, zonas,
      MODOS, rankingZonas, kpisGlobales,
      distritoSeleccionado, distritoConFiltro, panelAbierto,
      animarHaciaModo, getMetricaLabel,
      seleccionarDistrito, cerrarPanel, irAMapaDistrito,
      DATOS_DISTRITO,
      // Filtro de fechas
      filtroFecha, filtroActivo, hoy, limpiarFiltroFecha,
    };
  },
};
