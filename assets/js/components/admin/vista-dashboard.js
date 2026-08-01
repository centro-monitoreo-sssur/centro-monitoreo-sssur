// Vista Dashboard Ejecutivo: Vista limpia con KPIs, gráfica de tendencia y lista de pendientes.
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from '../../core/vue.js';
import { Chart } from '../../core/libs.js';
import { useDenuncias } from '../../stores/denuncias.js';
import { useCatalogos } from '../../stores/catalogos.js';
import { useNavegacion } from '../../stores/navegacion.js';
import { useDashboard } from '../../stores/dashboard.js';
import { useConfiguracion } from '../../stores/configuracion.js';

// Chart.js necesita el color como valor, no como `var(--serie-1)`: pinta sobre
// un <canvas>, donde las variables CSS no se resuelven. Se leen del elemento
// raíz en el momento de dibujar.
function colorDeVariable(nombre, respaldo) {
  if (typeof window === 'undefined') return respaldo;
  const valor = getComputedStyle(document.documentElement).getPropertyValue(nombre).trim();
  return valor || respaldo;
}

export default {
  setup() {
    const { denuncias, nombreDeTipo, colorDeTipo } = useDenuncias();
    const { iconoDeTipo } = useCatalogos();
    const { isDarkMode } = useNavegacion();
    const { kpis, cargarKpis } = useDashboard();
    const { config } = useConfiguracion();

    const canvasTendencia = ref(null);
    const canvasTendenciaMobile = ref(null);
    const fechaHoraActual = ref('');
    let chartTendencia = null;
    let chartTendenciaMobile = null;
    let relojInterval = null;

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

    // Si Supabase devolvió KPIs exactos, usarlos; si no, calcular desde filas cargadas
    const dashboardMetricas = computed(() => {
      // Priorizar kpis exactos del store (count=exact en Supabase)
      if (kpis.value.total > 0) return kpis.value;
      // Fallback: calcular desde filas demo
      const lista = denuncias.value || [];
      const total = lista.length;
      const pendientes = lista.filter(d => d.estado === 'pendiente' || d.estado === 'recibida' || d.estado === 'asignada').length;
      const resueltas = lista.filter(d => d.estado === 'resuelta' || d.estado === 'cerrada').length;
      const enCurso = lista.filter(d => d.estado === 'en_atencion' || d.estado === 'en_revision' || d.estado === 'en_obra').length;
      const tasaResolucion = total > 0 ? Math.round((resueltas / total) * 100) : 0;
      return { total, pendientes, enCurso, resueltas, tasaResolucion, empleadosActivos: 0 };
    });

    const incidentesPrioritarios = computed(() => {
      const lista = denuncias.value || [];
      return lista
        .filter(d => d.estado === 'pendiente')
        .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
        .slice(0, 10);
    });

    function tiempoRelativo(fecha) {
      const ahora = new Date();
      const fechaObj = new Date(fecha);
      const diffMs = ahora - fechaObj;
      const diffMin = Math.floor(diffMs / 60000);
      const diffHoras = Math.floor(diffMs / 3600000);
      const diffDias = Math.floor(diffMs / 86400000);

      if (diffMin < 1) return 'ahora';
      if (diffMin < 60) return `${diffMin} min`;
      if (diffHoras < 24) return `${diffHoras} h`;
      return `${diffDias} días`;
    }

    function dibujarGrafica(canvasRef, chartInstance) {
      const lista = denuncias.value || [];
      if (!canvasRef.value) return null;

      if (chartInstance) chartInstance.destroy();

      const dias = {};
      const hoy = new Date();
      for (let i = 6; i >= 0; i--) {
        const d = new Date(hoy);
        d.setDate(d.getDate() - i);
        const fechaStr = d.toLocaleDateString('es-SV', { month: 'short', day: 'numeric' });
        dias[fechaStr] = 0;
      }

      lista.forEach(d => {
        const fechaObj = new Date(d.created_at);
        const fechaStr = fechaObj.toLocaleDateString('es-SV', { month: 'short', day: 'numeric' });
        if (dias[fechaStr] !== undefined) {
          dias[fechaStr]++;
        }
      });

      const labels = Object.keys(dias);
      const data = Object.values(dias);

      const textColor = isDarkMode.value ? '#9ca3af' : '#6b7280';
      const gridColor = isDarkMode.value ? '#374151' : '#f3f4f6';
      // Primera serie de la paleta configurable.
      const serie = colorDeVariable('--serie-1', '#001ba0');

      return new Chart(canvasRef.value, {
        type: 'line',
        data: {
          labels,
          datasets: [{
            label: 'Incidentes',
            data,
            borderColor: serie,
            // Relleno derivado del mismo color en vez de un rgba fijo: si no,
            // al cambiar la paleta la línea y su sombra dejarían de casar.
            backgroundColor: `color-mix(in srgb, ${serie} ${isDarkMode.value ? 20 : 12}%, transparent)`,
            borderWidth: 3,
            pointBackgroundColor: isDarkMode.value ? '#1f2937' : '#fff',
            pointBorderColor: serie,
            pointBorderWidth: 2,
            pointRadius: 4,
            pointHoverRadius: 6,
            fill: true,
            tension: 0.4
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            y: { beginAtZero: true, grid: { borderDash: [4, 4], color: gridColor }, ticks: { precision: 0, color: textColor } },
            x: { grid: { display: false }, ticks: { color: textColor } }
          },
          interaction: { mode: 'index', intersect: false }
        }
      });
    }

    function dibujarGraficas() {
      chartTendencia = dibujarGrafica(canvasTendencia, chartTendencia);
      chartTendenciaMobile = dibujarGrafica(canvasTendenciaMobile, chartTendenciaMobile);
    }

    function verDetalle(denuncia) {
      console.log('Ver detalle:', denuncia);
    }

    onMounted(() => {
      actualizarReloj();
      relojInterval = setInterval(actualizarReloj, 60000);
      nextTick(() => dibujarGraficas());
      cargarKpis(); // KPIs exactos desde Supabase
    });

    onUnmounted(() => {
      if (relojInterval) clearInterval(relojInterval);
      if (chartTendencia) chartTendencia.destroy();
      if (chartTendenciaMobile) chartTendenciaMobile.destroy();
    });

    // Se incluye la paleta: el <canvas> ya está pintado cuando cambia el color,
    // así que sin redibujar el gráfico conservaría el color anterior hasta que
    // algo más lo forzara. `nextTick` deja que el store publique las variables
    // CSS antes de leerlas.
    watch(
      [() => denuncias.value.length, isDarkMode, () => config.value.colores?.graficos?.[0]],
      () => { nextTick(() => dibujarGraficas()); }
    );

    return {
      dashboardMetricas, incidentesPrioritarios, kpis,
      nombreDeTipo, colorDeTipo, iconoDeTipo,
      tiempoRelativo, fechaHoraActual, canvasTendencia, canvasTendenciaMobile,
      verDetalle
    };
  }
};
