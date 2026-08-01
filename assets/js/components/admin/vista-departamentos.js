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
    // Estado de la escritura. Sin `guardando` el usuario puede pulsar dos veces
    // y crear el departamento duplicado; sin `errorGuardado` un fallo de RLS se
    // traga en silencio y el modal se cierra como si hubiera funcionado.
    const guardando = ref(false);
    const errorGuardado = ref('');

    /* ─── Stores ─── */
    const {
      departamentos, direcciones,
      cargarDepartamentos, cargarDirecciones,
      guardarDepartamento, desactivarDepartamento,
    } = useCatalogos();

    /* ─── Computeds ─── */
    const departamentosFiltrados = computed(() => {
      return departamentos.value.filter(departamento => {
        const nombre = departamento.nombre || '';
        const codigo = departamento.codigo || '';
        const direccion = departamento.direcciones_administrativas?.nombre || '';
        
        const coincideBusqueda = nombre.toLowerCase().includes(filtroBusqueda.value.toLowerCase()) ||
                                codigo.toLowerCase().includes(filtroBusqueda.value.toLowerCase());
        
        const coincideDireccion = !filtroDireccion.value || direccion === filtroDireccion.value;
        const coincideEstado = !filtroEstado.value || departamento.estado === filtroEstado.value;
        
        return coincideBusqueda && coincideDireccion && coincideEstado;
      });
    });

    const totalDepartamentos = computed(() => departamentos.value.length);
    const departamentosActivos = computed(() => departamentos.value.filter(d => d.estado === 'activo').length);
    const departamentosInactivos = computed(() => departamentos.value.filter(d => d.estado === 'inactivo').length);
    
    // El filtro salía de los nombres presentes en la lista cargada, así que una
    // dirección sin departamentos no aparecía. Ahora sale del catálogo real.
    const direccionesDisponibles = computed(() =>
      direcciones.value.length
        ? direcciones.value.map((d) => d.nombre)
        : Array.from(new Set(
            departamentos.value
              .map((d) => d.direcciones_administrativas?.nombre)
              .filter(Boolean)
          )).sort()
    );

    /* ─── Funciones ─── */
    const limpiarFiltros = () => {
      filtroBusqueda.value = '';
      filtroDireccion.value = '';
      filtroEstado.value = '';
    };

    const abrirModalEditar = (departamento) => {
      errorGuardado.value = '';
      // El formulario editaba `codigo_direccion`, un campo que no existe: la
      // columna real es `direccion_id` (FK a direcciones_administrativas).
      departamentoSeleccionado.value = departamento
        ? { ...departamento, direccion_id: departamento.direccion_id ?? '' }
        : { id: null, codigo: '', nombre: '', direccion_id: '', estado: 'activo' };
      modalEditar.value = true;
    };

    const abrirModalEliminar = (departamento) => {
      errorGuardado.value = '';
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

    const guardarCambiosDepartamento = async () => {
      if (guardando.value) return;          // doble clic = departamento duplicado
      guardando.value = true;
      errorGuardado.value = '';
      const res = await guardarDepartamento(departamentoSeleccionado.value);
      guardando.value = false;
      if (res.ok) cerrarModalEditar();
      else errorGuardado.value = res.error;  // el modal sigue abierto con los datos
    };

    // "Eliminar" es desactivar. Ver el comentario de `desactivarDepartamento`
    // en el store: hay cuatro tablas con FK hacia departamentos.
    const eliminarDepartamento = async () => {
      if (guardando.value) return;
      guardando.value = true;
      errorGuardado.value = '';
      const res = await desactivarDepartamento(departamentoSeleccionado.value.id);
      guardando.value = false;
      if (res.ok) cerrarModalEliminar();
      else errorGuardado.value = res.error;
    };

    /* ─── Ciclo de vida ─── */
    onMounted(() => {
      // Las direcciones alimentan el selector del modal y el filtro; se piden en
      // paralelo porque ninguna depende de la otra.
      Promise.all([cargarDepartamentos(), cargarDirecciones()])
        .finally(() => { cargando.value = false; });
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
      guardando,
      errorGuardado,

      // Stores
      departamentos,
      direcciones,

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
