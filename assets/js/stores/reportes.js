// ============================================================
// STORE: reportes
// Filtros propios de la vista Reportes + métricas derivadas (computed) a
// partir de las denuncias del store correspondiente.
// ============================================================
import { ref, computed } from '../core/vue.js';
import { useDenuncias } from './denuncias.js';
import { estadosPosibles, etiquetaEstado } from '../utils/badge.js';

const filtroEstadoReporte = ref(null);
const filtroTipoReporte = ref(null);
const fechaMinReporte = ref('');
const fechaMaxReporte = ref('');

function restablecerFiltrosReporte() {
  filtroEstadoReporte.value = null;
  filtroTipoReporte.value = null;
  fechaMinReporte.value = '';
  fechaMaxReporte.value = '';
}

const { denuncias } = useDenuncias();

const denunciasParaReporte = computed(() =>
  denuncias.value.filter((d) => {
    if (filtroEstadoReporte.value && d.estado !== filtroEstadoReporte.value) return false;
    if (filtroTipoReporte.value && d.tipo_id !== filtroTipoReporte.value) return false;
    const f = new Date(d.created_at);
    if (fechaMinReporte.value && f < new Date(fechaMinReporte.value)) return false;
    if (fechaMaxReporte.value && f > new Date(fechaMaxReporte.value + 'T23:59:59')) return false;
    return true;
  })
);

const reporteMetricas = computed(() => {
  const lista = denunciasParaReporte.value;
  const resueltas = lista.filter((d) => d.estado === 'resuelta').length;
  const pendientes = lista.filter((d) => d.estado === 'pendiente').length;
  return {
    total: lista.length,
    enObra: lista.filter((d) => d.estado === 'en_obra').length,
    resueltas,
    pendientes,
    tasaResolucion: lista.length ? Math.round((resueltas / lista.length) * 100) : 0,
  };
});

export function useReportes() {
  return {
    filtroEstadoReporte, filtroTipoReporte, fechaMinReporte, fechaMaxReporte,
    restablecerFiltrosReporte, denunciasParaReporte, reporteMetricas,
    estadosPosibles, etiquetaEstado,
  };
}
