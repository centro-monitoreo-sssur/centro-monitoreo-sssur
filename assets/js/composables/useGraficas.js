// ============================================================
// COMPOSABLE: gráficas de Reportes (Chart.js).
// Recibe los refs de los canvas y redibuja cuando cambian los datos del
// store de reportes. La instancia vive fuera del scope reactivo de Vue.
// ============================================================
import { watch, nextTick } from '../core/vue.js';
import { useReportes } from '../stores/reportes.js';
import { useCatalogos } from '../stores/catalogos.js';
import { graficarBarrasHorizontales, graficarDistribucion, graficarLineaTiempo } from '../services/graficas.js';

let chartBarrasHorizontales = null;
let chartDonaDistrito = null;
let chartLineaTiempo = null;

const DISTRITOS = ['San Marcos', 'Santo Tomás', 'Santiago Texacuangos', 'Panchimalco', 'Rosario de Mora'];

export function useGraficas(canvasBarrasHorizontalesRef, canvasDonaDistritoRef, canvasLineaTiempoRef) {
  const { denunciasParaReporte } = useReportes();
  const { tiposDenuncia } = useCatalogos();

  function redibujar() {
    const lista = denunciasParaReporte.value;

    // Datos para barras horizontales (Top Tipos - ordenado descendente)
    const datosPorTipo = tiposDenuncia.value.map((t) => ({
      nombre: t.nombre,
      cantidad: lista.filter((d) => d.tipo_id === t.id).length,
      color: t.color_hex
    })).sort((a, b) => b.cantidad - a.cantidad).slice(0, 8); // Top 8

    // Datos para dona por distrito
    const datosPorDistrito = DISTRITOS.map(d => lista.filter(den => 
      den.direccion && den.direccion.includes(d)
    ).length);
    const coloresDistrito = ['#6366f1', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981'];

    // Datos para línea de tiempo (últimos 7 días)
    const datosTiempo = [];
    const etiquetasTiempo = [];
    for (let i = 6; i >= 0; i--) {
      const fecha = new Date();
      fecha.setDate(fecha.getDate() - i);
      const fechaStr = fecha.toISOString().split('T')[0];
      const cantidad = lista.filter(d => d.created_at.startsWith(fechaStr)).length;
      datosTiempo.push(cantidad);
      etiquetasTiempo.push(fecha.toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric' }));
    }

    nextTick(() => {
      if (!canvasBarrasHorizontalesRef.value || !canvasDonaDistritoRef.value || !canvasLineaTiempoRef.value) return;

      // Barras horizontales
      if (chartBarrasHorizontales) chartBarrasHorizontales.destroy();
      chartBarrasHorizontales = graficarBarrasHorizontales(
        canvasBarrasHorizontalesRef.value,
        datosPorTipo.map(d => d.nombre),
        datosPorTipo.map(d => d.cantidad),
        datosPorTipo.map(d => d.color)
      );

      // Dona por distrito
      if (chartDonaDistrito) chartDonaDistrito.destroy();
      chartDonaDistrito = graficarDistribucion(
        canvasDonaDistritoRef.value,
        DISTRITOS,
        datosPorDistrito,
        coloresDistrito
      );

      // Línea de tiempo
      if (chartLineaTiempo) chartLineaTiempo.destroy();
      chartLineaTiempo = graficarLineaTiempo(
        canvasLineaTiempoRef.value,
        etiquetasTiempo,
        datosTiempo
      );
    });
  }

  watch(denunciasParaReporte, () => redibujar());

  return { redibujar };
}
