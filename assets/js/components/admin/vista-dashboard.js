// ============================================================
// VISTA: Dashboard Ejecutivo
//
// Rediseño Fase 2. Tres cambios de fondo respecto de la versión anterior:
//
//   1. UN SOLO layout. Antes había dos bloques de plantilla —móvil y
//      escritorio— con el mismo contenido y DOS instancias de Chart.js vivas a
//      la vez. Cada corrección había que hacerla dos veces y era cuestión de
//      tiempo que una de las dos se olvidara.
//   2. Las cifras salen de la analítica del periodo, no del array de denuncias
//      cargado para otra vista. Un dashboard que depende de lo que otra pantalla
//      haya cargado antes muestra números distintos según por dónde entres.
//   3. Los KPI llevan variación contra el periodo anterior. Un número absoluto
//      sin comparación no permite decidir nada: 120 denuncias solo significa
//      algo al lado de las 90 de la semana pasada.
// ============================================================
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from '../../core/vue.js';
import { Chart } from '../../core/libs.js';
import { useDenuncias } from '../../stores/denuncias.js';
import { useCatalogos } from '../../stores/catalogos.js';
import { useNavegacion } from '../../stores/navegacion.js';
import { useDashboard } from '../../stores/dashboard.js';
import { useConfiguracion } from '../../stores/configuracion.js';
// El cumplimiento por distrito NO se calcula aquí. `v_kpis_distrito`
// (migration_v16) ya lo agrega en la base de datos y `territorio.js` descarta
// los distritos fuera del alcance del usuario. Calcularlo en el cliente sobre
// la muestra del periodo daría cifras distintas a las de la consola territorial
// para el mismo dato — y encima peores: parciales y sin respetar el ámbito.
import { useTerritorio } from '../../stores/territorio.js';
import { tiempoRelativo } from '../../utils/tiempo.js';

// Chart.js necesita el color como valor, no como `var(--serie-1)`: pinta sobre
// un <canvas>, donde las variables CSS no se resuelven. Se leen del elemento
// raíz en el momento de dibujar.
function colorDeVariable(nombre, respaldo) {
  if (typeof window === 'undefined') return respaldo;
  const valor = getComputedStyle(document.documentElement).getPropertyValue(nombre).trim();
  return valor || respaldo;
}

/** Clave YYYY-MM-DD en hora local. `toISOString()` no sirve: convierte a UTC y
 *  en El Salvador (UTC-6) manda los casos de la noche al día siguiente. */
