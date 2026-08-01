// ============================================================
// COMPOSABLE: gráficas de Reportes (Chart.js).
// Recibe los refs de los canvas y redibuja cuando cambian los datos del
// store de reportes. La instancia vive fuera del scope reactivo de Vue.
// ============================================================
import { watch, nextTick } from '../core/vue.js';
import { useReportes } from '../stores/reportes.js';
import { useCatalogos } from '../stores/catalogos.js';
import { useConfiguracion } from '../stores/configuracion.js';
import { graficarBarrasHorizontales, graficarDistribucion, graficarLineaTiempo } from '../services/graficas.js';

let chartBarrasHorizontales = null;
let chartDonaDistrito = null;
let chartLineaTiempo = null;



export function useGraficas(canvasBarrasHorizontalesRef, canvasDonaDistritoRef, canvasLineaTiempoRef) {
  const { denunciasParaReporte } = useReportes();
  const { tiposDenuncia } = useCatalogos();
  const { config } = useConfiguracion();

  function redibujar() {
    const lista = denunciasParaReporte.value;

    // Datos para barras horizontales (Top Tipos - ordenado descendente)
    const datosPorTipo = tiposDenuncia.value.map((t) => ({
      nombre: t.nombre,
      cantidad: lista.filter((d) => d.tipo_id === t.id).length,
      color: t.color_hex
    })).sort((a, b) => b.cantidad - a.cantidad).slice(0, 8); // Top 8

    // Datos para dona por distrito (agrupados dinámicamente por la propiedad direccion_distrito o direccion)
    const distritosMap = {};
    lista.forEach(den => {
      // Intentar usar direccion_distrito o extraer de direccion. Para el mock asume que direccion tiene el nombre.
      const dist = den.direccion_distrito || (den.direccion ? den.direccion.split(',')[0] : 'Desconocido');
      if (!distritosMap[dist]) distritosMap[dist] = 0;
      distritosMap[dist]++;
    });
    
    // Obtener array ordenado de distritos por cantidad (opcional) o alfabético
    const nombresDistritos = Object.keys(distritosMap).sort();
    const datosPorDistrito = nombresDistritos.map(d => distritosMap[d]);
    // Paleta de series configurable (Configuración → Apariencia). El respaldo
    // cubre el arranque, antes de que el store haya resuelto la configuración.
    const coloresBase = config.value.colores?.graficos?.length
      ? config.value.colores.graficos
      : ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ef4444', '#06b6d4', '#ec4899', '#84cc16', '#f97316', '#6366f1'];
    const coloresDistrito = nombresDistritos.map((_, i) => coloresBase[i % coloresBase.length]);

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
        nombresDistritos.length > 0 ? nombresDistritos : ['Sin datos'],
        datosPorDistrito.length > 0 ? datosPorDistrito : [1],
        nombresDistritos.length > 0 ? coloresDistrito : ['#e5e7eb']
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

  // Se observa también la paleta: los tres <canvas> ya están pintados cuando
  // cambia el color, así que sin redibujar conservarían el anterior.
  watch(
    [denunciasParaReporte, () => config.value.colores?.graficos],
    () => redibujar(),
    { deep: true }
  );

  return { redibujar };
}
