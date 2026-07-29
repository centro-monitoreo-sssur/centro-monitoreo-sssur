// ============================================================
// COMPONENTE: Intervenciones Activas
// Panel Kanban y vista de lista para seguimiento de cuadrillas y obras.
// ============================================================
import { ref, computed, onMounted } from '../../core/vue.js';
import { useCatalogos } from '../../stores/catalogos.js';
import { useIntervenciones } from '../../stores/intervenciones.js';

export default {
  name: 'vista-intervenciones',
  setup() {
    const { tiposDenuncia } = useCatalogos();
    const { intervenciones, cargandoIntervenciones, cargarIntervenciones } = useIntervenciones();

    const vistaModo = ref('kanban'); // 'kanban' o 'lista'

    const columnas = [
      { id: 'pendiente',   label: 'Pendientes por Asignar', color: 'border-rose-500',    bg: 'bg-rose-50 dark:bg-rose-900/10' },
      { id: 'en_progreso', label: 'En Progreso (En Sitio)', color: 'border-amber-500',   bg: 'bg-amber-50 dark:bg-amber-900/10' },
      { id: 'completado',  label: 'Completado',             color: 'border-emerald-500', bg: 'bg-emerald-50 dark:bg-emerald-900/10' }
    ];

    const porColumna = (estado) => intervenciones.value.filter(i => i.estado === estado);

    function getAreaColor(area) {
      const cat = (tiposDenuncia.value || []).find(t => t.area === area);
      return cat ? cat.color_hex : '#6b7280';
    }

    function getAreaIcon(area) {
      const cat = (tiposDenuncia.value || []).find(t => t.area === area);
      return cat ? cat.icono : 'fa-wrench';
    }

    // Modal
    const intervencionSeleccionada = ref(null);
    function abrirDetalle(inv) { intervencionSeleccionada.value = inv; }
    function cerrarDetalle() { intervencionSeleccionada.value = null; }

    onMounted(cargarIntervenciones);

    return {
      vistaModo, intervenciones, columnas, cargandoIntervenciones,
      porColumna,
      getAreaColor, getAreaIcon,
      intervencionSeleccionada, abrirDetalle, cerrarDetalle
    };
  }
};
