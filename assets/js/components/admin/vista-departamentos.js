// ============================================================
// VISTA: Departamentos / Unidades Administrativas
// Vista para gestionar los departamentos y unidades del ayuntamiento.
// ============================================================
import { ref, reactive, computed, onMounted, watch } from '../../core/vue.js';
import { useCatalogos } from '../../stores/catalogos.js';

export default {
  setup() {
    /* ─── Estado de UI ─── */
    const cargando = ref(true);
    const filtroBusqueda = ref('');
    const filtroDireccion = ref('');
    const filtroEstado = ref('');
    const departamentoSeleccionado = ref(null);
    const modalEditar = ref(false);
    const modalEliminar = ref(false);
    
    /* ─── Stores ─── */
    const { departamentos, cargarDepartamentos } = useCatalogos();

    /* ─── Computeds ─── */
    const departamentosFiltrados = computed(() => {
      return departamentos.value.filter(departamento => {
        const coincideBusqueda = departamento.nombre_dpto.toLowerCase().includes(filtroBusqueda.value.toLowerCase()) ||
                                departamento.cod_dpto.toLowerCase().includes(filtroBusqueda.value.toLowerCase());
        
        const coincideDireccion = !filtroDireccion.value || departamento.nombre_direccion === filtroDireccion.value;
        const coincideEstado = !filtroEstado.value || departamento.estado === filtroEstado.value;
        
        return coincideBusqueda && coincideDireccion && coincideEstado;
      });
    });

    const totalDepartamentos = computed(() => departamentos.value.length);
    const departamentosActivos = computed(() => departamentos.value.filter(d => d.estado === 'activo').length);
    const departamentosInactivos = computed(() => departamentos.value.filter(d => d.estado === 'inactivo').length);
    
    const direccionesDisponibles = computed(() => {
      const direcciones = new Set();
      departamentos.value.forEach(d => direcciones.add(d.nombre_direccion));
      return Array.from(direcciones).sort();
    });

    /* ─── Funciones ─── */
    const limpiarFiltros = () => {
      filtroBusqueda.value = '';
      filtroDireccion.value = '';
      filtroEstado.value = '';
    };

    const abrirModalEditar = (departamento) => {
      departamentoSeleccionado.value = departamento ? { ...departamento } : {
        id: null,
        cod_dpto: '',
        nombre_dpto: '',
        codigo_direccion: '',
        nombre_direccion: '',
        estado: 'activo'
      };
      modalEditar.value = true;
    };

    const abrirModalEliminar = (departamento) => {
      departamentoSeleccionado.value = { ...departamento };
      modalEliminar.value = true;
    };

    const cerrarModalEditar = () => {
      modalEditar.value = false;
      departamentoSeleccionado.value = null;
    };

    const cerrarModalEliminar = () => {
      modalEliminar.value = false;
      departamentoSeleccionado.value = null;
    };

    const guardarCambiosDepartamento = () => {
      // En un sistema real, esto actualizaría en Supabase
      const indice = departamentos.value.findIndex(d => d.id === departamentoSeleccionado.value.id);
      if (indice !== -1) {
        departamentos.value[indice] = { ...departamentoSeleccionado.value };
      } else {
        // Nuevo departamento
        departamentoSeleccionado.value.id = departamentos.value.length + 1;
        departamentos.value.push(departamentoSeleccionado.value);
      }
      cerrarModalEditar();
    };

    const eliminarDepartamento = () => {
      // En un sistema real, esto eliminaría de Supabase
      departamentos.value = departamentos.value.filter(d => d.id !== departamentoSeleccionado.value.id);
      cerrarModalEliminar();
    };

    /* ─── Ciclo de vida ─── */
    onMounted(() => {
      cargarDepartamentos().then(() => cargando.value = false);
    });

    return {
      // Estado
      cargando,
      filtroBusqueda,
      filtroDireccion,
      filtroEstado,
      departamentoSeleccionado,
      modalEditar,
      modalEliminar,
      
      // Stores
      departamentos,
      
      // Computeds
      departamentosFiltrados,
      totalDepartamentos,
      departamentosActivos,
      departamentosInactivos,
      direccionesDisponibles,
      
      // Funciones
      limpiarFiltros,
      abrirModalEditar,
      abrirModalEliminar,
      cerrarModalEditar,
      cerrarModalEliminar,
      guardarCambiosDepartamento,
      eliminarDepartamento
    };
  },
};
