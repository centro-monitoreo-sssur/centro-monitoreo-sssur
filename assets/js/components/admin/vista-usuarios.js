// ============================================================
// VISTA: Usuarios del Sistema
// Vista para gestionar los usuarios del sistema de monitoreo.
// Diseño moderno, profesional y limpio usando exclusivamente TailwindCSS.
// ============================================================
import { ref, reactive, computed, onMounted, watch } from '../../core/vue.js';
import { formatoFecha } from '../../utils/formato.js';
import { useUsuarios } from '../../stores/usuarios.js';
import { useCatalogos } from '../../stores/catalogos.js';
import { useNavegacion } from '../../stores/navegacion.js';
import { db } from '../../core/supabase.js';
import { subirFotoPerfil, almacenamientoConfigurado } from '../../services/fotos-perfil.js';

export default {
  setup() {
    /* ─── Estado de UI ─── */
    const {
      usuarios, cargandoUsuarios, cargarUsuarios,
      crearUsuario, actualizarUsuario, desactivarUsuario,
      ambitosUsuario, cargarAmbitos, aplicarAmbitos, restablecerAmbitos, eliminarAmbito,
    } = useUsuarios();

    const {
      departamentos, distritos, direcciones,
      cargarDepartamentos, cargarDistritos, cargarDirecciones,
    } = useCatalogos();

    const { rolUsuario } = useNavegacion();

    const guardando = ref(false);
    const errorGuardado = ref('');

    /* ─── Foto de perfil ─── */
    // Va a cPanel y no a Supabase Storage: las fotos de perfil son permanentes,
    // y el 1 GB de Storage está reservado para las fotos de denuncia, que se
    // purgan a los 7-15 días (CONTEXTO_CRITICO §3).
    const subiendoFoto = ref(false);

    const seleccionarFoto = async (evento) => {
      const archivo = evento.target.files?.[0];
      evento.target.value = '';   // permite reintentar con el mismo archivo
      if (!archivo) return;

      subiendoFoto.value = true;
      errorGuardado.value = '';
      const res = await subirFotoPerfil(archivo);
      subiendoFoto.value = false;

      if (res.ok) usuarioSeleccionado.value.fotoPerfilUrl = res.url;
      else errorGuardado.value = res.error;
    };

    const quitarFoto = () => { usuarioSeleccionado.value.fotoPerfilUrl = ''; };

    // El catálogo de roles se lee aquí y no en `catalogos.js` porque solo lo
    // necesita esta pantalla. Antes el <select> tenía opciones escritas a mano
    // —supervisor, operador, cuadrilla, solo_lectura— que NO existen en
    // public.roles: guardarlas habría dejado el usuario sin rol válido.
    const roles = ref([]);
    async function cargarRoles() {
      if (!db) return;
      try {
        const { data, error } = await db
          .from('roles').select('id, codigo, nombre, descripcion')
          .eq('activo', true).order('id');
        if (error) throw error;
        roles.value = data || [];
      } catch (e) {
        console.error('[usuarios] No se pudo leer el catálogo de roles:', e.message);
      }
    }

    // Los ámbitos granulares solo los escribe el superadmin (policy
    // `usuario_ambitos_write`). Para el resto ni se dibuja la sección: ofrecer
    // un formulario que siempre va a fallar es peor que no ofrecerlo.
    const puedeEditarAmbitos = computed(() => rolUsuario.value === 'superadmin');
    
    // Alias para compatibilidad con la vista
    const cargando = cargandoUsuarios;
    
    const filtroBusqueda = ref('');
    const filtroRol = ref('');
    const filtroEstado = ref('');
    const usuarioSeleccionado = ref(null);
    const modalEditar = ref(false);
    const modalEliminar = ref(false);
    
    /* ─── Computeds ─── */
    const usuariosFiltrados = computed(() => {
      return usuarios.value.filter(usuario => {
        const coincideBusqueda = usuario.nombre.toLowerCase().includes(filtroBusqueda.value.toLowerCase()) ||
                                usuario.email.toLowerCase().includes(filtroBusqueda.value.toLowerCase());
        
        const coincideRol = !filtroRol.value || usuario.rol === filtroRol.value;
        const coincideEstado = !filtroEstado.value || usuario.estado === filtroEstado.value;
        
        return coincideBusqueda && coincideRol && coincideEstado;
      });
    });

    const totalUsuarios = computed(() => usuarios.value.length);
    const usuariosActivos = computed(() => usuarios.value.filter(u => u.estado === 'activo').length);
    const usuariosInactivos = computed(() => usuarios.value.filter(u => u.estado === 'inactivo').length);

    /* ─── Funciones ─── */

    const limpiarFiltros = () => {
      filtroBusqueda.value = '';
      filtroRol.value = '';
      filtroEstado.value = '';
    };

    // Plantilla del formulario. Se define una sola vez para que alta y edición
    // trabajen exactamente sobre las mismas claves.
    const usuarioVacio = () => ({
      id: null, nombres: '', apellidos: '', username: '', email: '',
      password: '', dui: '', telefono: '', fotoPerfilUrl: '', cargo: '',
      departamento_id: '', distrito_id: '', rol_id: '', estado: 'activo',
    });

    const abrirModalCrear = () => {
      errorGuardado.value = '';
      ambitosUsuario.value = [];
      resetAmbitoNuevo();
      usuarioSeleccionado.value = usuarioVacio();
      modalEditar.value = true;
    };

    const abrirModalEditar = (usuario) => {
      errorGuardado.value = '';
      resetAmbitoNuevo();
      usuarioSeleccionado.value = {
        ...usuarioVacio(),
        ...usuario,
        // Los <select> comparan por valor: un null haría que ninguna opción
        // quedara seleccionada y el guardado borraría la asignación.
        departamento_id: usuario.departamento_id ?? '',
        distrito_id: usuario.distrito_id ?? '',
        rol_id: usuario.rol_id ?? '',
      };
      modalEditar.value = true;
      cargarAmbitos(usuario.id);
    };

    const abrirModalEliminar = (usuario) => {
      errorGuardado.value = '';
      usuarioSeleccionado.value = { ...usuario };
      modalEliminar.value = true;
    };

    const cerrarModalEditar = () => {
      modalEditar.value = false;
      usuarioSeleccionado.value = null;
    };

    const cerrarModalEliminar = () => {
      modalEliminar.value = false;
      usuarioSeleccionado.value = null;
    };

    const guardarCambiosUsuario = async () => {
      if (guardando.value) return;
      guardando.value = true;
      errorGuardado.value = '';
      const datos = usuarioSeleccionado.value;
      const res = datos.id
        ? await actualizarUsuario(datos)
        : await crearUsuario(datos);
      guardando.value = false;
      if (res.ok) cerrarModalEditar();
      else errorGuardado.value = res.error;
    };

    /* ─── Ámbitos granulares (selección múltiple) ─── */
    // En la práctica a una jefatura se le conceden varios distritos de una vez,
    // no uno a uno. Un desplegable de opción única obligaba a repetir el mismo
    // formulario N veces, con N motivos idénticos escritos a mano.
    const TIPOS_AMBITO = [
      { id: 'distrito',     etiqueta: 'Distritos',     icono: 'fa-map-location-dot' },
      { id: 'departamento', etiqueta: 'Departamentos', icono: 'fa-building' },
      { id: 'direccion',    etiqueta: 'Direcciones',   icono: 'fa-sitemap' },
    ];

    const tipoAmbito = ref('distrito');
    const seleccion = ref([]);
    const loteAmbito = ref({ modo: 'conceder', vigenteHasta: '', motivo: '' });

    function resetAmbitoNuevo() {
      tipoAmbito.value = 'distrito';
      seleccion.value = [];
      loteAmbito.value = { modo: 'conceder', vigenteHasta: '', motivo: '' };
    }

    // Cambiar de tipo debe vaciar la selección: un id de distrito arrastrado a
    // la lista de departamentos crearía el ámbito sobre el objeto equivocado.
    watch(tipoAmbito, () => { seleccion.value = []; });

    const opcionesAmbito = computed(() => {
      if (tipoAmbito.value === 'distrito')     return distritos.value || [];
      if (tipoAmbito.value === 'departamento') return departamentos.value || [];
      return direcciones.value || [];
    });

    // Estado vigente de cada elemento: 'conceder', 'denegar' o null (heredado
    // del rol). Es lo que permite ver de un vistazo qué tiene ya el usuario en
    // lugar de tener que leer la lista de excepciones y cruzarla mentalmente.
    const COLUMNA_POR_TIPO = {
      distrito: 'distrito_id', departamento: 'departamento_id', direccion: 'direccion_id',
    };
    const estadoPorElemento = computed(() => {
      const columna = COLUMNA_POR_TIPO[tipoAmbito.value];
      const mapa = {};
      for (const a of ambitosUsuario.value || []) {
        if (a.tipo !== tipoAmbito.value) continue;
        if (a[columna] != null) mapa[a[columna]] = a.modo;
      }
      return mapa;
    });

    const estadoDe = (id) => estadoPorElemento.value[id] || null;

    const estaSeleccionado = (id) => seleccion.value.includes(id);

    const alternarSeleccion = (id) => {
      const i = seleccion.value.indexOf(id);
      if (i === -1) seleccion.value.push(id);
      else seleccion.value.splice(i, 1);
    };

    const todosSeleccionados = computed(() =>
      opcionesAmbito.value.length > 0 && seleccion.value.length === opcionesAmbito.value.length
    );

    const alternarTodos = () => {
      seleccion.value = todosSeleccionados.value ? [] : opcionesAmbito.value.map((o) => o.id);
    };

    // Marca los que ya tienen excepción, para revisarlos o retirarlos en bloque.
    const seleccionarConExcepcion = () => {
      seleccion.value = opcionesAmbito.value
        .filter((o) => estadoDe(o.id))
        .map((o) => o.id);
    };

    const aplicarLote = async () => {
      if (guardando.value) return;
      guardando.value = true;
      errorGuardado.value = '';
      const res = await aplicarAmbitos(usuarioSeleccionado.value?.id, {
        tipo: tipoAmbito.value,
        modo: loteAmbito.value.modo,
        referencias: seleccion.value,
        vigenteHasta: loteAmbito.value.vigenteHasta,
        motivo: loteAmbito.value.motivo,
      });
      guardando.value = false;
      if (res.ok) {
        seleccion.value = [];
        loteAmbito.value.motivo = '';
      } else {
        errorGuardado.value = res.error;
      }
    };

    const restablecerLote = async () => {
      if (guardando.value) return;
      guardando.value = true;
      errorGuardado.value = '';
      const res = await restablecerAmbitos(
        usuarioSeleccionado.value?.id, tipoAmbito.value, seleccion.value
      );
      guardando.value = false;
      if (res.ok) seleccion.value = [];
      else errorGuardado.value = res.error;
    };

    const quitarAmbito = async (id) => {
      if (guardando.value) return;
      guardando.value = true;
      const res = await eliminarAmbito(id, usuarioSeleccionado.value?.id);
      guardando.value = false;
      if (!res.ok) errorGuardado.value = res.error;
    };

    // Nombre legible del objeto al que apunta el ámbito.
    const etiquetaAmbito = (a) =>
      a.distritos?.nombre || a.departamentos?.nombre ||
      a.direcciones_administrativas?.nombre || '—';

    const vigenciaAmbito = (a) =>
      a.vigente_hasta
        ? `hasta ${new Date(a.vigente_hasta).toLocaleDateString('es-SV')}`
        : 'permanente';

    // Resumen para la cabecera de la sección.
    const resumenAmbitos = computed(() => {
      const lista = ambitosUsuario.value || [];
      const c = lista.filter((a) => a.modo === 'conceder').length;
      const d = lista.filter((a) => a.modo === 'denegar').length;
      return { concedidos: c, denegados: d, total: lista.length };
    });

    // Baja lógica, no borrado: ver `desactivarUsuario` en el store.
    const eliminarUsuario = async () => {
      if (guardando.value) return;
      guardando.value = true;
      errorGuardado.value = '';
      const res = await desactivarUsuario(usuarioSeleccionado.value.id);
      guardando.value = false;
      if (res.ok) cerrarModalEliminar();
      else errorGuardado.value = res.error;
    };

    /* ─── Ciclo de vida ─── */
    onMounted(() => {
      // Todos los catálogos que alimentan el formulario. En paralelo porque
      // son independientes entre sí.
      cargarUsuarios();
      cargarRoles();
      cargarDepartamentos();
      cargarDistritos();
      cargarDirecciones();
    });

    return {
      // Estado
      usuarios,
      cargando,
      filtroBusqueda,
      filtroRol,
      filtroEstado,
      usuarioSeleccionado,
      modalEditar,
      modalEliminar,
      guardando,
      errorGuardado,
      subiendoFoto,
      seleccionarFoto,
      quitarFoto,
      almacenamientoConfigurado,

      // Computeds
      usuariosFiltrados,
      totalUsuarios,
      usuariosActivos,
      usuariosInactivos,
      
      // Catálogos del formulario
      roles,
      departamentos,
      distritos,
      direcciones,

      // Ámbitos granulares
      puedeEditarAmbitos,
      ambitosUsuario,
      TIPOS_AMBITO,
      tipoAmbito,
      seleccion,
      loteAmbito,
      opcionesAmbito,
      estadoDe,
      estaSeleccionado,
      alternarSeleccion,
      todosSeleccionados,
      alternarTodos,
      seleccionarConExcepcion,
      aplicarLote,
      restablecerLote,
      quitarAmbito,
      etiquetaAmbito,
      vigenciaAmbito,
      resumenAmbitos,

      // Funciones
      cargarUsuarios,
      limpiarFiltros,
      abrirModalCrear,
      abrirModalEditar,
      abrirModalEliminar,
      cerrarModalEditar,
      cerrarModalEliminar,
      guardarCambiosUsuario,
      eliminarUsuario,
      
      // Helpers
      formatoFecha
    };
  },
};