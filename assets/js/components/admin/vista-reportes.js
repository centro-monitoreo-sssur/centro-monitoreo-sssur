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
      restablecerFiltrosReporte, reporteMetricas, estadosPosibles, denunciasParaReporte
    } = useReportes();
    const { tiposDenuncia, nombreDeTipo } = useCatalogos();

    const canvasBarrasHorizontales = ref(null);
    const canvasDonaDistrito = ref(null);
    const canvasLineaTiempo = ref(null);
    const { redibujar } = useGraficas(canvasBarrasHorizontales, canvasDonaDistrito, canvasLineaTiempo);

    nextTick(() => redibujar());

    const exportarCSV = () => {
      if (!denunciasParaReporte.value || denunciasParaReporte.value.length === 0) {
        alert('No hay datos para exportar con los filtros actuales.');
        return;
      }

      const cabeceras = ['ID', 'Correlativo', 'Fecha de Registro', 'Tipo', 'Estado', 'Distrito', 'Dirección', 'Descripción'];
      const filas = denunciasParaReporte.value.map(d => [
        d.id,
        d.correlativo || '',
        d.created_at ? new Date(d.created_at).toLocaleString() : '',
        nombreDeTipo(d.tipo_id || d.tipo),
        etiquetaEstado(d.estado),
        d.direccion_distrito || (d.direccion ? d.direccion.split(',')[0] : ''),
        `"${(d.direccion || '').replace(/"/g, '""')}"`,
        `"${(d.descripcion || '').replace(/"/g, '""')}"`
      ]);

      const contenidoCSV = [cabeceras.join(','), ...filas.map(f => f.join(','))].join('\n');
      const blob = new Blob(['\uFEFF' + contenidoCSV], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      
      link.setAttribute('href', url);
      link.setAttribute('download', `reporte_incidencias_${new Date().toISOString().split('T')[0]}.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    };

    return {
      filtroEstadoReporte, filtroTipoReporte, fechaMinReporte, fechaMaxReporte,
      restablecerFiltrosReporte, reporteMetricas, estadosPosibles, tiposDenuncia,
      canvasBarrasHorizontales, canvasDonaDistrito, canvasLineaTiempo, badgeEstado, etiquetaEstado,
      exportarCSV
    };
  },
};
