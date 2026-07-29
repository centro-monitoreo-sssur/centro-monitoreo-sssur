// ============================================================
// COMPONENTE: Intervenciones Activas
// Panel Kanban y vista de lista para seguimiento de cuadrillas y obras.
// ============================================================
import { ref, computed } from '../../core/vue.js';
import { useCatalogos } from '../../stores/catalogos.js';

export default {
  name: 'vista-intervenciones',
  setup() {
    const { tiposDenuncia } = useCatalogos();

    const vistaModo = ref('kanban'); // 'kanban' o 'lista'
    
    // Mock de intervenciones
    const intervenciones = ref([
      { id: 101, titulo: 'Reparación de bache profundo', ubicacion: 'Bulevar Venezuela frente a gasolinera', area: 'Obras', estado: 'pendiente', progreso: 0, fecha: '2026-07-16' },
      { id: 102, titulo: 'Retiro de árbol caído', ubicacion: 'Carretera Panamericana km 12', area: 'P. Civil', estado: 'en_progreso', progreso: 60, fecha: '2026-07-15', personal: 'Cuadrilla Delta' },
      { id: 103, titulo: 'Cambio de luminarias', ubicacion: 'Colonia Escalón, calle Los Sisimiles', area: 'Alumbrado', estado: 'en_progreso', progreso: 30, fecha: '2026-07-15', personal: 'Brigada Eléctrica 2' },
      { id: 104, titulo: 'Limpieza de promontorio', ubicacion: 'Pasaje 4, Colonia San Benito', area: 'Aseo', estado: 'pendiente', progreso: 0, fecha: '2026-07-16' },
      { id: 105, titulo: 'Reparación de calle finalizada', ubicacion: 'Colonia Modelo, calle principal', area: 'Obras', estado: 'completado', progreso: 100, fecha: '2026-07-13', personal: 'Cuadrilla Alfa' },
      { id: 106, titulo: 'Cuadrilla CAM en sitio', ubicacion: 'Residencial San Luis, bloque 3', area: 'CAM', estado: 'en_progreso', progreso: 85, fecha: '2026-07-15', personal: 'Agentes CAM' },
    ]);

    const columnas = [
      { id: 'pendiente', label: 'Pendientes por Asignar', color: 'border-rose-500', bg: 'bg-rose-50 dark:bg-rose-900/10' },
      { id: 'en_progreso', label: 'En Progreso (En Sitio)', color: 'border-amber-500', bg: 'bg-amber-50 dark:bg-amber-900/10' },
      { id: 'completado', label: 'Completado', color: 'border-emerald-500', bg: 'bg-emerald-50 dark:bg-emerald-900/10' }
    ];

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
    function abrirDetalle(inv) {
      intervencionSeleccionada.value = inv;
    }
    function cerrarDetalle() {
      intervencionSeleccionada.value = null;
    }

    return {
      vistaModo, intervenciones, columnas,
      getAreaColor, getAreaIcon,
      intervencionSeleccionada, abrirDetalle, cerrarDetalle
    };
  }
};
