// ============================================================
// VISTA: Cartograma Analítico — Panel Ejecutivo Territorial
// Herramienta de análisis comparativo entre los 5 distritos
// de San Salvador Sur para apoyo en toma de decisiones.
// ============================================================
import { ref, reactive, computed, watch, onMounted, onUnmounted, nextTick } from '../../core/vue.js';
import { useNavegacion } from '../../stores/navegacion.js';
import { useTerritorio } from '../../stores/territorio.js';
import { usePerfilDistritos } from '../../stores/perfil-distritos.js';
import { cargarLimitesSSSur } from '../../services/geo-json/cargador.js';
import { crearGestorDeCapas } from '../../services/mapa/capas-territoriales.js';
import { HERRAMIENTAS } from '../../config/mapa/herramientas-mapa.js';
export default {
  setup() {
    const { irA } = useNavegacion();
    // Los indicadores se agregan en la BASE (`kpis_distrito_periodo`, v27), no
    // contando sobre el array de casos ya cargado: ese está limitado a 200
    // filas y los totales quedarían congelados ahí en cuanto el municipio
    // crezca, sin ningún aviso.
    const {
      periodoDelAmbito, totalesPeriodo, cargandoPeriodo, errorPeriodo, cargarKpisPeriodo,
      totalesPrevios, hayComparativa, variacion,
    } = useTerritorio();

    // Los 5 municipios de SSSur — no vienen de catálogos, son fijos geográficamente
    const NOMBRES_DISTRITOS = ['San Marcos', 'Santo Tomás', 'Santiago Texacuangos', 'Panchimalco', 'Rosario de Mora'];

    const cargando = ref(true);
    const cargandoAnimacion = ref(false);
    const modoActivo = ref('geo');          // 'geo' | 'densidad' | 'denuncias' | 'inversion'
    const zonas = ref([]);
    const distritoSeleccionado = ref(null); // objeto zona completo
    const panelAbierto = ref(false);

    /* ─── Filtro de período ───────────────────────────────────────────────
       Antes esto NO filtraba: calculaba qué fracción del año abarcaba el rango
       y MULTIPLICABA los contadores por ella (`total * díasDelRango / 365`).
       Un trimestre mostraba el 25 % del acumulado como si fueran los casos de
       ese trimestre — un número redondo, verosímil e imposible de distinguir de
       un dato real.

       Ahora el rango viaja a la base y se traduce en un `where` sobre
       `created_at` (RPC `kpis_distrito_periodo`, migration_v27). */
    const hoy = new Date().toISOString().split('T')[0];
    const filtroFecha = ref({ desde: '', hasta: '' });
    const filtroActivo = computed(() => !!(filtroFecha.value.desde || filtroFecha.value.hasta));

    function limpiarFiltroFecha() {
      filtroFecha.value = { desde: '', hasta: '' };
    }

    // Recarga al cambiar el rango. `debounce` de 350 ms porque un `input[type=date]`
    // emite mientras se teclea el año: sin él, escribir "2026" dispara cuatro
    // consultas de agregación.
    let _temporizadorPeriodo = null;
    watch(filtroFecha, ({ desde, hasta }) => {
      clearTimeout(_temporizadorPeriodo);
      _temporizadorPeriodo = setTimeout(() => {
        cargarKpisPeriodo(desde, hasta);
      }, 350);
    }, { deep: true });

    /* ─── Capas territoriales de referencia ───────────────────────────────
       Municipio y colonias. Los límites distritales no se ofrecen: en esta
       vista los distritos son el propio cartograma.

       `capasActivas` sí es reactivo —lo lee la plantilla para pintar los
       interruptores—, pero el gestor y el mapa NO: un objeto de Leaflet dentro
       de un proxy de Vue es el patrón que ya rompió el Mapa en Vivo. */
    const CAPAS_CARTOGRAMA = ['municipio', 'colonias'];
    const capasCartograma = HERRAMIENTAS.filter((h) => CAPAS_CARTOGRAMA.includes(h.id));
    const capasActivas = reactive({ municipio: false, colonias: false });
    const menuCapasAbierto = ref(false);
    let gestorCapas = null;

    function alternarCapa(id) {
      capasActivas[id] = !capasActivas[id];
      if (gestorCapas) gestorCapas.alternar(id, capasActivas[id]);
    }

    // Mapa y capas no reactivos (evita proxies en Leaflet)
    let mapa = null;
    let capas = new Map();

    // ── Configuración de modos ─────────────────────────────────────────────────
    const MODOS = [
      { id: 'geo', label: 'Geográfico', icono: 'fa-earth-americas', color: '#3b82f6', desc: 'Vista real del territorio' },
      { id: 'densidad', label: 'Densidad Pobl.', icono: 'fa-users', color: '#8b5cf6', desc: 'Hab. por km²' },
      { id: 'denuncias', label: 'Carga de Denuncias', icono: 'fa-clipboard-list', color: '#fb923c', desc: 'Denuncias activas por distrito' },
      // El modo que faltaba. El volumen bruto siempre corona a San Marcos
      // —57 094 habitantes frente a los 12 993 de Rosario de Mora—, así que
      // como criterio de reparto no informa de nada. Por habitante sí.
      { id: 'percapita', label: 'Por habitante', icono: 'fa-people-group', color: '#0ea5e9', desc: 'Denuncias activas por cada 1 000 habitantes' },
      { id: 'eficiencia', label: 'Eficiencia (%)', icono: 'fa-bolt', color: '#10b981', desc: 'Porcentaje de denuncias resueltas' },
    ];

    /* ─── Rangos rápidos ──────────────────────────────────────────────────
       La tendencia solo existe con las dos fechas puestas, y teclear dos
       fechas para ver una comparativa es fricción suficiente como para que
       nadie la use. Con esto es un clic. */
    const RANGOS_RAPIDOS = [
      { id: 'mes',       label: '30 días',   dias: 30 },
      { id: 'trimestre', label: 'Trimestre', dias: 90 },
      { id: 'anio',      label: 'Año',       dias: 365 },
    ];

    function aplicarRangoRapido(dias) {
      const fin = new Date();
      const ini = new Date(); ini.setDate(ini.getDate() - dias + 1);
      const aTexto = (f) => f.toISOString().split('T')[0];
      filtroFecha.value = { desde: aTexto(ini), hasta: aTexto(fin) };
    }

    // ── Datos oficiales por distrito ───────────────────────────────────────────
    /* ─── Perfil de cada distrito ─────────────────────────────────────────
       Aquí había un objeto literal con la población, la extensión, la altitud,
       el teléfono y la descripción de los cinco distritos. Datos censales y de
       contacto dentro de un archivo de código: para corregir un número hacía
       falta un desarrollador y un despliegue.

       Ahora salen de `public.distritos_perfil` (v28), que además guarda la
       FUENTE y la fecha de cada cifra. La extensión ya no se declara: se mide
       sobre el polígono oficial (`st_area`), porque la que estaba escrita a
       mano —198,67 km² en total— se apartaba un 9 % de la superficie real y esa
       diferencia se propagaba al modo de densidad. */
    const { perfilDe, fuentePoblacion, cargarPerfiles } = usePerfilDistritos();

    // Perfil + indicadores de un distrito, indexado por NOMBRE porque es la
    // clave con la que llegan los polígonos del GeoJSON.
    const datosPorNombre = computed(() => {
      const indice = new Map();
      for (const k of periodoDelAmbito.value) {
        indice.set(k.distrito_nombre, { ...k, perfil: perfilDe(k.distrito_id) || {} });
      }
      return indice;
    });

    /* ─── Indicadores operativos: de la BASE, no del archivo ──────────────
       `DATOS_DISTRITO` traía contadores escritos a mano —"Panchimalco: 12
       activas, 47 resueltas"— y `getKPIDistrito` solo los sustituía por datos
       reales SI ese distrito tenía casos. Con un municipio recién puesto en
       marcha, cuatro de los cinco distritos mostraban cifras inventadas, y en
       la misma fila de KPIs convivían números reales e imaginarios sin nada que
       los distinguiera.

       Ahora salen de `kpis_distrito_periodo` (v27), que agrega EN LA BASE. Es
       importante que sea allí y no aquí: `denuncias.value` está limitado a 200
       filas, así que contar sobre ese array daría totales congelados en cuanto
       el municipio pase de 200 casos, sin ningún aviso. */
    // Ceros —nunca datos de ejemplo— si el distrito no aparece: un distrito
    // sin casos tiene cero casos, y decir otra cosa es inventar.
    const SIN_DATOS = Object.freeze({
      total: 0, pendientes: 0, en_curso: 0, resueltas: 0, rechazadas: 0,
      fuera_de_objetivo: 0, criticas_abiertas: 0, intervenciones_activas: 0,
      horas_promedio_cierre: null, dias_mas_antiguo: null,
      area_km2: null, poblacion: null, categorias_top: [], perfil: {},
    });
    const getKPIDistrito = (nombre) => datosPorNombre.value.get(nombre) || SIN_DATOS;

    // "Activas" = todo lo que sigue abierto, incluido `en_obra`. La versión
    // anterior contaba solo `pendiente` y `en_revision`, así que un caso en
    // ejecución no aparecía ni como activo ni como resuelto: se esfumaba de los
    // indicadores justo mientras la cuadrilla trabajaba en él.
    const activasDe = (k) => k.pendientes + k.en_curso;

    // Eficiencia sobre el TOTAL, no sobre activas+resueltas. Lo anterior
    // ignoraba las rechazadas, así que un distrito que rechazara mucho salía
    // artificialmente eficiente.
    const eficienciaDe = (k) => (k.total ? Math.round((k.resueltas / k.total) * 100) : 0);

    /* Denuncias por cada 1 000 habitantes.

       Es la métrica que faltaba y la que más cambia una decisión. San Marcos
       tiene 57 094 habitantes y Rosario de Mora 12 993: cualquier ranking por
       volumen pondrá siempre a San Marcos primero, y eso no es un hallazgo, es
       demografía. Normalizado se ve qué territorio está peor atendido en
       proporción a la gente que vive en él.

       Devuelve null sin población: un "0 por mil" fabricado sobre un dato
       ausente se leería como un distrito modélico. */
    const porMilHab = (k) => {
      const pob = k.poblacion || k.perfil?.poblacion;
      if (!pob) return null;
      return Math.round((activasDe(k) / pob) * 1000 * 10) / 10;
    };

    // Densidad con la superficie MEDIDA sobre el polígono, no la declarada.
    const densidadDe = (k) => {
      const pob = k.poblacion || k.perfil?.poblacion;
      if (!pob || !k.area_km2) return null;
      return Math.round(pob / k.area_km2);
    };

    const kpisGlobales = computed(() => {
      const t = totalesPeriodo.value;
      const filas = periodoDelAmbito.value;
      const suma = (f) => filas.reduce((s, k) => s + (f(k) || 0), 0);
      const poblacion = suma((k) => k.poblacion);
      const activas = activasDe(t);
      return {
        // Censo y superficie: no se filtran por período ni salen de `casos`.
        poblacion,
        extensionKm2: suma((k) => k.area_km2),
        denunciasActivas: activas,
        // Intervención = caso abierto CON alguien asignado. No es lo mismo que
        // "en curso": distingue el trabajo en marcha del que sigue esperando
        // asignación, que para una jefatura son dos problemas distintos.
        intervenciones: t.intervenciones_activas,
        resueltas: t.resueltas,
        rechazadas: t.rechazadas,
        total: t.total,
        fueraDeObjetivo: t.fuera_de_objetivo,
        criticasAbiertas: t.criticas_abiertas,
        eficiencia: eficienciaDe(t),
        porMil: poblacion ? Math.round((activas / poblacion) * 1000 * 10) / 10 : null,
      };
    });

    /* ─── Tendencia frente al período anterior ────────────────────────────
       Un número aislado no dice si vamos bien. "34 casos" no significa nada;
       "34, un 18 % más que el trimestre pasado" sí.

       Solo aparece con las DOS fechas puestas: sin fecha de inicio no existe un
       período anterior comparable, y compararse contra un rango inventado sería
       repetir el error que se acaba de quitar. */
    const tendencia = (campo) => {
      if (!hayComparativa.value) return null;
      const v = variacion(totalesPeriodo.value[campo], totalesPrevios.value[campo]);
      if (v === null) return null;
      // En denuncias MENOS es mejor; en resueltas, MÁS.
      const menosEsMejor = campo !== 'resueltas';
      return { pct: v, bueno: menosEsMejor ? v < 0 : v > 0, neutro: v === 0 };
    };

    // Detalle del distrito abierto, con sus indicadores del período.
    const distritoConFiltro = computed(() => {
      if (!distritoSeleccionado.value) return null;
      const k = getKPIDistrito(distritoSeleccionado.value.nombre);
      const perfil = k.perfil || {};
      return {
        ...distritoSeleccionado.value,
        // Identidad visual desde el perfil: `distritoSeleccionado` ya solo
        // trae la geometría, así que el icono y el color se componen aquí.
        icono: perfil.icono || '📍',
        color: perfil.color_hex || distritoSeleccionado.value.colorOriginal || '#6b7280',
        poblacion: k.poblacion ?? perfil.poblacion ?? null,
        extensionKm2: k.area_km2,
        altitud: perfil.altitud_msnm ? perfil.altitud_msnm + ' m.s.n.m.' : '—',
        telefono: perfil.telefono || '—',
        economia: perfil.economia || '',
        descripcion: perfil.descripcion || '',
        destacados: perfil.destacados || [],
        denunciasActivas: activasDe(k),
        intervencionesActivas: k.intervenciones_activas,
        denunciasResueltas: k.resueltas,
        denunciasRechazadas: k.rechazadas,
        totalCasos: k.total,
        fueraDeObjetivo: k.fuera_de_objetivo,
        criticasAbiertas: k.criticas_abiertas,
        horasPromedioCierre: k.horas_promedio_cierre,
        diasMasAntiguo: k.dias_mas_antiguo,
        categoriasTop: k.categorias_top,
        eficiencia: eficienciaDe(k),
        porMil: porMilHab(k),
        densidad: densidadDe(k),
      };
    });

    // ── Ranking según modo activo ────────────────────────────────────────
    const rankingZonas = computed(() => {
      if (!zonas.value.length) return [];
      return [...zonas.value].sort((a, b) => {
        const va = getMetricaValor(a, modoActivo.value);
        const vb = getMetricaValor(b, modoActivo.value);
        return vb - va;
      });
    });

    function getMetricaValor(zona, modo) {
      const k = getKPIDistrito(zona.nombre);
      switch (modo) {
        case 'densidad':   return densidadDe(k) || 0;
        case 'denuncias':  return activasDe(k);
        case 'percapita':  return porMilHab(k) || 0;
        case 'eficiencia': return eficienciaDe(k);
        default:           return k.poblacion || k.perfil?.poblacion || 0;
      }
    }

    /* Etiqueta del ranking. Tenía tres defectos del mismo tipo:
         · `denuncias` leía el contador escrito a mano en lugar del KPI real que
           usaba `getMetricaValor`: la lista se ORDENABA por un número y MOSTRABA
           otro.
         · faltaba `eficiencia`, así que caía al `default` y en ese modo salía
           ordenada por eficiencia pero rotulada con población.
         · sobraba `inversion`, un modo que no existe en MODOS. */
    function getMetricaLabel(zona, modo) {
      const k = getKPIDistrito(zona.nombre);
      switch (modo) {
        case 'densidad': {
          const d = densidadDe(k);
          return d === null ? 'Sin dato poblacional' : d.toLocaleString('es-SV') + ' hab/km²';
        }
        case 'denuncias':
          return activasDe(k) + (activasDe(k) === 1 ? ' activa' : ' activas');
        case 'percapita': {
          const v = porMilHab(k);
          return v === null ? 'Sin dato poblacional' : v.toFixed(1) + ' por mil hab.';
        }
        case 'eficiencia':
          return k.total
            ? eficienciaDe(k) + '% · ' + k.resueltas + '/' + k.total
            : 'Sin casos en el período';
        default: {
          const pob = k.poblacion || k.perfil?.poblacion;
          return pob ? pob.toLocaleString('es-SV') + ' hab.' : 'Sin dato poblacional';
        }
      }
    }

    /* ─── Rótulo sobre el polígono ────────────────────────────────────────
       El peso de cada distrito, escrito encima de su forma, para poder leer el
       mapa sin pasar el ratón por cada uno.

       SOBRE EL MAPA SIEMPRE VA UN PORCENTAJE QUE SUMA 100. Sobre el polígono
       cabe una sola cifra, y tiene que ser una que el Alcalde pueda cuadrar de
       cabeza con los KPIs de arriba. La única clase de número que lo permite es
       la CUOTA DE UN TOTAL ADITIVO:

         · Los 166 671 habitantes del municipio se reparten entre los cinco
           distritos. «San Marcos, 34 %» se comprueba contra la cabecera.
         · Los casos activos, igual.

       Lo que NO puede ir sobre el polígono son las razones: densidad (hab/km²)
       y carga por habitante (casos/1000). Sumar 3 132 + 1 154 hab/km² no es la
       densidad de nada, así que no existe un total del que puedan ser cuota.
       Un intento anterior las rotuló contra el distrito más alto y San Marcos
       salió «100 %» por ser el más denso: los cinco sumaban 213 y el tablero
       parecía roto. Esas métricas van al RANKING, con su unidad, donde hay
       sitio para explicarlas.

       Por tanto, la cifra del mapa es:

         · densidad y percapita → % de la POBLACIÓN del municipio. Es el
           denominador de ambas métricas y es lo que da sentido a la
           deformación: la forma dice cuán denso, el número cuánta gente.
         · denuncias            → % de los CASOS ACTIVOS del municipio.
         · eficiencia           → ya es un porcentaje del propio distrito.

       El modo 'geo' no rotula nada: no hay métrica que representar. */
    const REFERENCIA_MAPA = {
      densidad:   'poblacion',  // razón     → sobre el mapa, el peso demográfico
      percapita:  'poblacion',
      denuncias:  'casos',      // aditiva   → cuota del total de casos activos
      eficiencia: 'propio',     // ya es un %→ el valor tal cual
    };

    /* De qué base sale la cuota. El total se toma de `kpisGlobales`, EL MISMO
       objeto que alimenta la cabecera, para que el 34 % del mapa y los 166 671
       habitantes de arriba no puedan discrepar nunca. */
    const BASES_CUOTA = {
      poblacion: { modo: 'geo',       total: (g) => g.poblacion },
      casos:     { modo: 'denuncias', total: (g) => g.denunciasActivas },
    };

    /* Valor SIN convertir los ausentes en cero. `getMetricaValor` los coacciona
       a 0 porque ordena la lista, pero rotular «0 hab/km²» en un distrito sin
       censo es inventar un dato: ahí no va etiqueta. */
    function metricaCruda(zona, modo) {
      const k = getKPIDistrito(zona.nombre);
      switch (modo) {
        case 'densidad':   return densidadDe(k);
        case 'percapita':  return porMilHab(k);
        case 'denuncias':  return activasDe(k);
        case 'eficiencia': return k.total ? eficienciaDe(k) : null;
        default:           return k.poblacion || k.perfil?.poblacion || null;
      }
    }

    /* Qué es la cifra del mapa, para la leyenda de la tarjeta «Modo activo».
       Se escribe UNA vez ahí y no cinco veces sobre los polígonos: un texto
       idéntico en los cinco distritos es tinta que no distingue a ninguno. */
    const LEYENDA_CIFRA = {
      densidad:   '% de la población del municipio',
      percapita:  '% de la población del municipio',
      denuncias:  '% de los casos activos del municipio',
      eficiencia: '% de casos resueltos del propio distrito',
    };
    const leyendaCifra = computed(() => LEYENDA_CIFRA[modoActivo.value] || '');

    /**
     * El número que se escribe sobre un polígono, o `null` si no hay dato.
     *
     * Una sola cifra, sin nombre y sin unidad. Una versión anterior ponía valor,
     * unidad, topónimo y comparación: con cinco distritos eran veinte piezas de
     * texto que se pisaban entre sí y tapaban el mapa. El nombre ya lo imprime
     * el mapa base, la unidad va en la leyenda y la métrica cruda en el ranking.
     * Sobre la forma queda lo único que distingue a un distrito de otro.
     */
    function etiquetaDePoligono(zona, modo) {
      const tipo = REFERENCIA_MAPA[modo];
      if (!tipo) return null;                       // modo 'geo'

      if (tipo === 'propio') {
        const valor = metricaCruda(zona, modo);     // la eficiencia YA es un %
        return Number.isFinite(valor) ? Math.round(valor) + '%' : null;
      }

      const pct = porcentajeDe(zona, modo);
      return pct === null ? null : pct + '%';
    }

    /**
     * Cuota del distrito sobre el total del municipio, o `null` si en ese modo
     * un porcentaje no significaría nada (eficiencia) o falta el dato.
     * O(1): el total sale de `kpisGlobales`, ya calculado para la cabecera.
     */
    function porcentajeDe(zona, modo) {
      const base = BASES_CUOTA[REFERENCIA_MAPA[modo]];
      if (!base) return null;                       // 'geo' y 'propio'

      const valor = metricaCruda(zona, base.modo);
      if (!Number.isFinite(valor)) return null;

      // Sin total no hay cuota. Devolver 0 % daría a entender que el distrito
      // no aporta nada, cuando lo que pasa es que no hay dato del que repartir.
      const total = base.total(kpisGlobales.value);
      if (!total) return null;
      return Math.round((valor / total) * 100);
    }

    /* La advertencia de lectura, en una línea. Acompaña a la leyenda, no al
       mapa: es una nota de método y se lee una vez. */
    const EXPLICACION_ETIQUETA = {
      denuncias:  'Los cinco distritos suman 100 %.',
      eficiencia: 'Cada distrito sobre su propio total, no sobre el municipio.',
      densidad:   'La forma indica la densidad; el ranking, los hab/km².',
      percapita:  'La forma indica los casos por mil hab.; el ranking, la tasa.',
    };
    const explicacionEtiqueta = computed(() => EXPLICACION_ETIQUETA[modoActivo.value] || '');

    // El encabezado decía siempre "Ranking Poblacional", en los cinco modos.
    const tituloRanking = computed(() => ({
      densidad:   'Ranking por densidad',
      denuncias:  'Ranking por carga',
      percapita:  'Ranking por habitante',
      eficiencia: 'Ranking por eficiencia',
    }[modoActivo.value] || 'Ranking poblacional'));

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
    /* Etiquetas permanentes con el porcentaje.

       Son `L.tooltip` con `permanent: true` ancladas al centroide, no marcadores:
       un tooltip no captura el clic, así que el polígono sigue siendo pulsable
       a través de la etiqueta. Con un `L.marker` habría zonas muertas justo en
       el centro de cada distrito, que es donde la gente pulsa.

       Se guardan en un `Map` aparte —`let` plano, nunca un ref— y se retiran
       por completo en el modo geográfico en lugar de ocultarse por CSS: dejar
       cinco tooltips vacíos sobre el mapa entorpece el ratón sin aportar nada. */
    let etiquetas = new Map();

    function quitarEtiquetas() {
      for (const t of etiquetas.values()) {
        if (mapa) mapa.removeLayer(t);
      }
      etiquetas.clear();
    }

    function pintarEtiquetas(modo) {
      quitarEtiquetas();
      if (!mapa || !REFERENCIA_MAPA[modo]) return;   // 'geo' no rotula

      for (const zona of zonas.value) {
        const rotulo = etiquetaDePoligono(zona, modo);
        if (!rotulo) continue;                       // sin dato: no se inventa un 0

        const etiqueta = L.tooltip({
          permanent: true,
          direction: 'center',
          className: 'carto-pct',
          interactive: false,      // el clic atraviesa hasta el polígono
        })
          .setLatLng(zona.centroid)
          .setContent(`<span class="carto-pct__valor">${rotulo}</span>`)
          .addTo(mapa);

        etiquetas.set(zona.id, etiqueta);
      }
    }

    // Los indicadores llegan asíncronos y el período se puede cambiar: sin esto
    // las etiquetas se quedarían con el porcentaje del primer cálculo.
    watch([periodoDelAmbito, zonas], () => pintarEtiquetas(modoActivo.value));

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

      // De inmediato, no al terminar la animación: la deformación escala cada
      // polígono alrededor de SU centroide, así que el punto de anclaje de la
      // etiqueta no se mueve y puede pintarse ya.
      pintarEtiquetas(modo);

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
      // Solo la zona. El perfil y los indicadores los compone
      // `distritoConFiltro`, que es reactivo: así el panel se actualiza al
      // cambiar el período en vez de quedarse con la foto del momento del clic.
      distritoSeleccionado.value = { ...zona };
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

    /* ─── Exportación ─────────────────────────────────────────────────────
       A un director le van a pedir esta comparativa en una reunión o para un
       memorando. Sin exportación hará una captura de pantalla, y una captura
       no se puede sumar, ni filtrar, ni auditar.

       CSV y no PDF: es lo que se abre en Excel, que es donde acaba realmente
       este dato. Con BOM UTF-8 porque sin él Excel en Windows destroza las
       tildes, y con `;` como separador porque en configuración regional de
       El Salvador la coma es el separador decimal. */
    function exportarComparativo() {
      const columnas = [
        ['Distrito',            (k) => k.distrito_nombre],
        ['Población',           (k) => k.poblacion ?? ''],
        ['Área (km²)',          (k) => k.area_km2 ?? ''],
        ['Densidad (hab/km²)',  (k) => densidadDe(k) ?? ''],
        ['Total casos',         (k) => k.total],
        ['Activas',             (k) => activasDe(k)],
        ['Por mil hab.',        (k) => porMilHab(k) ?? ''],
        ['En intervención',     (k) => k.intervenciones_activas],
        ['Resueltas',           (k) => k.resueltas],
        ['Rechazadas',          (k) => k.rechazadas],
        ['Eficiencia (%)',      (k) => eficienciaDe(k)],
        ['Fuera de plazo',      (k) => k.fuera_de_objetivo],
        ['Críticas abiertas',   (k) => k.criticas_abiertas],
        ['Horas medias cierre', (k) => k.horas_promedio_cierre ?? ''],
        ['Días del más antiguo',(k) => k.dias_mas_antiguo ?? ''],
        ['Top categorías',      (k) => (k.categorias_top || [])
                                        .map((c) => `${c.nombre} (${c.total})`).join(' | ')],
      ];

      // Se entrecomilla siempre y se doblan las comillas internas: un nombre de
      // categoría con `;` partiría la fila en dos columnas.
      const celda = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
      const filas = [
        columnas.map(([t]) => celda(t)).join(';'),
        ...periodoDelAmbito.value.map((k) => columnas.map(([, f]) => celda(f(k))).join(';')),
      ];

      // El período va DENTRO del archivo, no solo en el nombre: un CSV suelto
      // en el escritorio de alguien tiene que poder decir a qué fechas
      // corresponde sin depender de cómo se llame.
      const rango = filtroActivo.value
        ? `Período: ${filtroFecha.value.desde || 'inicio'} a ${filtroFecha.value.hasta || 'hoy'}`
        : 'Período: histórico completo';
      const cabecera = [
        celda('Cartograma Analítico · San Salvador Sur'),
        celda(rango),
        celda('Generado: ' + new Date().toLocaleString('es-SV')),
      ].join('\n');

      const csv = '﻿' + cabecera + '\n\n' + filas.join('\n');
      const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `cartograma-sssur-${filtroFecha.value.desde || 'historico'}.csv`;
      a.click();
      // Sin `revokeObjectURL` el Blob se queda en memoria toda la sesión.
      URL.revokeObjectURL(url);
    }

    function irAMapaDistrito() {
      if (!distritoSeleccionado.value) return;
      irA('mapa');
    }

    // ── Cargar GeoJSON ─────────────────────────────────────────────────────────
    // Cartografía oficial actualizada, la misma que el Mapa en Vivo. El global
    // `getDistritosGeoJSON()` queda como respaldo: si la descarga falla, es
    // preferible el trazado antiguo a un cartograma sin polígonos.
    async function cargarDistritos() {
      const oficial = await cargarLimitesSSSur();
      const geojson = oficial
        || (typeof window.getDistritosGeoJSON === 'function' ? window.getDistritosGeoJSON() : null);
      if (!geojson || !Array.isArray(geojson.features)) return [];

      return geojson.features.map((feat, idx) => {
        const name = feat.properties.nombre;
        const geom = feat.geometry;
        let coordsReal = [], sumLat = 0, sumLng = 0, totalPoints = 0;
        if (geom.type === 'Polygon') {
          coordsReal = geom.coordinates[0].map(pt => { sumLng += pt[0]; sumLat += pt[1]; totalPoints++; return [pt[1], pt[0]]; });
        } else if (geom.type === 'MultiPolygon') {
          coordsReal = geom.coordinates.map(poly => poly[0].map(pt => { sumLng += pt[0]; sumLat += pt[1]; totalPoints++; return [pt[1], pt[0]]; }));
        }
        // El color identitario del distrito sale del perfil. Gris si el perfil
        // aún no ha cargado: un color inventado haría que dos distritos
        // compartieran tono y el mapa dejaría de ser legible.
        const colorOriginal = datosPorNombre.value.get(name)?.perfil?.color_hex || '#6b7280';
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
      // Sin período: el acumulado histórico. El `watch` de `filtroFecha` se
      // encarga de recargar cuando el usuario acote el rango.
      // Los perfiles se piden aquí y se AGUARDAN abajo, antes de pintar: de
      // ellos sale el color de cada distrito.
      const perfilesListos = cargarPerfiles();
      cargarKpisPeriodo();

      nextTick(async () => {
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

          // `await` dentro de onMounted: el mapa ya está creado, solo faltan
          // los polígonos. Sin él, `zonas.value` sería una promesa y el
          // `forEach` de abajo reventaría con "zonas.value.forEach is not a
          // function" dejando el cartograma en blanco.
          // Los dos en paralelo: la cartografía y los perfiles son
          // independientes, y encadenarlos duplicaría el tiempo de arranque.
          // Pero hay que tener AMBOS antes de pintar, porque el color de cada
          // polígono sale del perfil.
          await perfilesListos;
          zonas.value = await cargarDistritos();

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

          // Capas territoriales de referencia, el mismo gestor que el Mapa en
          // Vivo. Aquí NO se ofrecen los límites distritales: los distritos ya
          // SON el cartograma, coloreados por el indicador activo. Duplicarlos
          // como capa solo añadiría un contorno encima de sí mismos.
          gestorCapas = crearGestorDeCapas(mapa, { tile: 'cartomap' });
          for (const id of CAPAS_CARTOGRAMA) {
            if (capasActivas[id]) gestorCapas.mostrar(id);
          }

        } catch (e) {
          console.error('[Cartograma]', e);
        } finally {
          cargando.value = false;
        }
      });
    });

    onUnmounted(() => {
      // El gestor suelta sus capas ANTES de destruir el mapa: después, el
      // contenedor ya no existe y `removeLayer` fallaría.
      if (gestorCapas) { gestorCapas.destruir(); gestorCapas = null; }
      quitarEtiquetas();   // antes de destruir el mapa: después ya no hay de dónde quitarlas
      if (mapa) { mapa.remove(); mapa = null; }
      capas.clear();
    });

    return {
      cargando, cargandoAnimacion, modoActivo, zonas,
      MODOS, rankingZonas, kpisGlobales,
      distritoSeleccionado, distritoConFiltro, panelAbierto,
      animarHaciaModo, getMetricaLabel, tituloRanking,
      porcentajeDe, explicacionEtiqueta, leyendaCifra,
      // Estado de la consulta de indicadores
      cargandoPeriodo, errorPeriodo,
      seleccionarDistrito, cerrarPanel, irAMapaDistrito,
      // Filtro de período y comparativa
      filtroFecha, filtroActivo, hoy, limpiarFiltroFecha,
      RANGOS_RAPIDOS, aplicarRangoRapido,
      hayComparativa, tendencia,
      // Procedencia del dato censal y exportación
      fuentePoblacion, exportarComparativo,
      // Capas territoriales
      capasCartograma, capasActivas, menuCapasAbierto, alternarCapa,
    };
  },
};
