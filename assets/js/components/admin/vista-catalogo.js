// ============================================================
// VISTA: Catálogo de Categorías
//
// Cada jefatura gestiona los tipos de incidencia de su unidad y declara qué
// más puede atender. Es la pantalla que le faltaba a migration_v26, que ya
// había dejado los permisos, las policies y los triggers puestos.
//
// Dos preguntas distintas, dos pestañas:
//   · Catálogo   → qué tipos de incidencia existen y a qué unidad se enrutan.
//   · Atenciones → qué puede atender MI unidad aunque no sea la responsable.
// ============================================================
import { ref, computed, watch, onMounted } from '../../core/vue.js';
import { useCatalogoCategorias } from '../../stores/catalogo-categorias.js';
import { useCatalogos } from '../../stores/catalogos.js';
import { usePermisos } from '../../stores/permisos.js';
import { useNavegacion } from '../../stores/navegacion.js';

// Iconos frecuentes en un catálogo municipal. Es una ayuda, no un límite: el
// campo acepta cualquier clase de Font Awesome escrita a mano.
const ICONOS_SUGERIDOS = [
  'fa-road', 'fa-person-walking', 'fa-water', 'fa-trash-can', 'fa-lightbulb',
  'fa-tree', 'fa-fire', 'fa-house-crack', 'fa-dog', 'fa-store',
  'fa-shop', 'fa-children', 'fa-file-signature', 'fa-cross', 'fa-circle-dot',
];

const COLORES_SUGERIDOS = [
  '#8b5cf6', '#3b82f6', '#14b8a6', '#f59e0b', '#ef4444',
  '#10b981', '#ec4899', '#6366f1', '#64748b',
];

