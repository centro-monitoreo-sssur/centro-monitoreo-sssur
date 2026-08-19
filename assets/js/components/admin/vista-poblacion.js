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

    const OPCIONES_ESTADO = [
      { id: 'activo',    nombre: 'Activo' },
      { id: 'pendiente', nombre: 'Pendiente' },
      { id: 'inactivo',  nombre: 'Inactivo' },
    ];
    const COLUMNAS_TABLA = [
      { clave: 'nombre',        titulo: 'Ciudadano',      ordenable: true },
      { clave: 'distrito',      titulo: 'Distrito',       ordenable: true,  ancho: '160px' },
      { clave: 'estado',        titulo: 'Estado',         ordenable: true,  ancho: '110px' },
      { clave: 'fechaRegistro', titulo: 'Registro',       ordenable: false, ancho: '140px' },
      { clave: 'acciones',      titulo: '',               ordenable: false, ancho: '110px', alineacion: 'centro' },
    ];
    const ciudadanoSeleccionado = ref(null);
    const modalEditar = ref(false);
    const modalEliminar = ref(false);
    const modalVerDetalles = ref(false);
    
    const guardando = ref(false);
    const errorGuardado = ref('');

    /* ─── Stores ─── */
    const {
      poblacion, cargarPoblacion,
      actualizarCiudadano, cambiarEstadoCiudadano,
    } = usePoblacion();

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

    // Reactiva la cuenta. No hay verificación de identidad en la BD —
    // `ciudadanos` no tiene columna `verificado` — así que lo único que este
    // botón puede hacer de verdad es poner `activo = true`.
    const verificarCiudadano = async (ciudadano) => {
      if (guardando.value) return;
      guardando.value = true;
      const res = await cambiarEstadoCiudadano(ciudadano.id, true);
      guardando.value = false;
      if (!res.ok) errorGuardado.value = res.error;
    };

    const guardarCambiosCiudadano = async () => {
      if (guardando.value) return;
      guardando.value = true;
      errorGuardado.value = '';
      const res = await actualizarCiudadano(ciudadanoSeleccionado.value);
      guardando.value = false;
      if (res.ok) cerrarModalEditar();
      else errorGuardado.value = res.error;
    };

    // Baja lógica: `ciudadanos.id` es FK a auth.users y sus denuncias apuntan
    // a esta fila vía `casos.creado_por_ciudadano_id`.
    const eliminarCiudadano = async () => {
      if (guardando.value) return;
      guardando.value = true;
      errorGuardado.value = '';
      const res = await cambiarEstadoCiudadano(ciudadanoSeleccionado.value.id, false);
      guardando.value = false;
      if (res.ok) cerrarModalEliminar();
      else errorGuardado.value = res.error;
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
      guardando,
      errorGuardado,

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
      OPCIONES_ESTADO, COLUMNAS_TABLA,
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