function claveDia(fecha) {
  const d = new Date(fecha);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Serie de N días hacia atrás desde hoy, con ceros donde no hubo actividad. */
function seriePorDia(filas, dias, campoFecha) {
  const cubos = new Map();
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  for (let i = dias - 1; i >= 0; i--) {
    const d = new Date(hoy);
    d.setDate(d.getDate() - i);
    cubos.set(claveDia(d), 0);
  }
  filas.forEach((f) => {
    const valor = f[campoFecha];
    if (!valor) return;
    const clave = claveDia(valor);
    if (cubos.has(clave)) cubos.set(clave, cubos.get(clave) + 1);
  });
  return cubos;
}

/** Puntos de una polilínea SVG normalizada a un lienzo de 100×28. */
function puntosSparkline(valores) {
  if (!valores.length) return '';
  const max = Math.max(...valores, 1);
  const paso = valores.length > 1 ? 100 / (valores.length - 1) : 0;
  return valores
    .map((v, i) => `${(i * paso).toFixed(2)},${(26 - (v / max) * 24).toFixed(2)}`)
    .join(' ');
}

export default {
  setup() {
    const { denuncias, colorDeTipo } = useDenuncias();
    const {
      iconoDeTipo, departamentos, nombreDepartamento, cargarDepartamentos,
    } = useCatalogos();
    const {
      distritosDelAmbito, cargandoKpis: cargandoDistritos, errorKpis: errorDistritos,
      cargarKpisDistrito, semaforo,
    } = useTerritorio();
    const { isDarkMode } = useNavegacion();
    const {
      kpis, cargarKpis,
      rangoDias, filasAnalitica, cargandoAnalitica, analiticaTruncada, cargarAnalitica,
    } = useDashboard();
    const { config } = useConfiguracion();

    const canvasTendencia = ref(null);
    const canvasDona = ref(null);
    const fechaHoraActual = ref('');
    // Los objetos de Chart.js se quedan fuera de `ref` por la misma razón que
    // los de Leaflet (§11.1 del doc técnico): el Proxy de Vue rompe las
    // comparaciones por identidad que la librería hace internamente.
    let chartTendencia = null;
    let chartDona = null;
    let relojInterval = null;

    const RANGOS = [
      { dias: 1,  etiqueta: 'Hoy' },
      { dias: 7,  etiqueta: '7 días' },
      { dias: 30, etiqueta: '30 días' },
    ];

    function actualizarReloj() {
      const ahora = new Date();
      fechaHoraActual.value = ahora.toLocaleDateString('es-ES', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        hour: '2-digit',
        minute: '2-digit'
      });
    }

    // ── Partición del periodo ───────────────────────────────────────────────
    // El store trae dos periodos seguidos; aquí se separan por el corte.
    const corte = computed(() => {
      const d = new Date();
      d.setHours(0, 0, 0, 0);
      d.setDate(d.getDate() - rangoDias.value + 1);
      return d.getTime();
    });

    const filasPeriodo = computed(() =>
      filasAnalitica.value.filter((f) => new Date(f.created_at).getTime() >= corte.value)
    );
    const filasPrevias = computed(() =>
      filasAnalitica.value.filter((f) => new Date(f.created_at).getTime() < corte.value)
    );

    /** Cerrados dentro de la ventana, por fecha de cierre (no de creación). */
    const cerradosEn = (desde, hasta) => filasAnalitica.value.filter((f) => {
      if (!f.fecha_cierre) return false;
      const t = new Date(f.fecha_cierre).getTime();
      return t >= desde && (hasta === null || t < hasta);
    });

    const resueltosPeriodo = computed(() => cerradosEn(corte.value, null));
    const resueltosPrevios = computed(() => {
      const inicio = new Date(corte.value);
      inicio.setDate(inicio.getDate() - rangoDias.value);
      return cerradosEn(inicio.getTime(), corte.value);
    });

    /** Variación porcentual. Sin base previa no se inventa un 100%: se marca
     *  como no comparable y la tarjeta muestra un guion. */
    function variacion(actual, previo) {
      if (!previo) return actual > 0 ? null : 0;
      return Math.round(((actual - previo) / previo) * 100);
    }

    const metricas = computed(() => {
      const nuevos = filasPeriodo.value.length;
      const nuevosPrev = filasPrevias.value.length;
      const resueltos = resueltosPeriodo.value.length;
      const resueltosPrev = resueltosPrevios.value.length;
      const tasa = nuevos > 0 ? Math.round((resueltos / nuevos) * 100) : 0;
      const tasaPrev = nuevosPrev > 0 ? Math.round((resueltosPrev / nuevosPrev) * 100) : 0;

      return {
        nuevos, resueltos, tasa,
        deltaNuevos:    variacion(nuevos, nuevosPrev),
        deltaResueltos: variacion(resueltos, resueltosPrev),
        deltaTasa:      tasa - tasaPrev,
        // Stock, no flujo: es la foto de ahora mismo y por eso no lleva delta.
        pendientes: kpis.value.pendientes,
        enCurso:    kpis.value.enCurso,
      };
    });

    // ── Sparklines ──────────────────────────────────────────────────────────
    const sparkNuevos = computed(() =>
      puntosSparkline([...seriePorDia(filasPeriodo.value, rangoDias.value, 'created_at').values()])
    );
    const sparkResueltos = computed(() =>
      puntosSparkline([...seriePorDia(resueltosPeriodo.value, rangoDias.value, 'fecha_cierre').values()])
    );

    // ── Distribución por departamento responsable ───────────────────────────
    // La pregunta que más hace una jefatura —"¿cuánto me toca a mí?"— no tenía
    // respuesta en ninguna pantalla.
    const porDepartamento = computed(() => {
      const cuenta = new Map();
      filasPeriodo.value.forEach((f) => {
        const id = f.departamento_actual_id;
        if (!id) return;
        cuenta.set(id, (cuenta.get(id) || 0) + 1);
      });
      const orden = [...cuenta.entries()]
        .map(([id, total]) => ({ id, total, nombre: nombreDepartamento(id) || `Depto. ${id}` }))
        .sort((a, b) => b.total - a.total);

      // Más de seis porciones en una dona es ruido: se agrupa la cola.
      if (orden.length <= 6) return orden;
      const cabeza = orden.slice(0, 6);
      const resto = orden.slice(6).reduce((s, d) => s + d.total, 0);
      return [...cabeza, { id: 'otros', nombre: `Otros (${orden.length - 6})`, total: resto }];
    });

    // ── Semáforo territorial por distrito ───────────────────────────────────
    // Los datos vienen agregados de `v_kpis_distrito`; aquí solo se les da
    // forma de barra. El nivel lo decide `semaforo()` del store de territorio,
    // que es la misma regla que usa la consola del mapa: si cada pantalla
    // definiera su propio umbral, el mismo distrito saldría en ámbar en una y
    // en rojo en otra.
    const porDistrito = computed(() =>
      distritosDelAmbito.value
        .map((k) => ({
          id: k.distrito_id,
          nombre: k.distrito_nombre || `Distrito ${k.distrito_id}`,
          total: k.total,
          vencidos: k.fuera_de_objetivo,
          criticas: k.criticas_abiertas,
          pct: k.total > 0 ? Math.round((k.fuera_de_objetivo / k.total) * 100) : 0,
          nivel: semaforo(k),
        }))
        .sort((a, b) => b.pct - a.pct)
    );

    // `semaforo()` puede devolver 'neutro' (distrito sin casos) y para ese nivel
    // no hay token en tokens.css. Sin este mapeo la barra se quedaría con
    // `background: var(--semaforo-neutro)` — una variable inexistente, que el
    // navegador descarta en silencio dejando la barra transparente.
    const colorSemaforo = (nivel) =>
      nivel === 'neutro' ? 'var(--kpi-neutro)' : `var(--semaforo-${nivel})`;

    const incidentesPrioritarios = computed(() => {
      const lista = denuncias.value || [];
      return lista
        .filter(d => d.estado === 'pendiente')
        .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
        .slice(0, 10);
    });

    function etiquetaDia(clave) {
      const [a, m, d] = clave.split('-').map(Number);
      return new Date(a, m - 1, d).toLocaleDateString('es-SV', { month: 'short', day: 'numeric' });
    }

    // ── Gráficas ────────────────────────────────────────────────────────────
    function dibujarTendencia() {
      if (!canvasTendencia.value) return;
      if (chartTendencia) { chartTendencia.destroy(); chartTendencia = null; }

      const entradas = seriePorDia(filasPeriodo.value, rangoDias.value, 'created_at');
      const cierres  = seriePorDia(resueltosPeriodo.value, rangoDias.value, 'fecha_cierre');
      const labels = [...entradas.keys()].map(etiquetaDia);

      const textColor = isDarkMode.value ? '#9ca3af' : '#6b7280';
      const gridColor = isDarkMode.value ? '#374151' : '#f3f4f6';
      const serieEntradas = colorDeVariable('--serie-1', '#3b82f6');
      const serieCierres  = colorDeVariable('--kpi-resuelta', '#10b981');

      const dataset = (label, datos, color, relleno) => ({
        label,
        data: datos,
        borderColor: color,
        backgroundColor: relleno
          ? `color-mix(in srgb, ${color} ${isDarkMode.value ? 20 : 12}%, transparent)`
          : 'transparent',
        borderWidth: 3,
        pointBackgroundColor: isDarkMode.value ? '#1f2937' : '#fff',
        pointBorderColor: color,
        pointBorderWidth: 2,
        pointRadius: labels.length > 14 ? 0 : 4,
        pointHoverRadius: 6,
        fill: relleno,
        tension: 0.4,
      });

      chartTendencia = new Chart(canvasTendencia.value, {
        type: 'line',
        data: {
          labels,
          datasets: [
            dataset('Ingresadas', [...entradas.values()], serieEntradas, true),
            dataset('Resueltas',  [...cierres.values()],  serieCierres,  false),
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              display: true, position: 'bottom',
              labels: { color: textColor, usePointStyle: true, pointStyle: 'circle', boxWidth: 8, padding: 16 },
            },
          },
          scales: {
            y: { beginAtZero: true, grid: { borderDash: [4, 4], color: gridColor }, ticks: { precision: 0, color: textColor } },
            x: { grid: { display: false }, ticks: { color: textColor, maxRotation: 0, autoSkip: true } },
          },
          interaction: { mode: 'index', intersect: false },
        },
      });
    }

    function dibujarDona() {
      if (!canvasDona.value) return;
      if (chartDona) { chartDona.destroy(); chartDona = null; }

      const datos = porDepartamento.value;
      if (!datos.length) return;

      const colores = Array.from({ length: 10 }, (_, i) =>
        colorDeVariable(`--serie-${i + 1}`, '#6b7280')
      );

      chartDona = new Chart(canvasDona.value, {
        type: 'doughnut',
        data: {
          labels: datos.map((d) => d.nombre),
          datasets: [{
            data: datos.map((d) => d.total),
            backgroundColor: datos.map((_, i) => colores[i % colores.length]),
            borderWidth: 0,
            hoverOffset: 6,
          }],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          cutout: '62%',
          plugins: { legend: { display: false } },
        },
      });
    }

    function dibujarGraficas() {
      dibujarTendencia();
      dibujarDona();
    }

    function cambiarRango(dias) {
      if (dias === rangoDias.value) return;
      cargarAnalitica(dias);
    }

    function verDetalle(denuncia) {
      console.log('Ver detalle:', denuncia);
    }

    onMounted(() => {
      actualizarReloj();
      relojInterval = setInterval(actualizarReloj, 60000);
      cargarKpis();
      cargarAnalitica(rangoDias.value);
      cargarKpisDistrito();
      // La dona traduce `departamento_actual_id` a nombre. Solo si el catálogo
      // aún no está: lo carga también el arranque de la app, y repetir la
      // consulta en cada visita al dashboard es gasto sin motivo.
      if (!departamentos.value.length) cargarDepartamentos();
    });

    onUnmounted(() => {
      if (relojInterval) clearInterval(relojInterval);
      if (chartTendencia) chartTendencia.destroy();
      if (chartDona) chartDona.destroy();
    });

    // Se incluye la paleta: el <canvas> ya está pintado cuando cambia el color,
    // así que sin redibujar el gráfico conservaría el color anterior hasta que
    // algo más lo forzara. `nextTick` deja que el store publique las variables
    // CSS antes de leerlas.
    watch(
      [filasAnalitica, isDarkMode, departamentos, () => config.value.colores?.graficos?.[0]],
      () => { nextTick(() => dibujarGraficas()); },
      { deep: false }
    );

    return {
      // datos
      metricas, kpis, incidentesPrioritarios,
      porDepartamento, porDistrito, cargandoDistritos, errorDistritos,
      sparkNuevos, sparkResueltos,
      rangoDias, RANGOS, cargandoAnalitica, analiticaTruncada,
      // helpers
      colorDeTipo, iconoDeTipo, tiempoRelativo, fechaHoraActual, colorSemaforo,
      cambiarRango, verDetalle,
      // refs de canvas
      canvasTendencia, canvasDona,
    };
  }
};