export default {
  name: 'vista-catalogo',
  setup() {
    /* ─── Stores ─── */
    const {
      categorias, cargando, guardando, error,
      totalCategorias, categoriasActivas, categoriasSinPrioridad,
      atencionesDeDepartamento,
      cargarCatalogo, guardarCategoria, fijarActivoCategoria,
      declararAtencion, fijarPuedeIntervenir, retirarAtencion,
    } = useCatalogoCategorias();

    const {
      departamentos, prioridades,
      cargarDepartamentos, cargarPrioridades, nombreDepartamento,
    } = useCatalogos();

    const { puedeCrear, puedeEditar } = usePermisos();
    const { rolUsuario, departamentoUsuario } = useNavegacion();

    /* ─── Competencias ─── */
    const puedeCrearCategoria = computed(() => puedeCrear('categorias'));
    const puedeEditarCategoria = computed(() => puedeEditar('categorias'));

    // La gerencia ve y gestiona todo; una jefatura, solo lo suyo. No es una
    // decisión de esta pantalla: es lo que hacen cumplir el trigger
    // `trg_categoria_enrutamiento` y la policy `categorias_update_jefatura`.
    // Aquí solo se refleja, para no ofrecer botones que el servidor rechazará.
    const esGerencia = computed(() =>
      rolUsuario.value === 'admin' || rolUsuario.value === 'superadmin'
    );

    /**
     * Departamento sobre el que se está trabajando. Una jefatura tiene el suyo
     * fijo; la gerencia lo elige, porque no pertenece a ninguno y sin selector
     * la pestaña de atenciones estaría vacía para ella.
     */
    const departamentoElegido = ref('');
    const departamentoActivo = computed(() =>
      esGerencia.value ? departamentoElegido.value : (departamentoUsuario.value || '')
    );

    const puedeTocarCategoria = (categoria) => {
      if (!puedeEditarCategoria.value) return false;
      if (esGerencia.value) return true;
      return String(categoria.departamento_responsable_id) === String(departamentoUsuario.value);
    };

    /* ─── Pestañas ─── */
    const pestana = ref('catalogo');       // 'catalogo' | 'atenciones'

    /* ─── Filtros del catálogo ─── */
    const filtroBusqueda = ref('');
    const filtroDepartamento = ref('');
    const filtroEstado = ref('');
    const soloMiUnidad = ref(false);

    const hayFiltros = computed(() =>
      !!(filtroBusqueda.value || filtroDepartamento.value || filtroEstado.value || soloMiUnidad.value)
    );

    const limpiarFiltros = () => {
      filtroBusqueda.value = '';
      filtroDepartamento.value = '';
      filtroEstado.value = '';
      soloMiUnidad.value = false;
    };

    const categoriasFiltradas = computed(() => {
      const texto = filtroBusqueda.value.trim().toLowerCase();
      return categorias.value.filter((c) => {
        if (soloMiUnidad.value
            && String(c.departamento_responsable_id) !== String(departamentoActivo.value)) return false;
        if (filtroDepartamento.value
            && String(c.departamento_responsable_id) !== String(filtroDepartamento.value)) return false;
        if (filtroEstado.value === 'activo' && !c.activo) return false;
        if (filtroEstado.value === 'inactivo' && c.activo) return false;
        if (filtroEstado.value === 'sin_prioridad' && c.prioridad_default_id) return false;
        if (!texto) return true;
        return (c.nombre || '').toLowerCase().includes(texto)
            || (c.codigo || '').toLowerCase().includes(texto)
            || (c.descripcion || '').toLowerCase().includes(texto);
      });
    });

    /* ─── Modal de categoría ─── */
    const modalCategoria = ref(false);
    const categoriaEnEdicion = ref(null);
    const errorFormulario = ref('');

    const abrirCategoria = (categoria) => {
      errorFormulario.value = '';
      categoriaEnEdicion.value = categoria
        ? { ...categoria, flujo: categoria.flujo || [] }
        : {
            id: null, codigo: '', nombre: '', descripcion: '',
            icono: 'fa-circle-dot', color_hex: '#6b7280',
            prioridad_default_id: '', requiere_ubicacion: true, activo: true,
            flujo: [], estado_inicial: '',
          };
      modalCategoria.value = true;
    };

    const cerrarCategoria = () => {
      modalCategoria.value = false;
      categoriaEnEdicion.value = null;
    };

    const guardarCambios = async () => {
      if (guardando.value) return;         // doble clic = categoría duplicada
      errorFormulario.value = '';
      const res = await guardarCategoria(categoriaEnEdicion.value);
      if (res.ok) cerrarCategoria();
      else errorFormulario.value = res.error;
    };

    /* ─── Activar / desactivar ─── */
    const modalEstado = ref(false);
    const categoriaParaEstado = ref(null);
    const errorEstado = ref('');

    const abrirModalEstado = (categoria) => {
      errorEstado.value = '';
      categoriaParaEstado.value = { ...categoria };
      modalEstado.value = true;
    };

    const cerrarModalEstado = () => {
      modalEstado.value = false;
      categoriaParaEstado.value = null;
    };

    const confirmarCambioDeEstado = async () => {
      if (guardando.value) return;
      errorEstado.value = '';
      const objetivo = categoriaParaEstado.value;
      const res = await fijarActivoCategoria(objetivo.id, !objetivo.activo);
      if (res.ok) cerrarModalEstado();
      else errorEstado.value = res.error;
    };

    /* ─── Atenciones de la unidad ─── */
    const errorAtencion = ref('');
    const busquedaAtencion = ref('');

    const misAtenciones = computed(() =>
      departamentoActivo.value ? atencionesDeDepartamento(departamentoActivo.value) : []
    );

    /**
     * Categorías que la unidad todavía no ha declarado.
     *
     * Se excluyen las que ya son suyas por enrutamiento: declarar que atiende
     * lo que le nace por defecto no aporta nada y confundiría las dos ideas.
     */
    const categoriasDeclarables = computed(() => {
      const depto = departamentoActivo.value;
      if (!depto) return [];
      const yaDeclaradas = new Set(misAtenciones.value.map((a) => a.categoria_id));
      const texto = busquedaAtencion.value.trim().toLowerCase();
      return categorias.value
        .filter((c) => c.activo)
        .filter((c) => !yaDeclaradas.has(c.id))
        .filter((c) => String(c.departamento_responsable_id) !== String(depto))
        .filter((c) => !texto
          || c.nombre.toLowerCase().includes(texto)
          || (c.codigo || '').toLowerCase().includes(texto))
        .slice(0, 30);
    });

    const anadirAtencion = async (categoriaId) => {
      errorAtencion.value = '';
      const res = await declararAtencion(departamentoActivo.value, categoriaId, true);
      if (!res.ok) errorAtencion.value = res.error;
    };

    const alternarIntervencion = async (fila) => {
      errorAtencion.value = '';
      const res = await fijarPuedeIntervenir(fila.id, !fila.puede_intervenir);
      if (!res.ok) errorAtencion.value = res.error;
    };

    const quitarAtencion = async (fila) => {
      errorAtencion.value = '';
      const res = await retirarAtencion(fila.id);
      if (!res.ok) errorAtencion.value = res.error;
    };

    /* ─── Presentación ─── */
    const nombreDelDepartamento = (id) => nombreDepartamento(id) || 'Sin departamento';

    const nombrePrioridad = (id) => {
      if (!id) return 'Sin prioridad';
      const p = (prioridades.value || []).find((x) => x.id === id);
      return p ? p.nombre : 'Prioridad no disponible';
    };

    const colorPrioridad = (id) => {
      const p = (prioridades.value || []).find((x) => x.id === id);
      return p?.color_hex || '#9ca3af';
    };

    // Al cambiar de unidad, la búsqueda de la pestaña anterior deja de tener
    // sentido: filtraba sobre otro conjunto.
    watch(departamentoActivo, () => { busquedaAtencion.value = ''; errorAtencion.value = ''; });

    /* ─── Ciclo de vida ─── */
    onMounted(() => {
      Promise.all([cargarCatalogo(), cargarDepartamentos(), cargarPrioridades()]);
    });

    return {
      // Estado
      cargando, guardando, error, pestana,
      filtroBusqueda, filtroDepartamento, filtroEstado, soloMiUnidad, hayFiltros,
      modalCategoria, categoriaEnEdicion, errorFormulario,
      modalEstado, categoriaParaEstado, errorEstado,
      errorAtencion, busquedaAtencion, departamentoElegido,

      // Datos
      categorias, departamentos, prioridades, categoriasFiltradas,
      misAtenciones, categoriasDeclarables,
      ICONOS_SUGERIDOS, COLORES_SUGERIDOS,

      // Indicadores
      totalCategorias, categoriasActivas, categoriasSinPrioridad,

      // Competencias
      puedeCrearCategoria, puedeEditarCategoria, puedeTocarCategoria,
      esGerencia, departamentoActivo,

      // Acciones
      limpiarFiltros,
      abrirCategoria, cerrarCategoria, guardarCambios,
      abrirModalEstado, cerrarModalEstado, confirmarCambioDeEstado,
      anadirAtencion, alternarIntervencion, quitarAtencion,

      // Presentación
      nombreDelDepartamento, nombrePrioridad, colorPrioridad,
    };
  },
};
