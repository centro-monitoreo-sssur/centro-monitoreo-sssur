// Vista Dashboard Ejecutivo: Vista limpia con KPIs, gráfica de tendencia y lista de pendientes.
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from '../../core/vue.js';
import { Chart } from '../../core/libs.js';
import { useDenuncias } from '../../stores/denuncias.js';
import { useCatalogos } from '../../stores/catalogos.js';
import { useNavegacion } from '../../stores/navegacion.js';

export default {
  setup() {
    const { denuncias, nombreDeTipo, colorDeTipo } = useDenuncias();
    const { iconoDeTipo } = useCatalogos();
    const { isDarkMode } = useNavegacion();

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

    const dashboardMetricas = computed(() => {
      const lista = denuncias.value || [];
      const total = lista.length;
      const pendientes = lista.filter(d => d.estado === 'pendiente').length;
      const resueltas = lista.filter(d => d.estado === 'resuelta').length;
      const enCurso = lista.filter(d => ['en_revision', 'en_obra'].includes(d.estado)).length;
      const tasaResolucion = total > 0 ? Math.round((resueltas / total) * 100) : 0;
      return { total, pendientes, enCurso, tasaResolucion };
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

      return new Chart(canvasRef.value, {
        type: 'line',
        data: {
          labels,
          datasets: [{
            label: 'Incidentes',
            data,
            borderColor: '#001ba0',
            backgroundColor: isDarkMode.value ? 'rgba(39, 75, 214, 0.2)' : 'rgba(0, 27, 160, 0.1)',
            borderWidth: 3,
            pointBackgroundColor: isDarkMode.value ? '#1f2937' : '#fff',
            pointBorderColor: isDarkMode.value ? '#3b82f6' : '#001ba0',
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
    });

    onUnmounted(() => {
      if (relojInterval) clearInterval(relojInterval);
      if (chartTendencia) chartTendencia.destroy();
      if (chartTendenciaMobile) chartTendenciaMobile.destroy();
    });

    watch([() => denuncias.value.length, isDarkMode], () => {
      nextTick(() => dibujarGraficas());
    });

    return {
      dashboardMetricas, incidentesPrioritarios,
      nombreDeTipo, colorDeTipo, iconoDeTipo,
      tiempoRelativo, fechaHoraActual, canvasTendencia, canvasTendenciaMobile,
      verDetalle
    };
  }
};
