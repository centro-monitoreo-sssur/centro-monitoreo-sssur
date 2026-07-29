// ============================================================
// VISTA: Usuarios del Sistema
// Vista para gestionar los usuarios del sistema de monitoreo.
// Diseño moderno, profesional y limpio usando exclusivamente TailwindCSS.
// ============================================================
import { ref, reactive, computed, onMounted, watch } from '../../core/vue.js';
import { formatoFecha } from '../../utils/formato.js';
import { useUsuarios } from '../../stores/usuarios.js';

export default {
  setup() {
    /* ─── Estado de UI ─── */
    const { usuarios, cargandoUsuarios, cargarUsuarios } = useUsuarios();
    
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

    const abrirModalEditar = (usuario) => {
      usuarioSeleccionado.value = { ...usuario };
      modalEditar.value = true;
    };

    const abrirModalEliminar = (usuario) => {
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

    const guardarCambiosUsuario = () => {
      // En un sistema real, esto actualizaría en Supabase
      const indice = usuarios.value.findIndex(u => u.id === usuarioSeleccionado.value.id);
      if (indice !== -1) {
        usuarios.value[indice] = { ...usuarioSeleccionado.value };
      }
      cerrarModalEditar();
    };

    const eliminarUsuario = () => {
      // En un sistema real, esto eliminaría de Supabase
      usuarios.value = usuarios.value.filter(u => u.id !== usuarioSeleccionado.value.id);
      cerrarModalEliminar();
    };

    /* ─── Ciclo de vida ─── */
    onMounted(() => {
      cargarUsuarios();
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
      
      // Computeds
      usuariosFiltrados,
      totalUsuarios,
      usuariosActivos,
      usuariosInactivos,
      
      // Funciones
      cargarUsuarios,
      limpiarFiltros,
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