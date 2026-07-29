// Vista Reportes: panel de filtros dinámicos, métricas y gráficas integradas vía `useGraficas`.
import { ref, nextTick } from '../../core/vue.js';
import { useReportes } from '../../stores/reportes.js';
import { useCatalogos } from '../../stores/catalogos.js';
import { useGraficas } from '../../composables/useGraficas.js';
import { badgeEstado, etiquetaEstado } from '../../utils/badge.js';

export default {
  setup() {
    const {
      filtroEstadoReporte, filtroTipoReporte, fechaMinReporte, fechaMaxReporte,
      restablecerFiltrosReporte, reporteMetricas, estadosPosibles,
    } = useReportes();
    const { tiposDenuncia } = useCatalogos();

    const canvasBarrasHorizontales = ref(null);
    const canvasDonaDistrito = ref(null);
    const canvasLineaTiempo = ref(null);
    const { redibujar } = useGraficas(canvasBarrasHorizontales, canvasDonaDistrito, canvasLineaTiempo);

    nextTick(() => redibujar());

    return {
      filtroEstadoReporte, filtroTipoReporte, fechaMinReporte, fechaMaxReporte,
      restablecerFiltrosReporte, reporteMetricas, estadosPosibles, tiposDenuncia,
      canvasBarrasHorizontales, canvasDonaDistrito, canvasLineaTiempo, badgeEstado, etiquetaEstado,
    };
  },
};
