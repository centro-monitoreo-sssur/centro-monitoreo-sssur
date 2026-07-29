// ============================================================
// VISTA: Población Registrada
// Vista para gestionar los ciudadanos registrados en el sistema.
// ============================================================
import { ref, reactive, computed, onMounted, watch } from '../../core/vue.js';
import { usePoblacion } from '../../stores/poblacion.js';
import { formatoFecha } from '../../utils/formato.js';

export default {
  setup() {
    /* ─── Estado de UI ─── */
    const cargando = ref(true);
    const filtroBusqueda = ref('');
    const filtroDistrito = ref('');
    const filtroEstado = ref('');
    const ciudadanoSeleccionado = ref(null);
    const modalEditar = ref(false);
    const modalEliminar = ref(false);
    const modalVerDetalles = ref(false);
    
    /* ─── Stores ─── */
    const { poblacion, cargarPoblacion } = usePoblacion();

    /* ─── Computeds ─── */
    const poblacionFiltrada = computed(() => {
      return poblacion.value.filter(ciudadano => {
        const coincideBusqueda = ciudadano.nombre.toLowerCase().includes(filtroBusqueda.value.toLowerCase()) ||
                                ciudadano.email.toLowerCase().includes(filtroBusqueda.value.toLowerCase()) ||
                                ciudadano.dui.includes(filtroBusqueda.value);
        
        const coincideDistrito = !filtroDistrito.value || ciudadano.distrito === filtroDistrito.value;
        const coincideEstado = !filtroEstado.value || ciudadano.estado === filtroEstado.value;
        
        return coincideBusqueda && coincideDistrito && coincideEstado;
      });
    });

    const totalPoblacion = computed(() => poblacion.value.length);
    const poblacionActiva = computed(() => poblacion.value.filter(c => c.estado === 'activo').length);
    const poblacionPendiente = computed(() => poblacion.value.filter(c => c.estado === 'pendiente').length);
    
    const distritosDisponibles = computed(() => {
      const distritos = new Set();
      poblacion.value.forEach(c => distritos.add(c.distrito));
      return Array.from(distritos).sort();
    });

    /* ─── Funciones ─── */
    const limpiarFiltros = () => {
      filtroBusqueda.value = '';
      filtroDistrito.value = '';
      filtroEstado.value = '';
    };

    const abrirModalVerDetalles = (ciudadano) => {
      ciudadanoSeleccionado.value = { ...ciudadano };
      modalVerDetalles.value = true;
    };

    const abrirModalEditar = (ciudadano) => {
      ciudadanoSeleccionado.value = { ...ciudadano };
      modalEditar.value = true;
    };

    const abrirModalEliminar = (ciudadano) => {
      ciudadanoSeleccionado.value = { ...ciudadano };
      modalEliminar.value = true;
    };

    const cerrarModalVerDetalles = () => {
      modalVerDetalles.value = false;
      ciudadanoSeleccionado.value = null;
    };

    const cerrarModalEditar = () => {
      modalEditar.value = false;
      ciudadanoSeleccionado.value = null;
    };

    const cerrarModalEliminar = () => {
      modalEliminar.value = false;
      ciudadanoSeleccionado.value = null;
    };

    const verificarCiudadano = (ciudadano) => {
      const indice = poblacion.value.findIndex(c => c.id === ciudadano.id);
      if (indice !== -1) {
        poblacion.value[indice].verificado = true;
        poblacion.value[indice].estado = 'activo';
      }
    };

    const guardarCambiosCiudadano = () => {
      // En un sistema real, esto actualizaría en Supabase
      const indice = poblacion.value.findIndex(c => c.id === ciudadanoSeleccionado.value.id);
      if (indice !== -1) {
        poblacion.value[indice] = { ...ciudadanoSeleccionado.value };
      }
      cerrarModalEditar();
    };

    const eliminarCiudadano = () => {
      // En un sistema real, esto eliminaría de Supabase
      poblacion.value = poblacion.value.filter(c => c.id !== ciudadanoSeleccionado.value.id);
      cerrarModalEliminar();
    };

    /* ─── Ciclo de vida ─── */
    onMounted(() => {
      cargarPoblacion().then(() => cargando.value = false);
    });

    return {
      // Estado
      cargando,
      filtroBusqueda,
      filtroDistrito,
      filtroEstado,
      ciudadanoSeleccionado,
      modalEditar,
      modalEliminar,
      modalVerDetalles,
      
      // Stores
      poblacion,
      
      // Computeds
      poblacionFiltrada,
      totalPoblacion,
      poblacionActiva,
      poblacionPendiente,
      distritosDisponibles,
      
      // Funciones
      limpiarFiltros,
      abrirModalVerDetalles,
      abrirModalEditar,
      abrirModalEliminar,
      cerrarModalVerDetalles,
      cerrarModalEditar,
      cerrarModalEliminar,
      verificarCiudadano,
      guardarCambiosCiudadano,
      eliminarCiudadano,
      
      // Helpers
      formatoFecha
    };
  },
};
