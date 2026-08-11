// ============================================================
// VISTA: Cuadrillas de Campo
//
// Alta, edición y composición de los equipos operativos. Es requisito de la
// asignación de casos: sin cuadrillas dadas de alta, «asignar cuadrilla» no
// tiene a qué apuntar.
// ============================================================
import { ref, computed, onMounted } from '../../core/vue.js';
import { useCuadrillas } from '../../stores/cuadrillas.js';
import { useCatalogos } from '../../stores/catalogos.js';
import { usePermisos } from '../../stores/permisos.js';

export default {
  setup() {
    /* ─── Stores ─── */
    const {
      cuadrillas, personal, cargando, guardando, error,
      totalCuadrillas, cuadrillasActivas, cuadrillasSinLider, personalAsignado,
      cuadrillasDe,
      cargarCuadrillas, guardarCuadrilla, fijarActivo,
      agregarIntegrante, quitarIntegrante, fijarLider,
    } = useCuadrillas();

    const { departamentos, cargarDepartamentos, nombreDepartamento } = useCatalogos();
    const { puedeCrear, puedeEditar } = usePermisos();

    /* ─── Permisos ───
       La matriz de roles distingue crear de editar: `jefe_area` y
       `jefe_distrito` tienen editar sin crear (v12, v16). La policy de v10 solo
       comprueba 'editar', así que la base les dejaría insertar; aquí se respeta
       la matriz, que es la intención declarada. */
    const puedeCrearCuadrilla = computed(() => puedeCrear('cuadrillas'));
    const puedeEditarCuadrilla = computed(() => puedeEditar('cuadrillas'));

    /* ─── Filtros ─── */
    const filtroBusqueda = ref('');
    const filtroDepartamento = ref('');
    const filtroEstado = ref('');

    const hayFiltros = computed(() =>
      !!(filtroBusqueda.value || filtroDepartamento.value || filtroEstado.value)
    );

    const limpiarFiltros = () => {
      filtroBusqueda.value = '';
      filtroDepartamento.value = '';
      filtroEstado.value = '';
    };

    const cuadrillasFiltradas = computed(() => {
      const texto = filtroBusqueda.value.trim().toLowerCase();
      const depto = filtroDepartamento.value;
      const estado = filtroEstado.value;

      return cuadrillas.value.filter((c) => {
        if (depto && String(c.departamento_id) !== String(depto)) return false;
        if (estado === 'activo' && !c.activo) return false;
        if (estado === 'inactivo' && c.activo) return false;
        if (estado === 'sin_lider' && c.lider) return false;
        if (!texto) return true;
        // La búsqueda alcanza a los integrantes: «¿en qué cuadrilla está
        // Fulano?» es la pregunta más frecuente sobre esta pantalla.
        return (c.nombre || '').toLowerCase().includes(texto)
            || (c.codigo || '').toLowerCase().includes(texto)
            || c.integrantes.some((i) => i.nombre.toLowerCase().includes(texto));
      });
    });

    /* ─── Modal de alta / edición ─── */
    const modalEditar = ref(false);
    const cuadrillaEnEdicion = ref(null);
    const errorFormulario = ref('');

    const abrirModalEditar = (cuadrilla) => {
      errorFormulario.value = '';
      cuadrillaEnEdicion.value = cuadrilla
        ? { ...cuadrilla }
        : { id: null, codigo: '', nombre: '', departamento_id: '', activo: true };
      modalEditar.value = true;
    };

    const cerrarModalEditar = () => {
      modalEditar.value = false;
      cuadrillaEnEdicion.value = null;
    };

    const guardarCambios = async () => {
      if (guardando.value) return;            // doble clic = cuadrilla duplicada
      errorFormulario.value = '';
      const res = await guardarCuadrilla(cuadrillaEnEdicion.value);
      if (res.ok) cerrarModalEditar();
      else errorFormulario.value = res.error;  // el modal sigue abierto con los datos
    };

    /* ─── Panel de composición ─── */
    const modalIntegrantes = ref(false);
    const cuadrillaAbiertaId = ref(null);
    const busquedaPersonal = ref('');
    const errorComposicion = ref('');

    // Se guarda el ID y no el objeto: tras cada cambio el store recarga y
    // reemplaza las filas, así que una referencia al objeto viejo mostraría la
    // composición anterior. El `computed` siempre lee la fila vigente.
    const cuadrillaAbierta = computed(() =>
      cuadrillas.value.find((c) => c.id === cuadrillaAbiertaId.value) || null
    );

    const abrirIntegrantes = (cuadrilla) => {
      errorComposicion.value = '';
      busquedaPersonal.value = '';
      cuadrillaAbiertaId.value = cuadrilla.id;
      modalIntegrantes.value = true;
    };

    const cerrarIntegrantes = () => {
      modalIntegrantes.value = false;
      cuadrillaAbiertaId.value = null;
    };

    /**
     * Personal disponible para añadir: activo, no presente ya en esta cuadrilla
     * y filtrado por el buscador. Se anota a qué otras cuadrillas pertenece cada
     * uno, porque asignar a alguien que ya está en otra es una decisión, no un
     * accidente, y quien administra debe verlo antes de pulsar.
     */
    const personalDisponible = computed(() => {
      const actual = cuadrillaAbierta.value;
      if (!actual) return [];
      const yaEstan = new Set(actual.integrantes.map((i) => i.usuarioId));
      const texto = busquedaPersonal.value.trim().toLowerCase();

      return personal.value
        .filter((u) => !yaEstan.has(u.id))
        .filter((u) => !texto
          || u.nombreCompleto.toLowerCase().includes(texto)
          || (u.username || '').toLowerCase().includes(texto))
        .map((u) => {
          const otras = cuadrillasDe(u.id);
          return {
            ...u,
            otrasCuadrillas: otras.length,
            // Solo el nombre de la primera: la etiqueta es un aviso, no un informe.
            nombreOtra: otras.length
              ? (cuadrillas.value.find((c) => c.id === otras[0])?.nombre || '')
              : '',
          };
        })
        .slice(0, 40);   // el selector es para buscar, no para hojear 200 fichas
    });

    const anadir = async (usuarioId) => {
      errorComposicion.value = '';
      const res = await agregarIntegrante(cuadrillaAbiertaId.value, usuarioId);
      if (!res.ok) errorComposicion.value = res.error;
    };

    const quitar = async (usuarioId) => {
      errorComposicion.value = '';
      const res = await quitarIntegrante(cuadrillaAbiertaId.value, usuarioId);
      if (!res.ok) errorComposicion.value = res.error;
    };

    const alternarLider = async (integrante) => {
      errorComposicion.value = '';
      const res = await fijarLider(
        cuadrillaAbiertaId.value, integrante.usuarioId, !integrante.esLider
      );
      if (!res.ok) errorComposicion.value = res.error;
    };

    /* ─── Activar / desactivar ─── */
    const modalEstado = ref(false);
    const cuadrillaParaEstado = ref(null);
    const errorEstado = ref('');

    const abrirModalEstado = (cuadrilla) => {
      errorEstado.value = '';
      cuadrillaParaEstado.value = { ...cuadrilla };
      modalEstado.value = true;
    };

    const cerrarModalEstado = () => {
      modalEstado.value = false;
      cuadrillaParaEstado.value = null;
    };

    const confirmarCambioDeEstado = async () => {
      if (guardando.value) return;
      errorEstado.value = '';
      const objetivo = cuadrillaParaEstado.value;
      const res = await fijarActivo(objetivo.id, !objetivo.activo);
      if (res.ok) cerrarModalEstado();
      else errorEstado.value = res.error;
    };

    /* ─── Presentación ─── */
    const nombreDelDepartamento = (id) => nombreDepartamento(id) || 'Sin departamento';

    const formatearFecha = (iso) => {
      if (!iso) return '—';
      const d = new Date(iso);
      return Number.isNaN(d.getTime())
        ? '—'
        : d.toLocaleDateString('es-SV', { day: '2-digit', month: 'short', year: 'numeric' });
    };

    /* ─── Ciclo de vida ─── */
    onMounted(() => {
      // Ninguna depende de la otra: los departamentos alimentan el selector del
      // formulario y el filtro.
      Promise.all([cargarCuadrillas(), cargarDepartamentos()]);
    });

    return {
      // Estado
      cargando, guardando, error,
      filtroBusqueda, filtroDepartamento, filtroEstado, hayFiltros,
      modalEditar, cuadrillaEnEdicion, errorFormulario,
      modalIntegrantes, cuadrillaAbierta, busquedaPersonal, errorComposicion,
      modalEstado, cuadrillaParaEstado, errorEstado,

      // Datos
      cuadrillas, departamentos, cuadrillasFiltradas, personalDisponible,

      // Indicadores
      totalCuadrillas, cuadrillasActivas, cuadrillasSinLider, personalAsignado,

      // Permisos
      puedeCrearCuadrilla, puedeEditarCuadrilla,

      // Acciones
      limpiarFiltros,
      abrirModalEditar, cerrarModalEditar, guardarCambios,
      abrirIntegrantes, cerrarIntegrantes, anadir, quitar, alternarLider,
      abrirModalEstado, cerrarModalEstado, confirmarCambioDeEstado,

      // Presentación
      nombreDelDepartamento, formatearFecha,
    };
  },
};
